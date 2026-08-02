# Releasing Pinback

The ordered checklist for taking Pinback public and for future releases. Everything below is a manual step Andy runs — nothing here happens in CI.

## 0. Security audit gate — ✅ passed 2026-07-08

The security-auditor review of the token, origin/CORS, collector, and extension token-handling code passed on 2026-07-08 (findings fixed in [PR #9](https://github.com/andybiggs/pinback/pull/9)). Verdict: GO for making the repo public.

That condition — pinning the published extension ID in the origin allowlist (`packages/mcp-server/src/security.ts`) — was satisfied in `fce0f8d`. `PUBLISHED_EXTENSION_ID` now holds the real ID; leave it alone unless the Web Store item itself is replaced.

**Pairing-code flow — ✅ passed 2026-07-08.** The `get_pairing_code` tool, `POST /pair` endpoint, and `packages/mcp-server/src/pairing.ts` (added after the initial GO) got their own focused audit: brute force is infeasible (2^40 code space, 5-attempt cap, single-use, 10-min TTL), the bearer token never leaks via MCP output, logs, errors, or timing, and the endpoint's placement in the request pipeline doesn't regress the token gate on any other route. Verdict: GO. One low-severity note (unbounded concurrent `/pair` requests from a hostile local process — no confidentiality/integrity impact, loopback-only) is optional hardening, not blocking. The extension-ID pin in step 4 covers `/pair` too — no separate action needed.

## 1. Make the repo public

GitHub → Settings → change visibility. Check first that no secrets or personal paths are committed (`git log -p` spot check, `~/.claudback` is never referenced with real tokens).

## 2. Enable GitHub Pages

GitHub → Settings → Pages → Deploy from branch → `main`, folder `/docs`. Verify https://andybiggs.github.io/pinback/ and `/privacy.html` render.

## 3. Publish `pinback-mcp` to npm

1. Confirm the name is still unclaimed: https://www.npmjs.com/package/pinback-mcp
2. Sanity-check the tarball (should be exactly `dist/bin.js`, `package.json`, `README.md`, `LICENSE`):

   ```sh
   npm pack --dry-run --workspace=pinback-mcp
   ```

3. Publish (unscoped packages are public by default):

   ```sh
   cd packages/mcp-server
   npm publish
   ```

4. Smoke test from a clean directory: `npx -y pinback-mcp` → expect the collector-listening line on stderr.

## 4. Submit the extension to the Chrome Web Store

1. Build the zip:

   ```sh
   npm run zip --workspace=@pinback/extension
   ```

2. Take the screenshots listed in [packages/extension/store/listing.md](./packages/extension/store/listing.md) (1280×800).
3. In the [developer dashboard](https://chrome.google.com/webstore/devconsole) create the item, upload the zip, and fill the form from `listing.md`: descriptions, category, single-purpose statement, permission justifications, privacy policy URL (https://andybiggs.github.io/pinback/privacy.html), data-use disclosures.
4. Once the item exists in the dashboard the extension ID is fixed: pin it in `packages/mcp-server/src/security.ts` (replace the any-`chrome-extension://` pattern with the published ID) and republish `pinback-mcp` — this is the audit's remaining distribution condition.
5. Submit for review. First review typically takes a few days; `optional_host_permissions` with a broad pattern may draw extra scrutiny — the justification in `listing.md` covers it.

## 5. Replace the Web Store link placeholders

Once the listing is live, put the real URL in:

- `README.md` (quick start step 1)
- `docs/index.html` (hero CTA + quick start — search for `TODO`)

## 6. The Claudback → Pinback rename (one-off, v0.3.0)

The product was renamed from Claudback to Pinback. The Web Store item was **renamed, not recreated**, so the extension ID is unchanged and existing users auto-update — `PUBLISHED_EXTENSION_ID` in `security.ts` must stay as it is.

Three compat mechanisms carry existing installs across. Ship them in this order:

1. **npm first, store second.** Publish `pinback-mcp`, then run the alias publish so `claudback-mcp` resolves to the same build:

   ```sh
   npm publish --workspace=pinback-mcp
   npm run publish-alias --workspace=pinback-mcp            # dry run
   npm run publish-alias --workspace=pinback-mcp -- --publish
   ```

   Existing users have `npx -y claudback-mcp` pinned in their agent config. npx resolves the latest version of that name, so keeping the alias current is what moves them onto the new server without them editing anything. Publishing the store update first would put a new extension in front of a stale server.

2. **Then deprecate the old name** (do this after the alias is published, or the notice points at nothing):

   ```sh
   npm deprecate claudback-mcp "Renamed to pinback-mcp — please re-register the MCP server as: npx -y pinback-mcp"
   ```

3. **Then update the store listing**: upload the new zip and submit for review.

   The listing title is **not** a dashboard field — it comes from `name` in `manifest.json`, which is what's shown in the install dialog, `chrome://extensions`, and the store. Uploading the zip renames the item; there is nothing to type. (Manifest `name` is capped at 75 characters.)

   What does need editing by hand: the short and full descriptions from `listing.md`, the privacy-policy URL (it moves with the repo rename — `https://andybiggs.github.io/pinback/privacy.html`), the store icon, and any screenshots or promo images carrying the old wordmark.

   The item's ID is a hash of its public key, assigned at item creation and unrelated to the name, so renaming keeps `dbnmlcmmgnchigedlglfmchkendlcfgc` and existing users auto-update on the same channel. The store URL's slug changes; the ID segment still resolves. Renaming an item in place is the only option that preserves the install base — creating a new item mints a new ID and strands every existing user.

Repo rename (`andybiggs/claudback` → `andybiggs/pinback`) is a GitHub Settings change. GitHub permanently redirects the old clone and web URLs, but update the Pages URL in the Web Store listing since that is the registered privacy-policy link.

### Closing the compat window

These mechanisms exist only for the transition. Retire them together, no earlier than three releases after v0.3.0:

- `packages/extension/src/lib/collector.ts` still sends `LEGACY_TOKEN_HEADER`. It cannot send the new header while collectors pinned to the old npm name are still out there — their CORS preflight rejects it. **Flip this to `TOKEN_HEADER` first**, one release before removing anything else; `packages/extension/src/lib/collector.test.ts` asserts the current behaviour and will fail as the reminder.
- `LEGACY_TOKEN_HEADER` acceptance in `collector.ts`/`security.ts` and the `CLAUDBACK_DEV_EXTENSION_ID` fallback in `security.ts` can go once the header flip has shipped.
- `packages/mcp-server/scripts/publish-alias.mjs` and the `claudback_token` fallback in `packages/extension/src/lib/token-storage.ts` go last.

**Renaming the state directory is part of closing this window, not part of the rename release.** `STATE_DIR` in `packages/mcp-server/src/paths.ts` deliberately stays `~/.claudback`; `paths.test.ts` pins it and explains why. A v0.2.x server reached through the `claudback-mcp` alias has that path compiled in, and agent sessions keep one resident for hours — so while the alias is live, two servers can run at once. Moving the directory under a running old server is silently destructive: its next write recreates `~/.claudback` via `mkdir(recursive)`, the extension keeps getting `201`s from whichever server owns port 57463, and the agent reads the other directory and reports no comments. Once both directories exist nothing can tell which is authoritative. Rename it — if at all — only after the alias is retired and old servers have aged out. The directory name is never typed by a user; the npm package, server, tools, and extension all carry the new name.

## 7. Future releases

Versions move in lockstep across `packages/shared`, `packages/mcp-server`, `packages/extension` (package.json), and `packages/extension/manifest.json`. For each release:

1. Bump all four versions.
2. `npm run typecheck && npm test`.
3. Server changes → repeat step 3 (publish). While the alias is still supported, publish it too (step 6).
4. Extension changes → repeat step 4 (new zip, upload as a new version, re-review).
