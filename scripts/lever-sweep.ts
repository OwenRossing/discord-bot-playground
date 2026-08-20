/** Render the lever at several points across its pull, to check the arc shape. */
import { writeFileSync } from 'node:fs';
import { renderStill } from '../src/render/render.js';
import { planSpin } from '../src/render/timeline.js';
import { resolve } from '../src/game/engine.js';
import { pixelTheme } from '../src/render/themes/pixel.js';

const outcome = resolve([19, 36, 19], 25, 8420);
const tl = planSpin(outcome);
const points = [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1.0];
const files: string[] = [];
for (const u of points) {
  // scrub the scene's lever value directly by sampling the leverStart..leverEnd window
  const t = tl.leverStart + (tl.leverEnd - tl.leverStart) * u;
  const f = `out/lever-u${Math.round(u * 100)}.png`;
  writeFileSync(f, renderStill(pixelTheme, { outcome, creditsBefore: 1200, jackpot: 8420 }, t));
  files.push(f);
}
console.log(files.join(' '));
