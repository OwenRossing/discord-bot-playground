import type { SKRSContext2D } from '@napi-rs/canvas';
import type { SymbolId } from '../game/symbols.js';

export type SymbolStyle = 'glossy' | 'flat' | 'neon';

interface Ink {
  /** Main body colour, light to dark. */
  hi: string;
  mid: string;
  lo: string;
  /** Outline / accent. */
  line: string;
  leaf: string;
}

const INK: Record<SymbolId, Ink> = {
  cherry: { hi: '#ff7b7b', mid: '#e01f2d', lo: '#8d0d17', line: '#4a060c', leaf: '#3fa34d' },
  lemon: { hi: '#fff3a8', mid: '#f7cf29', lo: '#c08f00', line: '#6b4f00', leaf: '#3fa34d' },
  grape: { hi: '#c69bf0', mid: '#8b4ecb', lo: '#542a86', line: '#2e1550', leaf: '#3fa34d' },
  bell: { hi: '#fff0b0', mid: '#f2b705', lo: '#a97400', line: '#5c3f00', leaf: '#3fa34d' },
  bar: { hi: '#ffffff', mid: '#e8ecf2', lo: '#9aa4b2', line: '#1e2733', leaf: '#3fa34d' },
  diamond: { hi: '#d6fbff', mid: '#3fd0e8', lo: '#1478a8', line: '#0b3a5c', leaf: '#3fa34d' },
  seven: { hi: '#ff8a6b', mid: '#e8262c', lo: '#9d0d18', line: '#4a060c', leaf: '#3fa34d' },
};

export function drawVectorSymbol(
  ctx: SKRSContext2D,
  sym: SymbolId,
  cx: number,
  cy: number,
  size: number,
  style: SymbolStyle = 'glossy',
) {
  ctx.save();
  ctx.translate(cx, cy);
  const ink = INK[sym];
  if (style === 'neon') {
    ctx.shadowColor = ink.mid;
    ctx.shadowBlur = size * 0.22;
  }
  switch (sym) {
    case 'cherry': cherry(ctx, size, ink, style); break;
    case 'lemon': lemon(ctx, size, ink, style); break;
    case 'grape': grape(ctx, size, ink, style); break;
    case 'bell': bell(ctx, size, ink, style); break;
    case 'bar': bar(ctx, size, ink, style); break;
    case 'diamond': diamond(ctx, size, ink, style); break;
    case 'seven': seven(ctx, size, ink, style); break;
  }
  ctx.restore();
}

/** Body fill: a soft top-lit gradient for glossy/neon, a flat tone otherwise. */
function body(ctx: SKRSContext2D, s: number, ink: Ink, style: SymbolStyle, top = -0.5, bottom = 0.5) {
  if (style === 'flat') return ink.mid;
  const g = ctx.createLinearGradient(0, s * top, 0, s * bottom);
  g.addColorStop(0, ink.hi);
  g.addColorStop(0.45, ink.mid);
  g.addColorStop(1, ink.lo);
  return g;
}

function outline(ctx: SKRSContext2D, s: number, ink: Ink, style: SymbolStyle, weight = 0.045) {
  if (style === 'flat') return;
  ctx.lineWidth = Math.max(1, s * weight);
  ctx.strokeStyle = style === 'neon' ? ink.hi : ink.line;
  ctx.stroke();
}

function specular(ctx: SKRSContext2D, x: number, y: number, rx: number, ry: number, alpha = 0.55) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function stem(ctx: SKRSContext2D, s: number, ink: Ink, toX: number, toY: number) {
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.40);
  ctx.quadraticCurveTo(toX * 0.55, -s * 0.30, toX, toY);
  ctx.lineWidth = Math.max(1, s * 0.045);
  ctx.strokeStyle = '#6b4a1f';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function leaf(ctx: SKRSContext2D, s: number, ink: Ink, style: SymbolStyle) {
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.40);
  ctx.quadraticCurveTo(s * 0.20, -s * 0.56, s * 0.34, -s * 0.42);
  ctx.quadraticCurveTo(s * 0.16, -s * 0.32, 0, -s * 0.40);
  ctx.closePath();
  ctx.fillStyle = style === 'neon' ? 'rgba(63,163,77,0.35)' : ink.leaf;
  ctx.fill();
  outline(ctx, s, { ...ink, line: '#1d5c28', hi: '#7de08c' }, style, 0.03);
}

function cherry(ctx: SKRSContext2D, s: number, ink: Ink, style: SymbolStyle) {
  const r = s * 0.21;
  stem(ctx, s, ink, -s * 0.19, s * 0.10);
  stem(ctx, s, ink, s * 0.21, s * 0.16);
  leaf(ctx, s, ink, style);
  for (const [x, y] of [[-s * 0.19, s * 0.16], [s * 0.21, s * 0.22]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = body(ctx, s, ink, style, 0.16 - 0.21, 0.16 + 0.21);
    ctx.fill();
    outline(ctx, s, ink, style);
    if (style === 'glossy') specular(ctx, x - r * 0.34, y - r * 0.38, r * 0.30, r * 0.18);
  }
}

function lemon(ctx: SKRSContext2D, s: number, ink: Ink, style: SymbolStyle) {
  ctx.save();
  ctx.rotate(-0.32);
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.40, s * 0.26, 0, 0, Math.PI * 2);
  ctx.fillStyle = body(ctx, s, ink, style, -0.26, 0.26);
  ctx.fill();
  outline(ctx, s, ink, style);
  // pointed tips
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * s * 0.38, -s * 0.05);
    ctx.quadraticCurveTo(dir * s * 0.50, 0, dir * s * 0.38, s * 0.05);
    ctx.closePath();
    ctx.fillStyle = style === 'flat' ? ink.mid : ink.lo;
    ctx.fill();
  }
  if (style === 'glossy') specular(ctx, -s * 0.12, -s * 0.11, s * 0.13, s * 0.055);
  ctx.restore();
}

