import { REEL_LENGTH, REEL_STRIP, type SymbolId } from '../game/symbols.js';
import type { SpinOutcome } from '../game/engine.js';

/** Strip index the reels rest on between spins -- all three showing a 7. */
export const IDLE_STOPS: [number, number, number] = (() => {
  const sevens = REEL_STRIP.flatMap((s, i) => (s === 'seven' ? [i] : []));
  const a = sevens[0] ?? 0;
  const b = sevens[1] ?? a;
  return [a, b, a];
})();

/** Symbols whose near-miss is worth stalling the last reel for. */
const TENSE: SymbolId[] = ['seven', 'diamond', 'bar', 'bell'];

const SPIN_START = 0.34;
const STAGGER = 0.07;
const BASE_STOP = [1.95, 2.6, 3.25];
const ANTICIPATION_HOLD = 0.95;

export interface ReelPlan {
  from: number;
  to: number;
  /** Total travel in symbols; always a positive whole number of steps. */
  distance: number;
  start: number;
  stop: number;
}

export interface Timeline {
  reels: ReelPlan[];
  /** True when the first two reels teased a big win and reel 3 stalled for it. */
  anticipation: boolean;
  leverStart: number;
  leverEnd: number;
  lastStop: number;
  /** End of the celebration hold. */
  duration: number;
}

export function planSpin(outcome: SpinOutcome): Timeline {
  const [s0, s1] = outcome.line;
  const anticipation = s0 === s1 && TENSE.includes(s0);

  const reels: ReelPlan[] = outcome.stops.map((to, i) => {
    const from = IDLE_STOPS[i];
    const delta = ((to - from) % REEL_LENGTH + REEL_LENGTH) % REEL_LENGTH;
    const revolutions = 3 + i; // later reels travel further, so they stop later
    const start = SPIN_START + i * STAGGER;
    let stop = BASE_STOP[i];
    if (anticipation && i === 2) stop += ANTICIPATION_HOLD;
    return { from, to, distance: delta + revolutions * REEL_LENGTH, start, stop };
  });

  const lastStop = reels[2].stop;
  return {
    reels,
    anticipation,
    leverStart: 0.16,
    leverEnd: SPIN_START + 0.22,
    lastStop,
    duration: lastStop + 1.5,
  };
}

/**
 * Fraction of the total travel completed at normalised time `u`.
 * Built by integrating a velocity ramp (quick spin-up, long cruise, smooth
 * braking) so the reel accelerates and lands instead of easing linearly.
 */
const EASE_LUT = buildEase();

function buildEase(): Float64Array {
  const n = 512;
  const lut = new Float64Array(n + 1);
  let acc = 0;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    acc += velocity(u - 0.5 / n);
    lut[i] = acc;
  }
  const total = lut[n];
  for (let i = 0; i <= n; i++) lut[i] /= total;
  return lut;
}

function velocity(u: number): number {
  if (u < 0.1) return u / 0.1; // spin up
  if (u < 0.68) return 1; // cruise
  const w = (u - 0.68) / 0.32; // brake
  return (1 - w) * (1 - w);
}

function ease(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const x = u * 512;
  const i = Math.floor(x);
  const f = x - i;
  return EASE_LUT[i] * (1 - f) + EASE_LUT[i + 1] * f;
}

/** Damped wobble as the reel settles against its stop. */
function bounce(dt: number): number {
  if (dt <= 0) return 0;
  return 0.13 * Math.sin(dt * 34) * Math.exp(-dt / 0.085);
}

export interface ReelState {
  pos: number;
  speed: number;
  stopped: boolean;
}

export function reelAt(plan: ReelPlan, t: number): ReelState {
  if (t <= plan.start) return { pos: plan.from, speed: 0, stopped: false };
  if (t >= plan.stop) {
    const dt = t - plan.stop;
    return { pos: plan.from + plan.distance + bounce(dt), speed: 0, stopped: true };
  }
  const span = plan.stop - plan.start;
  const u = (t - plan.start) / span;
  const pos = plan.from + plan.distance * ease(u);
  // Differentiate the eased curve for the motion-blur amount.
  const h = 1 / 512;
  const speed = (plan.distance * (ease(Math.min(1, u + h)) - ease(Math.max(0, u - h)))) / (2 * h * span);
  return { pos, speed, stopped: false };
}

/** 0 at rest, 1 at the bottom of the pull, easing back up afterwards. */
export function leverAt(tl: Timeline, t: number): number {
  if (t <= tl.leverStart) return 0;
  if (t >= tl.leverEnd) return 0;
  const u = (t - tl.leverStart) / (tl.leverEnd - tl.leverStart);
  // Pull down over the first 45%, spring back over the rest.
  return u < 0.45 ? easeOutCubic(u / 0.45) : 1 - easeInOutCubic((u - 0.45) / 0.55);
}

const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);
const easeInOutCubic = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/** Frame times and per-frame delays: sparse when idle, dense while spinning. */
export function schedule(tl: Timeline): { t: number; delay: number }[] {
  const out: { t: number; delay: number }[] = [];
  const push = (from: number, to: number, step: number) => {
    for (let t = from; t < to - 1e-6; t += step) out.push({ t, delay: Math.round(step * 1000) });
  };
  push(0, tl.leverStart, 0.11);
  push(tl.leverStart, SPIN_START, 0.04);
  push(SPIN_START, tl.lastStop + 0.3, 0.05);
  push(tl.lastStop + 0.3, tl.duration, 0.09);
  out.push({ t: tl.duration, delay: 1100 }); // hold on the result before looping
  return out;
}

export { REEL_STRIP, REEL_LENGTH };
