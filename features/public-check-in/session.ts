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
	try {
		const token = sessionStorage.getItem(key(slug));
		return token && tokenPattern.test(token) ? token : null;
	} catch {
		return null;
	}
}

export function saveVisitorToken(slug: string, token: string) {
	if (!tokenPattern.test(token)) throw new Error("Invalid visitor session token");
	try {
		sessionStorage.setItem(key(slug), token);
		return true;
	} catch {
		return false;
	}
}

export function clearVisitorToken(slug: string) {
	try {
		sessionStorage.removeItem(key(slug));
	} catch {
		// Keep the current tab's in-memory flow available when storage is blocked.
	}
}

export const terminalStatuses = new Set(["checked_out", "declined", "cancelled", "auto_closed"]);
