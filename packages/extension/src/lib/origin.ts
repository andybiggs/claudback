// Whether a tab's current URL still falls under the origin pattern the user
// granted. Anything that can't produce a real origin (about:blank, chrome://
// pages, malformed URLs) fails closed — the overlay must never follow the
// user somewhere the grant doesn't cover.
export function originMatches(url: string, originPattern: string): boolean {
	try {
		return `${new URL(url).origin}/*` === originPattern;
	} catch {
		return false;
	}
}
