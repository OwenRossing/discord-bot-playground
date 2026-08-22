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
  /**
   * Discord id with unrestricted rights, independent of server permissions.
   * This is the bot owner: the machine's economy is the bot's own data, so
   * administering it does not depend on holding Manage Server anywhere.
   */
  get superAdminId() {
    return process.env.SUPER_ADMIN_ID ?? null;
  },
  storeFile: process.env.STORE_FILE ?? join(process.cwd(), 'data', 'store.json'),
  themeId: process.env.THEME ?? 'pixel',

  webPort: Number(process.env.WEB_PORT ?? 4317),
  /** 0.0.0.0 exposes the panel to the LAN; 127.0.0.1 keeps it on this machine. */
  webHost: process.env.WEB_HOST ?? '127.0.0.1',
  get webToken() {
    return process.env.WEB_TOKEN ?? null;
  },
};
