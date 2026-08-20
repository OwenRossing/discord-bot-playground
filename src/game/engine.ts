import { randomInt } from 'node:crypto';
import { REEL_LENGTH, REEL_STRIP, SYMBOLS, type SymbolId } from './symbols.js';

export type Line = [SymbolId, SymbolId, SymbolId];

export interface PayRule {
  id: string;
  label: string;
  /** Payout as a multiple of the bet. `jackpot` rules ignore this. */
  multiplier: number;
  jackpot?: boolean;
  matches(line: Line): boolean;
}

const count = (line: Line, sym: SymbolId) => line.filter((s) => s === sym).length;
const triple = (line: Line, sym: SymbolId) => count(line, sym) === 3;
const FRUIT: SymbolId[] = ['cherry', 'lemon', 'grape'];

/** Evaluated top to bottom; the first rule that matches is the one that pays. */
export const PAYTABLE: PayRule[] = [
  { id: 'jackpot', label: '7️⃣ 7️⃣ 7️⃣  JACKPOT', multiplier: 0, jackpot: true, matches: (l) => triple(l, 'seven') },
  { id: 'diamond3', label: 'Triple Diamond', multiplier: 120, matches: (l) => triple(l, 'diamond') },
  { id: 'bar3', label: 'Triple BAR', multiplier: 60, matches: (l) => triple(l, 'bar') },
  { id: 'bell3', label: 'Triple Bell', multiplier: 30, matches: (l) => triple(l, 'bell') },
  { id: 'grape3', label: 'Triple Grapes', multiplier: 16, matches: (l) => triple(l, 'grape') },
  { id: 'lemon3', label: 'Triple Lemon', multiplier: 12, matches: (l) => triple(l, 'lemon') },
  { id: 'seven2', label: 'Two Lucky 7s', multiplier: 12, matches: (l) => count(l, 'seven') === 2 },
  { id: 'cherry3', label: 'Triple Cherry', multiplier: 8, matches: (l) => triple(l, 'cherry') },
  { id: 'diamond2', label: 'Two Diamonds', multiplier: 6, matches: (l) => count(l, 'diamond') === 2 },
  {
    id: 'fruit3',
    label: 'Fruit Salad',
    multiplier: 1,
    matches: (l) => l.every((s) => FRUIT.includes(s)),
  },
];

/** Share of every bet that feeds the progressive jackpot pool. */
export const JACKPOT_RATE = 0.01;
export const JACKPOT_SEED = 2000;

export interface SpinOutcome {
  /** Index into REEL_STRIP where each reel came to rest. */
  stops: [number, number, number];
  line: Line;
  rule: PayRule | null;
  /** Credits returned to the player. 0 on a loss. */
  payout: number;
  /** Payout minus the bet -- what the balance actually moves by. */
  net: number;
  bet: number;
  jackpotWon: boolean;
}

export function evaluate(line: Line): PayRule | null {
  return PAYTABLE.find((r) => r.matches(line)) ?? null;
}

/**
 * One fair spin. Each reel independently lands on a uniformly random stop,
 * drawn from the OS CSPRNG, so the strip composition alone sets the odds.
 */
export function spin(bet: number, jackpotPool: number): SpinOutcome {
  const stops: [number, number, number] = [
    randomInt(REEL_LENGTH),
    randomInt(REEL_LENGTH),
    randomInt(REEL_LENGTH),
  ];
  return resolve(stops, bet, jackpotPool);
}

/** Same scoring as `spin`, but for stops you supply (used by tests and the RTP audit). */
export function resolve(stops: [number, number, number], bet: number, jackpotPool: number): SpinOutcome {
  const line = stops.map((i) => REEL_STRIP[i]) as Line;
  const rule = evaluate(line);
  let payout = 0;
  if (rule) payout = rule.jackpot ? jackpotPool : Math.round(bet * rule.multiplier);
  return { stops, line, rule, payout, net: payout - bet, bet, jackpotWon: Boolean(rule?.jackpot) };
}

export interface RtpReport {
  combos: number;
  hitRate: number;
  /** Return excluding the jackpot rule. */
  baseRtp: number;
  /** Base return plus the jackpot contribution, which recycles back to players. */
  totalRtp: number;
  jackpotOdds: number;
  perRule: { id: string; label: string; probability: number; contribution: number }[];
}

/**
 * Exact return-to-player, by enumerating all 38^3 stop combinations rather
 * than simulating. No sampling error -- these are the real numbers.
 */
export function auditRtp(): RtpReport {
  const n = REEL_LENGTH;
  const combos = n * n * n;
  const hits = new Map<string, number>();
  let paying = 0;
  let baseReturn = 0;

  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      for (let c = 0; c < n; c++) {
        const line: Line = [REEL_STRIP[a], REEL_STRIP[b], REEL_STRIP[c]];
        const rule = evaluate(line);
        if (!rule) continue;
        paying++;
        hits.set(rule.id, (hits.get(rule.id) ?? 0) + 1);
        if (!rule.jackpot) baseReturn += rule.multiplier;
      }
    }
  }

  const jackpotHits = hits.get('jackpot') ?? 0;
  const baseRtp = baseReturn / combos;
  return {
    combos,
    hitRate: paying / combos,
    baseRtp,
    totalRtp: baseRtp + JACKPOT_RATE,
    jackpotOdds: jackpotHits / combos,
    perRule: PAYTABLE.map((r) => {
      const h = hits.get(r.id) ?? 0;
      return {
        id: r.id,
        label: r.label,
        probability: h / combos,
        contribution: r.jackpot ? JACKPOT_RATE : (h * r.multiplier) / combos,
      };
    }),
  };
}

export { SYMBOLS, REEL_STRIP, REEL_LENGTH };
export type { SymbolId };
