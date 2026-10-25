"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function useAccessWatch(input: { role: "admin" | "receptionist"; organizationId: string; branchId: string }) {
	const router = useRouter();
	const [degraded, setDegraded] = useState(false);
	useEffect(() => {
		if (input.role === "receptionist" && !input.branchId) return;
		let active = true;
		let inFlight = false;
		let failures = 0;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const supabase = createClient();
		const schedule = (delay: number) => {
			if (timer) clearTimeout(timer);
			if (active) timer = setTimeout(() => void check(), delay);
		};
		const fail = () => {
			if (!active) return;
			setDegraded(true);
			failures += 1;
			schedule(Math.min(60000, 5000 * 2 ** Math.min(failures - 1, 4)));
		};
		const revoke = async (path: string) => {
			if (!active) return;
			await supabase.removeAllChannels();
			router.replace(path);
			router.refresh();
		};
		const check = async () => {
			if (!active || inFlight) return;
			inFlight = true;
			try {
				const {
					data: { user },
					error: userError,
				} = await supabase.auth.getUser();
				if (userError) return fail();
				if (!user) return await revoke("/login");
				const { data: profile, error: profileError } = await supabase
					.from("operator_profiles")
					.select("role,is_active,organization_id")
					.eq("user_id", user.id)
					.maybeSingle();
				if (profileError) return fail();
				if (
					!profile?.is_active ||
					profile.role !== input.role ||
					profile.organization_id !== input.organizationId
				)
					return await revoke("/start");
				if (input.role === "receptionist") {
					const { data: assignment, error: assignmentError } = await supabase
						.from("receptionist_location_assignments")
						.select("location_id")
						.eq("user_id", user.id)
						.maybeSingle();
					if (assignmentError) return fail();
					if (assignment?.location_id !== input.branchId) return await revoke("/start");
				}
				const { data: organization, error: organizationError } = await supabase
					.from("organizations")
					.select("is_active")
					.eq("id", input.organizationId)
					.maybeSingle();
				if (organizationError) return fail();
				if (!organization?.is_active) return await revoke("/suspended");
				await supabase.realtime.setAuth();
				if (!active) return;
				failures = 0;
				setDegraded(false);
				schedule(30000);
			} catch {
				fail();
			} finally {
				inFlight = false;
			}
		};
		const onFocus = () => void check();
		window.addEventListener("focus", onFocus);
		schedule(30000);
		return () => {
			active = false;
			if (timer) clearTimeout(timer);
			window.removeEventListener("focus", onFocus);
		};
	}, [input.role, input.organizationId, input.branchId, router]);
	return { degraded };
}
