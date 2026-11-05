# GAPS — guesses, unknowns, unbuilt parts

States: OPEN · CLOSED (with evidence) · KILLED. Opened 2026-11-05.

| # | Gap | State | Next step |
|---|---|---|---|
| G1 | Is NimReview a hackathon entry (e.g. a later Nimiq Mini Apps cycle)? If yes, folder rule 1 requires `RULES.md` from the organiser's primary source before more work; the code here was built on the owner's direct request without one. | OPEN | Owner to say which event, if any |
| G2 | Genuineness engine runs in the browser (demo). All checks, receipts, ledger and limits must move to a server; client results are forgeable. | OPEN | Pick backend (the engine is pure and portable as is) |
| G3 | Payment proof checks seeded transactions only. Real version needs a Nimiq RPC lookup of the tx by hash, confirmations, sender and recipient. RPC method names not checked against current docs. | OPEN | Verify against Nimiq RPC docs before building |
| G4 | Cash-out is simulated. Needs a treasury wallet and a signing service; who funds rewards (venues, sponsor, fees) is undecided, so the economics are unknown. | OPEN | Owner decision on funding model |
| G5 | Reward size (25 NIM max), minimum bill ₹150 and minimum payment 50 NIM are placeholders. NIM's fiat value was not checked. | OPEN | Set from a real budget per review |
| G6 | Legal: paid/incentivised reviews usually need disclosure, and some jurisdictions restrict compensated reviews (e.g. US FTC rule on consumer reviews, 2024; India rules unknown). Not verified against primary sources. The app does not yet label rewarded reviews as incentivised. | OPEN | Check primary sources; add an "earned NIM" disclosure on review cards if required |
| G7 | Weak signals: GPS can be spoofed; typing signals are client-reported. Real GPS check-in records arrival only (no departure step), so dwell time fails outside the demo simulation. | OPEN | Arrival + departure check-in flow; server-side attestation where available |
| G8 | Photo dedupe only compares photos uploaded in this app (seed photos carry no hashes). No EXIF/time check, no reverse image search. | OPEN | Hash on upload server-side; compare against all stored photos |
| G9 | Bill amounts on receipts are whatever the venue types. A colluding venue can still mint receipts for fake accounts; burst detection and minimum bill limit it but do not stop it. | OPEN | POS integration or tie receipts to NIM payments; per-venue receipt-to-revenue anomaly checks |
| G10 | Sybil: one person, many wallets. Each wallet still needs a real proof, which caps it, but nothing links wallets to a person. | OPEN | Decide whether a uniqueness check (phone, Nimiq Pay identity) is acceptable |
| G11 | Nimiq address checksum (IBAN mod-97) is pinned only by the all-zero burn address `NQ07 0000…` from memory, not checked against a live address in docs. | OPEN | Validate one real address from Nimiq docs or wallet |
| G12 | Owner identity: who may act as a venue owner is not verified; staff wallets are unknown, so the "staff cannot review" rule only covers listed owner wallets. | OPEN | Venue claim + staff wallet registration flow |
| G13 | No Nimiq Pay / Mini App SDK integration; wallet address is a demo constant. | OPEN | Read the current Mini App SDK docs, then connect |
| G14 | Not a git repository; nothing committed. | OPEN | Owner to ask for `git init` + first commit |
| G15 | Testing on a phone over plain HTTP (`http://<LAN IP>:5173`): browsers block geolocation and the clipboard on insecure origins, so real GPS check-in and "Copy" fail there. The demo "simulate visit" path still works. Campus Wi-Fi may also isolate devices. | OPEN | HTTPS preview (Vercel preview deploy or a tunnel), needs owner's yes |
