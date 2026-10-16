import type { Database } from "./database.ts";

export type VisitType = Database["public"]["Enums"]["tgm_visit_type"];

export const visitTypes = new Set<VisitType>([
	"school",
	"business",
	"counselling",
	"travels",
	"vendors",
	"other",
]);

export function isVisitType(value: string): value is VisitType {
	return visitTypes.has(value as VisitType);
}

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const phonePattern = /^\+[1-9][0-9]{1,14}$/;
