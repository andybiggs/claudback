# Handoff: Claudback branding & UI refresh

## Overview
A brand identity and conservative UI polish pass for **Claudback** — the Chrome extension + local MCP server that lets users pin comments on any web page for Claude to read and act on. This handoff covers: a new logo mark, a refined color palette, brand typography, and token-level restyling of every extension surface (toolbar icon, popup, pairing/options page, on-page overlay: FABs, pin, composer, comment panel) in light and dark modes.

**Target codebase:** the Claudback monorepo (`packages/extension`). The surfaces to change are `src/popup.html`, `src/options.html`, and the `STYLES` constant + icon constants in `src/content.ts`, plus new icon files referenced from `manifest.json`.

## About the Design Files
`Claudback Branding.dc.html` in this bundle is a **design reference created in HTML** — a mockup canvas, not production code. The task is to **recreate these designs in the extension's existing plain-HTML/CSS/TS environment**, editing the existing files rather than copying markup from the mock. Layouts are intentionally identical to the current implementation; only tokens, icons, and small structural details change (listed below).

## Fidelity
**High-fidelity.** Colors, sizes, radii, and typography are final. Match them exactly. The relevant designs are in card **1c** of the canvas (card 1b defines the chosen logo; 1a is a rejected alternative — ignore it).

## The logo — Mark B, "Waypoint"
The product's existing comment-pin shape promoted to logo: **a circle with one sharp corner (bottom-left), solid green, with a white dot in the center**. It is pure geometry — render as SVG or CSS:

- Shape: square, `border-radius: 50% 50% 50% <sharp>` where sharp ≈ 8–10% of the size (2px at 16px, 3px at 22–32px, 5px at 60px, 8px at 104px+)
- Fill: `#0F8A46` (light backgrounds) / `#3FC479` (dark backgrounds, with the dot in the surface color)
- Center dot: white circle, diameter ≈ 29% of the mark size, exactly centered

### Icon files needed (new, referenced from manifest.json `icons` + `action.default_icon`)
Generate PNGs at 16, 32, 48, 128 px of the mark on a transparent background. At 16px use a 5px dot and 2px sharp corner so it stays legible.

### Wordmark
"Claudback" set in **Space Grotesk 600**, letter-spacing `-0.02em`, ink `#191C1F` (light) / `#E9ECEE` (dark). Mark sits left of the wordmark at cap-height scale with ~12px gap. Space Grotesk is only needed where the brand name is displayed (popup h1, options h1, panel header); load via Google Fonts or bundle the woff2 — body UI stays on the system stack.

## Design Tokens

### Color (light)
| Token | Value | Replaces |
|---|---|---|
| Primary green | `#0F8A46` | `#16a34a` |
| Green active/hover | `#0C6E38` | `#15803d` |
| Green tint (secondary btn bg, chips) | `#EAF5EE` | `#f0f0f0` |
| Ink (text) | `#191C1F` | `#111` |
| Secondary text | `#5C6167` | `#666` / `#444` |
| Faint text / labels | `#8B9096` | `#888` / `#777` |
| Selector-path text | `#9BA0A5` | `#888` |
| Border | `#E5E7E9` | `#e5e5e5` / `#d4d4d4` (surfaces) |
| Input border | `#D9DCDE` | `#d4d4d4` |
| Hairline dividers | `#EFF1F2` / `#F3F4F4` | `#eee` / `#f3f3f3` |
| Ghost button bg / code bg | `#F3F4F4` | `#f0f0f0` / `#f3f3f3` |
| Danger | `#C0271B` (unchanged) | — |
| Danger tint | `#FBE9E7` | `#fde7e7` |
| Warning text | `#8A5A00` | new |
| Warning dot | `#C88A04` | new |
| Warning bg / border | `#FBF3E0` / `#F2E4C4` | new |

