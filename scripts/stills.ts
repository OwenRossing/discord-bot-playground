/** Render a row of key frames for one theme: tsx scripts/stills.ts <themeId> */
import { writeFileSync } from 'node:fs';
import { renderStill } from '../src/render/render.js';
import { planSpin } from '../src/render/timeline.js';
import { resolve } from '../src/game/engine.js';
import { THEMES } from '../src/render/themes/index.js';
import { REEL_STRIP } from '../src/game/symbols.js';

const id = process.argv[2] ?? 'classic';
const theme = THEMES[id];
if (!theme) throw new Error(`unknown theme ${id}`);

const find = (name: string, from = 0) => REEL_STRIP.indexOf(name as never, from);
const cases: Record<string, [number, number, number]> = {
  jackpot: [19, 36, 19],
  bigwin: [find('bar'), find('bar', find('bar') + 1), find('bar', find('bar', find('bar') + 1) + 1)],
  lose: [find('cherry'), find('bell'), find('diamond')],
};

const shots: [string, keyof typeof cases, number][] = [
  ['idle', 'jackpot', 0.05],
  ['lever', 'jackpot', 0.28],
  ['blur', 'lose', 1.3],
  ['tension', 'bigwin', 3.6],
  ['lose', 'lose', 4.6],
  ['jackpot', 'jackpot', 4.7],
];

const files: string[] = [];
for (const [label, key, t] of shots) {
  const outcome = resolve(cases[key], 25, 8420);
  const tl = planSpin(outcome);
  const at = label === 'lose' || label === 'jackpot' ? tl.lastStop + 0.55 : t;
  const f = `out/${id}-${label}.png`;
  writeFileSync(f, renderStill(theme, { outcome, creditsBefore: 1200, jackpot: 8420 }, at));
  files.push(f);
}
console.log(files.join(' '));
