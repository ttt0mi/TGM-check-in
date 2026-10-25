"use client";

import { QRCodeSVG } from "qrcode.react";
import styles from "./admin.module.css";

export function PrintableQr({
	branch,
	organizationName,
	url,
}: {
	branch: { id: string; name: string; public_slug: string };
	organizationName: string;
	url: string;
}) {
	return (
		<main className={styles.page}>
			<a href="/app/manage">← Manage</a>
			<section className={styles.section}>
				<h1>{organizationName}</h1>
				<h2>Check in at {branch.name}</h2>
				<div className={styles.qr}>
					<QRCodeSVG value={url} size={260} />
					<span>{url}</span>
				</div>
				<p>Scan this QR code to check in.</p>
				<button onClick={() => window.print()}>Print QR</button>
			</section>
		</main>
	);
}
