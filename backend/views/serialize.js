// The "view" layer of the API: turns documents into the JSON shape the browser app already renders
// (the same shape as public/src/data/seed.js), so one set of screens serves demo and live data.
const ms = (d) => (d ? new Date(d).getTime() : null);
const id = (x) => (x ? String(x._id ?? x) : null);
// stock photo per kind when a venue has not added one (same Unsplash photos as the demo set)
const unsplash = (p) => `https://images.unsplash.com/photo-${p}?w=900&q=70&auto=format&fit=crop`;
const DEFAULT_IMG = { restaurant: unsplash('1517248135467-4c7edcad34c4'), cafe: unsplash('1554118811-1e0d58224f24'), hotel: unsplash('1566073771259-6a8506099945') };

export const venueJson = (v) => ({
  id: id(v),
  ownerId: id(v.owner),
  name: v.name,
  type: v.type,
  cuisine: v.cuisine,
  price: v.price,
  address: v.address,
  lat: v.lat,
  lng: v.lng,
  hours: v.hours,
  img: v.img || DEFAULT_IMG[v.type],
  menu: v.menu,
  nimAddress: v.nimAddress,
  rewardPerReview: v.rewardPerReview,
  payoutCooldownDays: v.payoutCooldownDays,
});

// Public profile. The wallet address is only included for the signed-in user.
export const userJson = (u, { self = false, ownsVenueIds = [] } = {}) => ({
  id: id(u),
  name: u.name,
  role: u.role,
  createdAt: ms(u.createdAt),
  reviewCount: u.reviewCount,
  helpfulVotes: u.helpfulVotes,
  upheldFlags: u.upheldFlags,
  ...(self ? { nimAddress: u.nimAddress, ownsVenueIds } : {}),
});

export const reviewJson = (r) => ({
  id: id(r),
  venueId: id(r.venue),
  authorId: id(r.author),
  rating: r.rating,
  aspects: r.aspects?.food ? { food: r.aspects.food, service: r.aspects.service, ambience: r.aspects.ambience, value: r.aspects.value } : null,
  text: r.text,
  method: r.method,
  status: r.status,
  score: r.score,
  createdAt: ms(r.createdAt),
  helpful: r.helpfulBy?.length || 0,
  photos: r.photos,
  photoHashes: r.photoHashes,
  ownerReply: r.ownerReply?.text ? { text: r.ownerReply.text, at: ms(r.ownerReply.at) } : null,
});

export const billJson = (b) => ({
  code: b.code,
  venueId: id(b.venue),
  amount: b.amount,
  label: b.label,
  issuedAt: ms(b.issuedAt),
  usedBy: b.usedBy ? id(b.usedBy) : undefined,
});

export const ledgerJson = (e) => ({
  id: id(e),
  type: e.type,
  reviewId: id(e.review),
  venueId: id(e.venue),
  label: e.label,
  amount: e.amount,
  status: e.status,
  at: ms(e.at),
  releaseAt: ms(e.releaseAt),
  toAddress: e.toAddress || undefined,
  txHash: e.txHash || undefined,
  note: e.note || undefined,
  paidAt: ms(e.paidAt) || undefined,
});

// What a venue sees of a guest's cash-out request: who to pay, where, how much.
export const payoutJson = (e, guest) => ({
  ...ledgerJson(e),
  guestName: guest?.name || 'Guest',
  guestAddress: e.toAddress,
});