### Color (dark) — new
Apply via `@media (prefers-color-scheme: dark)` in popup/options, and a `:host`-level media query in the content-script shadow styles.
| Token | Value |
|---|---|
| Page bg | `#141619` |
| Surface (popup, panel, composer) | `#1C1F23` |
| Border | `#2B3036` |
| Text | `#E9ECEE` |
| Secondary text | `#9AA1A8` |
| Faint / selector text | `#6E757C` |
| Green accent (text, icons, dots) | `#3FC479` |
| Green tint bg | `rgba(63,196,121,.14)` |
| Primary button | stays `#0F8A46` with white text |
| Ghost button | bg `#2B3036`, text `#C9CED3` |
| Danger text / tint | `#F08578` / `rgba(192,39,27,.18)` |

### Radii
- Controls (buttons, inputs, chips, toasts, textarea): **8px** (was 6px)
- Surfaces (popup body, panel, composer/popover): **12px** (was 10–12px)
- Pills (count badges, toggle, number dots): **999px**

### Typography
- Brand: Space Grotesk 600, -0.02em — popup h1 15px, options h1 19px, panel header 13.5px
- UI body: `ui-sans-serif, system-ui, -apple-system, sans-serif` — 13px rows/buttons, 12px minor
- Mono (NEW): `ui-monospace, SFMono-Regular, Menlo, monospace` — all selector paths (10.5–11px), tag chips, `~/.claudback/token` code spans

### Shadows (unchanged from current)
- FABs: `0 4px 14px rgba(0,0,0,.25)`
- Panel/popover: `0 8px 30px rgba(0,0,0,.25)` (light) — darker `.4` alpha on dark
- Pin: `0 2px 8px rgba(0,0,0,.3)`

## Screens / Views

### 1. Popup (260px wide, 14px padding)
Same rows as today (Enabled / Comments / Status + secondary button), plus:
- **Header**: mark (18px) + "Claudback" Space Grotesk 600 15px, with a `#EFF1F2` hairline below (10px padding-bottom)
- **Comments count**: green tint pill — `#EAF5EE` bg, `#0C6E38` text, 12px/700, radius 999px, `1px 6px` padding
- **Status**: 7px green dot + "Synced" in `#0F8A46` 600. Status colors: synced green, pending `#2563EB` (keep), offline `#C0271B`, unpaired `#9CA3AF`
- **"Pairing & options" button**: `#EAF5EE` bg, `#0C6E38` text, weight 600, radius 8px, `9px 12px` padding (replaces grey `#f0f0f0`)
- **Toggle**: unchanged geometry (34×20, 16px knob), checked bg `#0F8A46`
- Dark mode per dark tokens

### 2. Pairing / options page (max-width 520px)
- **h1**: mark (22px) + "Claudback pairing" Space Grotesk 600 19px, flex row gap 10px
- Body copy 13px `#5C6167`, line-height 1.55; `~/.claudback/token` in mono 12px on `#F3F4F4`, radius 4px
- **Input**: border `#D9DCDE`, radius 8px, `9px 12px` padding, placeholder `#8B9096`
- **Save token**: `#0F8A46` bg, white 600 text, radius 8px, `9px 16px`
- **Test connection**: `#EAF5EE` bg, `#0C6E38` 600 text (replaces grey ghost)
- **Status line**: 7px green dot + 13px `#5C6167` text
- Dark mode per dark tokens

### 3. On-page overlay (content.ts STYLES)
- **Primary FAB** (56px green circle): icon becomes the **Waypoint mark in white with a green plus** — 26px white waypoint shape (radius `50% 50% 50% 3px`) containing a `#0F8A46` plus (stroke-width 2.2, round caps, arms ~64% of inner box). In comment mode it swaps to the existing X icon (unchanged)
- **Secondary FAB** (46px white circle): border `#E5E7E9`, list icon in `#0F8A46` (unchanged); count badge `#191C1F` bg
- **Hint toast**: bg `#0F8A46` (was `#111`), white 13px text, radius 8px, with an "esc" keycap chip: 11px, `rgba(255,255,255,.85)` text, `1px solid rgba(255,255,255,.4)` border, radius 4px, `1px 5px` padding
- **Highlight box**: `2px solid #0F8A46`, fill `rgba(15,138,70,.10)`, radius 4px
- **Pin**: unchanged shape (26px, `50% 50% 50% 2px`, white 2px border), bg `#0F8A46`, resolved `#9CA3AF`

