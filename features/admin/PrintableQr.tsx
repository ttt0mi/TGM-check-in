"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import styles from "./admin.module.css";

export function PrintableQr({
	branch,
	privacyApproved,
	organizationName,
	url,
}: {
	branch: { id: string; name: string; public_slug: string; is_active: boolean };
	privacyApproved: boolean;
	organizationName: string;
	url: string;
}) {
	const usable = branch.is_active && privacyApproved;
	const qrRef = useRef<SVGSVGElement>(null);
	const [copyMessage, setCopyMessage] = useState("");
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(url);
			setCopyMessage("Check-in link copied.");
		} catch {
			setCopyMessage("Copy is unavailable. Select the visible link below instead.");
		}
	}
	function downloadQr() {
		if (!usable || !qrRef.current) return;
		const svg = new XMLSerializer().serializeToString(qrRef.current);
		const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
		const anchor = document.createElement("a");
		anchor.href = objectUrl;
		anchor.download = `tgm-check-in-${branch.id}.svg`;
		anchor.click();
		window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
	}
	return (
		<main id="main-content" className={styles.page}>
			<Link className={styles.qrControls} href="/app/manage?tab=branches">
				← Manage branches
			</Link>
			<section className={styles.section}>
				<h1>{organizationName}</h1>
				<h2>Check in at {branch.name}</h2>
				<p role="status">
					{!branch.is_active
						? "Branch inactive — do not distribute this code."
						: privacyApproved
							? "Branch active; privacy notice approved. Test the link before distribution."
							: "Public check-in unavailable until an organization administrator approves the privacy notice."}
				</p>
				<div className={styles.qr}>
					{usable && (
						<QRCodeSVG
							ref={qrRef}
							value={url}
							size={260}
							marginSize={4}
							role="img"
							aria-label={`QR code for check-in at ${branch.name}`}
						/>
					)}
					<span className={styles.qrUrl}>{url}</span>
				</div>
				<p>
					{usable
						? "Scan the QR code or use the visible URL above."
						: "The link is shown for testing only while public check-in is unavailable."}
				</p>
				<div className={styles.qrControls}>
					<button disabled={!usable} onClick={() => window.print()}>
						Print QR
					</button>
					<button disabled={!usable} onClick={downloadQr}>
						Download SVG
					</button>
					<button disabled={!usable} onClick={() => void copyLink()}>
						Copy link
					</button>
					<a href={url} target="_blank" rel="noopener noreferrer">
						Open test link
					</a>
				</div>
				{copyMessage && (
					<p className={styles.qrControls} role="status">
						{copyMessage}
					</p>
				)}
			</section>
		</main>
	);
}
