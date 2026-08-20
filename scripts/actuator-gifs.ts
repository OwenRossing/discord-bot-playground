/** Animated GIFs of selected actuator concepts: tsx scripts/actuator-gifs.ts crank buttons coin */
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderSpinGif } from '../src/render/render.js';
import { resolve } from '../src/game/engine.js';
import { createPixelTheme, pixelTheme } from '../src/render/themes/pixel.js';
import { ACTUATOR_BY_ID } from '../src/render/actuators.js';

mkdirSync('out/act', { recursive: true });

const ids = process.argv.slice(2);
const outcome = resolve([19, 36, 19], 25, 8420);
const input = { outcome, creditsBefore: 1200, jackpot: 8420 };

for (const id of ids) {
  const theme = id === 'lever' ? pixelTheme : createPixelTheme(ACTUATOR_BY_ID[id]);
  if (!theme) throw new Error(`unknown actuator ${id}`);
  const gif = renderSpinGif(theme, input);
  const f = `out/act/spin-${id}.gif`;
  writeFileSync(f, gif);
  console.log(f, `${(gif.length / 1024).toFixed(0)}KB`);
}
