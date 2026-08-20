import type { SKRSContext2D } from '@napi-rs/canvas';

/**
 * Drawing primitives for the pixel theme. Everything here snaps to whole
 * pixels and fills flat colours -- no gradients, no antialiased curves --
 * so the 4x nearest-neighbour upscale stays crisp.
 */

export function px(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** 1px outlined box with a lit top edge and a shaded bottom edge. */
export function bevel(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  mid: string,
  hi: string,
  lo: string,
  line: string,
) {
  px(ctx, x, y, w, h, line);
  px(ctx, x + 1, y + 1, w - 2, h - 2, mid);
  px(ctx, x + 1, y + 1, w - 2, 1, hi);
  px(ctx, x + 1, y + h - 2, w - 2, 1, lo);
  px(ctx, x + 1, y + 1, 1, h - 2, hi);
  px(ctx, x + w - 2, y + 1, 1, h - 2, lo);
}

/**
 * Filled circle, rasterised a scanline at a time. Using this instead of
 * ctx.arc keeps the edge as hard pixel steps rather than a soft antialiased
 * fringe, which would read as blur once the canvas is scaled up.
 */
export function disc(ctx: SKRSContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
    if (half <= 0 && r > 0) continue;
    ctx.fillRect(x0 - half, y0 + dy, half * 2 + 1, 1);
  }
}

/** Circle outline of 1px, drawn as a filled disc with the interior punched back out. */
export function ring(
  ctx: SKRSContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  interior: string,
) {
  disc(ctx, cx, cy, r, color);
  disc(ctx, cx, cy, r - 1, interior);
}

/** Straight 1px-wide line between two points, stepped to whole pixels. */
export function line(
  ctx: SKRSContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  thickness = 1,
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))));
  ctx.fillStyle = color;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ctx.fillRect(Math.round(x0 + dx * t), Math.round(y0 + dy * t), thickness, thickness);
  }
}
