# Releasing Claudback

The ordered checklist for taking Claudback public and for future releases. Everything below is a manual step Andy runs — nothing here happens in CI.

## 0. Security audit gate — do not proceed past this

Per [PLAN.md](./PLAN.md), the repo stays private and nothing is published until a security-auditor review of the token, origin/CORS, and collector code passes. Distribution prep (this checklist, packaging, docs, onboarding) is complete, but **publication is gated on the audit**.

Scope of the review: `packages/mcp-server/src/auth.ts`, `security.ts`, `collector.ts`, `store.ts`, plus the extension's token handling (`background.ts`, `options.ts`, `onboarding.ts`) and manifest permissions.

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
4. Submit for review. First review typically takes a few days; `optional_host_permissions` with a broad pattern may draw extra scrutiny — the justification in `listing.md` covers it.

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
