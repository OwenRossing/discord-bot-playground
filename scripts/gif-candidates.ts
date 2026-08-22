/** Renders the shortlist so the quality cost of each saving can be judged in Discord. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderSpinGif } from '../src/render/render.js';
import { resolve } from '../src/game/engine.js';
import { pixelTheme } from '../src/render/themes/pixel.js';
import { planSpin, schedule } from '../src/render/timeline.js';

mkdirSync('out/gif', { recursive: true });

// A near-miss line: two 7s then a stall, so the anticipation beat is included
// -- that is where a low frame rate would show up worst.
const outcome = resolve([19, 36, 5], 25, 8420);
const input = { outcome, creditsBefore: 1200, jackpot: 8420 };
const tl = planSpin(outcome);

const candidates: [string, number, number, number][] = [
  ['a-current-4x-full', 4, 96, 1],
  ['b-3x-full', 3, 64, 1],
  ['c-3x-fewer', 3, 64, 1.5],
  ['d-2x-fewer', 2, 64, 1.5],
];

for (const [name, scale, maxColors, stretch] of candidates) {
  const gif = renderSpinGif({ ...pixelTheme, scale, maxColors }, input, { frameStretch: stretch });
  writeFileSync(`out/gif/${name}.gif`, gif);
  console.log(
    `${name.padEnd(20)} ${128 * scale}x${104 * scale}  ${schedule(tl, stretch).length} frames  ${(gif.length / 1024).toFixed(0)}KB`,
  );
}
