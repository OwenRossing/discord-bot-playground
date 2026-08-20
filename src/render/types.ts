import type { SKRSContext2D } from '@napi-rs/canvas';
import type { PayRule } from '../game/engine.js';
import type { SymbolId } from '../game/symbols.js';

export interface ReelView {
  pos: number;
  speed: number;
  stopped: boolean;
}

export interface Scene {
  /** Seconds since the start of the animation. */
  t: number;
  /** 0 at rest, 1 at the bottom of the lever pull. */
  lever: number;
  reels: ReelView[];
  strip: SymbolId[];
  line: [SymbolId, SymbolId, SymbolId];
  allStopped: boolean;
  rule: PayRule | null;
  payout: number;
  /** 0 while spinning, then a 0..1 pulse driving the win flash. */
  winPulse: number;
  /** 0..1 while the last reel is stalling on a near miss. */
  anticipation: number;
  bet: number;
  credits: number;
  jackpot: number;
}

export interface Theme {
  id: string;
  name: string;
  /** Blurb shown when comparing styles. */
  tagline: string;
  baseW: number;
  baseH: number;
  /** Upscale factor applied to the base canvas. */
  scale: number;
  /** false gives a nearest-neighbour upscale, which is what pixel art needs. */
  smooth: boolean;
  maxColors: number;
  /** Embed accent colours, so the Discord message matches the art. */
  colors: { idle: number; win: number; jackpot: number; lose: number };
  render(ctx: SKRSContext2D, s: Scene): void;
}
