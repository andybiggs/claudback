// The floating "comment mode" hint banner. It's draggable: press anywhere on
// it and drag, and on release it snaps to whichever of six preset docks
// (three across the top, three across the bottom) it ended up closest to. The
// chosen dock persists to chrome.storage.local so it survives reloads.

import { HINT_POSITION_KEY, type HintPosition, type OverlayContext } from "./context.js";

const DOCK_STYLES: Record<HintPosition, Partial<CSSStyleDeclaration>> = {
	"top-left": { top: "20px", bottom: "auto", left: "20px", right: "auto", transform: "none" },
	"top-center": { top: "20px", bottom: "auto", left: "50%", right: "auto", transform: "translateX(-50%)" },
	"top-right": { top: "20px", bottom: "auto", left: "auto", right: "20px", transform: "none" },
	"bottom-left": { top: "auto", bottom: "20px", left: "20px", right: "auto", transform: "none" },
	"bottom-center": { top: "auto", bottom: "20px", left: "50%", right: "auto", transform: "translateX(-50%)" },
	"bottom-right": { top: "auto", bottom: "20px", left: "auto", right: "20px", transform: "none" },
};

function dockAt(hint: HTMLElement, position: HintPosition): void {
	Object.assign(hint.style, DOCK_STYLES[position]);
}

// Splits the viewport into three horizontal bands and two vertical ones, and
// reports whichever dock the given point falls into.
function nearestDock(centerX: number, centerY: number): HintPosition {
	const col = centerX < window.innerWidth / 3 ? "left" : centerX > (window.innerWidth * 2) / 3 ? "right" : "center";
	const row = centerY < window.innerHeight / 2 ? "top" : "bottom";

	return `${row}-${col}` as HintPosition;
}

function makeDraggable(ctx: OverlayContext, hint: HTMLElement): void {
	hint.addEventListener("pointerdown", (down) => {
		if (down.button !== 0) {
			return;
		}

		down.preventDefault();
		hint.setPointerCapture(down.pointerId);

		const rect = hint.getBoundingClientRect();
		const grabDx = down.clientX - rect.left;
		const grabDy = down.clientY - rect.top;
		let dragged = false;

		hint.classList.add("dragging");
		Object.assign(hint.style, {
			top: `${rect.top}px`,
			left: `${rect.left}px`,
			right: "auto",
			bottom: "auto",
			transform: "none",
		});

		const onMove = (move: PointerEvent): void => {
			dragged = true;
			hint.style.left = `${move.clientX - grabDx}px`;
			hint.style.top = `${move.clientY - grabDy}px`;
		};

		const onUp = (): void => {
			hint.removeEventListener("pointermove", onMove);
			hint.removeEventListener("pointerup", onUp);
			hint.removeEventListener("pointercancel", onUp);
			hint.classList.remove("dragging");

			if (!dragged) {
				// A plain click, not a drag — settle back onto its current dock
				// instead of leaving it pinned to the raw pointerdown coordinates.
				dockAt(hint, ctx.hintPosition);

				return;
			}

			const dropRect = hint.getBoundingClientRect();
			const position = nearestDock(dropRect.left + dropRect.width / 2, dropRect.top + dropRect.height / 2);

			ctx.hintPosition = position;
			dockAt(hint, position);

			try {
				ctx.localStore?.set({ [HINT_POSITION_KEY]: position });
			} catch {
				// Storage can be unavailable if the extension is being torn down;
				// the in-memory value still drives this session's rendering.
			}
		};

		hint.addEventListener("pointermove", onMove);
		hint.addEventListener("pointerup", onUp);
		hint.addEventListener("pointercancel", onUp);
	});
}

export function createHint(ctx: OverlayContext): HTMLElement {
	const hint = document.createElement("div");
	hint.className = "hint hint-draggable";
	hint.innerHTML =
		'Click any element to comment <span class="keycap">⌥C</span> toggles <span class="keycap">esc</span> exits';
	dockAt(hint, ctx.hintPosition);
	makeDraggable(ctx, hint);

	return hint;
}
