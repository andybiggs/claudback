# Releasing Claudback

The ordered checklist for taking Claudback public and for future releases. Everything below is a manual step Andy runs — nothing here happens in CI.

## 0. Security audit gate — ✅ passed 2026-07-08

The security-auditor review of the token, origin/CORS, collector, and extension token-handling code passed on 2026-07-08 (findings fixed in [PR #9](https://github.com/andybiggs/Claudback/pull/9)). Verdict: GO for making the repo public.

One condition remains for **distribution** (steps 3–4): at Web Store listing time, pin the published extension ID in the origin allowlist (`packages/mcp-server/src/security.ts` currently accepts any `chrome-extension://` origin) — see step 4.

**Scope note:** the pairing-code flow (`get_pairing_code` tool, `POST /pair` endpoint, `packages/mcp-server/src/pairing.ts`) was added after the 2026-07-08 GO and is not covered by that audit. Include it in the next security-audit pass before distribution.

## 1. Make the repo public

GitHub → Settings → change visibility. Check first that no secrets or personal paths are committed (`git log -p` spot check, `~/.claudback` is never referenced with real tokens).

## 2. Enable GitHub Pages

GitHub → Settings → Pages → Deploy from branch → `main`, folder `/docs`. Verify https://andybiggs.github.io/Claudback/ and `/privacy.html` render.

## 3. Publish `claudback-mcp` to npm

1. Confirm the name is still unclaimed: https://www.npmjs.com/package/claudback-mcp
2. Sanity-check the tarball (should be exactly `dist/bin.js`, `package.json`, `README.md`, `LICENSE`):

   ```sh
   npm pack --dry-run --workspace=claudback-mcp
   ```

3. Publish (unscoped packages are public by default):

   ```sh
   cd packages/mcp-server
   npm publish
   ```

4. Smoke test from a clean directory: `npx -y claudback-mcp` → expect the collector-listening line on stderr.

## 4. Submit the extension to the Chrome Web Store

1. Build the zip:

   ```sh
   npm run zip --workspace=@claudback/extension
   ```

2. Take the screenshots listed in [packages/extension/store/listing.md](./packages/extension/store/listing.md) (1280×800).
3. In the [developer dashboard](https://chrome.google.com/webstore/devconsole) create the item, upload the zip, and fill the form from `listing.md`: descriptions, category, single-purpose statement, permission justifications, privacy policy URL (https://andybiggs.github.io/Claudback/privacy.html), data-use disclosures.
4. Once the item exists in the dashboard the extension ID is fixed: pin it in `packages/mcp-server/src/security.ts` (replace the any-`chrome-extension://` pattern with the published ID) and republish `claudback-mcp` — this is the audit's remaining distribution condition.
5. Submit for review. First review typically takes a few days; `optional_host_permissions` with a broad pattern may draw extra scrutiny — the justification in `listing.md` covers it.

## 5. Replace the Web Store link placeholders

Once the listing is live, put the real URL in:

- `README.md` (quick start step 1)
- `docs/index.html` (hero CTA + quick start — search for `TODO`)

## 6. Future releases

Versions move in lockstep across `packages/shared`, `packages/mcp-server`, `packages/extension` (package.json), and `packages/extension/manifest.json`. For each release:

1. Bump all four versions.
2. `npm run typecheck && npm test`.
3. Server changes → repeat step 3 (publish).
4. Extension changes → repeat step 4 (new zip, upload as a new version, re-review).
