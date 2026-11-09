// Demo data. Every venue, person and review here is fictional; counts and ratings in the UI are computed
// from these records only, nothing is inflated.
import { makeAddress } from '../core/nimiq.js';

const DAY = 864e5;
const HOUR = 36e5;
const img = (id, w = 900) => `https://images.unsplash.com/photo-${id}?w=${w}&q=70&auto=format&fit=crop`;

export const DEMO_CENTER = { lat: 12.9719, lng: 77.6412, label: 'Indiranagar, Bengaluru' };

export function createSeed(now = Date.now()) {
  const venues = [
    {
      id: 'lumen', name: 'Lumen Bistro', type: 'restaurant', cuisine: 'Modern European', price: 3,
      lat: 12.9732, lng: 77.6405, address: '12th Main, HAL 2nd Stage', hours: '12:00 – 23:30',
      img: img('1517248135467-4c7edcad34c4'), nimAddress: makeAddress('5D3A0V4E9LCX7H1MBQRTUFYK2PNS8G6J'),
      menu: ['truffle risotto', 'burrata', 'lamb shank', 'tiramisu', 'sourdough'], ownerId: 'u_owner',
    },
    {
      id: 'copper', name: 'Copper Kettle Café', type: 'cafe', cuisine: 'Coffee & bakes', price: 2,
      lat: 12.9698, lng: 77.6389, address: '80 Feet Road, Indiranagar', hours: '07:30 – 21:00',
      img: img('1554118811-1e0d58224f24'), nimAddress: makeAddress('HQ4T8N2CY6RJ0VKDX3LM9BPE1G7AF5SU'),
      menu: ['cold brew', 'cappuccino', 'almond croissant', 'avocado toast', 'banana bread'],
    },
    {
      id: 'saffron', name: 'Saffron Courtyard', type: 'restaurant', cuisine: 'North Indian', price: 2,
      lat: 12.9761, lng: 77.6448, address: 'Old Airport Road, Domlur', hours: '11:30 – 23:00',
      img: img('1555396273-367ea4eb4db5'), nimAddress: makeAddress('2V7KPC9X4NQ1TH8ME3RJ6YB0DLF5GSUA'),
      menu: ['dal makhani', 'butter naan', 'paneer tikka', 'biryani', 'gulab jamun'],
    },
    {
      id: 'marigold', name: 'Hotel Marigold Residency', type: 'hotel', cuisine: '4-star hotel', price: 3,
      lat: 12.9684, lng: 77.6475, address: 'Indiranagar Double Road', hours: 'Check-in 14:00',
      img: img('1566073771259-6a8506099945'), nimAddress: makeAddress('YB6L1R8DT3Q0XK5VNG2HJ9CMP4A7FEUS'),
      menu: ['deluxe room', 'breakfast buffet', 'rooftop pool', 'spa', 'airport shuttle'],
    },
    {
      id: 'brew', name: 'Brew Theory', type: 'cafe', cuisine: 'Specialty coffee', price: 2,
      lat: 12.9745, lng: 77.6369, address: 'CMH Road, Indiranagar', hours: '08:00 – 22:00',
      img: img('1501339847302-ac426a4a7cbb'), nimAddress: makeAddress('KD0R5T9QX2M7HV4LC8YN1BG6JP3EAFSU'),
      menu: ['pour over', 'flat white', 'cheesecake', 'iced mocha', 'grilled sandwich'],
    },
    {
      id: 'nilgiri', name: 'Nilgiri Table', type: 'restaurant', cuisine: 'South Indian', price: 1,
      lat: 12.9662, lng: 77.6398, address: '100 Feet Road, Indiranagar', hours: '06:30 – 22:30',
      img: img('1414235077428-338989a2e8c0'), nimAddress: makeAddress('3N8XQ5HC0VKT1YL7DR9BM2PJ6E4GFASU'),
      menu: ['masala dosa', 'filter coffee', 'idli', 'pongal', 'appam'],
    },
    {
      id: 'willow', name: 'The Willow Suites', type: 'hotel', cuisine: 'Boutique hotel', price: 3,
      lat: 12.9789, lng: 77.6421, address: 'Indiranagar 1st Stage', hours: 'Check-in 13:00',
      img: img('1551882547-ff40c63fe5fa'), nimAddress: makeAddress('T6M1K9XV3QDH8R0YC5LN2BJ7PG4EAFSU'),
      menu: ['suite', 'breakfast', 'balcony', 'gym', 'late checkout'],
    },
  ];

  const users = {
    u_me: { id: 'u_me', name: 'Aanya Rao', createdAt: now - 74 * DAY, reviewCount: 6, helpfulVotes: 19, upheldFlags: 0, nimAddress: makeAddress('M8K2X4QHV7C0D3NB9RPLT5YEUJ1F6GSA'), ownsVenueIds: [] },
    u_owner: { id: 'u_owner', name: 'Karan Mehta', createdAt: now - 300 * DAY, reviewCount: 0, helpfulVotes: 0, upheldFlags: 0, nimAddress: makeAddress('P0L4C8R2X6VD9TK1MH5QN3BYJ7GEAFSU'), ownsVenueIds: ['lumen'] },
    u_1: { id: 'u_1', name: 'Meera Iyer', createdAt: now - 410 * DAY, reviewCount: 23, helpfulVotes: 88 },
    u_2: { id: 'u_2', name: 'Rohit Nair', createdAt: now - 160 * DAY, reviewCount: 9, helpfulVotes: 21 },
    u_3: { id: 'u_3', name: 'Sara D’Souza', createdAt: now - 45 * DAY, reviewCount: 3, helpfulVotes: 4 },
    u_4: { id: 'u_4', name: 'Vikram Shetty', createdAt: now - 12 * DAY, reviewCount: 1, helpfulVotes: 0 },
    u_5: { id: 'u_5', name: 'Leah Thomas', createdAt: now - 230 * DAY, reviewCount: 14, helpfulVotes: 40 },
    u_6: { id: 'u_6', name: 'Arjun Pillai', createdAt: now - 95 * DAY, reviewCount: 5, helpfulVotes: 9 },
  };

  const R = (id, venueId, authorId, rating, daysAgo, method, text, extra = {}) => ({
    id, venueId, authorId, rating, text, method,
    status: method === 'none' ? 'unverified' : 'verified',
    createdAt: now - daysAgo * DAY - 3 * HOUR,
    helpful: extra.helpful || 0, photos: extra.photos || [], photoHashes: [], ownerReply: extra.ownerReply || null,
    aspects: extra.aspects || null, score: extra.score ?? (method === 'payment' ? 86 : method === 'receipt' ? 79 : method === 'checkin' ? 64 : 41),
  });

  const reviews = [
    R('r1', 'lumen', 'u_1', 5, 2, 'payment', 'Truffle risotto was the best thing we ordered: rice still had bite, not drowned in cream. Lamb shank fell off the bone. Our server explained every wine without pushing the pricey ones. Bill for two came to about ₹3,400.', { helpful: 14, photos: [img('1540189549336-e6e99c3679fe', 400)], aspects: { food: 5, service: 5, ambience: 4, value: 4 } }),
    R('r2', 'lumen', 'u_2', 3, 6, 'receipt', 'Burrata was good but the sourdough came out cold and they forgot our second order of it. Waited 35 minutes for mains on a Saturday. Lovely lighting and music at a level where you can talk.', { helpful: 9, aspects: { food: 3, service: 2, ambience: 5, value: 3 }, ownerReply: { text: 'Thank you Rohit, the bread delay is on us. We have added a second oven slot for weekend dinners.', at: now - 5 * DAY } }),
    R('r3', 'lumen', 'u_5', 4, 15, 'receipt', 'Came for a work lunch. Tiramisu is light, not soggy. Portions are on the smaller side for the price, but quality is consistent and the staff were quick when we said we had 45 minutes.', { helpful: 6, aspects: { food: 4, service: 5, ambience: 4, value: 3 } }),
    R('r4', 'lumen', 'u_4', 5, 1, 'none', 'Best restaurant in Bangalore, amazing experience, highly recommend!!', { helpful: 0 }),

    R('c1', 'copper', 'u_3', 5, 3, 'checkin', 'Cold brew is smooth and not acidic, and the almond croissant is properly flaky. Plenty of plug points, quiet before 11 am, so good for working. Got loud after lunch.', { helpful: 7, photos: [img('1509042239860-f550ce710b93', 400)], aspects: { food: 5, service: 4, ambience: 4, value: 4 } }),
    R('c2', 'copper', 'u_1', 4, 9, 'payment', 'Avocado toast was generous but the bread was a little hard. Cappuccino milk was well steamed. Paid in NIM at the counter, took ten seconds.', { helpful: 11, aspects: { food: 4, service: 4, ambience: 4, value: 4 } }),
    R('c3', 'copper', 'u_6', 3, 20, 'receipt', 'Banana bread was dry and the barista seemed rushed. Coffee itself is fine. Prices went up since last year.', { helpful: 3, aspects: { food: 3, service: 3, ambience: 4, value: 2 } }),

    R('s1', 'saffron', 'u_2', 5, 4, 'receipt', 'Dal makhani slow-cooked the way it should be, smoky and thick. Butter naan came hot in two batches without us asking. Courtyard seating is lovely in the evening, mosquitoes aside.', { helpful: 12, photos: [img('1585937421612-70a008356fbe', 400)], aspects: { food: 5, service: 5, ambience: 4, value: 5 } }),
    R('s2', 'saffron', 'u_5', 4, 11, 'payment', 'Paneer tikka was charred well and the mint chutney fresh. Biryani was a bit oily for my taste. Service fast even with a full house of 40 people.', { helpful: 5, aspects: { food: 4, service: 5, ambience: 4, value: 4 } }),
    R('s3', 'saffron', 'u_3', 2, 18, 'receipt', 'Waited 50 minutes for a table despite a reservation, and the gulab jamun was served cold. Food otherwise fine, but the evening was spent waiting.', { helpful: 8, aspects: { food: 3, service: 1, ambience: 3, value: 3 } }),

    R('m1', 'marigold', 'u_1', 4, 5, 'payment', 'Deluxe room was spotless and the bed was firm in a good way. Breakfast buffet has proper dosas and fresh fruit. Rooftop pool closes at 8 pm, which they did not mention at check-in. Wifi dropped twice.', { helpful: 16, photos: [img('1631515243349-e0cb75fb8d3a', 400)], aspects: { food: 4, service: 4, ambience: 5, value: 4 } }),
    R('m2', 'marigold', 'u_6', 5, 13, 'receipt', 'Airport shuttle was on time at 5 am. Reception kept our bags after checkout. Shower pressure is great. Spa is overpriced though.', { helpful: 4, aspects: { food: 4, service: 5, ambience: 4, value: 3 } }),

    R('b1', 'brew', 'u_5', 5, 2, 'payment', 'Their pour over changes weekly; this week an Ethiopian that tasted of blueberries. Barista walked us through the brew ratio. Cheesecake is dense, baked style.', { helpful: 10, photos: [img('1495474472287-4d71bcdd2085', 400)], aspects: { food: 5, service: 5, ambience: 4, value: 4 } }),
    R('b2', 'brew', 'u_2', 4, 8, 'checkin', 'Flat white was balanced. Grilled sandwich was average and took 20 min. Seating is cramped, only six tables, so do not plan to work here at peak hours.', { helpful: 6, aspects: { food: 3, service: 4, ambience: 3, value: 4 } }),
    R('b3', 'brew', 'u_4', 1, 1, 'none', 'worst coffee ever dont go', { helpful: 0 }),

    R('n1', 'nilgiri', 'u_6', 5, 1, 'receipt', 'Masala dosa crisp edge to edge, potato filling not too sweet. Filter coffee strong and served in a proper dabara. Breakfast for two was under ₹300. Expect a 10 min queue on Sundays.', { helpful: 13, photos: [img('1567620905732-2d1ec7ab7445', 400)], aspects: { food: 5, service: 4, ambience: 3, value: 5 } }),
    R('n2', 'nilgiri', 'u_1', 4, 7, 'payment', 'Pongal was buttery and peppery. Appam with stew only after 11 am, which nobody told us until we ordered. Clean, quick, no frills.', { helpful: 7, aspects: { food: 4, service: 3, ambience: 3, value: 5 } }),

    R('w1', 'willow', 'u_5', 4, 10, 'receipt', 'Suite was large with a balcony facing the trees, very quiet at night. Breakfast was cooked to order, not a buffet. Gym is just two machines. Late checkout at 2 pm was free when we asked.', { helpful: 9, aspects: { food: 4, service: 5, ambience: 5, value: 4 } }),
    R('w2', 'willow', 'u_3', 3, 25, 'checkin', 'Room smelled of damp on the first night; housekeeping moved us without fuss. Staff were kind but the AC was noisy and the wifi slow for video calls.', { helpful: 5, aspects: { food: 3, service: 4, ambience: 2, value: 3 } }),
  ];

  // receipts the venues issued at billing; the demo user can redeem the unused ones
  const receipts = [
    { code: 'K7Q2M-9XH4T', venueId: 'lumen', amount: 1240, issuedAt: now - 3 * HOUR, label: 'Table 6' },
    { code: 'R4D8N-2PV6C', venueId: 'copper', amount: 420, issuedAt: now - 2 * HOUR },
    { code: 'H3J9T-6KQ1M', venueId: 'saffron', amount: 980, issuedAt: now - 20 * HOUR },
    { code: 'B5X2W-8NE7R', venueId: 'brew', amount: 360, issuedAt: now - 5 * HOUR },
    { code: 'P9M4C-1TF3V', venueId: 'nilgiri', amount: 260, issuedAt: now - 26 * HOUR },
    { code: 'Q2V7K-4HD8X', venueId: 'marigold', amount: 7400, issuedAt: now - 30 * HOUR },
    { code: 'G6T1R-5WN9P', venueId: 'willow', amount: 9100, issuedAt: now - 40 * HOUR },
    { code: 'D8F3H-7QA2M', venueId: 'lumen', amount: 2150, issuedAt: now - 28 * HOUR, usedBy: 'r3', label: 'Table 2' },
    { code: 'X1C5V-3BJ7K', venueId: 'lumen', amount: 860, issuedAt: now - 9 * HOUR, label: 'Takeaway' },
  ];

  // stand-in for chain lookups: payments the demo wallet made to venues
  const me = users.u_me.nimAddress;
  const transactions = [
    { hash: '4f9c2e1ab7d3508c6e2f91a4b0d7c3e85a1f6b29c4e7d0a3b8f5c2e9a6d1b4f7', sender: me, recipient: venues[0].nimAddress, valueNim: 1850, timestamp: now - 20 * HOUR },
    { hash: '9b3e7d1f5a2c8e4b0d6f3a9c7e1b5d2f8a4c0e6b3d9f7a1c5e2b8d4f0a6c3e9b', sender: me, recipient: venues[4].nimAddress, valueNim: 610, timestamp: now - 2 * DAY },
    { hash: '1d6a4c8e2f0b7d3a9c5e1f8b4d2a6c0e7f3b9d5a1c8e4f2b6d0a3c7e9f5b1d84', sender: me, recipient: venues[5].nimAddress, valueNim: 20, timestamp: now - 1 * DAY },
  ];

  const ledger = [
    { id: 'l1', type: 'reward', reviewId: 'old1', venueId: 'saffron', label: 'Review · Saffron Courtyard', amount: 21.5, status: 'claimable', at: now - 40 * DAY, releaseAt: now - 33 * DAY },
    { id: 'l2', type: 'reward', reviewId: 'old2', venueId: 'copper', label: 'Review · Copper Kettle Café', amount: 18.0, status: 'claimable', at: now - 33 * DAY, releaseAt: now - 26 * DAY },
    { id: 'l3', type: 'reward', reviewId: 'old3', venueId: 'marigold', label: 'Review · Hotel Marigold Residency', amount: 23.2, status: 'claimable', at: now - 21 * DAY, releaseAt: now - 14 * DAY },
    { id: 'l4', type: 'reward', reviewId: 'old4', venueId: 'willow', label: 'Review · The Willow Suites', amount: 22.4, status: 'claimable', at: now - 16 * DAY, releaseAt: now - 9 * DAY },
    { id: 'l5', type: 'reward', reviewId: 'old5', venueId: 'nilgiri', label: 'Review · Nilgiri Table', amount: 19.4, status: 'pending', at: now - 4 * DAY, releaseAt: now + 3 * DAY },
    { id: 'l6', type: 'reward', reviewId: 'old6', venueId: 'brew', label: 'Review · Brew Theory', amount: 16.8, status: 'pending', at: now - 2 * DAY, releaseAt: now + 5 * DAY },
    { id: 'l8', type: 'reward', reviewId: 'old7', venueId: 'lumen', label: 'Review · Lumen Bistro', amount: 22.8, status: 'claimable', at: now - 70 * DAY, releaseAt: now - 63 * DAY },
    { id: 'l9', type: 'reward', reviewId: 'old8', venueId: 'brew', label: 'Review · Brew Theory', amount: 24.1, status: 'claimable', at: now - 58 * DAY, releaseAt: now - 51 * DAY },
    { id: 'l10', type: 'reward', reviewId: 'old9', venueId: 'saffron', label: 'Review · Saffron Courtyard', amount: 20.6, status: 'claimable', at: now - 50 * DAY, releaseAt: now - 43 * DAY },
    { id: 'l11', type: 'reward', reviewId: 'old11', venueId: 'nilgiri', label: 'Review · Nilgiri Table', amount: 21.3, status: 'claimable', at: now - 90 * DAY, releaseAt: now - 83 * DAY },
    { id: 'l7', type: 'coupon', venueId: 'nilgiri', label: 'Perk · Free filter coffee, Nilgiri Table', amount: 12, status: 'done', at: now - 12 * DAY },
  ];

  // rewards history feeds the fair-use limits
  const rewards = ledger.filter((e) => e.type === 'reward').map((e) => ({ accountId: 'u_me', venueId: e.venueId, at: e.at }));

  const perks = [
    { id: 'p1', venueId: 'lumen', title: '15% off dinner for two', terms: 'Sun–Thu, up to ₹600', cost: 20, tone: 'navy' },
    { id: 'p2', venueId: 'copper', title: 'Free almond croissant', terms: 'With any coffee', cost: 15, tone: 'gold' },
    { id: 'p3', venueId: 'saffron', title: 'Dessert on the house', terms: 'Bills over ₹800', cost: 35, tone: 'green' },
    { id: 'p4', venueId: 'marigold', title: 'Free late checkout', terms: 'Until 2 pm, subject to availability', cost: 30, tone: 'blue' },
    { id: 'p5', venueId: 'brew', title: 'Second pour over half price', terms: 'Weekdays before noon', cost: 20, tone: 'gold' },
    { id: 'p6', venueId: 'nilgiri', title: 'Free filter coffee', terms: 'With any breakfast', cost: 12, tone: 'green' },
  ];

  // each demo venue chooses how long its guests wait before they can cash out (0 = instant)
  const cooldown = { lumen: 3, copper: 0, saffron: 3, marigold: 7, brew: 1, nilgiri: 3 };
  for (const v of venues) v.payoutCooldownDays = cooldown[v.id] ?? 3;

  return {
    version: 2,
    seededAt: now,
    here: { ...DEMO_CENTER, real: false },
    venues, users, reviews, receipts, transactions, ledger, rewards, perks,
    myPerks: [{ id: 'mp1', perkId: 'p6', code: 'NT-4KQ7', claimedAt: now - 12 * DAY, used: true }],
    saved: ['brew'],
    votes: [],
    flags: [],
    checkins: [],
  };
}
