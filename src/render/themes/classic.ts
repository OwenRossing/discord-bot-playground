import type { SKRSContext2D } from '@napi-rs/canvas';
import type { Theme, Scene } from '../types.js';
import { drawVectorSymbol } from '../symbols-vector.js';
import { bulbRing, drawReel, roundRect, textCentered, vgrad, clamp01 } from '../paint.js';

const W = 460;
const H = 360;
const CAB = { x: 24, y: 6, w: 352, h: 348, r: 22 };
const BEZEL = { x: 44, y: 84, w: 312, h: 170, r: 12 };
const REEL_W = 94;
const REEL_GAP = 9;
const REELS_X = BEZEL.x + 12;
const WIN_Y = BEZEL.y + 10;
const WIN_H = BEZEL.h - 20;
const CENTER_Y = WIN_Y + WIN_H / 2;
// Pitch is shorter than the window, so a quarter of each neighbouring symbol
// peeks above and below the payline -- that is what makes a near miss legible.
const CELL = 100;
const SYM = 66;
const PANEL = { x: 44, y: 266, w: 312, h: 58, r: 10 };
const LEVER = { x: 374, y: 150, len: 58, knob: 13 };

const FRAME_TIME = 0.05;

function backdrop(ctx: SKRSContext2D, s: Scene) {
  const g = ctx.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.5, W * 0.78);
  g.addColorStop(0, s.winPulse > 0 ? '#4a2410' : '#2a1016');
  g.addColorStop(0.55, '#170a0e');
  g.addColorStop(1, '#080405');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function cabinet(ctx: SKRSContext2D, s: Scene) {
  // drop shadow
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#000';
  roundRect(ctx, CAB.x + 5, CAB.y + 8, CAB.w, CAB.h, CAB.r);
  ctx.fill();
  ctx.restore();

  roundRect(ctx, CAB.x, CAB.y, CAB.w, CAB.h, CAB.r);
  ctx.fillStyle = vgrad(ctx, CAB.y, CAB.y + CAB.h, [
    [0, '#e0424f'],
    [0.18, '#c11f2c'],
    [0.62, '#8e1019'],
    [1, '#54070d'],
  ]);
  ctx.fill();

  // gold bevel
  ctx.lineWidth = 4;
  ctx.strokeStyle = vgrad(ctx, CAB.y, CAB.y + CAB.h, [
    [0, '#ffe9a8'],
    [0.4, '#e0a92b'],
    [1, '#8a6410'],
  ]);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, CAB.x + 3, CAB.y + 3, CAB.w - 6, CAB.h - 6, CAB.r - 3);
  ctx.stroke();

  // vertical sheen down the left cheek
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#fff';
  roundRect(ctx, CAB.x + 10, CAB.y + 10, 26, CAB.h - 20, 12);
  ctx.fill();
  ctx.restore();
}

function marquee(ctx: SKRSContext2D, s: Scene) {
  const x = CAB.x + 22;
  const y = CAB.y + 14;
  const w = CAB.w - 44;
  const h = 52;

  roundRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = vgrad(ctx, y, y + h, [
    [0, '#2a0d10'],
    [1, '#12060a'],
  ]);
  ctx.fill();
  ctx.strokeStyle = '#e0a92b';
  ctx.lineWidth = 2;
  ctx.stroke();

  const phase = s.t * 9 + s.winPulse * 12;
  const hot = s.winPulse > 0;
  bulbRing(ctx, x + 6, y + 6, w - 12, h - 12, 26, 2.6, phase,
    hot ? '#fff6c8' : '#ffd76a', hot ? '#ffb02e' : '#6b4a12',
    hot ? 'rgba(255,214,106,0.35)' : 'rgba(255,190,60,0.16)');

  const title = s.rule?.jackpot && s.winPulse > 0 ? 'JACKPOT!!' : 'LUCKY SEVENS';
  const glow = 0.6 + 0.4 * Math.sin(s.t * 6);
  ctx.save();
  ctx.shadowColor = `rgba(255,90,60,${0.5 * glow})`;
  ctx.shadowBlur = 12;
  const g = vgrad(ctx, y + 14, y + h - 12, [
    [0, '#fff1c2'],
    [0.5, '#ffcf4a'],
    [1, '#e5892b'],
  ]);
  textCentered(ctx, title, x + w / 2, y + h / 2 + 1, `bold 25px "DejaVu Sans", sans-serif`, g, {
    color: '#4a0a0a',
    width: 4,
  });
  ctx.restore();
}

