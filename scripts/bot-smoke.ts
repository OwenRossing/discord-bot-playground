/**
 * Exercises the whole spin pipeline without Discord: stake, derive, score,
 * settle, render. Everything /spin does except the API calls, so the economy
 * and fairness can be checked without a token.
 */
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolve as scoreSpin, JACKPOT_RATE, JACKPOT_SEED } from '../src/game/engine.js';
import { deriveStops, verifySpin } from '../src/game/fairness.js';
import { Store, STARTING_BALANCE, DAILY_AMOUNT } from '../src/game/store.js';
import { renderSpinGif } from '../src/render/render.js';
import { pixelTheme } from '../src/render/themes/pixel.js';

const file = join(tmpdir(), `slot-smoke-${Date.now()}.json`);
const store = new Store(file);
const checks: [string, boolean, string?][] = [];
const check = (name: string, ok: boolean, detail?: string) => checks.push([name, ok, detail]);

const USER = 'user-1';
const BET = 25;

check('new user starts at STARTING_BALANCE', store.user(USER).balance === STARTING_BALANCE);
check('jackpot starts seeded', store.jackpot === JACKPOT_SEED);

// --- the spin loop, mirroring runSpin -------------------------------------
let expectedBalance = STARTING_BALANCE;
let wagered = 0;
let won = 0;
const SPINS = 200;
const firstSeeds = { ...store.user(USER).seeds };

for (let n = 0; n < SPINS; n++) {
  const u = store.user(USER);
  if (u.balance < BET) break;

  const placed = store.placeBet(USER, BET);
  if (!placed.ok) break;
  expectedBalance -= BET;
  wagered += BET;

  const stops = deriveStops(u.seeds.serverSeed, u.seeds.clientSeed, placed.nonce);
  const outcome = scoreSpin(stops, BET, store.jackpot);
  store.settle(USER, outcome);
  expectedBalance += outcome.payout;
  won += outcome.payout;
}

const after = store.user(USER);
check('balance accounting is exact', after.balance === expectedBalance, `${after.balance} vs ${expectedBalance}`);
check('wagered tracked', after.stats.wagered === wagered, `${after.stats.wagered} vs ${wagered}`);
check('won tracked', after.stats.won === won);
check('nonce advanced once per spin', after.seeds.nonce === after.stats.spins);

// --- the jackpot rake fix -------------------------------------------------
// 200 spins * 25 * 0.01 = 50 credits. Flooring each contribution separately
// would have added exactly nothing, which was the bug.
const expectedRake = Math.floor(after.stats.spins * BET * JACKPOT_RATE);
const grew = store.jackpot - JACKPOT_SEED;
const jackpotHit = after.stats.jackpots > 0;
check(
  'small bets still grow the jackpot',
  jackpotHit || Math.abs(grew - expectedRake) <= 1,
  `pool grew ${grew}, expected ~${expectedRake}`,
);

// --- provable fairness end to end ----------------------------------------
const replayed = deriveStops(firstSeeds.serverSeed, firstSeeds.clientSeed, 0);
const v = verifySpin(firstSeeds.serverSeed, firstSeeds.serverSeedHash, firstSeeds.clientSeed, 0);
check('a played spin replays identically', JSON.stringify(v.stops) === JSON.stringify(replayed));
check('commitment verifies', v.ok);

// --- seed rotation --------------------------------------------------------
const spinsBefore = store.user(USER).seeds.nonce;
const { revealed, next } = store.rotateSeeds(USER, 'chosen-seed');
check('rotation reveals the retired seed', revealed.serverSeed === firstSeeds.serverSeed);
check('retired seed covers the spins played', revealed.spins === spinsBefore);
check('new pair differs', next.serverSeed !== revealed.serverSeed && next.nonce === 0);
check('client seed honoured', next.clientSeed === 'chosen-seed');

// --- daily ----------------------------------------------------------------
const balBefore = store.user(USER).balance;
const d1 = store.claimDaily(USER);
check('first daily pays out', d1.ok === true && store.user(USER).balance === balBefore + DAILY_AMOUNT);
const d2 = store.claimDaily(USER);
check('second daily is refused', d2.ok === false);

// --- bet validation -------------------------------------------------------
check('overspend refused', store.placeBet(USER, 10_000_000).ok === false);
check('zero bet refused', store.placeBet(USER, 0).ok === false);
check('fractional bet refused', store.placeBet(USER, 2.5).ok === false);

// --- persistence ----------------------------------------------------------
await store.save();
const reloaded = new Store(file);
check('survives a reload', reloaded.user(USER).balance === store.user(USER).balance);
check('jackpot survives a reload', reloaded.jackpot === store.jackpot);

// --- render ---------------------------------------------------------------
const outcome = scoreSpin([19, 36, 19], BET, 8420);
const t0 = Date.now();
const gif = renderSpinGif(pixelTheme, { outcome, creditsBefore: 1200, jackpot: 8420 });
const ms = Date.now() - t0;
// gifenc omits the NETSCAPE looping extension entirely when repeat is -1.
const loops = gif.includes(Buffer.from('NETSCAPE'));
check('gif plays once, not forever', !loops);
check('gif is under Discord 10MB limit', gif.length < 10 * 1024 * 1024, `${(gif.length / 1024 / 1024).toFixed(2)}MB`);
check('render is inside the 3s interaction window', ms < 3000, `${ms}ms`);

rmSync(file, { force: true });
if (existsSync(`${file}.tmp`)) rmSync(`${file}.tmp`, { force: true });

let failed = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
console.log(
  `\n${checks.length - failed}/${checks.length} passed · ${after.stats.spins} spins · ` +
    `realised return ${((won / wagered) * 100).toFixed(1)}% · gif ${(gif.length / 1024 / 1024).toFixed(2)}MB in ${ms}ms`,
);
if (failed) process.exit(1);
