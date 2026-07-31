# Claudback marketing strategy

A plan for getting Claudback from 12 installs to its first thousand, using only free
channels and the accounts Andy actually has (Reddit and Product Hunt — no X/Bluesky/HN).
Claudback is noncommercial by choice, so the goal here is adoption and goodwill, not
revenue: more people using it, reporting feedback, and telling other Claude Code users
it exists.

**Status snapshot (31 Jul 2026):** Chrome Web Store shows 12 users, v0.2.3, and **zero
ratings or reviews**. npm package `claudback-mcp` is live. The [landing
page](https://andybiggs.github.io/claudback/) and store listing are polished; discovery
is the problem, not the product — the users we have like it.

## Positioning

One line, used consistently everywhere:

> **The missing visual-feedback loop for Claude Code.** Click the thing on your page,
> say what you want, ask Claude to grab your comments.

Three supporting hooks, in the order they land with the target audience:

1. **Kills the screenshot-and-describe loop.** "The third button in the sidebar, no,
   the other one" is a pain every Claude Code user recognises instantly. Lead with it.
2. **Component mapping (React/Vue).** Comments name the component that rendered the
   element — even unwrapping UI-library wrappers to surface *your* component. This is
   the hardest-to-copy feature and the answer to "why not just screenshot?"
3. **Local-only, pull-not-push security.** No remote servers, loopback-only collector,
   pairing tokens, and comments never auto-enter Claude's context (each is wrapped in an
   untrusted-data envelope against prompt injection). For this audience, the security
   design is a *feature*, not fine print — and "I've no interest in commercialising
   this" is a trust signal worth repeating.

Primary audience: developers iterating on a local build with Claude Code (CLI or
Desktop). Secondary: anyone annotating live sites for Claude to turn into docs —
teardowns, PRDs, design reviews (already in the store listing copy; keep it secondary).

---

## Phase 0 — Fix the funnel first (do before any launch)

Cheap fixes so that traffic we later earn actually converts. Roughly a day of work.
Remaining hands-on steps live in [marketing/submissions.md](./marketing/submissions.md).

- [x] **Fix the README's dead-end quick start.** ~~`README.md` step 1 still says the Web
      Store link is "coming soon"~~ — now links the live listing:
      <https://chromewebstore.google.com/detail/claudback/dbnmlcmmgnchigedlglfmchkendlcfgc>.
- [x] **Make a demo GIF.** Done: `docs/demo.gif` (960px, 12fps, 2.4 MB), converted from
      `design/Listing Images/Claudback.mp4`. Reused at the top of the README; also
      servable from the Pages site for Reddit posts.
- [x] **Restructure the README for visitors, not contributors.** GIF + quick start +
      "Why Claudback" above the fold; dev/troubleshooting content moved to
      [DEVELOPMENT.md](./DEVELOPMENT.md).
- [x] **Add social-card meta to the landing page.** `og:*`/`twitter:*` tags added to
      `docs/index.html` and `docs/changelog.html`, pointing at `docs/social-card.png`
      (copy of the 1400×560 marquee).
- [ ] **Set GitHub repo topics + description.** *(Andy — 1 minute in the GitHub UI;
      exact values in [marketing/submissions.md](./marketing/submissions.md).)*
- [ ] **Tag releases and publish GitHub Releases.** Annotated tags v0.1.2 → v0.2.3 are
      prepared from the changelog prose; *(Andy — push commands + release steps in
      [marketing/submissions.md](./marketing/submissions.md); a scoped session can't
      push tags.)*
- [ ] **Ask the happy dozen for store reviews.** The listing has **zero reviews** —
      at this scale, 5 honest reviews move Chrome Web Store ranking and conversion more
      than anything else on this list. The review link is now in the README and the
      docs-site footer; *(Andy — the personal asks.)* Never gate or nag in-product.

## Phase 1 — Passive discovery (compounds while you sleep)

No social presence required; mostly one-off submissions. Do these the same week as
Phase 0 — some have review queues, so start early.

- [ ] **Official MCP registry** (registry.modelcontextprotocol.io) — staged:
      `server.json` at the repo root and `mcpName` in the server's package.json. Goes
      live with the next npm publish + `mcp-publisher publish` (steps in
      [marketing/submissions.md](./marketing/submissions.md)).
- [ ] **Community MCP directories:** PulseMCP, mcp.so, Glama, Smithery. Paste-ready
      copy for all four in [marketing/submissions.md](./marketing/submissions.md).
- [ ] **Awesome lists (PRs):** `awesome-mcp-servers` (top 2–3 forks by stars) and
      `awesome-claude-code`. Ready-to-paste entry line in
      [marketing/submissions.md](./marketing/submissions.md).
- [x] **Chrome Web Store SEO check.** Short description in `store/listing.md` now
      carries "Claude Code" + "MCP" (128 chars); manifest description says "Claude
      Code" from the next release. *(Andy — paste the new summary into the dashboard;
      see [marketing/submissions.md](./marketing/submissions.md).)*
- [ ] **npm keywords** are already solid (`mcp`, `claude-code`, `annotations`…) — no
      action, just don't lose them in a future publish.
