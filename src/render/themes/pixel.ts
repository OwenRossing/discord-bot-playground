import type { SKRSContext2D } from '@napi-rs/canvas';
import type { Scene, Theme } from '../types.js';
import { drawReel } from '../paint.js';
import { PAL, SPRITE_SIZE, drawPixelSymbol, validateSprites } from '../pixelsprites.js';
import { pixelTextCentered, pixelText, textWidth } from '../pixelfont.js';

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
// It rotates about that pivot, rest-to-pulled, in a plane that runs toward
// and away from the viewer rather than side to side. A flat screen can't
// show that rotation as a curved path (there is no sideways component to
// draw), so the arc instead reads through the rod itself: near both the
// rest and pulled ends the arm is closer to the image plane and draws at
// full length; at the midpoint of the pull it is rotating through the
// depth axis, most foreshortened, so the rendered rod shortens to about
// 60% there and the ball swells slightly, as if it has swung nearest the
// camera. The tip barely drifts sideways -- almost all visible motion is
// vertical, which is what makes it read as "pull down" rather than "swing
// sideways."
const LEVER = {
  x: CAB.x + CAB.w,
  y: CAB.y + CAB.h / 2,
  len: 24,
  // 60 degrees up from horizontal at rest (comfortably in the 50-70 range a
  // real cabinet handle sits at), swinging to the mirrored 60 degrees below
  // horizontal when pulled -- opposite side of horizontal, same lean side.
  restAngle: (30 * Math.PI) / 180,
  pulledAngle: (150 * Math.PI) / 180,
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
    if (x > CAB.x - 3 && x < LEVER.x + LEVER.len + 4) continue;
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
  x: number;
  y: number;
  /** 0..1, 1 at rest/pulled extremes, dips at the midpoint of the swing. */
  reach: number;
}

function leverTip(u: number): LeverTip {
  const angle = LEVER.restAngle + (LEVER.pulledAngle - LEVER.restAngle) * u;
  // Pinches the rod's rendered length at the swing's midpoint, which is the
  // instant a real rotation through the depth axis would foreshorten most.
  const reach = 1 - 0.5 * (1 - (2 * u - 1) ** 2);
  const len = LEVER.len * reach;
  return {
    x: LEVER.x + Math.sin(angle) * len,
    y: LEVER.y - Math.cos(angle) * len,
    reach,
  };
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

function lever(ctx: SKRSContext2D, s: Scene) {
  const tip = leverTip(s.lever);

  // Rod: a round-shaded 2px shaft from the pivot to the ball. Its length is
  // whatever leverTip() computed for this instant -- short at the midpoint,
  // full at both ends -- which is the whole depth illusion.
  const dx = tip.x - LEVER.x;
  const dy = tip.y - LEVER.y;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.round(dist));
  for (let i = 3; i <= steps; i++) {
    const t = i / steps;
    const px_ = LEVER.x + dx * t;
    const py_ = LEVER.y + dy * t;
    px(ctx, px_ - 1, py_ - 1, 1, 2, PAL.w);
    px(ctx, px_, py_ - 1, 1, 2, PAL.W);
  }

  // ball knob -- swells very slightly at peak foreshortening, as if it has
  // swung nearest the camera at that instant
  const grow = tip.reach < 0.65 ? 1 : 0;
  const bx = tip.x;
  const by = tip.y;
  px(ctx, bx - 3 - grow, by - 2 - grow, 6 + grow * 2, 5 + grow * 2, PAL.R);
  px(ctx, bx - 2 - grow, by - 3 - grow, 4 + grow * 2, 7 + grow * 2, PAL.R);
  px(ctx, bx - 2, by - 2, 2, 2, PAL.p);
  px(ctx, bx - 1, by + 1, 3, 2, PAL.r);
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

  render(ctx, s) {
    backdrop(ctx, s);
    cabinet(ctx, s);
    leverBracket(ctx);
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
    lever(ctx, s);
  },
};
