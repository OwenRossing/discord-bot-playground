import { Client, Events, GatewayIntentBits, MessageFlags, type Interaction, type RepliableInteraction } from 'discord.js';
import { Store } from '../game/store.js';
import { THEMES, DEFAULT_THEME } from '../render/themes/index.js';
import * as core from '../core/commands.js';
import type { Caller, CommandResult } from '../core/results.js';
import { config } from './config.js';
import { toReply } from './render-result.js';

const theme = THEMES[config.themeId] ?? THEMES[DEFAULT_THEME];
const ctx: core.Ctx = {
  store: new Store(config.storeFile),
  theme,
  superAdminId: config.superAdminId,
};

// Slash commands and buttons both arrive as interactions, so the bot needs no
// privileged intents and cannot read channel messages.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Ready as ${c.user.tag} — theme "${theme.id}"`);
  console.log(config.superAdminId ? `Super admin: ${config.superAdminId}` : 'No super admin configured');
});

/** Spins render a GIF and upload it, so they are deferred; nothing else is. */
async function send(interaction: RepliableInteraction, result: CommandResult, deferred: boolean) {
  const reply = toReply(theme, result);
  if (deferred) {
    // A deferred reply is already a public message, and editReply cannot carry
    // the Ephemeral flag, so an ephemeral result goes out as a follow-up.
    if (result.ephemeral) return void (await interaction.followUp(reply));
    const { flags, ...rest } = reply;
    return void (await interaction.editReply(rest));
  }
  await interaction.reply(reply);
}

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;
  const caller: Caller = { id: interaction.user.id, name: interaction.user.displayName };
  let deferred = false;

  try {
    if (interaction.isButton()) {
      const [id, arg] = interaction.customId.split(':');
      if (id === 'spin-again') {
        await interaction.deferReply();
        deferred = true;
        return await send(interaction, await core.spin(ctx, caller, Number(arg) || core.DEFAULT_BET), true);
      }
      if (id === 'show-fairness') {
        return await send(interaction, core.fairnessInfo(ctx, caller), false);
      }
      return;
    }

    const o = interaction.options;
    switch (interaction.commandName) {
      case 'spin': {
        await interaction.deferReply();
        deferred = true;
        return await send(interaction, await core.spin(ctx, caller, o.getInteger('bet') ?? core.DEFAULT_BET), true);
      }
      case 'balance':
        return await send(interaction, core.balance(ctx, caller), false);
      case 'daily':
        return await send(interaction, core.daily(ctx, caller), false);
      case 'leaderboard':
        return await send(interaction, core.leaderboard(ctx), false);
      case 'stats': {
        const u = o.getUser('player') ?? interaction.user;
        return await send(interaction, core.stats(ctx, { id: u.id, name: u.displayName }), false);
      }
      case 'odds':
        return await send(interaction, core.odds(ctx), false);
      case 'seed':
        return await send(interaction, core.seeds(ctx, caller, o.getString('client_seed')), false);
      case 'verify':
        return await send(
          interaction,
          core.verify(
            o.getString('server_seed', true),
            o.getString('server_seed_hash', true),
            o.getString('client_seed', true),
            o.getInteger('nonce', true),
          ),
          false,
        );
      case 'admin': {
        const sub = o.getSubcommand();
        const reason = o.getString('reason') ?? undefined;
        if (sub === 'grant' || sub === 'deduct') {
          const amount = o.getInteger('amount', true);
          return await send(
            interaction,
            core.adminAdjust(ctx, caller, o.getUser('player', true).id, sub === 'grant' ? amount : -amount, reason),
            false,
          );
        }
        if (sub === 'reset') {
          return await send(interaction, core.adminReset(ctx, caller, o.getUser('player', true).id, reason), false);
        }
        if (sub === 'jackpot') {
          return await send(interaction, core.adminJackpot(ctx, caller, o.getInteger('amount', true), reason), false);
        }
        if (sub === 'audit') return await send(interaction, core.adminAudit(ctx, caller), false);
        return;
      }
    }
  } catch (err) {
    console.error('interaction failed', err);
    const content = 'Something went wrong handling that.';
    // Replying twice throws and buries the original error, so branch on
    // whether this interaction was already acknowledged.
    if (deferred || interaction.replied) await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
});

async function shutdown(signal: string) {
  console.log(`\n${signal} — flushing store`);
  await ctx.store.save();
  await client.destroy();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

client.login(config.token);
