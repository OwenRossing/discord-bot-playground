import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import type { SpinOutcome } from '../game/engine.js';
import { REEL_STRIP } from '../game/symbols.js';
import { encodeGif, type Frame } from './gif.js';
import { leverAt, planSpin, reelAt, schedule, type Timeline } from './timeline.js';
import type { Scene, Theme } from './types.js';

export interface RenderInput {
  outcome: SpinOutcome;
  /** Balance before the bet was taken. */
  creditsBefore: number;
  /** Jackpot pool shown on the machine. */
  jackpot: number;
}

const WIN_RAMP = 0.9;
const COUNT_UP = 0.6;

function sceneAt(tl: Timeline, input: RenderInput, t: number): Scene {
  const { outcome } = input;
  const reels = tl.reels.map((p) => reelAt(p, t));
  const allStopped = reels.every((r) => r.stopped);
  const won = outcome.payout > 0;

  const winPulse = allStopped && won ? clamp01((t - tl.lastStop + 0.05) / WIN_RAMP) : 0;
  const anticipation =
    tl.anticipation && t > tl.reels[1].stop && t < tl.reels[2].stop ? 1 : 0;

  const staked = input.creditsBefore - outcome.bet;
  const countUp = allStopped ? clamp01((t - tl.lastStop) / COUNT_UP) : 0;
  const credits = Math.round(staked + outcome.payout * easeOutQuad(countUp));

  return {
    t,
    lever: leverAt(tl, t),
    reels,
    strip: REEL_STRIP,
    line: outcome.line,
    allStopped,
    rule: outcome.rule,
    payout: Math.round(outcome.payout * easeOutQuad(countUp)),
    winPulse,
    anticipation,
    bet: outcome.bet,
    credits,
    jackpot: input.jackpot,
  };
}

/** Render the full spin animation as an animated GIF. */
export function renderSpinGif(theme: Theme, input: RenderInput): Buffer {
  const tl = planSpin(input.outcome);
  const times = schedule(tl);

  const base = createCanvas(theme.baseW, theme.baseH);
  const baseCtx = base.getContext('2d');
  const outW = theme.baseW * theme.scale;
  const outH = theme.baseH * theme.scale;
  const out = createCanvas(outW, outH);
  const outCtx = out.getContext('2d');
  outCtx.imageSmoothingEnabled = theme.smooth;

  const frames: Frame[] = [];
  for (const { t, delay } of times) {
    baseCtx.save();
    baseCtx.clearRect(0, 0, theme.baseW, theme.baseH);
    theme.render(baseCtx, sceneAt(tl, input, t));
    baseCtx.restore();

    outCtx.clearRect(0, 0, outW, outH);
    outCtx.drawImage(base, 0, 0, outW, outH);
    frames.push({ rgba: outCtx.getImageData(0, 0, outW, outH).data, delay });
  }

  return encodeGif(frames, outW, outH, theme.maxColors);
}

/** A single frame as a PNG -- used for the paytable art and for eyeballing themes. */
export function renderStill(theme: Theme, input: RenderInput, t: number): Buffer {
  const tl = planSpin(input.outcome);
  const base = createCanvas(theme.baseW, theme.baseH);
  const ctx = base.getContext('2d');
  theme.render(ctx, sceneAt(tl, input, t));
  if (theme.scale === 1) return base.toBuffer('image/png');
  const out = createCanvas(theme.baseW * theme.scale, theme.baseH * theme.scale);
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = theme.smooth;
  octx.drawImage(base, 0, 0, out.width, out.height);
  return out.toBuffer('image/png');
}

/** Total animation length in ms, so callers can time follow-up messages. */
export function spinDurationMs(outcome: SpinOutcome): number {
  const tl = planSpin(outcome);
  return schedule(tl).reduce((n, f) => n + f.delay, 0);
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutQuad = (u: number) => 1 - (1 - u) * (1 - u);

export type { SKRSContext2D };
