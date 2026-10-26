import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Access unavailable", description: "Your TGM access is unavailable." };

export default function SuspendedLayout({ children }: { children: ReactNode }) {
	return children;
}
