/** Animated GIFs of lever geometry candidates: tsx scripts/lever-gifs.ts */
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderSpinGif } from '../src/render/render.js';
import { resolve } from '../src/game/engine.js';
import { createPixelTheme, DEFAULT_LEVER, type LeverGeom } from '../src/render/themes/pixel.js';

mkdirSync('out/lev', { recursive: true });

const deg = (d: number) => (d * Math.PI) / 180;

const candidates: Record<string, LeverGeom> = {
  l: DEFAULT_LEVER,
  m: { len: 24, pulledAngle: deg(125), bulge: 3.5 },
  n: { len: 24, pulledAngle: deg(140), bulge: 2.4 },
};

const outcome = resolve([19, 36, 19], 25, 8420);
const input = { outcome, creditsBefore: 1200, jackpot: 8420 };

for (const [id, geom] of Object.entries(candidates)) {
  const gif = renderSpinGif(createPixelTheme(undefined, geom), input);
  const f = `out/lev/spin-${id}.gif`;
  writeFileSync(f, gif);
  console.log(f, `${(gif.length / 1024).toFixed(0)}KB`);
}
