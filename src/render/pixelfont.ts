import type { SKRSContext2D } from '@napi-rs/canvas';

/**
 * A 3x5 bitmap font. Real pixel art needs a real pixel font -- hinting a
 * vector face down to five pixels tall just produces mush.
 */
const GLYPHS: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111101101101', N: '101111111111101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101011', V: '101101101101010', W: '101101101111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111',
  '+': '000010111010000', '-': '000000111000000', '.': '000000000000010', ',': '000000000010100',
  ':': '000010000010000', '!': '010010010000010', '/': '001001010100100', '?': '110001010000010',
  ' ': '000000000000000',
};

export const GLYPH_W = 3;
export const GLYPH_H = 5;

export function textWidth(text: string, scale = 1, tracking = 1): number {
  if (!text.length) return 0;
  return (text.length * (GLYPH_W + tracking) - tracking) * scale;
}

/** Draw `text` with its left edge at x and top edge at y, in whole pixels. */
export function pixelText(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  scale = 1,
  tracking = 1,
) {
  ctx.fillStyle = color;
  let cx = Math.round(x);
  for (const ch of text.toUpperCase()) {
    const bits = GLYPHS[ch] ?? GLYPHS['?'];
    for (let row = 0; row < GLYPH_H; row++) {
      for (let col = 0; col < GLYPH_W; col++) {
        if (bits[row * GLYPH_W + col] === '1') {
          ctx.fillRect(cx + col * scale, Math.round(y) + row * scale, scale, scale);
        }
      }
    }
    cx += (GLYPH_W + tracking) * scale;
  }
}

export function pixelTextCentered(
  ctx: SKRSContext2D,
  text: string,
  cx: number,
  y: number,
  color: string,
  scale = 1,
  tracking = 1,
) {
  pixelText(ctx, text, Math.round(cx - textWidth(text, scale, tracking) / 2), y, color, scale, tracking);
}
