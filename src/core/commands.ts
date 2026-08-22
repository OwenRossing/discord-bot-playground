import { auditRtp, PAYTABLE, REEL_STRIP, resolve, type Line } from '../game/engine.js';
import { deriveStops, hashSeed, verifySpin } from '../game/fairness.js';
import { DAILY_AMOUNT, STARTING_BALANCE, type Store } from '../game/store.js';
import { renderSpinGif } from '../render/render.js';
import type { Theme } from '../render/types.js';
import { problem, type Caller, type CommandResult } from './results.js';

export const MIN_BET = 1;
export const MAX_BET = 500;
export const DEFAULT_BET = 25;

const credits = (n: number) => n.toLocaleString('en-US');
const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

export interface Ctx {
  store: Store;
  theme: Theme;
  /** Discord id with unrestricted rights, or null if none is configured. */
  superAdminId: string | null;
}

export const isAdmin = (ctx: Ctx, id: string) => ctx.superAdminId !== null && ctx.superAdminId === id;

/**
 * Per-player lock. Two Spin Again clicks landing together would otherwise both
 * read the same balance and both stake against it.
 */
const inFlight = new Set<string>();

export async function spin(ctx: Ctx, caller: Caller, requestedBet: number): Promise<CommandResult> {
  const { store, theme } = ctx;
  if (inFlight.has(caller.id)) return problem('Still spinning', 'Your last spin has not resolved yet.');

  const bet = Math.trunc(requestedBet);
  if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
    return problem('Bad bet', `Bet must be between ${MIN_BET} and ${MAX_BET}.`);
  }

  inFlight.add(caller.id);
  try {
    const user = store.user(caller.id);
    const creditsBefore = user.balance;
    const placed = store.placeBet(caller.id, bet);
    if (!placed.ok) return problem('Cannot spin', placed.reason);

    // Read after the rake, so the machine shows the pool this spin plays for.
    const jackpot = store.jackpot;
    const stops = deriveStops(user.seeds.serverSeed, user.seeds.clientSeed, placed.nonce);
    const outcome = resolve(stops, bet, jackpot);
    const settled = store.settle(caller.id, outcome);

    const name = `spin-${placed.nonce}.gif`;
    const gif = renderSpinGif(theme, { outcome, creditsBefore, jackpot });

    return {
      title: outcome.jackpotWon ? '🎰 JACKPOT!' : outcome.payout > 0 ? `✨ ${outcome.rule?.label ?? 'Winner'}` : 'No win',
      accent: outcome.jackpotWon ? 'jackpot' : outcome.payout > 0 ? 'win' : 'lose',
      fields: [
        { name: 'Bet', value: credits(outcome.bet), inline: true },
        {
          name: outcome.payout > 0 ? 'Won' : 'Lost',
          value: credits(outcome.payout > 0 ? outcome.payout : outcome.bet),
          inline: true,
        },
        { name: 'Balance', value: credits(settled.balance), inline: true },
      ],
      image: { name, data: gif, contentType: 'image/gif' },
      footer: `Jackpot ${credits(store.jackpot)} · spin #${placed.nonce} · ${user.seeds.serverSeedHash.slice(0, 16)}…`,
      buttons: [
        { id: `spin-again:${bet}`, label: `Spin again (${credits(bet)})`, style: 'primary', emoji: '🎰' },
        { id: 'show-fairness', label: 'Fairness', style: 'secondary' },
      ],
    };
  } finally {
    inFlight.delete(caller.id);
  }
}

export function balance(ctx: Ctx, caller: Caller): CommandResult {
  const u = ctx.store.user(caller.id);
  return {
    title: `${credits(u.balance)} credits`,
    accent: 'idle',
    fields: [
      { name: 'Jackpot pool', value: credits(ctx.store.jackpot), inline: true },
      { name: 'Spins', value: credits(u.stats.spins), inline: true },
    ],
  };
}

export function daily(ctx: Ctx, caller: Caller): CommandResult {
  const r = ctx.store.claimDaily(caller.id);
  if (!r.ok) {
    return problem('Already claimed', `Your next top-up is available <t:${Math.floor(r.nextAt / 1000)}:R>.`);
  }
  return {
    title: `+${credits(r.amount)} credits`,
    accent: 'win',
    fields: [{ name: 'Balance', value: credits(r.balance), inline: true }],
  };
}

