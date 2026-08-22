import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Secrets come from the environment only. Nothing here is ever written to a
 * file the repo tracks, and `.env` is gitignored -- a bot token is a full
 * account credential, so it must not end up in git history.
 */

const ENV_FILE = join(process.cwd(), '.env');
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing ${name}. Create a .env file in the project root containing:\n` +
        `  DISCORD_TOKEN=...\n  DISCORD_CLIENT_ID=...\n` +
        `Get both from https://discord.com/developers/applications (Bot -> Reset Token).`,
    );
  }
  return v;
}

export const config = {
  get token() {
    return required('DISCORD_TOKEN');
  },
  get clientId() {
    return required('DISCORD_CLIENT_ID');
  },
  /** Optional: register commands to one guild, which updates instantly. */
  get devGuildId() {
    return process.env.DISCORD_GUILD_ID ?? null;
  },
  storeFile: process.env.STORE_FILE ?? join(process.cwd(), 'data', 'store.json'),
  themeId: process.env.THEME ?? 'pixel',
};

export const MIN_BET = 1;
export const MAX_BET = 500;
