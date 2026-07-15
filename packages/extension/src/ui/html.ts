// Small HTML/text helpers shared across the overlay's string-built UI.

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function shortUrl(url: string): string {
	try {
		return new URL(url).pathname;
	} catch {
		return url;
	}
}
