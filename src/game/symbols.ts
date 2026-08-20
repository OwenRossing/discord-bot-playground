/** The seven reel symbols, ordered from most common to rarest. */
export const SYMBOLS = ['cherry', 'lemon', 'grape', 'bell', 'bar', 'diamond', 'seven'] as const;
export type SymbolId = (typeof SYMBOLS)[number];

export const SYMBOL_LABEL: Record<SymbolId, string> = {
  cherry: 'Cherry',
  lemon: 'Lemon',
  grape: 'Grapes',
  bell: 'Bell',
  bar: 'BAR',
  diamond: 'Diamond',
  seven: 'Lucky 7',
};

/**
 * How many stops each symbol occupies on a physical reel. A spin picks a
 * uniformly random stop, so these counts *are* the odds — nothing else
 * weights the draw.
 */
export const STOP_COUNTS: Record<SymbolId, number> = {
  cherry: 9,
  lemon: 8,
  grape: 7,
  bell: 5,
  bar: 4,
  diamond: 3,
  seven: 2,
};

export const REEL_LENGTH = Object.values(STOP_COUNTS).reduce((a, b) => a + b, 0); // 38

/**
 * The physical strip: a fixed running order of symbols around the reel.
 * Built once, deterministically, and spaced so identical symbols never sit
 * next to each other -- that is what makes the near-miss peeks read well.
 */
export const REEL_STRIP: SymbolId[] = buildStrip();

function buildStrip(): SymbolId[] {
  // Lay the rarest symbols down first at wide, even spacing, then fill the
  // gaps with the common ones. Deterministic: same strip on every process.
  const slots: (SymbolId | null)[] = new Array(REEL_LENGTH).fill(null);
  const order = [...SYMBOLS].reverse(); // seven first, cherry last
  let cursor = 0;
  for (const sym of order) {
    const count = STOP_COUNTS[sym];
    const stride = REEL_LENGTH / count;
    for (let i = 0; i < count; i++) {
      let idx = Math.round(cursor + i * stride) % REEL_LENGTH;
      // walk forward to the next free slot
      let guard = 0;
      while (slots[idx] !== null && guard++ < REEL_LENGTH) idx = (idx + 1) % REEL_LENGTH;
      slots[idx] = sym;
    }
    cursor += 1; // offset each symbol's phase so they interleave
  }
  const strip = slots.map((s, i) => s ?? SYMBOLS[i % SYMBOLS.length]);
  return separateNeighbours(strip);
}

/**
 * Swap apart any two identical neighbours. Swapping only permutes the strip,
 * so every symbol's stop count -- and therefore every payout probability --
 * is untouched.
 */
function separateNeighbours(strip: SymbolId[]): SymbolId[] {
  const n = strip.length;
  const at = (i: number) => strip[(i + n) % n];
  for (let pass = 0; pass < 4; pass++) {
    let clean = true;
    for (let i = 0; i < n; i++) {
      if (at(i) !== at(i + 1)) continue;
      clean = false;
      for (let d = 2; d < n; d++) {
        const j = (i + d) % n;
        // strip[j] may move to i+1, and strip[i+1] may move to j
        const a = at(i + 1);
        const b = strip[j];
        if (a === b) continue;
        if (b === at(i) || b === at(i + 2)) continue;
        if (a === at(j - 1) || a === at(j + 1)) continue;
        strip[(i + 1) % n] = b;
        strip[j] = a;
        break;
      }
    }
    if (clean) break;
  }
  return strip;
}
