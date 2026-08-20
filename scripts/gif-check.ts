import { renderSpinGif } from '../src/render/render.js';
import { pixelTheme } from '../src/render/themes/pixel.js';
import { resolve } from '../src/game/engine.js';
import { writeFileSync } from 'node:fs';

const outcome = resolve([19, 36, 19], 25, 8420);
const gif = renderSpinGif(pixelTheme, { outcome, creditsBefore: 1200, jackpot: 8420 });
writeFileSync('out/pixel-spin.gif', gif);
console.log('bytes', gif.length);
