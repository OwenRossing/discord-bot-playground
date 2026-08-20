import type { SKRSContext2D } from '@napi-rs/canvas';
import type { SymbolId } from '../game/symbols.js';

export type SymbolPainter = (
  ctx: SKRSContext2D,
  sym: SymbolId,
  cx: number,
  cy: number,
  size: number,
  ghost: boolean,
) => void;

export function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function vgrad(ctx: SKRSContext2D, y0: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

export function hgrad(ctx: SKRSContext2D, x0: number, x1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

export interface ReelWindow {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Vertical pitch between symbols, in pixels. */
  cell: number;
  /** Rendered size of a symbol. */
  size: number;
}

/**
 * Draw one reel's visible slice of the strip. Positions advance upward as
 * `pos` grows; at a whole `pos` the symbol at that index sits on the payline.
 * Fast reels are drawn as several faint copies smeared along the direction of
 * travel, which is what sells the spin at 20fps.
 */
export function drawReel(
  ctx: SKRSContext2D,
  win: ReelWindow,
  strip: SymbolId[],
  pos: number,
  speed: number,
  frameTime: number,
  paint: SymbolPainter,
) {
  const centerY = win.y + win.h / 2;
  const smear = Math.abs(speed) * frameTime;
  const samples = Math.max(1, Math.min(4, Math.round(smear / 0.22)));

  ctx.save();
  ctx.beginPath();
  ctx.rect(win.x, win.y, win.w, win.h);
  ctx.clip();

  for (let s = 0; s < samples; s++) {
    const offset = samples === 1 ? 0 : (s / (samples - 1) - 0.5) * smear;
    const p = pos + offset;
    const base = Math.floor(p);
    const frac = p - base;
    const ghost = samples > 1;
    // Slightly above 1/samples so the smear keeps some body instead of washing out.
    ctx.globalAlpha = samples === 1 ? 1 : Math.min(0.85, 1.25 / samples);

    const span = Math.ceil(win.h / win.cell / 2) + 1;
    for (let k = -span; k <= span; k++) {
      const idx = ((base + k) % strip.length + strip.length) % strip.length;
      const y = centerY + (k - frac) * win.cell;
      if (y < win.y - win.cell || y > win.y + win.h + win.cell) continue;
      paint(ctx, strip[idx], win.x + win.w / 2, y, win.size, ghost);
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Symbol index currently sitting on the payline. */
export function paylineIndex(strip: SymbolId[], pos: number): SymbolId {
  const i = ((Math.round(pos) % strip.length) + strip.length) % strip.length;
  return strip[i];
}

/** A ring of marquee bulbs that chase around a rectangle. */
export function bulbRing(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  count: number,
  radius: number,
  phase: number,
  on: string,
  off: string,
  glow?: string,
) {
  const perim = 2 * (w + h);
  const step = perim / count;
  for (let i = 0; i < count; i++) {
    let d = i * step;
    let px: number;
    let py: number;
    if (d < w) { px = x + d; py = y; }
    else if (d < w + h) { px = x + w; py = y + (d - w); }
    else if (d < 2 * w + h) { px = x + w - (d - w - h); py = y + h; }
    else { px = x; py = y + h - (d - 2 * w - h); }

    const lit = (Math.floor(phase) + i) % 3 === 0;
    if (lit && glow) {
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, radius * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = lit ? on : off;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function textCentered(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  fill: string | CanvasGradient,
  stroke?: { color: string; width: number },
) {
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (stroke) {
    ctx.lineWidth = stroke.width;
    ctx.strokeStyle = stroke.color;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill as string;
  ctx.fillText(text, x, y);
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
