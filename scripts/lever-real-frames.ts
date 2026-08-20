/** Sample the lever at the exact frame times the real GIF schedule uses. */
import { writeFileSync } from 'node:fs';
import { renderStill } from '../src/render/render.js';
import { planSpin, schedule } from '../src/render/timeline.js';
import { resolve } from '../src/game/engine.js';
import { pixelTheme } from '../src/render/themes/pixel.js';

const outcome = resolve([19, 36, 19], 25, 8420);
const tl = planSpin(outcome);
const frames = schedule(tl).map((f) => f.t).filter((t) => t <= tl.leverEnd + 0.05);
console.log('frame times in lever window:', frames.map((t) => t.toFixed(2)).join(', '));

const files: string[] = [];
frames.forEach((t, i) => {
  const f = `out/real-lever-${String(i).padStart(2, '0')}.png`;
  writeFileSync(f, renderStill(pixelTheme, { outcome, creditsBefore: 1200, jackpot: 8420 }, t));
  files.push(f);
});
console.log(files.join(' '));
