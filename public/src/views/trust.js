import { icon } from '../ui.js';
import { POLICY } from '../core/genuine.js';

const P = POLICY;
const LAYERS = [
  {
    title: 'No proven visit, no NIM',
    body: 'Anyone can post. Only a proven visit earns, and proof is ranked by how hard it is to fake:',
    list: [
      `NIM payment from your wallet to the venue's wallet, within ${P.paymentWindowDays} days`,
      `Single-use receipt code printed on the bill, valid ${P.receiptTtlHours} h, bound to one venue`,
      `GPS check-in within ${P.geofenceMeters} m for ${P.minDwellMinutes}+ min (spoofable, so it only pays established accounts)`,
    ],
  },
  {
    title: 'Stars never change the reward',
    body: 'The reward formula never reads the rating. An honest 1★ earns exactly what a 5★ earns, so flattery pays nothing and venues cannot buy praise through us.',
  },
  {
    title: 'Copies and spam are refused',
    list: [
      `Text overlapping ${Math.round(P.duplicateThreshold * 100)}%+ with any review, at any venue, is rejected`,
      'A photo reused from another review is rejected',
      'Links, phone numbers and shouting count as spam',
      'Generic one-liners are published but cannot earn',
    ],
  },
  {
    title: 'Specific, first-hand detail scores',
    body: `Naming what you ordered, the wait and the service earns up to ${P.weights.content} points. Typing signals (pasted text, inhuman speed) add up to ${P.weights.composition}; they are easy to forge, so they never decide alone.`,
  },
  {
    title: 'Limits make farming unprofitable',
    list: [
      `${P.maxRewardedPerDay} rewarded reviews a day; one per venue every ${P.venueCooldownDays} days`,
      'Owners and staff cannot review their own venue',
      `A burst of reviews from accounts under ${P.burst.newAccountDays} days old pauses that venue's rewards`,
      `The place that pays you sets the wait (instant to 30 days); an upheld report cancels a reward that is still waiting`,
    ],
  },
  {
    title: 'Ratings weight what is proven',
    body: `Proven visits count fully in a venue's average; unverified reviews count ${P.unverifiedWeight * 100}%. Owners can reply and dispute, never edit or delete.`,
  },
];

export function trustView() {
  const html = `
  <div class="page">
    <div class="titlebar"><button class="icon-btn" data-back aria-label="Back">${icon('back')}</button><h1>Genuine reviews</h1><span></span></div>
    <div class="page-head"><h2>Paying for reviews only works if <em>fakes cost more than they earn.</em></h2><p>Six layers checked on every review. Score ${P.minRewardScore}/100 or more to earn the venue's per-review reward, scaled by the score.</p></div>
    <div class="layers">
      ${LAYERS.map((l, i) => `<section class="layer card"><span class="n">${i + 1}</span><div class="body"><h3>${l.title}</h3>${l.body ? `<p>${l.body}</p>` : ''}${l.list ? `<ul>${l.list.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}</div></section>`).join('')}
      <section class="layer card dark"><span class="n">!</span><div class="body"><h3>What this cannot stop</h3><p>A real customer who really paid and writes a dishonest review. Rating-neutral rewards remove the money motive; reports, helpful votes and the unlock window handle the rest.</p></div></section>
    </div>
  </div>`;
  function mount(root) {
    root.querySelector('[data-back]').addEventListener('click', () => (history.length > 1 ? history.back() : (location.hash = '#/')));
  }
  return { html, mount, tabs: false, tab: 'trust' };
}
