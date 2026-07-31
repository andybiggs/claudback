# Submissions playbook

Everything staged by the Phase 0/1 work that needs Andy's hands (accounts, auth, or
GitHub UI) to finish. Each item is copy-paste ready. Companion to [MARKETING.md](../MARKETING.md).

## 1. One-time follow-ups from Phase 0

### Push the release tags (~30 seconds)

Annotated tags v0.1.2 → v0.2.3 were created from the changelog prose but a scoped
session can't push tags. From a normal checkout of `main`, recreate and push:

```sh
git tag -a v0.1.2 3784f9a -m "Claudback 0.1.2 — July 9, 2026"
git tag -a v0.1.3 db37869 -m "Claudback 0.1.3 — July 10, 2026"
git tag -a v0.1.4 7dc6640 -m "Claudback 0.1.4 — July 11, 2026"
git tag -a v0.2.0 55e7a8c -m "Claudback 0.2.0 — July 13, 2026"
git tag -a v0.2.1 489d72e -m "Claudback 0.2.1 — July 15, 2026"
git tag -a v0.2.3 e2e8f7e -m "Claudback 0.2.3 — July 24, 2026"
git push origin v0.1.2 v0.1.3 v0.1.4 v0.2.0 v0.2.1 v0.2.3
```

Then on GitHub: **Releases → Draft a new release → choose tag**, paste the matching
entry from [the changelog](https://andybiggs.github.io/claudback/changelog.html) as the
body. At minimum do v0.2.3; backfilling the rest is nice-to-have.

### Set repo topics and description (GitHub UI, ~1 minute)

Repo page → ⚙ next to About:

- **Description:** `Pin comments to elements on any page — Claude Code reads them via a local MCP server and makes the changes. Nothing leaves your machine.`
- **Website:** `https://andybiggs.github.io/claudback/`
- **Topics:** `mcp` `mcp-server` `model-context-protocol` `claude` `claude-code` `chrome-extension` `annotations` `developer-tools`

### Update the Web Store dashboard summary

The listing summary currently shows the manifest description, which doesn't say
"Claude Code" or "MCP" — the two terms people search. In the [developer
dashboard](https://chrome.google.com/webstore/devconsole) → Store Listing → Summary,
paste the updated short description from
[`packages/extension/store/listing.md`](../packages/extension/store/listing.md):

> Pin comments to page elements. Claude Code reads them via a local MCP server and makes the changes. Nothing leaves your machine.

(The manifest description was also updated to say "Claude Code" — that ships with the
next extension release. "MCP" is deliberately kept out of the manifest per #22/#23/#26.)

### Ask the happy dozen for reviews

The listing has zero reviews; five honest ones change everything at this scale. The
review link (now also in the README and site footer):
https://chromewebstore.google.com/detail/claudback/dbnmlcmmgnchigedlglfmchkendlcfgc/reviews

## 2. Official MCP registry

Staged in this repo: `server.json` at the root, and `mcpName: "io.github.andybiggs/claudback"`
in `packages/mcp-server/package.json`. The registry validates that the *published* npm
package contains `mcpName`, so publishing happens on the next server release:

1. Bump `claudback-mcp` to 0.2.2 (per RELEASING.md as usual) and `npm publish` — this
   version now carries `mcpName`. `server.json` already says 0.2.2; keep them in sync.
2. Install the publisher CLI and authenticate (GitHub device login):

   ```sh
   brew install mcp-publisher   # or the curl one-liner from modelcontextprotocol.io/registry/quickstart
   mcp-publisher login github
   mcp-publisher publish        # run from the repo root, next to server.json
   ```

3. Verify: `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.andybiggs/claudback"`

Downstream directories (below) increasingly index the official registry, so this is
the highest-leverage single submission.

## 3. Community directories

Paste-ready fields for all of them:

- **Name:** Claudback
- **One-liner:** Pin visual-feedback comments to elements on any web page — Claude reads them via a local MCP server and makes the changes.
- **Description:** Claudback is a Chrome extension plus local MCP server (`claudback-mcp`) for iterating on a local build with Claude Code without screenshots or "the third button in the sidebar" descriptions. Click an element, say what you want, ask Claude to grab your comments — each carries the exact selector, and on React/Vue apps the component that rendered it. Local-only: no remote servers, no accounts, no analytics; the collector binds to 127.0.0.1 and comments never auto-enter Claude's context.
- **Category:** Developer Tools / Browser Automation / Productivity
- **Repo:** https://github.com/andybiggs/claudback · **npm:** claudback-mcp · **Site:** https://andybiggs.github.io/claudback/

Where to submit:

| Directory | How |
| --- | --- |
| PulseMCP | https://www.pulsemcp.com/submit (form) |
| mcp.so | "Submit" on https://mcp.so (form/GitHub issue) |
| Glama | https://glama.ai/mcp/servers — auto-indexes GitHub + the official registry; claim the listing once it appears |
| Smithery | https://smithery.ai — sign in with GitHub, add server |

## 4. Awesome-list PRs

Target the top `awesome-mcp-servers` forks by stars (punkpeye's and wong2's are the
big two) plus `hesreallyhim/awesome-claude-code`. One-liner entry, matching each
list's format, under Browser/Feedback/Dev-tools:

```md
- [Claudback](https://github.com/andybiggs/claudback) — Pin visual-feedback comments to elements on any web page from a Chrome extension; Claude reads them (with exact selectors and React/Vue component names) via a local, loopback-only MCP server.
```

Read each list's CONTRIBUTING first — most want alphabetical order and reject
promotional wording. The entry above is descriptive on purpose.

## 5. Next-release checklist additions

When 0.2.4 (extension) / 0.2.2 (server) ships:

- [ ] npm publish carries `mcpName` → run the registry publish (section 2)
- [ ] New manifest description ("Claude Code") goes live on the store listing
- [ ] Create the GitHub Release for the new tag
- [ ] Post a "what's new" update in the Reddit threads (Phase 2, once they exist)
