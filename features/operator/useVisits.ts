"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/browser";
import type { Visit } from "./types";

export const ACTIVE_STATUSES = [
	"pending_reception_review",
	"pending_host_acknowledgement",
	"host_approved_awaiting_reception",
	"approved_on_site",
] as const;
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];
type QueueStatus = ActiveStatus | "history";
type Cursor = { arrived_at: string; id: string };
const PAGE_SIZE = 25;

function useVisitGroup(branchId: string | null, status: QueueStatus, search: string, connected: boolean) {
	return useInfiniteQuery({
		queryKey: ["visit-queue", branchId, status, search],
		enabled: Boolean(branchId),
		initialPageParam: null as Cursor | null,
		queryFn: async ({ pageParam }) => {
			if (!branchId) return { items: [] as Visit[], next: null as Cursor | null };
			const { data, error } = await createClient().rpc("tgm_list_visit_queue", {
				p_location_id: branchId,
				p_status: status === "history" ? undefined : status,
				p_search: search || undefined,
				p_after_arrived_at: pageParam?.arrived_at,
				p_after_id: pageParam?.id,
				p_page_size: PAGE_SIZE + 1,
			});
			if (error) throw error;
			const rows = (data ?? []) as Visit[];
			const items = rows.slice(0, PAGE_SIZE);
			const last = items.at(-1);
			return {
				items,
				next: rows.length > PAGE_SIZE && last ? { arrived_at: last.arrived_at, id: last.id } : null,
			};
		},
		getNextPageParam: (lastPage) => lastPage.next,
		refetchInterval: connected ? false : 30000,
	});
}

export function useVisits(branchId: string | null, search: string) {
	const queryClient = useQueryClient();
	const [connection, setConnection] = useState<{ branchId: string | null; status: "connected" | "fallback" }>({
		branchId: null,
		status: "fallback",
	});
	const connectionStatus = connection.branchId === branchId ? connection.status : "connecting";
	const connected = connectionStatus === "connected";
	const reception = useVisitGroup(branchId, "pending_reception_review", search, connected);
	const host = useVisitGroup(branchId, "pending_host_acknowledgement", search, connected);
	const admission = useVisitGroup(branchId, "host_approved_awaiting_reception", search, connected);
	const onSite = useVisitGroup(branchId, "approved_on_site", search, connected);
	const history = useVisitGroup(branchId, "history", search, connected);
	const counts = useQuery({
		queryKey: ["visit-queue-counts", branchId, search],
		enabled: Boolean(branchId),
		queryFn: async () => {
			if (!branchId) return null;
			const { data, error } = await createClient().rpc("tgm_visit_queue_counts", {
				p_location_id: branchId,
				p_search: search || undefined,
			});
			if (error) throw error;
			return data as Record<QueueStatus, number>;
		},
		refetchInterval: connected ? false : 30000,
	});

	useEffect(() => {
		if (!branchId) return;
		const supabase = createClient();
		let channel: ReturnType<typeof supabase.channel> | undefined;
		let mounted = true;
		let debounce: ReturnType<typeof setTimeout> | undefined;
		const refresh = () => {
			if (debounce) clearTimeout(debounce);
			debounce = setTimeout(() => {
				void queryClient.invalidateQueries({ queryKey: ["visit-queue", branchId] });
				void queryClient.invalidateQueries({ queryKey: ["visit-queue-counts", branchId] });
			}, 500);
		};
		void supabase.realtime
			.setAuth()
			.then(() => {
				if (!mounted) return;
				channel = supabase
					.channel(`tgm:location:${branchId}`, { config: { private: true } })
					.on("broadcast", { event: "visit_changed" }, refresh)
					.subscribe((status) => {
						if (!mounted) return;
						if (status === "SUBSCRIBED") {
							setConnection({ branchId, status: "connected" });
							refresh();
						} else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
							setConnection({ branchId, status: "fallback" });
						}
					});
			})
			.catch(() => {
				if (mounted) setConnection({ branchId, status: "fallback" });
			});
		return () => {
			mounted = false;
			if (debounce) clearTimeout(debounce);
			if (channel) void supabase.removeChannel(channel);
		};
	}, [branchId, queryClient]);

	return {
		groups: {
			pending_reception_review: reception,
			pending_host_acknowledgement: host,
			host_approved_awaiting_reception: admission,
			approved_on_site: onSite,
			history,
		},
		counts,
		connection: connectionStatus,
		refresh: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: ["visit-queue", branchId] }),
				queryClient.invalidateQueries({ queryKey: ["visit-queue-counts", branchId] }),
			]),
	};
}
