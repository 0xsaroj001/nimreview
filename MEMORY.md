# MEMORY — NimReview

## Now

Written **2026-11-09 10:35 UTC (2026-11-09 16:05 IST)**.

- **Where:** worktree `.claude/worktrees/logout-payment-fixes-0aee8e`, branch `claude/logout-payment-fixes-0aee8e`; the same
  commits are on `main` (local, `Harshyadav442277/nimreview` and the private `0xsaroj001/nimreview`; the feature branch
  was deleted on 0xsaroj001, kept locally). Code commit **`b376d3f`** (earlier: `8b0b473` wallet sign-in etc.,
  `2afca97` review fixes). New dependency: `@noble/hashes`. `.env` copied from the `untitled-a19f37` worktree
  (gitignored). `.vercel/` linked here (gitignored).
- **Production (DEPLOYED 2026-11-09 ~10:28 UTC, owner: "deploy at vercel, i want the latest app everywhere"):**
  https://nimreview.vercel.app = deployment `nimreview-nk24c5b3d-wukong4.vercel.app` (`dpl_AWuAgVWFKAj5S1WxoqzuRdpvpjow`),
  built from `b376d3f` with `vercel deploy --prod` (CLI, not git). Smoke 16/16 PASS against the live URL: `/` 200,
  `/api/health` connected, new owner pages / wallet sign-in / image normaliser / XSS fix served, old connect screen 404,
  email login 404, `/api/bootstrap` 401, demo sign-in 200, challenge issued, bad signature 401, a real Ed25519 signature
  verified on Vercel (new wallet -> setup step, NO account created), challenge reuse 401. The only write was one
  single-use sign-in nonce record (expires after 15 min). No test accounts were created on the live DB. Env vars on
  Vercel (Production + Preview, names only): `JWT_SECRET`, `MONGODB_DB`, `MONGODB_URI`; `NIMIQ_RPC_URL` NOT set (uses the
  open `rpc.nimiqwatch.com`, G28). Previous production: `nimreview-hruhhnhow-wukong4` (`cbfb238`), kept by Vercel for
  rollback (`vercel rollback`).
- **Live DB impact (G29):** the 4 real people's email accounts and the 1 venue are untouched but cannot sign in any more.
  The first request after deploy also drops the unique `email_1` index on `users` (`config/db.js`); not re-checked.
- **Owner requests this session, 2026-11-09 (garbled voice-style message; my reading in brackets):**
  1. Sign in with Nimiq instead of email + password; setup asks reviewer or owner; wallet creates the account, lost
     wallet = lost account is fine. [DONE]
  2. Demo: a real log out button, not a cross. [DONE: labelled "Log out" + door icon everywhere; titlebar on phones,
     header on desktop, menu rows.]
  3. "Wallet setup will allow users to cash out as the hotel's wallet is listed." [Read as: the PLACE pays its guests
     from its own wallet. Replaces the reward fund I built earlier; that is deleted.]
  4. Venue sets the cooldown before a guest can cash out, with an instant option. [DONE: 0/1/3/7/14/30 days, per
     venue, in Settings.]
  5. Stale data when going back and forth: [Review draft is now thrown away when you leave the form; demo data lives
     in sessionStorage (tab only); real logins stay in localStorage. DONE]
  6. Pasted Google picture links not loading. [DONE: see below. I was not given the failing link, so the cause is
     inferred from the usual Google shapes.]
  7. Owner UI too crammed on one page. [DONE: Overview, Reviews, Bill codes, Payouts, Settings.]
