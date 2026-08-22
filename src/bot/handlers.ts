import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { auditRtp, PAYTABLE, REEL_STRIP } from '../game/engine.js';
import { hashSeed, verifySpin } from '../game/fairness.js';
import { DAILY_AMOUNT, type Store } from '../game/store.js';
import type { Theme } from '../render/types.js';
import { infoEmbed } from './embeds.js';

const credits = (n: number) => n.toLocaleString('en-US');
const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

export interface Deps {
  store: Store;
  theme: Theme;
}

export async function handleBalance(i: ChatInputCommandInteraction, { store, theme }: Deps) {
  const u = store.user(i.user.id);
  const embed = infoEmbed(theme, `${credits(u.balance)} credits`).addFields(
    { name: 'Jackpot pool', value: credits(store.jackpot), inline: true },
    { name: 'Spins', value: credits(u.stats.spins), inline: true },
  );
  await i.reply({ embeds: [embed] });
}

export async function handleDaily(i: ChatInputCommandInteraction, { store, theme }: Deps) {
  const result = store.claimDaily(i.user.id);
  if (!result.ok) {
    // Discord renders this as a live countdown, so it stays correct without us
    // having to format a duration.
    const when = Math.floor(result.nextAt / 1000);
    await i.reply({ content: `Already claimed. Next one <t:${when}:R>.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const embed = infoEmbed(theme, `+${credits(result.amount)} credits`).addFields({
    name: 'Balance',
    value: credits(result.balance),
    inline: true,
  });
  await i.reply({ embeds: [embed] });
}

export async function handleLeaderboard(i: ChatInputCommandInteraction, { store, theme }: Deps) {
  const top = store.leaderboard(10);
  if (top.length === 0) {
    await i.reply({ content: 'Nobody has played yet.' });
    return;
  }
  const medal = ['🥇', '🥈', '🥉'];
  const lines = top.map((u, n) => `${medal[n] ?? `\`${n + 1}.\``} <@${u.id}> — **${credits(u.balance)}**`);
  await i.reply({
    embeds: [infoEmbed(theme, 'Richest players', lines.join('\n'))],
    allowedMentions: { parse: [] },
  });
}

export async function handleStats(i: ChatInputCommandInteraction, { store, theme }: Deps) {
  const target = i.options.getUser('player') ?? i.user;
  const u = store.user(target.id);
  const { spins, wagered, won, biggestWin, jackpots } = u.stats;
  // Their realised return, which will sit near the theoretical RTP only after
  // a lot of spins -- showing it invites exactly the right question.
  const realised = wagered > 0 ? pct(won / wagered) : '—';

  const embed = infoEmbed(theme, `${target.displayName}'s stats`).addFields(
    { name: 'Spins', value: credits(spins), inline: true },
    { name: 'Wagered', value: credits(wagered), inline: true },
    { name: 'Won', value: credits(won), inline: true },
    { name: 'Net', value: credits(won - wagered), inline: true },
    { name: 'Biggest win', value: credits(biggestWin), inline: true },
    { name: 'Jackpots', value: credits(jackpots), inline: true },
    { name: 'Your return', value: realised, inline: true },
    { name: 'Balance', value: credits(u.balance), inline: true },
  );
  await i.reply({ embeds: [embed] });
}

export async function handleOdds(i: ChatInputCommandInteraction, { theme }: Deps) {
  const r = auditRtp();
  const rows = r.perRule
    .filter((rule) => rule.probability > 0)
    .map((rule) => `\`${pct(rule.probability).padStart(7)}\`  ${rule.label}`);

  const embed = infoEmbed(
    theme,
    'Odds',
    `Computed by enumerating all ${credits(r.combos)} stop combinations — no sampling.`,
  ).addFields(
    { name: 'Return to player', value: pct(r.totalRtp), inline: true },
    { name: 'Hit rate', value: pct(r.hitRate), inline: true },
    { name: 'Jackpot', value: `1 in ${credits(Math.round(1 / r.jackpotOdds))}`, inline: true },
    { name: 'Paytable', value: rows.join('\n') },
  );
  await i.reply({ embeds: [embed] });
}

export async function handleSeed(i: ChatInputCommandInteraction, { store, theme }: Deps) {
  const next = i.options.getString('client_seed');

  if (next === null) {
    const u = store.user(i.user.id);
    const embed = infoEmbed(
      theme,
      'Your seeds',
      'Your next spin is already determined by these three values. Rotate to reveal the current server seed and check every spin you played under it.',
    ).addFields(
      { name: 'Server seed hash (committed)', value: `\`${u.seeds.serverSeedHash}\`` },
      { name: 'Client seed', value: `\`${u.seeds.clientSeed}\``, inline: true },
      { name: 'Next nonce', value: String(u.seeds.nonce), inline: true },
    );
    await i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (next.length > 64) {
    await i.reply({ content: 'Client seed must be 64 characters or fewer.', flags: MessageFlags.Ephemeral });
    return;
  }

  const { revealed, next: pair } = store.rotateSeeds(i.user.id, next);
  const embed = infoEmbed(
    theme,
    'Seeds rotated',
    `Your previous server seed is now revealed. Check any of those ${revealed.spins} spins with \`/verify\` — nonces run 0 to ${Math.max(0, revealed.spins - 1)}.`,
  ).addFields(
    { name: 'Revealed server seed', value: `\`${revealed.serverSeed}\`` },
    { name: 'Its committed hash', value: `\`${revealed.serverSeedHash}\`` },
    { name: 'Old client seed', value: `\`${revealed.clientSeed}\`` },
    { name: 'New server seed hash', value: `\`${pair.serverSeedHash}\`` },
    { name: 'New client seed', value: `\`${pair.clientSeed}\``, inline: true },
  );
  await i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

export async function handleVerify(i: ChatInputCommandInteraction, { theme }: Deps) {
  const serverSeed = i.options.getString('server_seed', true).trim();
  const clientSeed = i.options.getString('client_seed', true);
  const nonce = i.options.getInteger('nonce', true);
  const committed = i.options.getString('server_seed_hash', true).trim().toLowerCase();

  const result = verifySpin(serverSeed, committed, clientSeed, nonce);

  if (!result.hashMatches) {
    const embed = infoEmbed(
      theme,
      '❌ Does not match',
      'That server seed does not hash to the committed value, so it is not the seed those spins were played under.',
    ).addFields(
      { name: 'Committed', value: `\`${committed}\`` },
      { name: 'This seed hashes to', value: `\`${hashSeed(serverSeed)}\`` },
    );
    await i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const stops = result.stops!;
  const line = stops.map((s) => REEL_STRIP[s]);
  const rule = PAYTABLE.find((r) => r.matches(line as never)) ?? null;

  const embed = infoEmbed(
    theme,
    '✅ Verified',
    'The seed matches its commitment, so this is genuinely the spin the machine was bound to produce.',
  ).addFields(
    { name: 'Stops', value: `\`${stops.join(', ')}\``, inline: true },
    { name: 'Symbols', value: line.join(' · '), inline: true },
    { name: 'Result', value: rule ? rule.label : 'No win' },
  );
  await i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

export { DAILY_AMOUNT };
