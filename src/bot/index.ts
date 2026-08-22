import { Client, Events, GatewayIntentBits, MessageFlags, type Interaction } from 'discord.js';
import { Store } from '../game/store.js';
import { THEMES, DEFAULT_THEME } from '../render/themes/index.js';
import { config } from './config.js';
import { SPIN_AGAIN_ID, SHOW_FAIRNESS_ID } from './commands.js';
import { runSpin } from './spin.js';
import { infoEmbed } from './embeds.js';
import {
  handleBalance,
  handleDaily,
  handleLeaderboard,
  handleOdds,
  handleSeed,
  handleStats,
  handleVerify,
  type Deps,
} from './handlers.js';

const DEFAULT_BET = 25;

const theme = THEMES[config.themeId] ?? THEMES[DEFAULT_THEME];
const deps: Deps = { store: new Store(config.storeFile), theme };

// Slash commands and buttons are all this bot uses, and both arrive as
// interactions, so it needs no privileged intents and cannot read messages.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Ready as ${c.user.tag} — theme "${theme.id}"`);
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case 'spin':
          return await runSpin(interaction, deps, interaction.options.getInteger('bet') ?? DEFAULT_BET);
        case 'balance':
          return await handleBalance(interaction, deps);
        case 'daily':
          return await handleDaily(interaction, deps);
        case 'leaderboard':
          return await handleLeaderboard(interaction, deps);
        case 'stats':
          return await handleStats(interaction, deps);
        case 'odds':
          return await handleOdds(interaction, deps);
        case 'seed':
          return await handleSeed(interaction, deps);
        case 'verify':
          return await handleVerify(interaction, deps);
      }
      return;
    }

    if (interaction.isButton()) {
      const [id, arg] = interaction.customId.split(':');

      if (id === SPIN_AGAIN_ID) {
        // Anyone may spin from someone else's message; the bet rides along in
        // the custom id, and the stake comes out of whoever clicked.
        return await runSpin(interaction, deps, Number(arg) || DEFAULT_BET);
      }

      if (id === SHOW_FAIRNESS_ID) {
        const u = deps.store.user(interaction.user.id);
        const embed = infoEmbed(
          theme,
          'How this is provably fair',
          'Every spin is `HMAC-SHA256(server seed, client seed:nonce)`. The server seed was fixed and its hash published before you played, so it cannot have been chosen to fit a result. Run `/seed` to rotate and reveal it, then `/verify` to recompute any spin yourself.',
        ).addFields(
          { name: 'Your committed server seed hash', value: `\`${u.seeds.serverSeedHash}\`` },
          { name: 'Client seed', value: `\`${u.seeds.clientSeed}\``, inline: true },
          { name: 'Spins on this seed', value: String(u.seeds.nonce), inline: true },
        );
        return void (await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }));
      }
    }
  } catch (err) {
    console.error('interaction failed', err);
    if (!interaction.isRepliable()) return;
    const content = 'Something went wrong handling that.';
    // A deferred interaction has already been acknowledged, so replying again
    // would throw and bury the original error.
    if (interaction.deferred || interaction.replied) await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
});

async function shutdown(signal: string) {
  console.log(`\n${signal} — flushing store`);
  await deps.store.save();
  await client.destroy();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

client.login(config.token);
