import type { SKRSContext2D } from '@napi-rs/canvas';
import type { Scene, Theme } from '../types.js';
import { drawReel } from '../paint.js';
import { PAL, SPRITE_SIZE, drawPixelSymbol, validateSprites } from '../pixelsprites.js';
import { pixelTextCentered, pixelText, textWidth } from '../pixelfont.js';
import type { Actuator, Region } from '../actuators.js';
import { disc } from '../pixelbox.js';

validateSprites();

// Authored at 128x104 and blown up 4x with nearest-neighbour sampling, so
// every drawn pixel is exactly one 4x4 block in the finished GIF.
const W = 128;
const H = 104;
const SCALE = 4;

const CAB = { x: 2, y: 2, w: 100, h: 100 };
const MARQ = { x: 8, y: 6, w: 88, h: 13 };
const BEZ = { x: 6, y: 23, w: 92, h: 44 };
const REEL_W = 24;
const REEL_GAP = 5;
const REELS_X = 11;
const WIN_Y = 25;
const WIN_H = 40;
const CENTER_Y = WIN_Y + WIN_H / 2;
const CELL = 22;
const PANEL = { x: 6, y: 71, w: 92, h: 17 };
// The lever is bolted straight to the cabinet's flank, at the vertical
// midpoint of that side -- no separate housing column.
//
// It swings in the plane containing the vertical and the depth axis: straight
// up at rest, then over and down *toward the viewer*. Under a front-on
// orthographic projection that motion has no sideways component at all, so the
// ball tracks a perfectly vertical line and every cue for "it is coming at me"
// has to come from depth instead:
//
//   - the ball swells as it nears the camera, peaking as it passes the pivot,
//   - it is drawn *over* the bracket at that moment rather than behind it,
//   - the rod thickens with the ball and collapses to nothing at the pass,
//   - its shading shifts to a brighter, higher-contrast key.
//
// Leaning the rod sideways would be the easy way to show the arc, but it reads
// as a lever swinging right rather than one being pulled, so the x offset is
// held at exactly zero.
const LEVER = {
  x: CAB.x + CAB.w,
  y: CAB.y + CAB.h / 2,
};

/**
 * `pulledAngle` is measured from straight up, rotating toward the viewer, so
 * 90 points the rod directly at the camera and anything beyond that carries
 * the ball below the pivot. `bulge` is how much the ball's radius grows at
 * that nearest point.
 */
export interface LeverGeom {
  len: number;
  pulledAngle: number;
  bulge: number;
}

const deg = (d: number) => (d * Math.PI) / 180;

/** Collar on the lever's own end, in base pixels: length along the arm, and half-width. */
const HUB_LEN = 8;
const HUB_R = 2;

export const DEFAULT_LEVER: LeverGeom = {
  len: 24,
  // Swings 50 degrees past pointing at the camera, so the ball finishes clearly
  // below the pivot. The pull lasts only ~0.4s, so total on-screen travel reads
  // better than a bigger depth bulge would.
  pulledAngle: deg(140),
  bulge: 2.4,
};

const FRAME_TIME = 0.05;

