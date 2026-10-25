const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function createVisitorToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	let value = "";
	for (const byte of bytes) value += String.fromCharCode(byte);
	return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function key(slug: string) {
	return `tgm:visitor-session:${slug}`;
}

export function loadVisitorToken(slug: string) {
	const token = sessionStorage.getItem(key(slug));
	return token && tokenPattern.test(token) ? token : null;
}

export function saveVisitorToken(slug: string, token: string) {
	if (!tokenPattern.test(token)) throw new Error("Invalid visitor session token");
	sessionStorage.setItem(key(slug), token);
}

export const terminalStatuses = new Set(["checked_out", "declined", "cancelled", "auto_closed"]);