function reelBackdrop(ctx: SKRSContext2D) {
  // recessed bezel
  roundRect(ctx, BEZEL.x - 4, BEZEL.y - 4, BEZEL.w + 8, BEZEL.h + 8, BEZEL.r + 3);
  ctx.fillStyle = vgrad(ctx, BEZEL.y, BEZEL.y + BEZEL.h, [
    [0, '#8a6410'],
    [0.5, '#e0a92b'],
    [1, '#7a5709'],
  ]);
  ctx.fill();

  roundRect(ctx, BEZEL.x, BEZEL.y, BEZEL.w, BEZEL.h, BEZEL.r);
  ctx.fillStyle = '#150e08';
  ctx.fill();
}

function reelFace(ctx: SKRSContext2D, i: number) {
  const x = REELS_X + i * (REEL_W + REEL_GAP);
  roundRect(ctx, x, WIN_Y, REEL_W, WIN_H, 6);
  ctx.fillStyle = vgrad(ctx, WIN_Y, WIN_Y + WIN_H, [
    [0, '#b3a78f'],
    [0.2, '#efe7d3'],
    [0.5, '#fbf6ea'],
    [0.8, '#e9e0ca'],
    [1, '#a89c85'],
  ]);
  ctx.fill();
}

/** Darken the top and bottom of each reel so the strip reads as a cylinder. */
function reelCurvature(ctx: SKRSContext2D, i: number) {
  const x = REELS_X + i * (REEL_W + REEL_GAP);
  ctx.save();
  roundRect(ctx, x, WIN_Y, REEL_W, WIN_H, 6);
  ctx.clip();
  const g = ctx.createLinearGradient(0, WIN_Y, 0, WIN_Y + WIN_H);
  g.addColorStop(0, 'rgba(18,10,3,0.80)');
  g.addColorStop(0.16, 'rgba(18,10,3,0.30)');
  g.addColorStop(0.30, 'rgba(18,10,3,0.04)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.70, 'rgba(18,10,3,0.04)');
  g.addColorStop(0.84, 'rgba(18,10,3,0.30)');
  g.addColorStop(1, 'rgba(18,10,3,0.80)');
  ctx.fillStyle = g;
  ctx.fillRect(x, WIN_Y, REEL_W, WIN_H);
  ctx.restore();
}

function payline(ctx: SKRSContext2D, s: Scene) {
  const lit = s.winPulse > 0;
  const a = lit ? 0.30 + 0.30 * Math.sin(s.t * 14) : 0;
  const top = CENTER_Y - CELL / 2 + 6;
  const h = CELL - 12;
  ctx.save();
  if (lit) {
    ctx.fillStyle = `rgba(255,214,90,${a * 0.55})`;
    ctx.fillRect(BEZEL.x + 4, top, BEZEL.w - 8, h);
  }
  ctx.strokeStyle = lit ? `rgba(255,240,170,${0.55 + a})` : 'rgba(214,36,46,0.75)';
  ctx.lineWidth = lit ? 3 : 1.6;
  ctx.beginPath();
  ctx.moveTo(BEZEL.x + 4, top);
  ctx.lineTo(BEZEL.x + BEZEL.w - 4, top);
  ctx.moveTo(BEZEL.x + 4, top + h);
  ctx.lineTo(BEZEL.x + BEZEL.w - 4, top + h);
  ctx.stroke();
  ctx.restore();

  // arrow markers on the bezel
  for (const dir of [-1, 1]) {
    const x = dir < 0 ? BEZEL.x - 2 : BEZEL.x + BEZEL.w + 2;
    ctx.beginPath();
    ctx.moveTo(x, CENTER_Y - 8);
    ctx.lineTo(x + dir * 9, CENTER_Y);
    ctx.lineTo(x, CENTER_Y + 8);
    ctx.closePath();
    ctx.fillStyle = lit ? '#ffe27a' : '#f3f0e6';
    ctx.fill();
  }
}

function glass(ctx: SKRSContext2D) {
  ctx.save();
  roundRect(ctx, BEZEL.x, BEZEL.y, BEZEL.w, BEZEL.h, BEZEL.r);
  ctx.clip();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(BEZEL.x, BEZEL.y + BEZEL.h * 0.75);
  ctx.lineTo(BEZEL.x + BEZEL.w * 0.55, BEZEL.y);
  ctx.lineTo(BEZEL.x + BEZEL.w * 0.85, BEZEL.y);
  ctx.lineTo(BEZEL.x, BEZEL.y + BEZEL.h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function led(ctx: SKRSContext2D, label: string, value: string, x: number, y: number, color: string) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 10px "DejaVu Sans", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.fillText(label, x, y - 13);
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 9;
  ctx.font = `bold 19px "DejaVu Sans Mono", monospace`;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y + 6);
  ctx.restore();
}

function panel(ctx: SKRSContext2D, s: Scene) {
  roundRect(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, PANEL.r);
  ctx.fillStyle = vgrad(ctx, PANEL.y, PANEL.y + PANEL.h, [
    [0, '#0d0b0a'],
    [1, '#1c1614'],
  ]);
  ctx.fill();
  ctx.strokeStyle = '#a97c1c';
  ctx.lineWidth = 2;
  ctx.stroke();

  const third = PANEL.w / 3;
  const cy = PANEL.y + PANEL.h / 2;
  led(ctx, 'CREDITS', String(s.credits), PANEL.x + third * 0.5, cy, '#7dff9b');
  led(ctx, 'BET', String(s.bet), PANEL.x + third * 1.5, cy, '#ffd24a');

  const winText = s.allStopped ? (s.payout > 0 ? `+${s.payout}` : '0') : '---';
  const winColor = s.payout > 0 && s.winPulse > 0
    ? (Math.floor(s.t * 12) % 2 ? '#fff6c0' : '#ff7a4d')
    : s.payout > 0 ? '#ff9a5c' : '#5b6470';
  led(ctx, 'WIN', winText, PANEL.x + third * 2.5, cy, winColor);

  // jackpot strip under the panel
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 12px "DejaVu Sans", sans-serif`;
  ctx.fillStyle = '#ffd76a';
  ctx.fillText(`JACKPOT  ${s.jackpot.toLocaleString('en-US')}`, CAB.x + CAB.w / 2, PANEL.y + PANEL.h + 17);
}

/** Cabinet rivets, so the flanks are not just flat red. */
function trim(ctx: SKRSContext2D) {
  ctx.fillStyle = 'rgba(255,226,160,0.55)';
  for (const ry of [CAB.y + 84, CAB.y + 180, CAB.y + 276]) {
    for (const rx of [CAB.x + 12, CAB.x + CAB.w - 12]) {
      ctx.beginPath();
      ctx.arc(rx, ry, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function lever(ctx: SKRSContext2D, s: Scene) {
  // flank plate the lever is bolted through
  roundRect(ctx, LEVER.x - 9, LEVER.y - 26, 18, 52, 9);
  ctx.fillStyle = vgrad(ctx, LEVER.y - 30, LEVER.y + 30, [
    [0, '#6f7986'],
    [0.5, '#39404a'],
    [1, '#20252c'],
  ]);
  ctx.fill();
  ctx.strokeStyle = '#8a6410';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // hub
  ctx.beginPath();
  ctx.ellipse(LEVER.x, LEVER.y, 11, 13, 0, 0, Math.PI * 2);
  ctx.fillStyle = vgrad(ctx, LEVER.y - 13, LEVER.y + 13, [
    [0, '#f2f4f7'],
    [0.5, '#98a2b0'],
    [1, '#4a5361'],
  ]);
  ctx.fill();
  ctx.strokeStyle = '#2b3038';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // rest points up-right; pulling swings it down
  const rest = -0.62;
  const pulled = 1.15;
  const angle = rest + (pulled - rest) * s.lever;
  const ex = LEVER.x + Math.sin(angle) * LEVER.len;
  const ey = LEVER.y - Math.cos(angle) * LEVER.len;

  ctx.beginPath();
  ctx.moveTo(LEVER.x, LEVER.y);
  ctx.lineTo(ex, ey);
  ctx.lineCap = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#3b424c';
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeStyle = vgrad(ctx, LEVER.y - LEVER.len, LEVER.y + LEVER.len, [
    [0, '#ffffff'],
    [0.5, '#b9c3d0'],
    [1, '#6d7783'],
  ]);
  ctx.stroke();

  // ball knob
  const kg = ctx.createRadialGradient(ex - 4, ey - 5, 1, ex, ey, LEVER.knob);
  kg.addColorStop(0, '#ff8f8f');
  kg.addColorStop(0.45, '#d81f2c');
  kg.addColorStop(1, '#6e070f');
  ctx.beginPath();
  ctx.arc(ex, ey, LEVER.knob, 0, Math.PI * 2);
  ctx.fillStyle = kg;
  ctx.fill();
  ctx.strokeStyle = '#3d060b';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(ex - 4, ey - 5, 4, 2.6, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
}

/** Gold sparks thrown from the reel window on a win. */
function sparkle(ctx: SKRSContext2D, s: Scene) {
  if (s.winPulse <= 0) return;
  const n = s.rule?.jackpot ? 26 : 14;
  const life = clamp01(s.winPulse);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const seed = i * 2.399963;
    const a = seed % (Math.PI * 2);
    const dist = (28 + ((i * 37) % 90)) * life;
    const x = W / 2 - 22 + Math.cos(a) * dist * 1.5;
    const y = CENTER_Y + Math.sin(a) * dist;
    const r = 3.4 * (1 - life) + 0.8;
    ctx.globalAlpha = (1 - life) * 0.95;
    ctx.fillStyle = i % 3 === 0 ? '#fff4c4' : i % 3 === 1 ? '#ffd24a' : '#ff8a3d';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export const classicTheme: Theme = {
  id: 'classic',
  name: 'Classic Vegas',
  tagline: 'Red-and-chrome cabinet, gold bevel, chasing marquee bulbs, physical lever.',
  baseW: W,
  baseH: H,
  scale: 1,
  smooth: true,
  maxColors: 216,
  colors: { idle: 0x2b2d31, win: 0xf1c40f, jackpot: 0xff4d4d, lose: 0x4e5058 },

  render(ctx, s) {
    backdrop(ctx, s);
    cabinet(ctx, s);
    marquee(ctx, s);
    reelBackdrop(ctx);

    for (let i = 0; i < 3; i++) {
      reelFace(ctx, i);
      const x = REELS_X + i * (REEL_W + REEL_GAP);
      drawReel(
        ctx,
        { x, y: WIN_Y, w: REEL_W, h: WIN_H, cell: CELL, size: SYM },
        s.strip,
        s.reels[i].pos,
        s.reels[i].speed,
        FRAME_TIME,
        (c, sym, cx, cy, size) => drawVectorSymbol(c, sym, cx, cy, size, 'glossy'),
      );
      reelCurvature(ctx, i);

      // anticipation glow on the last reel while it stalls
      if (i === 2 && s.anticipation > 0) {
        ctx.save();
        ctx.globalAlpha = 0.30 + 0.25 * Math.sin(s.t * 18);
        ctx.strokeStyle = '#ffe27a';
        ctx.lineWidth = 4;
        roundRect(ctx, x + 1, WIN_Y + 1, REEL_W - 2, WIN_H - 2, 6);
        ctx.stroke();
        ctx.restore();
      }

      if (i < 2) {
        const gx = x + REEL_W + REEL_GAP / 2;
        ctx.fillStyle = 'rgba(20,12,4,0.85)';
        ctx.fillRect(gx - REEL_GAP / 2, WIN_Y - 2, REEL_GAP, WIN_H + 4);
      }
    }

    payline(ctx, s);
    glass(ctx);
    sparkle(ctx, s);
    trim(ctx);
    panel(ctx, s);
    lever(ctx, s);
  },
};
