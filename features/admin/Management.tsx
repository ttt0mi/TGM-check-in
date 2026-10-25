"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Branch, Department, Staff } from "@/features/operator/types";
import { OrganizationSettings } from "./OrganizationSettings";
import { BranchManagement } from "./BranchManagement";
import { DirectoryManagement } from "./DirectoryManagement";
import { AccessManagement } from "./AccessManagement";
import styles from "./admin.module.css";

export function Management({
	organization,
	branches,
	departments,
	staff,
}: {
	organization: { id: string; name: string; is_active: boolean };
	branches: Branch[];
	departments: Department[];
	staff: Staff[];
}) {
	const router = useRouter();
	const [tab, setTab] = useState<"organization" | "branches" | "directory" | "access">("organization");
	const refresh = () => router.refresh();
	return (
		<main className={styles.page}>
			<header>
				<Link href="/app">← Visits</Link>
				<h1>Manage {organization.name}</h1>
			</header>
			<nav aria-label="Management sections">
				{(["organization", "branches", "directory", "access"] as const).map((name) => (
					<button key={name} aria-current={tab === name ? "page" : undefined} onClick={() => setTab(name)}>
						{name}
					</button>
				))}
			</nav>
			{tab === "organization" && <OrganizationSettings organization={organization} onChanged={refresh} />}
			{tab === "branches" && <BranchManagement branches={branches} onChanged={refresh} />}
			{tab === "directory" && (
				<DirectoryManagement
					organizationId={organization.id}
					branches={branches}
					departments={departments}
					staff={staff}
					onChanged={refresh}
				/>
			)}
			{tab === "access" && <AccessManagement branches={branches} />}
		</main>
	);
}
