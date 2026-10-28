export function publicConfigurationIssue(url: string | undefined, key: string | undefined): boolean {
	if (!url || !key || !/^[A-Za-z0-9._-]{8,}$/.test(key)) return true;
	try {
		const parsed = new URL(url);
		return (
			(parsed.protocol !== "https:" &&
				!(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) ||
			Boolean(parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/")
		);
	} catch {
		return true;
	}
}