### 4. Composer popover (280px, 12px padding, radius 12px)
- **Selector line restructured**: a leading tag chip — `<button>` in mono 11px/700, `#EAF5EE` bg, `#0C6E38` text, radius 4px, `2px 7px` — followed by the remaining path in mono 11px `#8B9096`, single line, ellipsized (full path in `title`)
- **Textarea**: radius 8px, focus border `#0F8A46` (1.5px)
- **Buttons** right-aligned: Cancel ghost (`#F3F4F4`/`#43474C` 600), "Add comment" primary (`#0F8A46`/white 600), radius 8px, `7px 13px`
- Dark mode per dark tokens (textarea bg `#141619`, focus border `#3FC479`)

### 5. Comment panel (330px, radius 12px)
- **Header restructured**: 30px mark left, spanning a two-line text column — "Claudback" (Space Grotesk 600 13.5px) over the hostname (mono 11px `#8B9096`, ellipsized, full origin in `title`). This is the long-hostname strategy: brand never truncates, hostname does. "Clear all" becomes a danger chip: `#FBE9E7` bg, `#C0271B` 600 12px text, radius 6px, `4px 10px`, `flex-shrink: 0`
- **Sync status strip REMOVED when healthy.** Show a strip under the header **only** when not synced:
  - Offline: `#FBF3E0` bg, `1px solid #F2E4C4` bottom border, 7px `#C88A04` dot, 12px 600 `#8A5A00` text — "Collector offline — comments saved locally, retrying"
  - Same pattern for pending/unpaired with appropriate copy
- **Mode row** ("After Claude reads:" + select): unchanged layout; select border `#D9DCDE`, radius 6px
- **Items**: number dot 18px `#0F8A46` pill (resolved `#9CA3AF`); meta line = element tag in mono + "· this page" 11px `#8B9096`; comment text 13px; selector path mono 10.5px `#9BA0A5`, **single line ellipsized** (was multi-line wrap; full path in `title`); Edit link `#0F8A46` 600, Delete `#C0271B` 600, 12px, 12px gap
- Dividers `#F3F4F4`; empty state copy unchanged, 13px `#8B9096` centered
- Dark mode per dark tokens

## Interactions & Behavior
- All existing behavior is unchanged — this is a reskin plus two structural tweaks (panel header two-line layout; composer tag chip) and one behavioral tweak (conditional sync strip)
- Sync strip logic: render only when collector state ∈ {offline, pending, unpaired}; hide when synced. Reuse the existing status polling already driving the popup
- Hover states: primary buttons darken to `#0C6E38`; tinted buttons deepen tint slightly (e.g. `#DFF0E5`); FAB active state `#0C6E38` (replaces `#15803d`)
- Prefer `prefers-color-scheme` media queries; no manual theme toggle needed

## State Management
No new state. The offline strip consumes the existing sync-status value already tracked by the content script/popup.

## Assets
- No external images. The logo is pure geometry (CSS border-radius or a small SVG path) — generate the four manifest PNGs from it
- Space Grotesk: Google Fonts (weights 500/600 sufficient)
- All other iconography stays as the existing inline stroke SVGs (list, X), recolored only

## Files
- `Claudback Branding.dc.html` — the design canvas. Card **1b** = chosen logo (Waypoint); card **1c** = full brand system + every screen mock in light and dark, including the offline-state panel
- Ignore card 1a (rejected logo direction)
