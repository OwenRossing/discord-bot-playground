/** How long a spin GIF actually takes to render, which decides the /spin flow. */
import { renderSpinGif, renderStill } from '../src/render/render.js';
import { planSpin } from '../src/render/timeline.js';
import { resolve } from '../src/game/engine.js';
import { pixelTheme } from '../src/render/themes/pixel.js';

const outcome = resolve([19, 36, 19], 25, 8420);
const input = { outcome, creditsBefore: 1200, jackpot: 8420 };
const tl = planSpin(outcome);

for (let i = 0; i < 3; i++) {
  const t0 = Date.now();
  const gif = renderSpinGif(pixelTheme, input);
  const gifMs = Date.now() - t0;
  const t1 = Date.now();
  renderStill(pixelTheme, input, 0);
  const stillMs = Date.now() - t1;
  console.log(
    `run ${i + 1}: gif ${gifMs}ms (${(gif.length / 1024 / 1024).toFixed(2)}MB), still ${stillMs}ms`,
  );
}
console.log(`animation length: ${tl.duration.toFixed(2)}s`);
