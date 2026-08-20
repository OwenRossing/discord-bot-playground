/**
 * Render every actuator concept on the real cabinet, idle and actuated, so
 * they can be judged in context rather than in isolation.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderStill } from '../src/render/render.js';
import { planSpin } from '../src/render/timeline.js';
import { resolve } from '../src/game/engine.js';
import { createPixelTheme, pixelTheme } from '../src/render/themes/pixel.js';
import { ACTUATORS } from '../src/render/actuators.js';

mkdirSync('out/act', { recursive: true });

const outcome = resolve([19, 36, 19], 25, 8420);
const tl = planSpin(outcome);
const input = { outcome, creditsBefore: 1200, jackpot: 8420 };

// t=0 is fully at rest; the lever window's midpoint is peak actuation.
const REST_T = 0;
const ACTIVE_T = tl.leverStart + (tl.leverEnd - tl.leverStart) * 0.45;

const variants = [{ id: 'lever', theme: pixelTheme, name: 'Current pull lever' }].concat(
  ACTUATORS.map((a) => ({ id: a.id, theme: createPixelTheme(a), name: a.name })),
);

const files: string[] = [];
for (const v of variants) {
  for (const [tag, t] of [['idle', REST_T], ['active', ACTIVE_T]] as const) {
    const f = `out/act/${v.id}-${tag}.png`;
    writeFileSync(f, renderStill(v.theme, input, t));
    files.push(f);
  }
}
console.log(files.join(' '));
