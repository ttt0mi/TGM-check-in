import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
	title: "TGM Check-in | Visitor management",
	description: "A simpler way to welcome and check in office visitors.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
