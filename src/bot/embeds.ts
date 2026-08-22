import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type APIEmbedField,
} from 'discord.js';
import type { SpinOutcome } from '../game/engine.js';
import type { Theme } from '../render/types.js';
import type { UserRecord } from '../game/store.js';
import { SPIN_AGAIN_ID, SHOW_FAIRNESS_ID } from './commands.js';

const credits = (n: number) => n.toLocaleString('en-US');

/** Accent colour matching what the machine is doing, so the message reads at a glance. */
function accent(theme: Theme, outcome: SpinOutcome): number {
  if (outcome.jackpotWon) return theme.colors.jackpot;
  if (outcome.payout > 0) return theme.colors.win;
  return theme.colors.lose;
}

function headline(outcome: SpinOutcome): string {
  if (outcome.jackpotWon) return '🎰 JACKPOT!';
  if (outcome.payout > 0) return `✨ ${outcome.rule?.label ?? 'Winner'}`;
  return 'No win';
}

export function spinEmbed(
  theme: Theme,
  outcome: SpinOutcome,
  user: UserRecord,
  jackpot: number,
  gifName: string,
) {
  const fields: APIEmbedField[] = [
    { name: 'Bet', value: credits(outcome.bet), inline: true },
    {
      name: outcome.payout > 0 ? 'Won' : 'Lost',
      value: credits(outcome.payout > 0 ? outcome.payout : outcome.bet),
      inline: true,
    },
    { name: 'Balance', value: credits(user.balance), inline: true },
  ];

  return new EmbedBuilder()
    .setColor(accent(theme, outcome))
    .setTitle(headline(outcome))
    .addFields(fields)
    .setImage(`attachment://${gifName}`)
    // The commitment and nonce are what make this spin checkable later, so they
    // travel with the result rather than living only in /seed.
    .setFooter({ text: `Jackpot ${credits(jackpot)} · spin #${user.seeds.nonce - 1} · ${user.seeds.serverSeedHash.slice(0, 16)}…` });
}

export function spinButtons(bet: number, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${SPIN_AGAIN_ID}:${bet}`)
      .setLabel(`Spin again (${credits(bet)})`)
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎰')
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(SHOW_FAIRNESS_ID)
      .setLabel('Fairness')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

export function infoEmbed(theme: Theme, title: string, description?: string) {
  const e = new EmbedBuilder().setColor(theme.colors.idle).setTitle(title);
  if (description) e.setDescription(description);
  return e;
}