export function leaderboard(ctx: Ctx): CommandResult {
  const top = ctx.store.leaderboard(10);
  if (top.length === 0) return { title: 'Leaderboard', description: 'Nobody has played yet.', accent: 'idle' };
  const medal = ['🥇', '🥈', '🥉'];
  return {
    title: 'Richest players',
    accent: 'idle',
    // A balance that is mostly minted credits is flagged, so the ranking stays
    // readable as a record of play rather than of admin generosity.
    description: top
      .map((u, n) => {
        const minted = u.stats.granted > 0 ? ` *(${credits(u.stats.granted)} granted)*` : '';
        return `${medal[n] ?? `\`${n + 1}.\``} <@${u.id}> — **${credits(u.balance)}**${minted}`;
      })
      .join('\n'),
    silenceMentions: true,
  };
}

export function stats(ctx: Ctx, target: Caller): CommandResult {
  const u = ctx.store.user(target.id);
  const { spins, wagered, won, biggestWin, jackpots, granted } = u.stats;
  const fields = [
    { name: 'Spins', value: credits(spins), inline: true },
    { name: 'Wagered', value: credits(wagered), inline: true },
    { name: 'Won', value: credits(won), inline: true },
    { name: 'Net', value: credits(won - wagered), inline: true },
    { name: 'Biggest win', value: credits(biggestWin), inline: true },
    { name: 'Jackpots', value: credits(jackpots), inline: true },
    { name: 'Your return', value: wagered > 0 ? pct(won / wagered) : '—', inline: true },
    { name: 'Balance', value: credits(u.balance), inline: true },
  ];
  if (granted > 0) fields.push({ name: 'Granted by admin', value: credits(granted), inline: true });
  return { title: `${target.name}'s stats`, accent: 'idle', fields };
}

export function odds(ctx: Ctx): CommandResult {
  const r = auditRtp();
  return {
    title: 'Odds',
    accent: 'idle',
    description: `Computed by enumerating all ${credits(r.combos)} stop combinations — no sampling.`,
    fields: [
      { name: 'Return to player', value: pct(r.totalRtp), inline: true },
      { name: 'Hit rate', value: pct(r.hitRate), inline: true },
      { name: 'Jackpot', value: `1 in ${credits(Math.round(1 / r.jackpotOdds))}`, inline: true },
      {
        name: 'Paytable',
        value: r.perRule
          .filter((x) => x.probability > 0)
          .map((x) => `\`${pct(x.probability).padStart(7)}\`  ${x.label}`)
          .join('\n'),
      },
    ],
  };
}

export function seeds(ctx: Ctx, caller: Caller, newClientSeed?: string | null): CommandResult {
  if (!newClientSeed) {
    const u = ctx.store.user(caller.id);
    return {
      title: 'Your seeds',
      accent: 'idle',
      ephemeral: true,
      description:
        'Your next spin is already determined by these three values. Rotating reveals the current server seed so every spin played under it becomes checkable.',
      fields: [
        { name: 'Server seed hash (committed)', value: `\`${u.seeds.serverSeedHash}\`` },
        { name: 'Client seed', value: `\`${u.seeds.clientSeed}\``, inline: true },
        { name: 'Next nonce', value: String(u.seeds.nonce), inline: true },
      ],
    };
  }

  if (newClientSeed.length > 64) return problem('Seed too long', 'Client seed must be 64 characters or fewer.');

  const { revealed, next } = ctx.store.rotateSeeds(caller.id, newClientSeed);
  return {
    title: 'Seeds rotated',
    accent: 'idle',
    ephemeral: true,
    description: `Your previous server seed is revealed below. Check any of those ${revealed.spins} spins with \`/verify\` — nonces run 0 to ${Math.max(0, revealed.spins - 1)}.`,
    fields: [
      { name: 'Revealed server seed', value: `\`${revealed.serverSeed}\`` },
      { name: 'Its committed hash', value: `\`${revealed.serverSeedHash}\`` },
      { name: 'Old client seed', value: `\`${revealed.clientSeed}\`` },
      { name: 'New server seed hash', value: `\`${next.serverSeedHash}\`` },
      { name: 'New client seed', value: `\`${next.clientSeed}\``, inline: true },
    ],
  };
}

export function verify(
  serverSeed: string,
  committedHash: string,
  clientSeed: string,
  nonce: number,
): CommandResult {
  const result = verifySpin(serverSeed.trim(), committedHash.trim().toLowerCase(), clientSeed, nonce);

  if (!result.hashMatches) {
    return {
      title: '❌ Does not match',
      accent: 'lose',
      ephemeral: true,
      description: 'That server seed does not hash to the committed value, so it is not the seed those spins were played under.',
      fields: [
        { name: 'Committed', value: `\`${committedHash.trim().toLowerCase()}\`` },
        { name: 'This seed hashes to', value: `\`${hashSeed(serverSeed.trim())}\`` },
      ],
    };
  }

  const stops = result.stops!;
  const line = stops.map((s) => REEL_STRIP[s]) as Line;
  const rule = PAYTABLE.find((r) => r.matches(line)) ?? null;

  return {
    title: '✅ Verified',
    accent: 'win',
    ephemeral: true,
    description: 'The seed matches its commitment, so this is genuinely the spin the machine was bound to produce.',
    fields: [
      { name: 'Stops', value: `\`${stops.join(', ')}\``, inline: true },
      { name: 'Symbols', value: line.join(' · '), inline: true },
      { name: 'Result', value: rule ? rule.label : 'No win' },
    ],
  };
}

export function fairnessInfo(ctx: Ctx, caller: Caller): CommandResult {
  const u = ctx.store.user(caller.id);
  return {
    title: 'How this is provably fair',
    accent: 'idle',
    ephemeral: true,
    description:
      'Every spin is `HMAC-SHA256(server seed, client seed:nonce)`. The server seed was fixed and its hash published before you played, so it cannot have been chosen to fit a result. Run `/seed` with a new client seed to rotate and reveal it, then `/verify` to recompute any spin yourself.',
    fields: [
      { name: 'Your committed server seed hash', value: `\`${u.seeds.serverSeedHash}\`` },
      { name: 'Client seed', value: `\`${u.seeds.clientSeed}\``, inline: true },
      { name: 'Spins on this seed', value: String(u.seeds.nonce), inline: true },
    ],
  };
}

// ------------------------------------------------------------------ admin

export function adminAdjust(ctx: Ctx, caller: Caller, target: string, amount: number, reason?: string): CommandResult {
  if (!isAdmin(ctx, caller.id)) return problem('Not permitted', 'That command is limited to the bot owner.');
  const r = ctx.store.adjust(caller.id, target, amount, reason);
  if (!r.ok) return problem('Cannot adjust', r.reason);
  return {
    title: amount > 0 ? `Granted ${credits(amount)}` : `Deducted ${credits(-amount)}`,
    accent: 'idle',
    ephemeral: true,
    fields: [
      { name: 'Target', value: `<@${target}>`, inline: true },
      { name: 'New balance', value: credits(r.entry.balanceAfter), inline: true },
    ],
    silenceMentions: true,
  };
}

export function adminReset(ctx: Ctx, caller: Caller, target: string, reason?: string): CommandResult {
  if (!isAdmin(ctx, caller.id)) return problem('Not permitted', 'That command is limited to the bot owner.');
  const entry = ctx.store.resetUser(caller.id, target, reason);
  return {
    title: 'Player reset',
    accent: 'idle',
    ephemeral: true,
    fields: [
      { name: 'Target', value: `<@${target}>`, inline: true },
      { name: 'Balance', value: credits(entry.balanceAfter), inline: true },
    ],
    silenceMentions: true,
  };
}

export function adminJackpot(ctx: Ctx, caller: Caller, value: number, reason?: string): CommandResult {
  if (!isAdmin(ctx, caller.id)) return problem('Not permitted', 'That command is limited to the bot owner.');
  const r = ctx.store.setJackpot(caller.id, value, reason);
  if (!r.ok) return problem('Cannot set jackpot', r.reason);
  return { title: `Jackpot set to ${credits(value)}`, accent: 'idle', ephemeral: true };
}

export function adminAudit(ctx: Ctx, caller: Caller): CommandResult {
  if (!isAdmin(ctx, caller.id)) return problem('Not permitted', 'That command is limited to the bot owner.');
  const log = ctx.store.auditLog(15);
  if (log.length === 0) return { title: 'Audit log', description: 'No admin actions recorded.', accent: 'idle', ephemeral: true };
  return {
    title: 'Recent admin actions',
    accent: 'idle',
    ephemeral: true,
    description: log
      .map((e) => {
        const who = e.target ? `<@${e.target}>` : 'pool';
        return `<t:${Math.floor(e.at / 1000)}:R> \`${e.action}\` ${who} ${e.amount > 0 ? '+' : ''}${credits(e.amount)}${e.reason ? ` — ${e.reason}` : ''}`;
      })
      .join('\n'),
    silenceMentions: true,
  };
}

export { STARTING_BALANCE, DAILY_AMOUNT };
