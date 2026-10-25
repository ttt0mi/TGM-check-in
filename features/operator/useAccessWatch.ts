"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function useAccessWatch(input: { role: "admin" | "receptionist"; organizationId: string; branchId: string }) {
	const router = useRouter();
	useEffect(() => {
		if (input.role === "receptionist" && !input.branchId) return;
		let active = true;
		const supabase = createClient();
		const check = async () => {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) {
				if (active) router.replace("/login");
				return;
			}
			const { data: profile } = await supabase
				.from("operator_profiles")
				.select("role,is_active,organization_id")
				.eq("user_id", user.id)
				.maybeSingle();
			let allowed =
				profile?.is_active && profile.role === input.role && profile.organization_id === input.organizationId;
			if (allowed && input.role === "receptionist") {
				const { data: assignment } = await supabase
					.from("receptionist_location_assignments")
					.select("location_id")
					.eq("user_id", user.id)
					.maybeSingle();
				allowed = assignment?.location_id === input.branchId;
			}
			if (allowed) {
				const { data: organization } = await supabase
					.from("organizations")
					.select("is_active")
					.eq("id", input.organizationId)
					.maybeSingle();
				allowed = organization?.is_active === true;
			}
			if (!allowed && active) {
				await supabase.removeAllChannels();
				router.replace("/start");
				router.refresh();
			}
		};
		const timer = window.setInterval(() => {
			void check();
		}, 30000);
		const onFocus = () => {
			void check();
		};
		window.addEventListener("focus", onFocus);
		return () => {
			active = false;
			clearInterval(timer);
			window.removeEventListener("focus", onFocus);
		};
	}, [input.role, input.organizationId, input.branchId, router]);
}
