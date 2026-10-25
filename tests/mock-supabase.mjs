import { createServer } from "node:http";

const port = Number(process.env.TGM_MOCK_SUPABASE_PORT ?? 54331);
const branchId = "11111111-1111-4111-8111-111111111111";
const departmentId = "22222222-2222-4222-8222-222222222222";
const hostId = "33333333-3333-4333-8333-333333333333";
let visit = null;

function reply(response, status, body) {
	response.writeHead(status, {
		"content-type": "application/json",
		"access-control-allow-origin": "*",
		"access-control-allow-headers": "*",
		"access-control-allow-methods": "GET, POST, OPTIONS",
	});
	response.end(JSON.stringify(body));
}

async function readJson(request) {
	let raw = "";
	for await (const chunk of request) raw += chunk;
	return JSON.parse(raw || "{}");
}

createServer(async (request, response) => {
	if (request.method === "OPTIONS") return reply(response, 200, {});
	const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
	if (url.pathname === "/health") return reply(response, 200, { ready: true });
	if (url.pathname === "/__test/visit-status") {
		if (!visit) return reply(response, 404, { error: "No visit" });
		const body = await readJson(request);
		visit.status = body.status;
		if ("admitted_at" in body) visit.admitted_at = body.admitted_at;
		if ("time_out" in body) visit.time_out = body.time_out;
		return reply(response, 200, { status: visit.status });
	}
	if (url.pathname === "/functions/v1/get-public-directory") {
		if (url.searchParams.get("location") !== branchId) return reply(response, 404, { error: "Unknown branch" });
		return reply(response, 200, {
			organization: { name: "Example Organization" },
			location: {
				name: "Lagos Branch",
				address: "1 Test Street",
				timezone: "Africa/Lagos",
			},
			departments: [
				{
					id: departmentId,
					name: "Operations",
					staff: [{ id: hostId, name: "Ada Host" }],
				},
			],
		});
	}
	if (url.pathname === "/functions/v1/submit-public-visit") {
		const body = await readJson(request);
		if (body.location !== branchId || !body.turnstile_token)
			return reply(response, 400, { error: "Invalid submission" });
		visit = {
			token: body.visitor_session_token,
			status: "pending_reception_review",
			visitor_display_name: body.visitor_full_name,
			organization_name: "Example Organization",
			branch_name: "Lagos Branch",
			host_name: body.staff_id === hostId ? "Ada Host" : null,
			admitted_at: null,
			time_out: null,
			self_checkout_available: false,
		};
		return reply(response, 202, { accepted: true });
	}
	if (url.pathname === "/functions/v1/get-visitor-visit") {
		const body = await readJson(request);
		if (!visit || body.token !== visit.token) return reply(response, 404, { error: "Visit unavailable" });
		const publicVisit = { ...visit };
		delete publicVisit.token;
		return reply(response, 200, { visit: publicVisit });
	}
	if (url.pathname === "/functions/v1/respond-to-host-visit") {
		const body = await readJson(request);
		if (!/^[a-f0-9]{64}$/.test(body.token)) return reply(response, 400, { error: "Invalid token" });
		return reply(response, 200, {
			outcome: body.outcome,
			requires_reception_admission: body.outcome === "approved",
		});
	}
	return reply(response, 404, { error: "Not mocked" });
}).listen(port, "127.0.0.1", () => {
	process.stdout.write(`Mock Supabase listening on ${port}\n`);
});
