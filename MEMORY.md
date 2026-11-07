# MEMORY — NimReview

## Now

Written **2026-11-07 ~19:25 UTC (2026-11-08 ~00:55 IST)**.

- **Where:** worktree `.claude/worktrees/untitled-a19f37`, branch `claude/untitled-a19f37`, base `ba8440a`.
  **Everything below is uncommitted** (owner has not asked for a commit). `origin` = github.com/Harshyadav442277/nimreview.
- **State:** Express + MongoDB MVC backend built (`server.js`, `backend/`), frontend moved to `public/`.
  First screen = sign-in / sign-up / two demos (guest, venue). Live roles: customer and venue, isolated by route
  table (browser) and role middleware (API). Wallet connect required for live accounts (Hub `chooseAddress` or
  pasted address, checksum-validated). Venues set `rewardPerReview`; bill codes are single-use (conditional update).
- **Secrets:** `.env` (gitignored, never tracked: `git ls-files` shows none) holds `MONGODB_URI` (copied from
  `Downloads/atlas-credentials.env`), `MONGODB_DB=nimreview`, a generated `JWT_SECRET`. The Atlas password
  appeared once in this session's tool output when the credentials file was read; it was not written anywhere else.
- **Verified 2026-11-07 ~18:30 UTC** (local, against Atlas):
  - `npm test` 22/22 (23/23 after the XSS fix logged below): 21 engine tests + `tests/api.test.js` end-to-end against `nimreview_test` (signup, wallet,
    listing, reward, bill code, one-use, concurrent race → exactly one 201 + one 409, role isolation, reply, login).
  - Browser pane: demo venue → set 15 NIM, issued code, switched to hotel; demo guest → venue shows "earn up to
    15", code verified, 2★ review scored 81 → +12.2 NIM, second use refused. Live (on `nimreview_test`): venue
    signup → wallet gate → listing → code issued; customer signup → wallet → review with that code → +5.3 NIM
    pending (66 × 8 NIM). Guest `#/owner` falls back to Explore. 375 px: no horizontal overflow on the first screen.
  - `nimreview_test` dropped afterwards; live `nimreview` database has 0 users/venues/reviews/codes/ledger entries.
- **Deployed 2026-11-07 ~19:15 UTC** from this uncommitted worktree (CLI, not git) to Vercel project
  `wukong4/nimreview` (linked in `.vercel/`, gitignored). Production: **https://nimreview.vercel.app**
  (deployment `nimreview-3gk0rz4x3-wukong4.vercel.app`). `vercel.json` sets `"framework": "express"`; without it the
  old "Other" preset deployed static files only (`/api` 404, seen on preview `nimreview-o7eoiedhm`). Node pinned 24.x.
  Env vars `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET` set as Sensitive for production + preview (piped from `.env`,
  never printed). `vercel link` wrote `.env.local` (only `VERCEL_OIDC_TOKEN`, gitignored).
- **Verified on production 2026-11-07 ~19:20 UTC:** `/` 200; `/api/health` → `{"ok":true,"db":"connected"}`;
  smoke script (`node smoke.mjs <url>`, kept outside the repo) 9/9 PASS: venue signup, wallet, listing, bill code,
  review with code → 201 verified +7.3 NIM, same code again → 409, customer issuing code → 403, venue posting
  review → 403, unsafe photo link → 400. Smoke records (2 users, 1 venue, 1 review, 1 code, 1 ledger entry)
  deleted; live DB back to 0 documents. Browser: demo guest on production shows 7 venues, images, no console errors.
- **Not verified:** real phone on the deployed URL, Nimiq Hub pop-up (`chooseAddress`) end to end in a browser
  (only the pasted-address path was exercised), production performance under load.
- **Next action:** owner tries the live URL (sign up as venue and as guest); decide on commit/push (nothing
  committed; a future git-connected deploy from `main` would not contain this work until it is merged).
- **Open blockers:** G4 (no on-chain payouts / funding), G16 (wallet ownership), G18 (no rate limiting),
  G1 (hackathon entry? then `RULES.md`), G6 (incentivised-review rules).
- **Authorised 2026-11-07:** build the backend and deploy; owner said "Yes, deploy" to sending the Atlas URI and JWT
  secret to Vercel (done). **Not authorised:** commits, pushes, any NIM transfer, changing Atlas network settings.

## Log (append only)

- **2026-11-05 — prototype built.** Owner supplied three reference UIs (ratings summary with bars, review/rate
  screens, new-review flow). Built from an empty folder. Design choices: proof-of-visit gates money, rating-neutral
  rewards, vesting with clawback, duplicate/photo hashing, fair-use limits, burst freeze, 25 % weight for
  unverified reviews.
- **2026-11-05 ~11:40 UTC: responsive redesign.** Owner: drop the in-browser phone frame, make it responsive,
  less generic. Rewrote styles and every view; switched to body scroll; added desktop nav.
- **2026-11-05 ~11:55 UTC: trust page fix.** Owner screenshot showed list text one word per line and card 2's body
  missing on desktop: the card grid placed the list in the 44 px number column. Content now sits in its own body
  column; checked in the pane at 1440 and 1820 px (body text 436-454 px wide, all 7 cards have content).
- **2026-11-07: backend + accounts.** Owner asked for a Mongo/Express/Node MVC backend on the Atlas `nimreview`
  database, sign-up with two roles (venues list themselves; customers review), login, demo accounts using the demo
  data (no real NIM), wallet connect for real accounts, per-venue reward per review, venue demo moved off the
  guest screens onto the first screen, venue view isolated from the guest view, single-use bill codes, then deploy.
  Engine change: reward = venue `rewardPerReview` × score / 100 (falls back to 25 for demo venues without one).
  Live accounts accept only bill-code proof (payment lookup and GPS dwell cannot be trusted yet). Deploy blocked
  at the env-var step pending the owner's yes.
- **2026-11-07 ~18:50 UTC: XSS fix (automated security review).** A venue photo link only had to match
  `https://\S+`, so a quote could break out of the `style` attribute on every guest's screen. Server now parses the
  URL and refuses quotes/brackets/backslashes/whitespace; review photos must be pure base64 data URLs; browser
  renders images only through `bgImg()` (`public/src/ui.js`), which drops anything else. `npm test` 23/23 (new
  cases for both sides); all 13 demo images still pass the filter. Not re-checked in the browser pane.
- **2026-11-07 ~19:15 UTC: deployed.** Owner: "Yes, deploy". Linked the existing Vercel project, set env vars,
  preview showed `/api` 404 under the "Other" preset; added `vercel.json` `framework: express`, preview then
  healthy, promoted to production at https://nimreview.vercel.app. Smoke test 9/9 on production, smoke data deleted.
