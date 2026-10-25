"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/browser";
import type { Visit } from "./types";

export function useVisits(branchId: string | null, initialBranchId: string | null, initialVisits: Visit[]) {
	const queryClient = useQueryClient();
	const query = useQuery({
		queryKey: ["visits", branchId],
		enabled: Boolean(branchId),
		initialData: branchId === initialBranchId ? initialVisits : undefined,
		queryFn: async () => {
			if (!branchId) return [];
			const { data, error } = await createClient()
				.from("visits")
				.select("*")
				.eq("location_id", branchId)
				.order("arrived_at", { ascending: false })
				.limit(100);
			if (error) throw error;
			return data;
		},
	});

	useEffect(() => {
		if (!branchId) return;
		const supabase = createClient();
		let channel: ReturnType<typeof supabase.channel> | undefined;
		let mounted = true;
		void supabase.realtime.setAuth().then(() => {
			if (!mounted) return;
			channel = supabase
				.channel(`tgm:location:${branchId}`, { config: { private: true } })
				.on("broadcast", { event: "visit_changed" }, () => {
					void queryClient.invalidateQueries({
						queryKey: ["visits", branchId],
					});
				})
				.subscribe();
		});
		return () => {
			mounted = false;
			if (channel) void supabase.removeChannel(channel);
		};
	}, [branchId, queryClient]);

	return query;
}
