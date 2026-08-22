/**
 * Does the seeded derivation actually pay what the paytable says?
 *
 * The chi-square in fairness-check only proves each stop is uniform on its
 * own. If the three stops drawn for one spin were correlated -- consecutive
 * HMAC words are not independent in any obvious way, but "not obvious" is not
 * "verified" -- triples would land more or less often than chance and the RTP
 * would drift from the enumerated figure while every stop still looked fine.
 */
import { auditRtp, resolve } from '../src/game/engine.js';
import { deriveStops, newSeedPair } from '../src/game/fairness.js';

const theory = auditRtp();
const BET = 100;
const SPINS = 400_000;

const pair = newSeedPair('convergence');
let wagered = 0;
let returned = 0;
let hits = 0;
let jackpots = 0;

for (let n = 0; n < SPINS; n++) {
  const stops = deriveStops(pair.serverSeed, pair.clientSeed, n);
  // A fixed notional pool, so the jackpot rule contributes a comparable amount
  // each time rather than tracking a live progressive.
  const o = resolve(stops, BET, 0);
  wagered += BET;
  returned += o.payout;
  if (o.rule) hits++;
  if (o.jackpotWon) jackpots++;
}

const baseRtp = returned / wagered;
const hitRate = hits / SPINS;

console.log(`spins           ${SPINS.toLocaleString()}`);
console.log(`base RTP        ${(baseRtp * 100).toFixed(2)}%  (theoretical ${(theory.baseRtp * 100).toFixed(2)}%)`);
console.log(`hit rate        ${(hitRate * 100).toFixed(2)}%  (theoretical ${(theory.hitRate * 100).toFixed(2)}%)`);
console.log(`jackpots        ${jackpots}  (expected ${(theory.jackpotOdds * SPINS).toFixed(1)})`);

// Standard error on the hit rate; 4 sigma is a generous band that still fails
// on a real bias.
const se = Math.sqrt((theory.hitRate * (1 - theory.hitRate)) / SPINS);
const drift = Math.abs(hitRate - theory.hitRate);
const ok = drift < 4 * se;
console.log(`\nhit-rate drift  ${(drift * 100).toFixed(3)}pp, 4-sigma bound ${(4 * se * 100).toFixed(3)}pp`);
console.log(ok ? 'PASS derivation matches the enumerated odds' : 'FAIL derivation drifts from the enumerated odds');
if (!ok) process.exit(1);
