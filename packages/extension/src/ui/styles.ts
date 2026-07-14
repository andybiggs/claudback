// All overlay CSS, injected once into the shadow root. Kept as a single template
// string so the content script stays dependency-free (no CSS loader / bundler
// asset handling needed).

export const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
:host {
	--ink: #191c1f; --secondary-text: #5c6167; --faint-text: #8b9096; --selector-text: #9ba0a5;
	--border: #e5e7e9; --hairline: #eff1f2; --divider: #f3f4f4;
	--green: #0f8a46; --green-active: #0c6e38; --green-strong: #0c6e38; --green-tint: #eaf5ee;
	--ghost-bg: #f3f4f4; --ghost-text: #43474c;
	--danger: #c0271b; --danger-tint: #fbe9e7;
	--warning-text: #8a5a00; --warning-dot: #c88a04; --warning-bg: #fbf3e0; --warning-border: #f2e4c4;
	--surface: #fff; --shadow-alpha: .25;
}
@media (prefers-color-scheme: dark) {
	:host {
		--ink: #e9ecee; --secondary-text: #9aa1a8; --faint-text: #6e757c; --selector-text: #6e757c;
		--border: #2b3036; --hairline: #2b3036; --divider: #2b3036;
		--green: #0f8a46; --green-active: #0c6e38; --green-strong: #3fc479; --green-tint: rgba(63,196,121,.14);
		--ghost-bg: #2b3036; --ghost-text: #c9ced3;
		--danger: #f08578; --danger-tint: rgba(192,39,27,.18);
		--warning-text: #dfa64a; --warning-dot: #c88a04; --warning-bg: rgba(200,138,4,.14); --warning-border: rgba(200,138,4,.3);
		--surface: #1c1f23; --shadow-alpha: .4;
	}
}
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.mark {
	background: var(--green); border-radius: 50% 50% 50% 3px;
	display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
@media (prefers-color-scheme: dark) {
	.mark { background: #3fc479; }
	.mark::after { background: var(--surface); }
}
.mark::after { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #fff; }
.fabs {
	position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
	display: flex; align-items: center; gap: 12px;
}
.fab {
	position: relative; width: 52px; height: 52px;
	border-radius: 50%; border: none; cursor: pointer;
	background: var(--green); color: #fff; box-shadow: 0 4px 14px rgba(0,0,0,.25);
	display: flex; align-items: center; justify-content: center; transition: transform .12s ease;
}
.fab:hover { transform: scale(1.06); }
.fab.active { background: var(--green-active); }
.fab.secondary { width: 46px; height: 46px; background: var(--surface); color: var(--green); border: 1px solid var(--border); }
.fab.secondary.active { background: var(--green); color: #fff; border-color: var(--green); }
.fab svg { width: 24px; height: 24px; }
.fab.secondary svg { width: 20px; height: 20px; }
.fab .waypoint-icon { width: 26px; height: 26px; background: #fff; border-radius: 50% 50% 50% 3px; display: flex; align-items: center; justify-content: center; }
.count {
	position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px;
	padding: 0 5px; border-radius: 10px; background: var(--green); color: #fff; border: 2px solid transparent;
	font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center;
}
.fab.secondary.active .count { background: #fff; color: var(--green); border-color: var(--green); }
.hint {
	position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
	background: var(--green); color: #fff; padding: 10px 16px; border-radius: 100px;
	font-size: 15px; font-weight: 500; box-shadow: 0 4px 18px rgba(0,0,0,.28); display: flex; align-items: center; gap: 10px;
	white-space: nowrap;
}
.hint.error-toast { background: var(--danger); border-radius: 8px; font-size: 13px; }
.hint .keycap {
	font-size: 12px; font-weight: 600; color: rgba(255,255,255,.9);
	background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.3);
	border-radius: 6px; padding: 2px 8px; line-height: 1.4;
}
.highlight {
	position: fixed; pointer-events: none; z-index: 2147483646;
	border: 2px solid var(--green); background: rgba(15,138,70,.10); border-radius: 4px;
	transition: all .04s linear;
}
.pin {
	position: fixed; z-index: 2147483646; width: 26px; height: 26px; border-radius: 50% 50% 50% 2px;
	background: var(--green); color: #fff; border: 2px solid #fff; cursor: pointer;
	font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center;
	box-shadow: 0 2px 8px rgba(0,0,0,.3); transform: translate(-50%, -100%);
}
.pin.resolved { background: #9ca3af; }
.popover {
	position: fixed; z-index: 2147483647; width: 280px; background: var(--surface); color: var(--ink);
	border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,var(--shadow-alpha)); padding: 12px;
	border: 1px solid var(--border);
}
.popover textarea, .inline-edit textarea {
	width: 100%; min-height: 56px; resize: vertical; border: 1.5px solid var(--border);
	border-radius: 8px; padding: 8px 10px; font-size: 13px; color: var(--ink); background: var(--surface);
}
.popover textarea:focus, .inline-edit textarea:focus { outline: none; border-color: var(--green); }
@media (prefers-color-scheme: dark) {
	.popover textarea:focus, .inline-edit textarea:focus { border-color: #3fc479; }
}
.inline-edit { margin: 5px 0 3px; }
.inline-edit .row { margin-top: 6px; }
.popover .tagchip {
	font-size: 11px; font-weight: 700; background: var(--green-tint); color: var(--green-strong);
	padding: 2px 7px; border-radius: 4px; flex-shrink: 0;
}
.component-pill {
	display: inline-flex; align-items: center; gap: 4px; max-width: 100%; vertical-align: middle;
	font-size: 11px; font-weight: 700; background: var(--green-tint); color: var(--green-strong);
	padding: 2px 7px; border-radius: 4px;
}
.component-pill svg { flex: none; }
.component-pill .pill-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.selector-line .component-pill { flex: 0 1 auto; }
.selector-line .component-pill.path { flex: 1 1 auto; min-width: 0; }
.popover .selector-line { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; min-width: 0; }
.popover .selector-path {
	font-size: 11px; color: var(--faint-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1;
}
.popover .meta { font-size: 11px; color: var(--faint-text); margin: 6px 0; word-break: break-all; }
.row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
button.btn { border: none; border-radius: 8px; padding: 7px 13px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn.primary { background: var(--green); color: #fff; }
.btn.ghost { background: var(--ghost-bg); color: var(--ghost-text); }
.btn.danger { background: var(--danger-tint); color: var(--danger); }
button.btn:disabled { opacity: .5; cursor: default; }
.panel {
	position: fixed; bottom: 84px; right: 20px; width: 330px; max-height: 70vh;
	display: flex; flex-direction: column;
	z-index: 2147483647; background: var(--surface); color: var(--ink); border-radius: 12px;
	box-shadow: 0 8px 30px rgba(0,0,0,var(--shadow-alpha)); border: 1px solid var(--border);
}
.panel > :not(.items) { flex-shrink: 0; }
.panel .items { overflow-y: auto; flex: 1; min-height: 0; }
.panel header { position: relative; padding: 12px 14px; border-bottom: 1px solid var(--hairline); display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.panel header .cog { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 26px; padding: 0; border: 1px solid transparent; border-radius: 6px; background: none; color: var(--faint-text); cursor: pointer; flex-shrink: 0; }
.panel header .cog:hover, .panel header .cog.open { background: var(--surface); color: var(--ink); border-color: var(--border); }
.panel header .identity { display: flex; align-items: center; gap: 9px; min-width: 0; flex: 1; }
.panel header .identity .mark { width: 30px; height: 30px; }
.panel header .identity .mark::after { width: 9px; height: 9px; }
.panel header .identity .text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.panel header .brand-name { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; font-weight: 600; font-size: 13.5px; white-space: nowrap; }
.panel header .hostname { font-size: 11px; color: var(--faint-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.panel .clear-all { font-size: 12px; font-weight: 600; color: var(--danger); background: var(--danger-tint); border: none; border-radius: 6px; padding: 4px 10px; cursor: pointer; flex-shrink: 0; }
.panel .clear-all:disabled { opacity: .5; cursor: default; }
.panel .sync-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 7px; padding: 8px 14px; font-size: 12px; font-weight: 600; border-bottom: 1px solid var(--warning-border); background: var(--warning-bg); color: var(--warning-text); }
.panel .sync-strip .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--warning-dot); flex-shrink: 0; }
.panel .sync-strip .sync-action { margin-left: 14px; border: none; background: none; padding: 0; font-size: 12px; font-weight: 600; color: var(--warning-text); text-decoration: underline; cursor: pointer; text-align: left; }
.panel .settings-menu { position: absolute; top: 100%; right: 8px; margin-top: 4px; z-index: 20; width: max-content; max-width: 300px; padding: 12px; border-radius: 10px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 8px 30px rgba(0,0,0,var(--shadow-alpha)); }
.panel .settings-menu select { font-size: 12px; padding: 3px 6px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); }
.panel .settings-menu .settings-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--ink); cursor: pointer; }
.panel .settings-menu .settings-row + .settings-row { margin-top: 10px; }
.panel .settings-menu .settings-row > span:first-child { white-space: nowrap; }
.switch { position: relative; flex-shrink: 0; width: 34px; height: 20px; }
.switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.switch .slider { position: absolute; inset: 0; border-radius: 999px; background: var(--border); transition: background .15s; }
.switch .slider::before { content: ""; position: absolute; left: 2px; top: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.3); transition: transform .15s; }
.switch input:checked + .slider { background: var(--green); }
.switch input:checked + .slider::before { transform: translateX(14px); }
.cb-tooltip { position: fixed; z-index: 2147483647; max-width: 360px; padding: 5px 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.4; word-break: break-all; box-shadow: 0 8px 30px rgba(0,0,0,var(--shadow-alpha)); opacity: 0; pointer-events: none; transition: opacity .1s; }
.cb-tooltip.show { opacity: 1; }
.cb-tooltip .tip-sep { color: var(--green-strong); font-weight: 700; }
[data-tip] { cursor: pointer; }
.item { padding: 10px 14px; border-bottom: 1px solid var(--divider); }
.item .top { display: flex; align-items: center; gap: 7px; }
.item .num { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; background: var(--green); color: #fff; border-radius: 999px; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.item.resolved .num { background: #9ca3af; }
.item .meta-line { font-size: 11px; color: var(--faint-text); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.item .txt { font-size: 13px; margin: 5px 0 3px; }
.item .ref {
	font-size: 10.5px; color: var(--selector-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.item.resolved .txt, .item.resolved .ref { opacity: .6; }
.item .acts { margin-top: 6px; display: flex; gap: 12px; }
.item .acts a { font-size: 12px; font-weight: 600; color: var(--green); cursor: pointer; }
.item .acts a.del { color: var(--danger); }
.empty { padding: 20px 14px; font-size: 13px; color: var(--faint-text); text-align: center; }
.prompt-footer { padding: 12px 14px; border-top: 1px solid var(--hairline); }
.prompt-footer .label { font-size: 12px; color: var(--faint-text); margin-bottom: 7px; }
.prompt-footer .prompt-row { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px; background: var(--surface); }
.prompt-footer .prompt-text { flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prompt-footer .copy-prompt { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: var(--green-strong); background: var(--green-tint); border: none; border-radius: 6px; padding: 4px 10px; cursor: pointer; flex-shrink: 0; white-space: nowrap; }
.prompt-footer .copy-prompt:hover { background: #d5eddf; }
.prompt-footer .copy-prompt svg { display: block; }
`;
