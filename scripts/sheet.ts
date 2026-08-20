/** Compose PNGs into a labelled contact sheet: tsx scripts/sheet.ts out.png cols a.png b.png ... */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const [dest, colsArg, ...files] = process.argv.slice(2);
const cols = Number(colsArg);
const imgs = await Promise.all(files.map((f) => loadImage(f)));
const cw = Math.max(...imgs.map((i) => i.width));
const ch = Math.max(...imgs.map((i) => i.height));
const rows = Math.ceil(imgs.length / cols);
const c = createCanvas(cw * cols, ch * rows);
const x = c.getContext('2d');
x.fillStyle = '#000';
x.fillRect(0, 0, c.width, c.height);
imgs.forEach((im, i) => {
  const px = (i % cols) * cw;
  const py = Math.floor(i / cols) * ch;
  x.drawImage(im, px, py);
  x.fillStyle = 'rgba(0,0,0,0.65)';
  x.fillRect(px, py, 150, 20);
  x.fillStyle = '#7CFC98';
  x.font = 'bold 13px "DejaVu Sans"';
  x.textBaseline = 'top';
  x.fillText(basename(files[i], '.png'), px + 6, py + 4);
});
writeFileSync(dest, c.toBuffer('image/png'));
console.log(dest, c.width + 'x' + c.height);
