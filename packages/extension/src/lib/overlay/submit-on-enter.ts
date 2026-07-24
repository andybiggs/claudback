// Wires plain Enter to trigger submit (Shift+Enter, Ctrl/Cmd+Enter, etc. fall
// through to native textarea behavior — i.e. insert a newline).
export function submitOnEnter(textarea: HTMLTextAreaElement, onSubmit: () => void): void {
	textarea.addEventListener("keydown", (ev) => {
		// IME composition (e.g. confirming a Japanese/Chinese/Korean candidate)
		// dispatches a plain Enter too; keyCode 229 covers Safari, where
		// isComposing is unreliable on the confirming keydown.
		if (ev.isComposing || ev.keyCode === 229) {
			return;
		}

		if (ev.key === "Enter" && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
			ev.preventDefault();
			onSubmit();
		}
	});
}
