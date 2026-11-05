# MEMORY — NimReview

## Now

Written **2026-11-05 ~11:40 UTC (~17:10 IST)**.

- **State:** responsive redesign done, all files uncommitted; the folder is **not a git repository** (G14).
- **Design (owner asked 2026-11-05: no phone frame, responsive, less generic):** body scroll, phone tab bar <960 px,
  top nav >=960 px, two-column venue/wallet/profile/owner on desktop. Fraunces + Figtree, paper/ink/gold/paprika,
  receipt motif (result receipt with stamp and barcode, owner code receipt, perk tickets).
- **Verified 2026-11-05 ~11:35 UTC:** `npm test` 21/21 pass. Browser pane at 375 px: no horizontal overflow on all
  9 routes (one list-overflow bug found and fixed); write flow with a receipt scored 81, earned 20.3 NIM, receipt
  rendered. At 1366 px: top nav, 2-column hero, 4-up picks, venue sidebar layout rendered.
- **Phone test:** server (`npm start`, preview server on port 5173) answers on `http://172.16.38.108:5173`
  (Wi-Fi, checked from this machine: 200). Node has an inbound firewall allow rule. Not checked from a real phone.
  Over plain HTTP, GPS check-in and Copy will fail (G15).
- **Not verified:** real phone rendering (iOS Safari / Android Chrome), camera upload on a phone, accessibility audit.
- **Demo only:** engine runs client-side; seeded chain transactions; cash-out moves nothing (G2–G4).
- **Open blockers:** G1 (hackathon entry? then `RULES.md`), G4 (who funds rewards), G6 (incentivised-review rules).
- **Next action:** owner tests on phone and reports issues; HTTPS preview if GPS must work (needs a yes).
- **Authorised:** build UI and anti-fake system; redesign. **Not authorised:** commits, deploys, publishing,
  firewall changes, any NIM transfer.

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
