# NimReview

Open reviews for restaurants, cafés and hotels. Anyone can post; only a **proven visit** earns NIM, and the
reward never depends on the star rating. Mobile-first web app, no build step, no dependencies.

```bash
npm start      # http://localhost:5173
npm test       # genuineness engine + Nimiq address tests (node:test)
```

## Design

Responsive, mobile first. Phones get a floating dark tab bar with a hexagon write button; from 640 px sheets
become centred dialogs and lists go two-up; from 960 px a top nav replaces the tab bar and venue, wallet, profile
and owner pages split into two columns. Type: Fraunces (display serif) + Figtree. Palette: warm paper, ink, Nimiq
gold, paprika. Recurring motif: receipts (the review result, owner codes, perk tickets), because proof of visit is
the product.

## Screens

Explore (search, categories, distance) · Venue (weighted rating, distribution, aspects, verified badges, owner
replies) · Write review (prove visit → rate and write with a live genuineness meter → result) · Wallet (claimable,
unlocking, activity, cash-out with address checksum) · Perks (spend NIM on venue coupons) · Me (trust tier, my
reviews) · Owner view (issue receipt codes, reply, dispute, KPIs, burst alert) · How reviews stay genuine.

## How fakes are stopped

All rules live in [src/core/genuine.js](src/core/genuine.js) (`POLICY` at the top) and are pinned by
[tests/genuine.test.js](tests/genuine.test.js).

| Attack | Defence |
|---|---|
| Write reviews without visiting | Reward needs proof: NIM payment to the venue wallet (40 pts), single-use venue receipt code, 72 h, venue-bound (34), or GPS check-in, 120 m, 20 min dwell (16; alone it cannot pay a new account) |
| Flatter the venue for money / venue buys praise | Reward formula never reads the rating; 1★ and 5★ earn the same |
| Copy-paste reviews across venues | Word 3-shingle overlap ≥ 50 % with any review → rejected |
| Reuse photos | 64-bit difference hash, ≤ 6 bits apart → rejected |
| Low-effort one-liners for coins | Specificity scoring (menu items, aspects, concrete details), generic-phrase and spam detection; under 8/30 content points earns nothing |
| Bots | Paste ratio and typing speed (client-reported, max 10 pts, never decisive alone) |
| Farming at volume | 3 rewarded reviews/day, 1 per venue per 30 days, account-trust tiers |
| Venue-run campaign with fresh accounts | > 4 reviews in 24 h from accounts < 7 days old pauses that venue's rewards; minimum bill for a rewarded receipt |
| Owner reviews self | Owner/staff wallets cannot review their venue |
| Fraud found later | Rewards vest 3–14 days by trust tier; an upheld report voids them |
| Unverified noise in ratings | Unverified reviews count 25 % in the average |

## Demo vs real

This is a prototype. **The engine runs in the browser so the demo works offline; in production it must run on a
server**, because anything computed client-side can be forged. Data is fictional seed data in `localStorage`
(reset from Me → Reset demo data). Payment proof checks a seeded transaction list, not the Nimiq chain. Cash-out
moves no NIM. Open items are in [GAPS.md](GAPS.md); status in [MEMORY.md](MEMORY.md).

Photos: Unsplash (hotlinked). Font: Mulish (Google Fonts).
