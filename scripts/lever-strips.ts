/**
 * Filmstrip of lever geometry candidates across the pull window. The pull is
 * ~8% of the animation, so this samples it densely and ignores the spin --
 * the lever is at rest for all of it anyway.
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderStill } from '../src/render/render.js';
import { planSpin } from '../src/render/timeline.js';
import { resolve } from '../src/game/engine.js';
import { createPixelTheme, DEFAULT_LEVER, type LeverGeom } from '../src/render/themes/pixel.js';
import { pixelText } from '../src/render/pixelfont.js';

mkdirSync('out', { recursive: true });

const outcome = resolve([19, 36, 19], 25, 8420);
const tl = planSpin(outcome);
const input = { outcome, creditsBefore: 1200, jackpot: 8420 };

const REGION = { x: 96, w: 32, y: 20, h: 68 };
const SCALE = 4;
const ZOOM = 2;
const FRAMES = 9;
const LABEL_W = 128;

const deg = (d: number) => (d * Math.PI) / 180;

const candidates: { name: string; geom: LeverGeom }[] = [
  { name: 'K 110 b2', geom: { len: 24, pulledAngle: deg(110), bulge: 2 } },
  { name: 'L 125 b2.4', geom: DEFAULT_LEVER },
  { name: 'M 125 b3.5', geom: { len: 24, pulledAngle: deg(125), bulge: 3.5 } },
  { name: 'N 140 b2.4', geom: { len: 24, pulledAngle: deg(140), bulge: 2.4 } },
  { name: 'O 155 b3', geom: { len: 26, pulledAngle: deg(155), bulge: 3 } },
  { name: 'P 180 b3', geom: { len: 24, pulledAngle: deg(180), bulge: 3 } },
];

const cellW = REGION.w * ZOOM;
const cellH = REGION.h * ZOOM;
const rowH = cellH + 10;
const sheet = createCanvas(LABEL_W + cellW * FRAMES, rowH * candidates.length);
const sctx = sheet.getContext('2d');
sctx.imageSmoothingEnabled = false;
sctx.fillStyle = '#0a0c10';
sctx.fillRect(0, 0, sheet.width, sheet.height);

for (let v = 0; v < candidates.length; v++) {
  const { name, geom } = candidates[v];
  const rowY = v * rowH;
  pixelText(sctx, name.toUpperCase(), 4, rowY + cellH / 2, '#63c96b', 2, 1);
  const theme = createPixelTheme(undefined, geom);

  for (let f = 0; f < FRAMES; f++) {
    const t = (f / (FRAMES - 1)) * (tl.leverEnd + 0.04);
    const img = await loadImage(renderStill(theme, input, t));
    sctx.drawImage(
      img,
      REGION.x * SCALE,
      REGION.y * SCALE,
      REGION.w * SCALE,
      REGION.h * SCALE,
      LABEL_W + f * cellW,
      rowY,
      cellW,
      cellH,
    );
    sctx.strokeStyle = '#1b1f28';
    sctx.lineWidth = 1;
    sctx.strokeRect(LABEL_W + f * cellW + 0.5, rowY + 0.5, cellW - 1, cellH - 1);
  }
}

writeFileSync('out/lever-strips.png', sheet.toBuffer('image/png'));
console.log('out/lever-strips.png', `${sheet.width}x${sheet.height}`);
