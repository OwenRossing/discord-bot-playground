/**
 * Publish the slash commands to Discord: tsx src/bot/register.ts
 *
 * Guild-scoped registration (DISCORD_GUILD_ID set) appears instantly, which is
 * what you want while iterating. Global registration takes up to an hour to
 * propagate, so only do that once the command list has settled.
 */
import { REST, Routes } from 'discord.js';
import { commands } from './commands.js';
import { config } from './config.js';

const rest = new REST().setToken(config.token);
const guildId = config.devGuildId;

const route = guildId
  ? Routes.applicationGuildCommands(config.clientId, guildId)
  : Routes.applicationCommands(config.clientId);

const data = (await rest.put(route, { body: commands })) as unknown[];
console.log(
  `Registered ${data.length} commands ${guildId ? `to guild ${guildId} (instant)` : 'globally (up to 1h to appear)'}`,
);