- **How it works now:**
  - Sign-in: `POST /auth/challenge` -> wallet signs it (Nimiq Pay `sign()` inside the app, Hub `signMessage` pop-up
    on desktop) -> `POST /auth/wallet` verifies the Ed25519 signature, derives the address from the public key
    (Blake2b-256, first 20 bytes) -> known wallet: signed in; new wallet: ticket -> `POST /auth/signup` with role
    (+ optional name). Challenge is single-use (nonce recorded), 5 min, server-held message, domain in it. No pasted-
    address sign-in (that would let anyone be anyone).
  - Money: reward = what the venue owes the guest (pending -> claimable after the venue's cooldown). Guest asks THAT
    venue to pay (`POST /wallet/cashout {venueId, amount}`, per-venue balance, one 15 s lease per user). Venue pays
    from its wallet (Nimiq Pay `sendBasicTransaction`) or sends from any wallet and pastes the hash; server looks the
    transaction up on the chain (`backend/utils/chain.js`, public RPC) and only marks it paid if sender = venue wallet,
    recipient = guest, value >= amount, executed, confirmed. One tx can settle one payout. Venue can decline (refund).
  - Demo: same flow in the browser with fake NIM; reviewer asks, owner demo pays. Perks are spent from the NIM earned
    at that place.
- **Verified 2026-11-09 ~09:00 UTC:**
  - `npm test` **36/36** (engine, wallet-sig, API end to end against Atlas `nimreview_test`, dropped after). Mutation
    checks: removing the payout sender check, and removing the one-time-challenge check, each fail the tests; both
    restored.
  - Address derivation checked against **5 real mainnet transactions** (public key from the tx proof, address from the
    sender; 5/5 match), one pinned as a test vector.
  - Browser pane on a throwaway DB `nimreview_uitest` (dropped, 0 collections left), using a stand-in `window.nimiq`
    that signs with a real Ed25519 key (SHA-256 + Nimiq prefix form): auto sign-in inside "Nimiq Pay" -> new wallet ->
    role + name -> owner account -> listing (photo check: Google imgres link, `&amp;`, `http`, share page, dead host)
    -> settings (reward 20, instant) -> bill code -> log out (old token 401) -> same wallet signs back in with no setup
    -> second wallet as reviewer -> review with the code: +14.8 NIM claimable at once -> cash-out requested, balance 0 ->
    owner payouts shows it with badge 1 -> "Pay in Nimiq Pay" sent exactly 1,480,000 Luna to the guest -> server refused
    to mark it paid because that fake hash is not on the chain, UI shows "Check the payment". Demo flow: reviewer asks
    Lumen for 20 (161.9 -> 141.9), owner demo pays, history shows it. Phone 375 px: no overflow on all five owner pages.
    Desktop: top nav with Payouts badge, Settings two columns.
- **NOT verified (important):**
  - **Real Nimiq Pay.** What exactly `sign()` signs is undocumented (nimiq.dev, checked 2026-11-08). The server accepts
    three forms (raw bytes, SHA-256 of "\x16Nimiq Signed Message:\n"+len+msg, and that prefixed string unhashed). If
    real Nimiq Pay uses a fourth, sign-in fails with "signature not accepted". Test on a device first.
  - Hub `signMessage` pop-up (never opened); `sendBasicTransaction` shape (`value` in Luna, per docs only).
  - A real on-chain payout end to end; real phone; production; the unauthenticated `/auth/challenge` has no rate limit.
- **Next action:** owner tests wallet sign-in inside real Nimiq Pay (Custom URL field `nimreview.vercel.app`) and reports;
  then admin wallet address(es) for report moderation (G24) and a decision on the 4 orphaned live accounts (G29).
- **Open blockers:** G24 (admin wallet addresses), G29 (existing live accounts), G1, G6, G18.
- **Authorised:** the changes above, commits, pushing `main` to both GitHub repos, and the production deploy (owner's
  words: "push this on 0xsaroj github", "merge the branch. just keep the main", "also deploy at vercel. i want the latest
  app everywhere"). **Not authorised:** any NIM transfer, touching or deleting production data, deleting the other local
  branches/worktrees.

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
- **2026-11-07 ~19:30 UTC: committed `d9ccf34`** on `claude/untitled-a19f37` (owner asked). No attribution trailer
  (checked). Staged diff scanned: no `.env*`, `.vercel`, URI, JWT secret or Atlas password.
- **2026-11-07 ~19:50 UTC: three security fixes after review, uncommitted, not deployed.**
  (1) CSS injection: `&#39;` in a photo URL decoded to a quote inside the style attribute. `bgImg()` now
  HTML-escapes the whole value; server refuses character references. Browser check: normal Unsplash URL still
  loads, the `&#39;` payload stays literal (no `color:red`). (2) Payout race (G19): per-user lease. (3) Reward
  limit race (G20): post-insert re-check, fails closed. `npm test` 23/23; both race tests fail 3/3 with their fix
  removed (mutation check in a throwaway copy). Colluding-venue finding acknowledged, not fixed (G9/G4).
  Next: owner's yes to commit, then redeploy production and re-run the smoke test.
- **2026-11-07 ~21:20 UTC: committed and redeployed the security fixes** (owner: "Commit and redeploy").
  `41e1857` = the three fixes logged above. A further commit review found the payout lease could be released
  by a request that outlived it; `b97dc73` makes the lease token-owned (the new test covers lease semantics but
  cannot stage the slow-request case, said so in the test). `npm test` 23/23 before each commit; secrets scan
  clean; no attribution trailers. Production redeployed and smoke-tested 11/11; smoke data deleted. Found 4 real
  user accounts in the live DB (not ours), left untouched.
- **2026-11-08 ~19:35 UTC: logout + venue reward fund (uncommitted, branch `claude/logout-payment-fixes-0aee8e`).**
  Owner asked for logout in demo and live for guests and venues, and to fix wallet deductions. Found the worktree on
  the stale `ba8440a`; fast-forwarded to `cbfb238`. Logout: server-side token revocation + buttons on every screen.
  Payments: customer deductions were correct (browser check); added the missing venue-side debit (reward fund),
  refunds on void, top-ups, guest-facing "reward fund empty". Tests 27/27; browser checks on a throwaway DB, dropped.
- **2026-11-08 ~20:00 UTC: Nimiq Pay auto-connect + wallet red flags (uncommitted).** Owner's phone showed the Hub
  button leaving the app. Read the Mini App docs and the `@nimiq/mini-app-sdk` 0.2.5 source (init() only waits for
  `window.nimiq`), so the provider is called directly, no new dependency. Added one-wallet-per-account. Red flags
  logged as G23-G26. Real Nimiq Pay test still needed.
- **2026-11-09 ~09:15 UTC: wallet sign-in, venue-paid cash-outs, owner pages (uncommitted).** Replaced email/password
  with Nimiq wallet sign-in (Ed25519 challenge, address derived and checked against mainnet). Deleted the reward-fund
  work from 2026-11-08: owner's message made the venue the payer, so the money moves from the venue's wallet to the
  guest's and the server confirms it on-chain. Cooldown is the venue's choice. Owner area split into five pages.
  Photo links normalised (Google imgres / Drive / `&amp;` / http). Review draft discarded on leaving the form; demo
  data kept per tab. Two research subagents read nimiq.dev; their reports were treated as data (the sign() digest is
  NOT documented, hence three accepted forms).
- **2026-11-09 ~10:00 UTC: automated review of the commit (3 findings), 2 fixed, 1 explained, uncommitted.** (1) Payout could be settled by an older unrelated payment to the same guest: now the transaction's block time must be after the request (2 min skew). (2) Legacy accounts' pasted, never-proven wallet addresses could have been matched to whoever proves that address: `walletProven` added, login and the unique index only use proven wallets (this also corrects my earlier claim that old accounts simply cannot sign in). (3) Host-header binding of the challenge: real threat class (G32) but the suggested fix does not stop a relay; not changed. `npm test` 37/37; mutation checks on both fixes fail the tests.
- **2026-11-09 ~10:30 UTC: pushed and deployed.** `b376d3f` (escape venue names: stored-XSS review finding) committed; `main` fast-forwarded on `Harshyadav442277/nimreview` (`ba8440a` -> `b376d3f`) and `0xsaroj001/nimreview` (`2afca97` -> `b376d3f`); linked this worktree to `wukong4/nimreview`; `vercel deploy --prod` ready in ~20 s; read-only smoke 16/16. Docs commit follows (differs from the deployed build by notes only).
