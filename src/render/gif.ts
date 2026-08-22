// gifenc publishes CommonJS with no exports map, so Node cannot resolve named
// ESM imports from it -- take the default export and destructure instead.
import gifenc from 'gifenc';

const { GIFEncoder, quantize, applyPalette } = gifenc;

export interface Frame {
  rgba: Uint8ClampedArray;
  delay: number;
}

/**
 * Encode frames with one global palette. Sharing a palette across frames keeps
 * the file small and stops colours shimmering between frames, which a
 * per-frame palette would cause on the spinning reels.
 */
export function encodeGif(
  frames: Frame[],
  width: number,
  height: number,
  maxColors = 200,
  // Play once and hold the last frame. A looping spin would leave every past
  // result in the channel cycling forever, and the final frame is the one
  // carrying the information anyway.
  repeat = -1,
): Buffer {
  const palette = buildPalette(frames, maxColors);
  const gif = GIFEncoder();
  for (let i = 0; i < frames.length; i++) {
    const indexed = applyPalette(frames[i].rgba as unknown as Uint8Array, palette, 'rgb565');
    gif.writeFrame(indexed, width, height, {
      // Only the first frame carries the palette, so it becomes the global one.
      palette: i === 0 ? palette : undefined,
      delay: frames[i].delay,
      repeat,
    });
  }
  gif.finish();
  return Buffer.from(gif.bytes());
}

/**
 * Sample across the whole animation so the palette covers the spin blur and
 * the win flash, not just whatever happens to be in frame one.
 */
function buildPalette(frames: Frame[], maxColors: number): number[][] {
  const wanted = Math.min(14, frames.length);
  const stride = Math.max(1, Math.floor(frames.length / wanted));
  const picked: Uint8ClampedArray[] = [];
  for (let i = 0; i < frames.length; i += stride) picked.push(frames[i].rgba);
  const last = frames[frames.length - 1].rgba;
  if (picked[picked.length - 1] !== last) picked.push(last);

  const total = picked.reduce((n, f) => n + f.length, 0);
  const merged = new Uint8Array(total);
  let at = 0;
  for (const f of picked) {
    merged.set(f as unknown as Uint8Array, at);
    at += f.length;
  }
  return quantize(merged, maxColors, { format: 'rgb565', oneBitAlpha: false });
}