- [ ] **Roadmap option — Claude Code plugin packaging.** There's no
      `.claude-plugin`/marketplace manifest today. If Claude Code's plugin marketplace
      keeps growing, packaging the MCP-server half as an installable plugin removes the
      `claude mcp add` step entirely and adds another discovery surface. Park it as a
      post-launch item; note it pairs well with PLAN.md Phase 4/5 work.

## Phase 2 — Reddit launch (the main push)

Reddit is the one active channel with an existing account, and it's the right one:
r/ClaudeAI regularly front-pages solo-built MCP tools. Rules of engagement: one sub at
a time, spaced a few days apart, native tone, GIF embedded in the post, link in a
comment if the sub is link-hostile, and be present for the first 2–3 hours to answer
questions. Check each sub's self-promo rules before posting.

Order and angles:

1. **r/ClaudeAI** (largest, most receptive). Angle: the origin story + demo.
   Suggested titles —
   - "I got tired of screenshotting my UI for Claude Code, so I built a Chrome
     extension that lets me pin comments Claude can read (free, local-only)"
   - "Click the button, type 'make this green', ask Claude to grab your comments —
     a visual feedback loop for Claude Code"
2. **r/ClaudeCode** (smaller, exact audience). Angle: workflow deep-dive — the
   resolve-as-Claude-works loop, `--scope user` one-time setup, offline buffering.
   Can be a leaner post; this crowd wants the details.
3. **r/reactjs** (and optionally r/vuejs). Angle: lead with component mapping —
   "Comments on your rendered page that resolve to the React component that made the
   element (it unwraps UI-library wrappers too)". This is the post where the
   differentiator *is* the headline.
4. **r/ChatGPTCoding / r/webdev** (broader, later). Angle: the general "stop
   describing UI to your AI" problem. Lower conversion expected; only post once the
   earlier threads have gone well and can be referenced.

For the technical subs, a second-wave post that performs well with developer audiences:
the **security-design writeup** — "How I made a browser→AI feedback channel that can't
be prompt-injected: pull-not-push, loopback-only, pairing tokens, untrusted-data
envelopes." It markets the tool by teaching something.

What to link: the landing page (now with social card), not the store — it explains the
two-part install before asking for one. Have the pinned FAQ ready: "does anything leave
my machine?" (no), "Firefox/Safari?" (not yet), "why noncommercial license?" (it's a
gift, not a funnel — commercial resale is what's restricted).

## Phase 3 — Product Hunt (after Reddit, not before)

PH rewards existing momentum; launching cold as a free dev tool usually fizzles. Wait
until there are store reviews and at least one good Reddit thread to point at.

- **Timing:** Tuesday–Thursday, 12:01am PT. Note NZ timezone — that's early evening
  NZT, which is convenient for being present in comments.
- **Tagline:** "Comment on your page. Claude reads it." (already the brand line —
  don't invent a new one).
- **Gallery:** the six 1280×800 store screenshots (`design/Listing Images/`) plus the
  video — assets are already done; this launch is nearly free.
- **First comment (maker comment):** the origin story from the Reddit post, plus the
  privacy stance and the noncommercial line — PH's audience responds well to "no
  account, no analytics, nothing leaves your machine."
- **Expectations:** a free, niche dev tool typically lands 50–200 upvotes; the value is
  the permanent listing, the backlink, and the badge for the landing page — not the
  launch-day spike.

## Ongoing loop — release-driven micro-marketing

The changelog cadence (6 releases in 3 weeks) is itself a marketing asset. For each
release from now on:

1. Publish a GitHub Release (from the changelog prose).
2. Post a short "what's new" comment in the original Reddit threads — updates to a
   thread that did well re-surface it and show the project is alive.
3. When a release ships something a user asked for via the feedback template, say so
   and thank them by name — that's what turns users into evangelists.
4. Fold the best feedback quotes (with permission) into the landing page as
   testimonials.

## Measurement

Weekly, in a simple note or spreadsheet — no analytics tooling needed (and adding any
would undercut the privacy story):

| Metric | Source | Now (31 Jul) | 30-day target |
| --- | --- | --- | --- |
| Web Store users | Chrome developer dashboard | 12 | 100+ |
| Web Store reviews | Store listing | 0 | 5+ |
| npm weekly downloads | npmjs.com/package/claudback-mcp | ~0 baseline | tracks installs |
| GitHub stars | Repo | — | 50+ |
| Referrers | GitHub Insights → Traffic | — | Reddit + directories visible |

Per-channel rule: after a launch post, judge a channel on the referrer + install bump
within a week. Double down on what moved the number; don't re-post into channels that
didn't (once is a launch, twice is spam).

## Explicitly out of scope

- **X/Bluesky/YouTube/Discord presence** — no accounts, and maintaining social
  channels is a bigger commitment than a solo noncommercial project needs.
- **Hacker News (Show HN)** — no account today, but flagging it as the single best
  future channel for this product: local-only + anti-prompt-injection design + "no
  interest in commercialising" is close to an ideal Show HN profile. Revisit if
  willing to create an account; otherwise someone else posting it organically is fine
  (be ready to show up in comments).
- **Paid ads / sponsorships** — spending money to give away a noncommercial tool
  doesn't add up.
- **Press/newsletter outreach** — skip for now; MCP-focused newsletters may pick it
  up organically from the registries, which is the better version of the same thing.
