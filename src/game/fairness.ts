import { createHash, createHmac, randomBytes } from 'node:crypto';
import { REEL_LENGTH } from './symbols.js';

/**
 * Provably fair spins by commit-reveal.
 *
 * The bot draws a server seed and publishes only its SHA-256 up front. Every
 * spin is then a pure function of (server seed, client seed, nonce), so once
 * the server seed is revealed a player can recompute any spin the bot claimed
 * to have made. The bot cannot change the server seed after the fact without
 * breaking the published hash, and cannot pick a favourable one for a
 * particular spin because the client seed is the player's to set.
 *
 * The reveal is what makes this worth anything, so a seed is only ever
 * revealed once it has been retired -- see `rotateSeeds` in the store.
 */

export interface SeedPair {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export function hashSeed(serverSeed: string): string {
  return createHash('sha256').update(serverSeed).digest('hex');
}

export function newServerSeed(): string {
  return randomBytes(32).toString('hex');
}

export function newClientSeed(): string {
  return randomBytes(8).toString('hex');
}

export function newSeedPair(clientSeed = newClientSeed()): SeedPair {
  const serverSeed = newServerSeed();
  return { serverSeed, serverSeedHash: hashSeed(serverSeed), clientSeed, nonce: 0 };
}

/**
 * Endless stream of 32-bit words from HMAC-SHA256, re-keyed per round so a
 * spin that rejects several words never runs out of entropy.
 */
function* words(serverSeed: string, clientSeed: string, nonce: number): Generator<number> {
  for (let round = 0; ; round++) {
    const mac = createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}:${round}`).digest();
    for (let i = 0; i + 4 <= mac.length; i += 4) yield mac.readUInt32BE(i);
  }
}

/**
 * Three independent reel stops. Words at or above the largest exact multiple
 * of the strip length are rejected rather than folded, since taking the
 * remainder of the full 32-bit range would make the first
 * `2^32 % REEL_LENGTH` stops very slightly likelier than the rest -- small,
 * but it would make the RTP audit a lie.
 */
export function deriveStops(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  reelLength: number = REEL_LENGTH,
): [number, number, number] {
  const limit = Math.floor(0x100000000 / reelLength) * reelLength;
  const stream = words(serverSeed, clientSeed, nonce);
  const stops: number[] = [];
  while (stops.length < 3) {
    const w = stream.next().value as number;
    if (w >= limit) continue;
    stops.push(w % reelLength);
  }
  return stops as [number, number, number];
}

export interface VerifyResult {
  ok: boolean;
  /** Whether the supplied server seed actually hashes to the committed value. */
  hashMatches: boolean;
  expectedHash: string;
  stops: [number, number, number] | null;
}

/**
 * Recompute a spin from a revealed seed. Checks the hash commitment first --
 * stops derived from a seed that was never committed to prove nothing.
 */
export function verifySpin(
  serverSeed: string,
  committedHash: string,
  clientSeed: string,
  nonce: number,
): VerifyResult {
  const expectedHash = hashSeed(serverSeed);
  const hashMatches = expectedHash === committedHash;
  return {
    ok: hashMatches,
    hashMatches,
    expectedHash,
    stops: hashMatches ? deriveStops(serverSeed, clientSeed, nonce) : null,
  };
}
