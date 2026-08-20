/** Nearest-neighbour upscale, matching how the pixel theme is blown up: tsx scripts/upscale.ts in.png out.png [factor] */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';

const [src, dest, factorArg] = process.argv.slice(2);
const factor = Number(factorArg ?? 4);
const img = await loadImage(src);
const c = createCanvas(img.width * factor, img.height * factor);
const ctx = c.getContext('2d');
ctx.imageSmoothingEnabled = false;
ctx.drawImage(img, 0, 0, c.width, c.height);
writeFileSync(dest, c.toBuffer('image/png'));
console.log(dest, `${c.width}x${c.height}`);
