import { SlashCommandBuilder } from 'discord.js';
import { MAX_BET, MIN_BET } from './config.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('spin')
    .setDescription('Pull the lever')
    .addIntegerOption((o) =>
      o
        .setName('bet')
        .setDescription(`Credits to stake (${MIN_BET}-${MAX_BET})`)
        .setMinValue(MIN_BET)
        .setMaxValue(MAX_BET)
        .setRequired(false),
    ),

  new SlashCommandBuilder().setName('balance').setDescription('Check your credits'),

  new SlashCommandBuilder().setName('daily').setDescription('Claim your daily credits'),

  new SlashCommandBuilder().setName('leaderboard').setDescription('Richest players on this server'),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Lifetime stats')
    .addUserOption((o) => o.setName('player').setDescription('Whose stats to show').setRequired(false)),

  new SlashCommandBuilder().setName('odds').setDescription('Exact paytable odds and return to player'),

  new SlashCommandBuilder()
    .setName('seed')
    .setDescription('View or change your fairness seeds')
    .addStringOption((o) =>
      o
        .setName('client_seed')
        .setDescription('New client seed. Rotating reveals your old server seed so past spins become checkable.')
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Recompute a past spin from a revealed seed')
    .addStringOption((o) => o.setName('server_seed').setDescription('The revealed server seed').setRequired(true))
    .addStringOption((o) => o.setName('client_seed').setDescription('The client seed in use').setRequired(true))
    .addIntegerOption((o) => o.setName('nonce').setDescription('Which spin (0 = first)').setMinValue(0).setRequired(true))
    .addStringOption((o) =>
      o.setName('server_seed_hash').setDescription('The hash committed before you played').setRequired(true),
    ),
].map((c) => c.toJSON());

export const SPIN_AGAIN_ID = 'spin-again';
export const SHOW_FAIRNESS_ID = 'show-fairness';
