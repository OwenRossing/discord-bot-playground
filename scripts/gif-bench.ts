/**
 * Where the Spin Again delay actually goes.
 *
 * The wait is render time plus upload time, and upload is driven by file size,
 * so this varies the three knobs that move size -- upscale factor, palette
 * size, and frame rate -- and reports both costs for each.
 */
import { renderSpinGif } from '../src/render/render.js';
import { resolve } from '../src/game/engine.js';
import { pixelTheme } from '../src/render/themes/pixel.js';
import { planSpin, schedule } from '../src/render/timeline.js';
import type { Theme } from '../src/render/types.js';

// A jackpot line, so the win flash and its extra colours are included.
const outcome = resolve([19, 36, 19], 25, 8420);
const input = { outcome, creditsBefore: 1200, jackpot: 8420 };
const tl = planSpin(outcome);
const frames = schedule(tl).length;

console.log(`baseline: ${frames} frames, ${tl.duration.toFixed(2)}s, ${pixelTheme.baseW}x${pixelTheme.baseH} at ${pixelTheme.scale}x\n`);

function bench(label: string, theme: Theme, opts: { frameStretch?: number } = {}) {
  // Two runs, take the faster, so a stray GC does not decide the winner.
  let best = Infinity;
  let size = 0;
  for (let i = 0; i < 2; i++) {
    const t0 = Date.now();
    const gif = renderSpinGif(theme, input, opts);
    best = Math.min(best, Date.now() - t0);
    size = gif.length;
  }
  const kb = size / 1024;
  // 8 Mbit/s up is a fair home-connection figure; the point is the ratio.
  const uploadMs = Math.round((size * 8) / (8 * 1024 * 1024 / 1000));
  console.log(
    `${label.padEnd(26)} ${String(Math.round(kb)).padStart(5)}KB  render ${String(best).padStart(4)}ms  ~upload ${String(uploadMs).padStart(4)}ms  total ~${best + uploadMs}ms`,
  );
  return { kb, ms: best };
}

const variant = (scale: number, maxColors: number): Theme => ({ ...pixelTheme, scale, maxColors });

console.log('--- upscale factor (palette 96) ---');
for (const s of [4, 3, 2]) bench(`${s}x  ${128 * s}x${104 * s}`, variant(s, 96));

console.log('\n--- palette size (4x) ---');
for (const c of [96, 64, 48, 32, 24]) bench(`4x, ${c} colours`, variant(4, c));

console.log('\n--- frame rate (4x, 96 colours) ---');
for (const s of [1, 1.25, 1.5, 2]) {
  const n = schedule(tl, s).length;
  bench(`stretch ${s} (${n} frames)`, pixelTheme, { frameStretch: s });
}

console.log('\n--- combined candidates ---');
bench('3x, 64c, stretch 1.25', variant(3, 64), { frameStretch: 1.25 });
bench('3x, 64c, stretch 1.5', variant(3, 64), { frameStretch: 1.5 });
bench('2x, 64c, stretch 1.5', variant(2, 64), { frameStretch: 1.5 });