function grape(ctx: SKRSContext2D, s: number, ink: Ink, style: SymbolStyle) {
  leaf(ctx, s, ink, style);
  const r = s * 0.125;
  const rows: [number, number][] = [
    [-2, 0], [0, 0], [2, 0],
    [-1, 1], [1, 1],
    [0, 2],
  ];
  for (const [gx, gy] of rows) {
    const x = gx * r * 0.95;
    const y = -s * 0.16 + gy * r * 1.62;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = body(ctx, s, ink, style, (y - r) / s, (y + r) / s);
    ctx.fill();
    outline(ctx, s, ink, style, 0.03);
    if (style === 'glossy') specular(ctx, x - r * 0.3, y - r * 0.35, r * 0.28, r * 0.16, 0.45);
  }
}

function bell(ctx: SKRSContext2D, s: number, ink: Ink, style: SymbolStyle) {
  ctx.beginPath();
  ctx.moveTo(-s * 0.34, s * 0.20);
  ctx.quadraticCurveTo(-s * 0.32, -s * 0.34, 0, -s * 0.38);
  ctx.quadraticCurveTo(s * 0.32, -s * 0.34, s * 0.34, s * 0.20);
  ctx.closePath();
  ctx.fillStyle = body(ctx, s, ink, style, -0.38, 0.20);
  ctx.fill();
  outline(ctx, s, ink, style);
  // rim
  ctx.beginPath();
  ctx.ellipse(0, s * 0.21, s * 0.38, s * 0.085, 0, 0, Math.PI * 2);
  ctx.fillStyle = style === 'flat' ? ink.mid : ink.lo;
  ctx.fill();
  outline(ctx, s, ink, style, 0.035);
  // clapper
  ctx.beginPath();
  ctx.arc(0, s * 0.33, s * 0.085, 0, Math.PI * 2);
  ctx.fillStyle = style === 'neon' ? ink.hi : ink.line;
  ctx.fill();
  if (style === 'glossy') specular(ctx, -s * 0.13, -s * 0.16, s * 0.075, s * 0.15, 0.4);
}

function bar(ctx: SKRSContext2D, s: number, ink: Ink, style: SymbolStyle) {
  const w = s * 0.82;
  const h = s * 0.36;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, s * 0.07);
  // Neon reads as a lit outline on a dark plate; a white fill would blow out.
  ctx.fillStyle = style === 'neon' ? '#101826' : body(ctx, s, ink, style, -0.18, 0.18);
  ctx.fill();
  outline(ctx, s, ink, style, 0.05);
  ctx.font = `bold ${Math.round(s * 0.27)}px "DejaVu Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = style === 'neon' ? ink.hi : '#16202b';
  ctx.fillText('BAR', 0, s * 0.012);
  if (style === 'glossy') {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-w / 2 + s * 0.03, -h / 2 + s * 0.03, w - s * 0.06, h * 0.22);
    ctx.restore();
  }
}

function diamond(ctx: SKRSContext2D, s: number, ink: Ink, style: SymbolStyle) {
  const topY = -s * 0.26;
  const tw = s * 0.20; // table half-width
  const cw = s * 0.38; // crown half-width
  const botY = s * 0.40;
  // pavilion
  ctx.beginPath();
  ctx.moveTo(-cw, topY + s * 0.10);
  ctx.lineTo(cw, topY + s * 0.10);
  ctx.lineTo(0, botY);
  ctx.closePath();
  ctx.fillStyle = body(ctx, s, ink, style, -0.16, 0.40);
  ctx.fill();
  outline(ctx, s, ink, style, 0.035);
  // crown
  ctx.beginPath();
  ctx.moveTo(-tw, topY);
  ctx.lineTo(tw, topY);
  ctx.lineTo(cw, topY + s * 0.10);
  ctx.lineTo(-cw, topY + s * 0.10);
  ctx.closePath();
  ctx.fillStyle = style === 'flat' ? ink.hi : ink.hi;
  ctx.fill();
  outline(ctx, s, ink, style, 0.035);
  if (style !== 'flat') {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, s * 0.022);
    ctx.beginPath();
    ctx.moveTo(-tw, topY);
    ctx.lineTo(0, botY);
    ctx.moveTo(tw, topY);
    ctx.lineTo(0, botY);
    ctx.stroke();
    ctx.restore();
  }
  if (style === 'glossy') specular(ctx, -s * 0.16, topY + s * 0.16, s * 0.05, s * 0.11, 0.5);
}

function seven(ctx: SKRSContext2D, s: number, ink: Ink, style: SymbolStyle) {
  ctx.font = `bold ${Math.round(s * 0.92)}px "DejaVu Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const g = ctx.createLinearGradient(0, -s * 0.42, 0, s * 0.42);
  if (style === 'flat') {
    ctx.fillStyle = ink.mid;
  } else {
    g.addColorStop(0, ink.hi);
    g.addColorStop(0.5, ink.mid);
    g.addColorStop(1, ink.lo);
    ctx.fillStyle = g;
  }
  if (style !== 'flat') {
    ctx.lineWidth = Math.max(1.5, s * 0.075);
    ctx.strokeStyle = style === 'neon' ? ink.hi : '#ffd23f';
    ctx.lineJoin = 'round';
    ctx.strokeText('7', 0, s * 0.03);
  }
  ctx.fillText('7', 0, s * 0.03);
}
