/**
 * Filmstrip of just the control region across the actuation window, one row
 * per concept. Stills flatter two-state controls and undersell the ones that
 * actually travel, so this is the honest comparison.
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderStill } from '../src/render/render.js';
import { planSpin } from '../src/render/timeline.js';
import { resolve } from '../src/game/engine.js';
import { createPixelTheme, pixelTheme } from '../src/render/themes/pixel.js';
import { ACTUATORS } from '../src/render/actuators.js';
import { pixelText } from '../src/render/pixelfont.js';

mkdirSync('out/act', { recursive: true });

const outcome = resolve([19, 36, 19], 25, 8420);
const tl = planSpin(outcome);
const input = { outcome, creditsBefore: 1200, jackpot: 8420 };

// Control region in base pixels, matching ACT_REGION in the theme.
const REGION = { x: 100, w: 28, y: 2, h: 100 };
const SCALE = 4;
const ZOOM = 2; // extra magnification for the strip
// The pull occupies only ~8% of the animation, so uniform sampling would miss
// it almost entirely. Sample the pull densely, then the spin and settle.
const PULL_FRAMES = 6;
const SPIN_FRACTIONS = [0.25, 0.45, 0.7, 1.0];
const FRAMES = PULL_FRAMES + SPIN_FRACTIONS.length;
const LABEL_W = 116;

const variants = [{ id: 'lever', name: 'Current lever', theme: pixelTheme }].concat(
  ACTUATORS.map((a) => ({ id: a.id, name: a.name, theme: createPixelTheme(a) })),
);

const cellW = REGION.w * ZOOM;
const cellH = REGION.h * ZOOM;
const rowH = cellH + 10;
const sheet = createCanvas(LABEL_W + cellW * FRAMES, rowH * variants.length);
const sctx = sheet.getContext('2d');
sctx.imageSmoothingEnabled = false;
sctx.fillStyle = '#0a0c10';
sctx.fillRect(0, 0, sheet.width, sheet.height);

for (let v = 0; v < variants.length; v++) {
  const variant = variants[v];
  const rowY = v * rowH;
  pixelText(sctx, variant.name.slice(0, 22).toUpperCase(), 4, rowY + cellH / 2, '#63c96b', 2, 1);

  for (let f = 0; f < FRAMES; f++) {
    const t =
      f < PULL_FRAMES
        ? (f / (PULL_FRAMES - 1)) * (tl.leverEnd + 0.05)
        : tl.leverEnd + (tl.duration - tl.leverEnd) * SPIN_FRACTIONS[f - PULL_FRAMES];
    const png = renderStill(variant.theme, input, t);
    const img = await loadImage(png);
    // renderStill returns the already-4x-scaled canvas; crop the control strip.
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

writeFileSync('out/act-strips.png', sheet.toBuffer('image/png'));
console.log('out/act-strips.png', `${sheet.width}x${sheet.height}`);