function px(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** 1px outlined box with a lit top edge and a shaded bottom edge. */
function bevel(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, mid: string, hi: string, lo: string, line: string) {
  px(ctx, x, y, w, h, line);
  px(ctx, x + 1, y + 1, w - 2, h - 2, mid);
  px(ctx, x + 1, y + 1, w - 2, 1, hi);
  px(ctx, x + 1, y + h - 2, w - 2, 1, lo);
  px(ctx, x + 1, y + 1, 1, h - 2, hi);
  px(ctx, x + w - 2, y + 1, 1, h - 2, lo);
}

function backdrop(ctx: SKRSContext2D, s: Scene) {
  px(ctx, 0, 0, W, H, s.winPulse > 0 && Math.floor(s.t * 10) % 2 ? '#141826' : PAL.k);
  // sparse starfield, deterministic so it does not crawl between frames
  ctx.fillStyle = PAL.g;
  for (let i = 0; i < 26; i++) {
    const x = (i * 37 + 11) % W;
    const y = (i * 61 + 5) % H;
    if (x > CAB.x - 3 && x < LEVER.x + DEFAULT_LEVER.len + 4) continue;
    ctx.fillRect(x, y, 1, 1);
  }
}

function cabinet(ctx: SKRSContext2D, s: Scene) {
  px(ctx, CAB.x + 2, CAB.y + 2, CAB.w, CAB.h, PAL.k); // shadow
  bevel(ctx, CAB.x, CAB.y, CAB.w, CAB.h, PAL.R, PAL.e, PAL.r, PAL.k);
  // gold inner frame
  const trim = s.winPulse > 0 && Math.floor(s.t * 12) % 2 ? PAL.l : PAL.Y;
  px(ctx, CAB.x + 3, CAB.y + 3, CAB.w - 6, 1, trim);
  px(ctx, CAB.x + 3, CAB.y + CAB.h - 4, CAB.w - 6, 1, trim);
  px(ctx, CAB.x + 3, CAB.y + 3, 1, CAB.h - 6, trim);
  px(ctx, CAB.x + CAB.w - 4, CAB.y + 3, 1, CAB.h - 6, trim);
  // rivets
  for (const ry of [CAB.y + 22, CAB.y + 50, CAB.y + 78]) {
    px(ctx, CAB.x + 4, ry, 1, 1, PAL.l);
    px(ctx, CAB.x + CAB.w - 5, ry, 1, 1, PAL.l);
  }
}

function marquee(ctx: SKRSContext2D, s: Scene) {
  bevel(ctx, MARQ.x, MARQ.y, MARQ.w, MARQ.h, PAL.d, PAL.g, PAL.k, PAL.k);
  // chasing bulbs along the top and bottom rails
  const phase = Math.floor(s.t * 12 + s.winPulse * 20);
  for (let i = 0; i < 21; i++) {
    const bx = MARQ.x + 2 + i * 4;
    if (bx > MARQ.x + MARQ.w - 3) break;
    const lit = (phase + i) % 3 === 0;
    const c = lit ? (s.winPulse > 0 ? PAL.F : PAL.l) : PAL.o;
    px(ctx, bx, MARQ.y + 1, 1, 1, c);
    px(ctx, bx, MARQ.y + MARQ.h - 2, 1, 1, c);
  }
  const title = s.rule?.jackpot && s.winPulse > 0 ? 'JACKPOT' : s.winPulse > 0 ? 'WINNER' : 'LUCKY 7S';
  const flash = s.winPulse > 0 && Math.floor(s.t * 10) % 2 ? PAL.F : PAL.Y;
  pixelTextCentered(ctx, title, CAB.x + CAB.w / 2, MARQ.y + 2, flash, 2, 1);
}

function reelFace(ctx: SKRSContext2D, i: number) {
  const x = REELS_X + i * (REEL_W + REEL_GAP);
  px(ctx, x, WIN_Y, REEL_W, WIN_H, PAL.l);
  // banded shading top and bottom fakes the cylinder curve
  px(ctx, x, WIN_Y, REEL_W, 1, PAL.o);
  px(ctx, x, WIN_Y + 1, REEL_W, 1, PAL.y);
  px(ctx, x, WIN_Y + 2, REEL_W, 2, PAL.Y);
  px(ctx, x, WIN_Y + WIN_H - 1, REEL_W, 1, PAL.o);
  px(ctx, x, WIN_Y + WIN_H - 2, REEL_W, 1, PAL.y);
  px(ctx, x, WIN_Y + WIN_H - 4, REEL_W, 2, PAL.Y);
}

/** Re-apply the shading bands over the symbols so they sink into the drum. */
function reelShade(ctx: SKRSContext2D, i: number) {
  const x = REELS_X + i * (REEL_W + REEL_GAP);
  ctx.save();
  ctx.globalAlpha = 0.8;
  px(ctx, x, WIN_Y, REEL_W, 1, PAL.o);
  px(ctx, x, WIN_Y + WIN_H - 1, REEL_W, 1, PAL.o);
  ctx.globalAlpha = 0.45;
  px(ctx, x, WIN_Y + 1, REEL_W, 1, PAL.y);
  px(ctx, x, WIN_Y + WIN_H - 2, REEL_W, 1, PAL.y);
  ctx.restore();
}

function payline(ctx: SKRSContext2D, s: Scene) {
  const lit = s.winPulse > 0;
  const c = lit ? (Math.floor(s.t * 12) % 2 ? PAL.F : PAL.Y) : PAL.R;
  const top = CENTER_Y - CELL / 2;
  px(ctx, BEZ.x + 1, top, BEZ.w - 2, 1, c);
  px(ctx, BEZ.x + 1, top + CELL - 1, BEZ.w - 2, 1, c);
  // payline arrows on the bezel edges
  for (let i = 0; i < 3; i++) {
    px(ctx, BEZ.x + 1 + i, CENTER_Y - 2 + i, 1, 5 - i * 2, c);
    px(ctx, BEZ.x + BEZ.w - 2 - i, CENTER_Y - 2 + i, 1, 5 - i * 2, c);
  }
}

function panel(ctx: SKRSContext2D, s: Scene) {
  bevel(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, PAL.d, PAL.g, PAL.k, PAL.k);
  const col = PANEL.w / 3;
  const cells: [string, string, string][] = [
    ['CREDITS', String(s.credits), PAL.m],
    ['BET', String(s.bet), PAL.Y],
    ['WIN', s.allStopped ? String(s.payout) : '---', s.payout > 0 ? (Math.floor(s.t * 12) % 2 ? PAL.F : PAL.e) : PAL.G],
  ];
  cells.forEach(([label, value, color], i) => {
    const cx = PANEL.x + col * (i + 0.5);
    pixelTextCentered(ctx, label, cx, PANEL.y + 3, PAL.w, 1, 1);
    pixelTextCentered(ctx, value, cx, PANEL.y + 10, color, 1, 1);
  });
}

function jackpotStrip(ctx: SKRSContext2D, s: Scene) {
  const text = `JACKPOT ${s.jackpot}`;
  const cx = CAB.x + CAB.w / 2;
  px(ctx, cx - textWidth(text) / 2 - 2, PANEL.y + PANEL.h + 2, textWidth(text) + 4, 9, PAL.r);
  pixelTextCentered(ctx, text, cx, PANEL.y + PANEL.h + 4, PAL.l, 1, 1);
}

interface LeverTip {
  /** Screen height of the ball. x is always LEVER.x -- see the note above. */
  y: number;
  /** 0 at rest, 1 when the rod points straight at the camera. */
  depth: number;
  /** Signed rod length on screen: negative above the pivot, positive below. */
  reach: number;
}

function leverTip(u: number, g: LeverGeom): LeverTip {
  const angle = g.pulledAngle * u;
  // Orthographic projection of a swing through the depth axis: the vertical
  // component is cos, and sin is depth, which never reaches the screen as
  // displacement -- only as scale.
  const reach = -Math.cos(angle) * g.len;
  return { y: LEVER.y + reach, depth: Math.sin(angle), reach };
}

/**
 * Hinge bracket bolted straight to the cabinet's flank -- a plate half on
 * the cabinet, half hanging past its edge, with a visible pin. No separate
 * housing: the lever mounts directly to the machine.
 */
function leverBracket(ctx: SKRSContext2D) {
  px(ctx, LEVER.x - 5, LEVER.y - 7, 12, 14, PAL.d);
  px(ctx, LEVER.x - 4, LEVER.y - 6, 10, 12, PAL.G);
  px(ctx, LEVER.x - 4, LEVER.y - 6, 10, 1, PAL.w);
  px(ctx, LEVER.x - 4, LEVER.y - 6, 1, 12, PAL.w);
  px(ctx, LEVER.x - 5, LEVER.y - 7, 1, 1, PAL.k);
  px(ctx, LEVER.x + 5, LEVER.y - 7, 1, 1, PAL.k);
  px(ctx, LEVER.x - 5, LEVER.y + 6, 1, 1, PAL.k);
  px(ctx, LEVER.x + 5, LEVER.y + 6, 1, 1, PAL.k);
  // pivot pin
  px(ctx, LEVER.x - 1, LEVER.y - 1, 3, 3, PAL.k);
  px(ctx, LEVER.x - 1, LEVER.y - 1, 1, 1, PAL.w);
}

function lever(ctx: SKRSContext2D, s: Scene, g: LeverGeom) {
  const tip = leverTip(s.lever, g);
  const x = LEVER.x;

  const dir = Math.sign(tip.reach) || -1;
  const span = Math.round(Math.abs(tip.reach));
  const wide = tip.depth > 0.72;

  // Hub: the collar clamped to the pivot. It belongs to the lever, not the
  // mount, so it swings with the arm -- a short cylinder along the arm's axis,
  // foreshortening by the same cosine as the rod until it is a disc seen
  // end-on at the pass. Without this the arm reads as bending out of a rigid
  // bracket rather than the whole assembly rotating.
  const hubSpan = Math.round((Math.abs(tip.reach) / g.len) * HUB_LEN);
  for (let i = 0; i <= hubSpan; i++) {
    const ry = LEVER.y + dir * i;
    px(ctx, x - HUB_R, ry, HUB_R * 2 + 1, 1, PAL.G);
    px(ctx, x - HUB_R, ry, 1, 1, PAL.w);
    px(ctx, x + HUB_R, ry, 1, 1, PAL.d);
  }
  // Outer face of the collar, which is the whole of it when end-on.
  const capY = LEVER.y + dir * hubSpan;
  disc(ctx, x, capY, HUB_R + 1, PAL.d);
  disc(ctx, x, capY, HUB_R, PAL.G);
  px(ctx, x - HUB_R + 1, capY - 1, 2, 1, PAL.w);

  // Rod: a vertical shaft from the collar to the ball, thickening as it comes
  // toward the camera. It runs up at rest and down once the ball has passed
  // the pivot, and vanishes entirely at the pass -- which is correct, that is
  // the instant it points straight at the viewer.
  for (let i = hubSpan; i <= span; i++) {
    const ry = LEVER.y + dir * i;
    px(ctx, x - 1, ry, 1, 1, PAL.w);
    px(ctx, x, ry, 1, 1, PAL.W);
    if (wide) px(ctx, x + 1, ry, 1, 1, PAL.w);
  }

  // Ball: swells toward the camera and is drawn over the bracket at the pass,
  // which is what sells the pull as coming at the viewer rather than swinging.
  const rad = 3 + Math.round(tip.depth * g.bulge);
  const by = Math.round(tip.y);
  const near = tip.depth > 0.55;
  disc(ctx, x, by, rad + 1, PAL.k);
  disc(ctx, x, by, rad, PAL.R);
  // Lit cap offset up-left toward the key light, and a shaded underside, so it
  // stays spherical instead of flattening into a red blob as it grows.
  disc(ctx, x - 1, by - 1, Math.max(1, rad - 2), near ? PAL.e : PAL.r);
  px(ctx, x - rad + 1, by + rad - 1, rad, 1, PAL.r);
  px(ctx, x - 2, by - 2, 2, 2, PAL.p);
}

function sparkle(ctx: SKRSContext2D, s: Scene) {
  if (s.winPulse <= 0) return;
  const n = s.rule?.jackpot ? 22 : 12;
  const life = s.winPulse;
  for (let i = 0; i < n; i++) {
    const a = (i * 2.399963) % (Math.PI * 2);
    const dist = (8 + ((i * 13) % 26)) * life;
    const x = CAB.x + CAB.w / 2 + Math.cos(a) * dist * 1.6;
    const y = CENTER_Y + Math.sin(a) * dist;
    if (life > 0.92) continue;
    px(ctx, x, y, 1, 1, i % 3 === 0 ? PAL.F : i % 3 === 1 ? PAL.Y : PAL.e);
  }
}

/** The strip of canvas to the right of the cabinet, where the control lives. */
const ACT_REGION: Region = {
  x: CAB.x + CAB.w,
  y: CAB.y,
  w: W - (CAB.x + CAB.w) - 1,
  h: CAB.h,
  cx: CAB.x + CAB.w + Math.round((W - (CAB.x + CAB.w) - 1) / 2),
  cy: CAB.y + CAB.h / 2,
};

/**
 * Build the theme around a given control. Passing no actuator keeps the
 * original pull lever; passing one swaps in an alternative so the concepts
 * can be compared on the real cabinet rather than in isolation.
 */
export function createPixelTheme(actuator?: Actuator, leverGeom: LeverGeom = DEFAULT_LEVER): Theme {
  return {
    id: actuator ? `pixel-${actuator.id}` : 'pixel',
    name: actuator ? `Pixel Arcade (${actuator.name})` : 'Pixel Arcade',
    tagline: actuator?.note ?? 'Hand-drawn 16x16 sprites on a 26-colour palette, blown up 4x. Chunky and retro.',
    baseW: W,
    baseH: H,
    scale: SCALE,
    smooth: false,
    maxColors: 96,
    colors: { idle: 0x1b1f28, win: 0xffc93c, jackpot: 0xe8434d, lose: 0x4a5361 },
    render: (ctx, s) => renderCabinet(ctx, s, actuator, leverGeom),
  };
}

export const pixelTheme: Theme = {
  id: 'pixel',
  name: 'Pixel Arcade',
  tagline: 'Hand-drawn 16x16 sprites on a 26-colour palette, blown up 4x. Chunky and retro.',
  baseW: W,
  baseH: H,
  scale: SCALE,
  smooth: false,
  maxColors: 96,
  colors: { idle: 0x1b1f28, win: 0xffc93c, jackpot: 0xe8434d, lose: 0x4a5361 },
  render: (ctx, s) => renderCabinet(ctx, s, undefined, DEFAULT_LEVER),
};

function renderCabinet(ctx: SKRSContext2D, s: Scene, actuator: Actuator | undefined, leverGeom: LeverGeom) {
  {
    backdrop(ctx, s);
    cabinet(ctx, s);
    if (!actuator) leverBracket(ctx);
    marquee(ctx, s);

    // bezel recess
    px(ctx, BEZ.x, BEZ.y, BEZ.w, BEZ.h, PAL.Y);
    px(ctx, BEZ.x + 1, BEZ.y + 1, BEZ.w - 2, BEZ.h - 2, PAL.k);

    for (let i = 0; i < 3; i++) {
      reelFace(ctx, i);
      const x = REELS_X + i * (REEL_W + REEL_GAP);
      drawReel(
        ctx,
        { x, y: WIN_Y, w: REEL_W, h: WIN_H, cell: CELL, size: SPRITE_SIZE },
        s.strip,
        s.reels[i].pos,
        s.reels[i].speed,
        FRAME_TIME,
        (c, sym, cx, cy) => drawPixelSymbol(c, sym, cx, cy),
      );
      reelShade(ctx, i);

      if (i === 2 && s.anticipation > 0 && Math.floor(s.t * 14) % 2) {
        px(ctx, x - 1, WIN_Y - 1, REEL_W + 2, 1, PAL.F);
        px(ctx, x - 1, WIN_Y + WIN_H, REEL_W + 2, 1, PAL.F);
        px(ctx, x - 1, WIN_Y, 1, WIN_H, PAL.F);
        px(ctx, x + REEL_W, WIN_Y, 1, WIN_H, PAL.F);
      }
      if (i < 2) px(ctx, x + REEL_W, WIN_Y, REEL_GAP, WIN_H, PAL.k);
    }

    payline(ctx, s);
    sparkle(ctx, s);
    panel(ctx, s);
    jackpotStrip(ctx, s);
    if (actuator) {
      // Latches once the reels are away and stays set for the rest of the
      // animation, so controls that shouldn't spring back have something
      // monotonic to key off.
      const fired = s.allStopped || s.reels.some((r) => r.speed > 0.5);
      actuator.draw(ctx, ACT_REGION, { u: s.lever, fired }, s);
    } else {
      lever(ctx, s, leverGeom);
    }
  }
}
