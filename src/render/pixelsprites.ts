import { createCanvas, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import type { SymbolId } from '../game/symbols.js';

/**
 * One shared retro palette for every sprite and every piece of cabinet trim.
 * Drawing the whole theme from a single ramp set is what makes pixel art read
 * as one cohesive machine rather than seven unrelated stickers.
 */
export const PAL: Record<string, string> = {
  k: '#0a0c10', d: '#1b1f28', g: '#333b4a', G: '#4a5361', w: '#8b95a5', W: '#d8dee8', F: '#ffffff',
  r: '#6b0f1a', R: '#b3222e', e: '#e8434d', p: '#ff8a80',
  o: '#7a4a00', y: '#c98b12', Y: '#ffc93c', l: '#ffe9a8',
  n: '#1d5c28', N: '#2f8f3f', m: '#63c96b',
  u: '#3d1f66', U: '#7040ad', v: '#a97ae0',
  c: '#0d4f6e', C: '#1e9ec4', s: '#58d7ef', S: '#bdf3ff',
  b: '#4a3210',
};

/** 16x16 sprites, one character per pixel. '.' is transparent. */
const SPRITES: Record<SymbolId, string[]> = {
  cherry: [
    '................',
    '.........nnn....',
    '........nNmmm...',
    '........nNmm....',
    '........b.......',
    '.......b.b......',
    '......b..b......',
    '.....b....b.....',
    '....b.....b.....',
    '..kkk...kkk.....',
    '.kppRk...kppRk..',
    'kpeeeRk.kpeeeRk.',
    'keeeeRk.keeeeRk.',
    'keeRRRk.keeRRRk.',
    '.kRRRk...kRRRk..',
    '..kkk.....kkk...',
  ],
  lemon: [
    '................',
    '................',
    '................',
    '................',
    '.....kkkkkk.....',
    '...kkllllllkk...',
    '..klllYYYYYYyk..',
    'ykllYYYYYYYYYyky',
    'yklYYYYYYYYYYyky',
    '..kyYYYYYYYYyk..',
    '...kkyyyyyykk...',
    '.....kkkkkk.....',
    '................',
    '................',
    '................',
    '................',
  ],
  grape: [
    '................',
    '.......nnn......',
    '......nNmmm.....',
    '......nNmm......',
    '.......b........',
    '.......b........',
    '..uUUuuUUuuUUu..',
    '..UvvUUvvUUvvU..',
    '..uUUuuUUuuUUu..',
    '....uUUuuUUu....',
    '....UvvUUvvU....',
    '....uUUuuUUu....',
    '......uUUu......',
    '......UvvU......',
    '......uUUu......',
    '................',
  ],
  bell: [
    '................',
    '.......kk.......',
    '......kllk......',
    '.....klllYk.....',
    '....klYYYYYk....',
    '....klYYYYYk....',
    '...klYYYYYYYk...',
    '...klYYYYYYYk...',
    '..klYYYYYYYYYk..',
    '..klYYYYYYYYYk..',
    '.klYYYYYYYYYYYk.',
    '.klYYYYYYYYYYYk.',
    '.kyyyyyyyyyyyyk.',
    'kyyyyyyyyyyyyyyk',
    '.kkkkkkkkkkkkkk.',
    '.......oo.......',
  ],
  bar: [
    '................',
    '................',
    '................',
    '................',
    '.kkkkkkkkkkkkkk.',
    'kFFFFFFFFFFFFFFk',
    'kWkkWWWkWWkkWWWk',
    'kWkWkWkWkWkWkWWk',
    'kWkkWWkkkWkkWWWk',
    'kWkWkWkWkWkWkWWk',
    'kWkkWWkWkWkWkWWk',
    'kGGGGGGGGGGGGGGk',
    '.kkkkkkkkkkkkkk.',
    '................',
    '................',
    '................',
  ],
  diamond: [
    '................',
    '................',
    '...cccccccccc...',
    '..cSSSSSSSSSSc..',
    '.cSSSSSSSSSSSSc.',
    'cSssssssssssssSc',
    '.cCssssssssssCc.',
    '..cCssssssssCc..',
    '...cCssssssCc...',
    '....cCssssCc....',
    '.....cCssCc.....',
    '......cCsc......',
    '.......cc.......',
    '................',
    '................',
    '................',
  ],
  seven: [
    '................',
    '..YYYYYYYYYYYY..',
    '..YeeeeeeeeeeY..',
    '..YeeeeeeeeeeY..',
    '..YYYYYYYeeeeY..',
    '........YeeeeY..',
    '.......YeeeeY...',
    '.......YeeeY....',
    '......YeeeeY....',
    '......YeeeY.....',
    '.....YeeeeY.....',
    '.....YeeeY......',
    '....YeeeeY......',
    '....YeeeY.......',
    '....YYYY........',
    '................',
  ],
};

export const SPRITE_SIZE = 16;

const cache = new Map<SymbolId, Canvas>();

export function pixelSprite(sym: SymbolId): Canvas {
  const hit = cache.get(sym);
  if (hit) return hit;
  const rows = SPRITES[sym];
  const c = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
  const ctx = c.getContext('2d');
  for (let y = 0; y < SPRITE_SIZE; y++) {
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === undefined) continue;
      const col = PAL[ch];
      if (!col) throw new Error(`sprite ${sym} uses unknown palette char '${ch}'`);
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  cache.set(sym, c);
  return c;
}

/** Blit centred on (cx, cy), snapped to whole pixels so nothing softens. */
export function drawPixelSymbol(ctx: SKRSContext2D, sym: SymbolId, cx: number, cy: number) {
  ctx.drawImage(pixelSprite(sym), Math.round(cx - SPRITE_SIZE / 2), Math.round(cy - SPRITE_SIZE / 2));
}

/** Fails loudly at startup if a sprite is not a clean 16x16 grid. */
export function validateSprites(): void {
  for (const [sym, rows] of Object.entries(SPRITES)) {
    if (rows.length !== SPRITE_SIZE) throw new Error(`sprite ${sym} has ${rows.length} rows`);
    rows.forEach((r, i) => {
      if (r.length !== SPRITE_SIZE) throw new Error(`sprite ${sym} row ${i} is ${r.length} wide`);
    });
  }
}
