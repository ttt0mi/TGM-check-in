import type { Metadata } from "next";
import type { ReactNode } from "react";
import { publicConfigurationIssue } from "@/lib/configuration";
import "./globals.css";

export const metadata: Metadata = {
	title: { default: "TGM Check-in", template: "%s | TGM Check-in" },
	description: "A simpler way to welcome and check in office visitors.",
	robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en">
			<body>
				<a className="skip-link" href="#main-content">
					Skip to main content
				</a>
				{publicConfigurationIssue(
					process.env.NEXT_PUBLIC_SUPABASE_URL,
					process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
				) ? (
					<main id="main-content" className="state-page" role="alert">
						<h1>Service configuration unavailable</h1>
						<p>Check-in is temporarily unavailable. Please contact reception or your administrator.</p>
					</main>
				) : (
					children
				)}
			</body>
		</html>
	);
}
