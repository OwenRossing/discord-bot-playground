/**
 * Reports whether the environment is complete enough to run the bot and the
 * console. Deliberately prints only presence and length -- never a value, so
 * running it can never leak the token into a terminal or a transcript.
 */
import { existsSync } from 'node:fs';

if (!existsSync('.env')) {
  console.log('No .env file. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
process.loadEnvFile('.env');

const secret = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'SUPER_ADMIN_ID', 'WEB_TOKEN', 'DISCORD_GUILD_ID'];
const plain = ['WEB_HOST', 'WEB_PORT', 'THEME'];

const requiredForBot = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];
const missing: string[] = [];

for (const k of secret) {
  const v = process.env[k];
  const ok = v !== undefined && v.trim() !== '';
  if (!ok && requiredForBot.includes(k)) missing.push(k);
  console.log(`${k.padEnd(20)} ${ok ? `set (${v!.trim().length} chars)` : 'not set'}`);
}
for (const k of plain) {
  console.log(`${k.padEnd(20)} ${process.env[k] ?? '(default)'}`);
}

console.log();
const host = process.env.WEB_HOST ?? '127.0.0.1';
const webToken = (process.env.WEB_TOKEN ?? '').trim();
if (host !== '127.0.0.1' && host !== 'localhost' && !webToken) {
  console.log('WARN  WEB_HOST is not localhost but WEB_TOKEN is unset — the console will refuse all API calls.');
}
if (!(process.env.SUPER_ADMIN_ID ?? '').trim()) {
  console.log('NOTE  SUPER_ADMIN_ID is unset — /admin and the admin panel will refuse every action.');
}
if (!(process.env.DISCORD_GUILD_ID ?? '').trim()) {
  console.log('NOTE  DISCORD_GUILD_ID is unset — commands register globally and can take up to an hour to appear.');
}

if (missing.length) {
  console.log(`\nFAIL missing: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('\nOK ready to register and run.');
