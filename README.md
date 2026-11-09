# NimReview

Open reviews for restaurants, cafés and hotels. Anyone can post; only a **proven visit** earns NIM, and the
reward never depends on the star rating. Venues list themselves, set what they pay per review and print a
single-use bill code on each bill.

Node + Express + MongoDB (Mongoose), MVC. The browser app is plain ES modules in `public/` with no build step.

```bash
npm install
npm start      # http://localhost:5173 (needs .env, below)
npm test       # engine tests + end-to-end API test (API test uses a throwaway nimreview_test database)
```

`.env` (gitignored) holds `MONGODB_URI`, `MONGODB_DB=nimreview` and `JWT_SECRET`. The projects folder syncs to
OneDrive, so install and run from a copy outside it if `node_modules` sync is a problem.

## Accounts

**Sign in with your Nimiq wallet.** No email, no password: your wallet is your account, and losing it loses the
account. Inside **Nimiq Pay** the app asks the wallet to sign a one-time message automatically; on a desktop browser
the Nimiq Hub pop-up does the same. A wallet the app has not seen asks one thing: *I review places* or *I own a
restaurant, café or hotel*. The server checks the signature, works out the address from the signing key, and never
sees a key or seed phrase.

- **Reviewers** prove a visit with the bill code the owner issued, write, and earn NIM owed by that place.
- **Owners** list their place, set the reward per review and how long a guest waits before cashing out (Instant to
  30 days), issue single-use bill codes, answer reviews, and pay their guests' cash-out requests from their own wallet.
- **Demo** (no wallet): reviewer or owner, fake NIM, kept for the browser tab only. Reviewer asks a place to pay, owner
  demo pays it.

## Money

A reward is an IOU from the place that asked for the review. When a guest cashes out, they ask *that* place; the place
sends NIM from its own wallet (one tap in Nimiq Pay, or from any wallet plus pasting the transaction hash). The
server marks it paid only after finding that exact transaction on the Nimiq chain (right sender, right recipient, at
least the amount, executed, in a block). A place can decline a request and the guest gets the NIM back in their
balance. The server never holds a key and never sends NIM itself. The chain lookup uses `NIMIQ_RPC_URL` (default
`the open server `rpc.nimiqwatch.com`, which has no uptime promise: set your own before real use).

## Backend layout

```
server.js                     entry (Vercel default export; listens locally)
backend/app.js                middleware, /api, static public/
backend/config/               env loading, cached Mongo connection
backend/models/               User, Venue, BillCode, Review, LedgerEntry
backend/controllers/          auth, wallet, venue, bill, review, bootstrap
backend/views/serialize.js    JSON shapes the browser renders (same shape as the demo seed)
backend/middleware/           auth (session, live user, role, wallet), errors
backend/routes/index.js       all /api routes
```

The genuineness engine ([public/src/core/genuine.js](public/src/core/genuine.js)) is shared: the browser runs it
for the live score preview, the server re-runs it on submit and only the server's result is stored.

| Route | Who |
|---|---|
| `POST /api/auth/signup` `login` `demo` · `GET /api/auth/me` | anyone |
| `GET /api/bootstrap` · `PUT /api/me/wallet` · `GET /api/venues[/:id]` · `POST /api/reviews/:id/flag` | live user |
| `POST /api/venues` · `PUT /api/venues/mine` · `GET/POST /api/bills` · `POST /api/reviews/:id/reply` | venue |
| `POST /api/reviews/check-proof` · `POST /api/reviews` · `POST /api/reviews/:id/helpful` · `POST /api/wallet/cashout` | customer |

## Bill codes are single use

A code is 10 Crockford base-32 characters, unique by index. Redeeming it is one conditional update
(`usedBy: null` → review id), so two simultaneous submissions cannot both win; `tests/api.test.js` races two
customers on one code and expects exactly one 201 and one 409. A review sent with a used, expired or foreign code
is refused, not posted as unverified. A review rejected for other reasons (copied text, spam) does not use the code.

## Rewards

Each venue sets `rewardPerReview` (0 to 1000 NIM). A review earns `rewardPerReview × genuineness score / 100`,
never more for more stars, and only if the visit is proven and the score is 60+. 0 means the venue funds no rewards.

## How fakes are stopped

All rules live in [public/src/core/genuine.js](public/src/core/genuine.js) (`POLICY` at the top) and are pinned by
[tests/genuine.test.js](tests/genuine.test.js).

| Attack | Defence |
|---|---|
| Write reviews without visiting | Reward needs proof. Live: the venue's single-use bill code, 72 h, venue-bound. Demo also shows NIM payment and GPS check-in |
| Flatter the venue for money / venue buys praise | Reward formula never reads the rating; 1★ and 5★ earn the same |
| Copy-paste reviews across venues | Word 3-shingle overlap ≥ 50 % with any review → rejected |
| Reuse photos | 64-bit difference hash, ≤ 6 bits apart → rejected |
| Low-effort one-liners for coins | Specificity scoring, generic-phrase and spam detection; under 8/30 content points earns nothing |
| Bots | Paste ratio and typing speed (client-reported, max 10 pts, never decisive alone) |
| Farming at volume | 3 rewarded reviews/day, 1 per venue per 30 days, account-trust tiers |
| Venue-run campaign with fresh accounts | > 4 reviews in 24 h from accounts < 7 days old pauses that venue's rewards; minimum bill for a rewarded code |
| Owner reviews self | Venue accounts cannot post reviews; owners cannot review their own venue |
| Fraud found later | Rewards vest 3–14 days by trust tier; an upheld report voids them |

## Not built yet

No NIM moves on-chain: rewards and payout requests are recorded only. NIM-payment proof (chain lookup) and GPS
check-in are demo-only. Wallet connection picks an address through the Nimiq Hub but does not prove ownership.
No rate limiting. Details in [GAPS.md](GAPS.md); status in [MEMORY.md](MEMORY.md).

Live: https://nimreview.vercel.app (Vercel, deployed from the CLI).

Photos: Unsplash (hotlinked). Fonts: Fraunces and Figtree (Google Fonts). Wallet: Nimiq Hub API 1.10.0 (jsDelivr, SRI-pinned).
