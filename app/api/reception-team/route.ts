import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

function responseError(message: string, status: number) {
	return NextResponse.json({ error: message }, { status });
}

async function getAdminContext(request: Request) {
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
	const secretKey = process.env.SUPABASE_SECRET_KEY;
	const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
	if (!supabaseUrl || !supabasePublishableKey || !secretKey) {
		return {
			error: responseError("Reception team invitations require Supabase server configuration.", 503),
		} as const;
	}
	if (!accessToken) {
		return { error: responseError("Sign in as a company administrator to manage reception staff.", 401) } as const;
	}

	const userClient = createClient(supabaseUrl, supabasePublishableKey, {
		global: { headers: { Authorization: `Bearer ${accessToken}` } },
		auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
	});
	const { data, error } = await userClient.auth.getUser(accessToken);
	if (error || !data.user)
		return { error: responseError("Your administrator session is invalid or expired.", 401) } as const;
	const { data: workspace, error: workspaceError } = await userClient
		.from("workspaces")
		.select("owner_id")
		.eq("owner_id", data.user.id)
		.maybeSingle();
	if (workspaceError || !workspace) {
		return { error: responseError("Only company administrators can manage reception staff.", 403) } as const;
	}

	const adminClient = createClient(supabaseUrl, secretKey, {
		auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
	});
	return { adminClient, ownerId: data.user.id } as const;
}

export async function POST(request: Request) {
	const context = await getAdminContext(request);
	if ("error" in context) return context.error;

	let input: { email?: unknown };
	try {
		input = (await request.json()) as { email?: unknown };
	} catch {
		return responseError("Provide a valid JSON body containing the reception member's email.", 400);
	}
	if (typeof input.email !== "string" || input.email.trim().length > 254 || !emailPattern.test(input.email.trim())) {
		return responseError("Enter a valid email address for the reception team member.", 400);
	}
	const email = input.email.trim().toLowerCase();

	const { data: invitation, error: inviteError } = await context.adminClient.auth.admin.inviteUserByEmail(email);
	if (inviteError) return responseError(`Unable to invite this email address: ${inviteError.message}`, 400);
	if (!invitation.user) return responseError("The invitation was created without a user record.", 502);

	const { error: membershipError } = await context.adminClient
		.from("workspace_reception_members")
		.upsert({ owner_id: context.ownerId, user_id: invitation.user.id }, { onConflict: "owner_id,user_id" });
	if (membershipError) {
		await context.adminClient.auth.admin.deleteUser(invitation.user.id);
		return responseError(`Unable to grant reception access: ${membershipError.message}`, 500);
	}
	return NextResponse.json({ invited: true });
}

export async function DELETE(request: Request) {
	const context = await getAdminContext(request);
	if ("error" in context) return context.error;

	let input: { user_id?: unknown };
	try {
		input = (await request.json()) as { user_id?: unknown };
	} catch {
		return responseError("Provide a valid JSON body containing the reception member ID.", 400);
	}
	if (
		typeof input.user_id !== "string" ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.user_id)
	) {
		return responseError("Provide a valid reception team member ID.", 400);
	}
	const { error } = await context.adminClient
		.from("workspace_reception_members")
		.delete()
		.eq("owner_id", context.ownerId)
		.eq("user_id", input.user_id);
	if (error) return responseError(`Unable to remove reception access: ${error.message}`, 500);
	return NextResponse.json({ removed: true });
}
