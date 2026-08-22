import { AttachmentBuilder, MessageFlags, type RepliableInteraction } from 'discord.js';
import { resolve } from '../game/engine.js';
import { deriveStops } from '../game/fairness.js';
import type { Store } from '../game/store.js';
import { renderSpinGif } from '../render/render.js';
import type { Theme } from '../render/types.js';
import { spinButtons, spinEmbed } from './embeds.js';
import { MAX_BET, MIN_BET } from './config.js';

/**
 * One spin, from stake to posted result. Shared by /spin and the Spin Again
 * button so the two can never drift apart.
 *
 * Concurrency matters here: the same player double-clicking Spin Again would
 * otherwise interleave two bets against one balance read. `inFlight` makes a
 * player's spins strictly sequential -- the store is a single in-memory
 * document, so this is the only lock needed.
 */
const inFlight = new Set<string>();

export interface SpinDeps {
  store: Store;
  theme: Theme;
}

export async function runSpin(
  interaction: RepliableInteraction,
  { store, theme }: SpinDeps,
  requestedBet: number,
): Promise<void> {
  const userId = interaction.user.id;

  if (inFlight.has(userId)) {
    await interaction.reply({ content: 'Your last spin is still resolving.', flags: MessageFlags.Ephemeral });
    return;
  }

  const bet = Math.trunc(requestedBet);
  if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
    await interaction.reply({ content: `Bet must be between ${MIN_BET} and ${MAX_BET}.`, flags: MessageFlags.Ephemeral });
    return;
  }

  inFlight.add(userId);
  try {
    // Rendering is fast, but a 1.4MB upload on a slow link is not, and the
    // 3s interaction deadline covers both.
    await interaction.deferReply();

    const user = store.user(userId);
    const creditsBefore = user.balance;
    const placed = store.placeBet(userId, bet);
    if (!placed.ok) {
      await interaction.editReply({ content: placed.reason });
      return;
    }

    // The pool is read after the rake so the machine shows the jackpot this
    // spin is actually playing for.
    const jackpot = store.jackpot;
    const stops = deriveStops(user.seeds.serverSeed, user.seeds.clientSeed, placed.nonce);
    const outcome = resolve(stops, bet, jackpot);
    const settled = store.settle(userId, outcome);

    const gif = renderSpinGif(theme, { outcome, creditsBefore, jackpot });
    const name = `spin-${placed.nonce}.gif`;

    await interaction.editReply({
      embeds: [spinEmbed(theme, outcome, settled, store.jackpot, name)],
      files: [new AttachmentBuilder(gif, { name })],
      components: [spinButtons(bet)],
    });
  } finally {
    inFlight.delete(userId);
  }
}
