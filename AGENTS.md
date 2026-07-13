# Agent Instructions

General guidelines for AI agents working in this codebase.

## Repo Overview

- npm workspaces monorepo: `packages/shared` (zod schema, constants, selector capture), `packages/mcp-server` (`claudback-mcp` — stdio MCP server + embedded loopback collector), `packages/extension` (Manifest V3 Chrome extension).
- See `README.md` for setup, build, and how to run the server. See `PLAN.md` for the full architecture, security/threat model, and phase plan — read it before making any change that touches the collector, the pairing token, or comment data flow.

## Git Workflow

- **All work goes through a branch and a PR — no direct commits or pushes to `main`.** This applies to code and docs equally.
- Branch names follow `phase-N/short-name` for plan phases, or `fix/short-name` / `docs/short-name` for everything else.
- Commits in this repo do not require the user's approval before running (unlike most repos) — but they must still go through a PR, not straight to `main`.
- Prefer non-destructive git operations. If local and remote history diverge, use `git pull --ff-only` (or stash + fast-forward + pop) rather than `git reset --hard` — the latter is a legitimate last resort, but check for a non-destructive path first.
- Before merging a PR, `npm run typecheck` and `npm test` must both be clean at the repo root.

## Security Model

This is a local dev tool that receives user-authored text from a browser extension and later feeds it into an LLM's context. Treat every change through that lens:

- **The collector binds `127.0.0.1` only.** Never bind `0.0.0.0` or accept a host argument that could widen this.
- **Every collector request must carry the pairing token** (`TOKEN_HEADER` from `@claudback/shared`), compared timing-safe (see `packages/mcp-server/src/auth.ts`). Never log the token itself.
- **CORS is an allowlist, not a wildcard.** The allowlist is pinned to the published extension ID; any other origin gets a bare 403 with no CORS headers. Don't relax this to fix a dev inconvenience — the sanctioned dev path is the `CLAUDBACK_DEV_EXTENSION_ID` environment variable (see below).
- **Comment text reaching Claude is untrusted.** It must stay behind pull-only MCP tools (never pushed into context automatically), size-capped, control/bidi-character sanitized at ingest, and wrapped in the nonce-delimited envelope (`packages/mcp-server/src/envelope.ts`) so comment content can't forge the envelope's own closing tag.
- **`htmlExcerpt` captures tag and attribute names only — never attribute values.** Values routinely carry tokens, session IDs, or PII.
- Any change to `packages/mcp-server/src/{auth,security,collector,sanitize,envelope}.ts` should get a security-focused review pass (a security-auditor agent or equivalent) before merging, not just a typecheck/test pass.

## Build Notes

- **Packages that ship a runnable binary (`mcp-server`) must be bundled with esbuild, not built with plain `tsc`.** Workspace imports like `@claudback/shared` resolve to that package's TypeScript source at the type level; a `tsc`-only build emits JS that still imports the unbuilt `.ts` source and crashes at runtime with `ERR_MODULE_NOT_FOUND`. `tsc -b` is for typechecking only in this repo — its output goes to `tsbuild/`, not `dist/`.
- `dist/` is esbuild output (what actually ships/loads); `tsbuild/` is typecheck-only output. Both are gitignored. Every package's `vitest.config.ts` must exclude both, or compiled `.test.js` files under `tsbuild/` get picked up alongside their `.ts` sources and double-count tests.
- After changing a package's build config, actually run the built artifact (`node dist/bin.js`, load the unpacked extension) — a clean `tsc -b` does not prove the shipped bundle works.

## Manual testing with an unpacked extension

An unpacked dev build has a different extension ID than the store copy, so the collector rejects it (403 with no CORS headers — the browser reports a CORS preflight failure on `/pair`). This is the pinned allowlist working as designed, not a bug; do not "fix" it by widening the allowlist. Instead:

1. Build both packages and load `packages/extension/dist/` unpacked (disable the store copy of the extension while testing).
2. Register the source-built server with the unpacked copy's ID allowlisted:

   ```sh
   claude mcp remove --scope user claudback
   claude mcp add --scope user claudback \
     --env CLAUDBACK_DEV_EXTENSION_ID=<unpacked-extension-id> \
     -- node /absolute/path/to/Claudback/packages/mcp-server/dist/bin.js
   ```

3. Restart the Claude Code session (the old server process keeps running otherwise), then pair. The unpacked ID is stable as long as the extension loads from the same directory; the pairing token in `~/.claudback/` is shared between dev and production servers.
4. Testing schema or tool changes requires the source-built server — the published `npx claudback-mcp` strips unknown comment fields at ingest and won't surface new tool output.

## Testing

- Unit tests live alongside source as `*.test.ts` (Vitest). Run `npm test` from the root for the full suite, or `npm test --workspace=<name>` to scope to one package.
- `npm run typecheck` runs `tsc -b` across all packages via project references.
- Tests touching the DOM use `// @vitest-environment happy-dom`; the mcp-server and extension packages otherwise run under `node`.
- When adding a security-relevant fix (e.g. closing an injection vector), add a regression test that would fail without the fix — see `envelope.test.ts`'s tag-spoof test for the pattern.

## Code Style

- Tabs for indentation.
- Always use braces in `if`/`else`, even single-line bodies.
- No nested ternaries.
- TypeScript strict mode throughout.
- Default to no comments. Only add one when the *why* is non-obvious (a security invariant, a workaround, a subtle constraint) — never restate what the code already says.
- Keep changes minimal and focused; don't refactor or add abstractions beyond what was asked.

## Commits

- Use the standard commit body style already in this repo's history: a one-line summary, a blank line, then the "why" — what broke or what this enables — not just a description of the diff.
- Sign off with `Co-Authored-By: Claude <model> <noreply@anthropic.com>` matching whichever model did the work.
