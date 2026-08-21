/**
 * Sanity check on the provably-fair derivation: same inputs give the same
 * spin, forged seeds are rejected, and stops land uniformly across the strip.
 * Uniformity is the one that matters -- a biased derivation would quietly
 * invalidate the RTP audit.
 */
import { newSeedPair, deriveStops, verifySpin } from '../src/game/fairness.js';
import { REEL_LENGTH } from '../src/game/symbols.js';

const p = newSeedPair('mytest');
const a = deriveStops(p.serverSeed, p.clientSeed, 0);

const checks: [string, boolean][] = [
  ['deterministic', JSON.stringify(deriveStops(p.serverSeed, p.clientSeed, 0)) === JSON.stringify(a)],
  ['nonce changes result', JSON.stringify(deriveStops(p.serverSeed, p.clientSeed, 1)) !== JSON.stringify(a)],
  ['client seed changes result', JSON.stringify(deriveStops(p.serverSeed, 'other', 0)) !== JSON.stringify(a)],
];

const v = verifySpin(p.serverSeed, p.serverSeedHash, p.clientSeed, 0);
checks.push(['verify reproduces the spin', v.ok && JSON.stringify(v.stops) === JSON.stringify(a)]);

const forged = verifySpin(newSeedPair().serverSeed, p.serverSeedHash, p.clientSeed, 0);
checks.push(['forged seed rejected', forged.ok === false && forged.stops === null]);

const N = 20000;
const counts = new Array<number>(REEL_LENGTH).fill(0);
for (let i = 0; i < N; i++) for (const s of deriveStops(p.serverSeed, p.clientSeed, i)) counts[s]++;
const expected = (N * 3) / REEL_LENGTH;
const chi2 = counts.reduce((t, c) => t + (c - expected) ** 2 / expected, 0);
// 5% critical value for 37 degrees of freedom.
checks.push([`uniform (chi2 ${chi2.toFixed(1)} < 52.2)`, chi2 < 52.2]);

for (const [name, ok] of checks) console.log(ok ? 'PASS' : 'FAIL', name);
console.log(`stops seen ${Math.min(...counts)}..${Math.max(...counts)}, expected ${expected.toFixed(0)} each`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
