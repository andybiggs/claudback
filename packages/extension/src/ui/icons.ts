// Inline SVG/markup icons used across the overlay UI.

export const ADD_ICON = `<span class="waypoint-icon"><svg width="14" height="14" viewBox="0 0 14 14"><line x1="7" y1="4" x2="7" y2="10" stroke="#0F8A46" stroke-width="2" stroke-linecap="round"/><line x1="4" y1="7" x2="10" y2="7" stroke="#0F8A46" stroke-width="2" stroke-linecap="round"/></svg></span>`;
export const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
export const LIST_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;

// Gear icon for the settings popover trigger.
export const COG_ICON =
	'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

// 12px inline framework marks, currentColor so they follow chip text color.
export const FRAMEWORK_ICONS: Record<string, string> = {
	react:
		'<svg viewBox="-11 -11 22 22" width="12" height="12" aria-hidden="true"><circle r="2" fill="currentColor"/><g stroke="currentColor" fill="none"><ellipse rx="10" ry="4.2"/><ellipse rx="10" ry="4.2" transform="rotate(60)"/><ellipse rx="10" ry="4.2" transform="rotate(120)"/></g></svg>',
	vue:
		'<svg viewBox="0 0 24 22" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M14.8 0L12 4.8 9.2 0H0l12 21 12-21h-9.2zM3.6 2.1h3.2L12 11l5.2-8.9h3.2L12 16.9 3.6 2.1z"/></svg>',
};
