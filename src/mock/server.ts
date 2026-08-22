/**
 * Local web UI: a fake Discord channel for iterating on the bot's output
 * without a token, and an admin panel over the same store the bot uses.
 *
 * It calls the same `core` commands the bot does, so what you see here is what
 * Discord renders -- not a parallel implementation that can drift.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import { join } from 'node:path';
import { Store } from '../game/store.js';
import { THEMES, DEFAULT_THEME } from '../render/themes/index.js';
import * as core from '../core/commands.js';
import type { Caller, CommandResult } from '../core/results.js';
import { config } from '../bot/config.js';

const theme = THEMES[config.themeId] ?? THEMES[DEFAULT_THEME];
const ctx: core.Ctx = { store: new Store(config.storeFile), theme, superAdminId: config.superAdminId };

const app = express();
app.use(express.json());

/**
 * Images are held in memory rather than written to disk: a spin GIF is only
 * ever fetched once, immediately, by the page that just requested the spin.
 */
const images = new Map<string, { data: Buffer; contentType: string }>();
const IMAGE_LIMIT = 40;

function stash(result: CommandResult): string | null {
  if (!result.image) return null;
  const key = `${Date.now()}-${result.image.name}`;
  images.set(key, { data: result.image.data, contentType: result.image.contentType });
  for (const k of images.keys()) {
    if (images.size <= IMAGE_LIMIT) break;
    images.delete(k);
  }
  return key;
}

/** Strips the Buffer out so the result can go over JSON. */
function wire(result: CommandResult) {
  const { image, ...rest } = result;
  return { ...rest, imageUrl: image ? `/api/image/${stash(result)}` : null };
}

// --- auth -----------------------------------------------------------------
// Only meaningful when the server is reachable beyond this machine, but the
// check is unconditional so binding to the LAN can never silently open it up.
function requireToken(req: Request, res: Response, next: NextFunction) {
  if (!config.webToken) {
    if (config.webHost === '127.0.0.1' || config.webHost === 'localhost') return next();
    return res.status(500).json({ error: 'WEB_TOKEN must be set when WEB_HOST is not localhost.' });
  }
  const given = req.get('x-web-token') ?? (req.query.token as string | undefined);
  if (given !== config.webToken) return res.status(401).json({ error: 'Bad or missing token.' });
  next();
}

app.get('/api/image/:key', (req, res) => {
  const img = images.get(req.params.key);
  if (!img) return res.status(404).end();
  res.setHeader('Content-Type', img.contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.end(img.data);
});

app.use('/api', requireToken);

const caller = (req: Request): Caller => ({
  id: String(req.body?.userId ?? req.query.userId ?? 'web-tester'),
  name: String(req.body?.userName ?? req.query.userName ?? 'Tester'),
});

app.post('/api/command', async (req, res) => {
  const { name, args = {} } = req.body ?? {};
  const who = caller(req);
  try {
    switch (name) {
      case 'spin':
        return res.json(wire(await core.spin(ctx, who, Number(args.bet) || core.DEFAULT_BET)));
      case 'balance':
        return res.json(wire(core.balance(ctx, who)));
      case 'daily':
        return res.json(wire(core.daily(ctx, who)));
      case 'leaderboard':
        return res.json(wire(core.leaderboard(ctx)));
      case 'stats':
        return res.json(wire(core.stats(ctx, who)));
      case 'odds':
        return res.json(wire(core.odds(ctx)));
      case 'seed':
        return res.json(wire(core.seeds(ctx, who, args.clientSeed ?? null)));
      case 'fairness':
        return res.json(wire(core.fairnessInfo(ctx, who)));
      case 'verify':
        return res.json(
          wire(core.verify(String(args.serverSeed), String(args.serverSeedHash), String(args.clientSeed), Number(args.nonce))),
        );
      default:
        return res.status(400).json({ error: `Unknown command "${name}"` });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// --- admin ----------------------------------------------------------------
// The panel acts as the configured super admin, which is why reaching it at
// all requires the token.
const adminCaller = (): Caller => ({ id: ctx.superAdminId ?? 'web-admin', name: 'Web admin' });

app.get('/api/admin/state', (_req, res) => {
  res.json({
    jackpot: ctx.store.jackpot,
    superAdminId: ctx.superAdminId,
    users: ctx.store.allUsers().map((u) => ({
      id: u.id,
      balance: u.balance,
      granted: u.stats.granted,
      spins: u.stats.spins,
      wagered: u.stats.wagered,
      won: u.stats.won,
      jackpots: u.stats.jackpots,
      nonce: u.seeds.nonce,
      serverSeedHash: u.seeds.serverSeedHash,
      clientSeed: u.seeds.clientSeed,
      createdAt: u.createdAt,
    })),
    audit: ctx.store.auditLog(50),
  });
});

app.post('/api/admin/action', (req, res) => {
  const { action, target, amount, reason } = req.body ?? {};
  const me = adminCaller();
  if (!ctx.superAdminId) {
    return res.status(400).json({ error: 'SUPER_ADMIN_ID is not set, so admin actions have no owner to attribute.' });
  }
  switch (action) {
    case 'grant':
      return res.json(wire(core.adminAdjust(ctx, me, String(target), Math.abs(Number(amount)), reason)));
    case 'deduct':
      return res.json(wire(core.adminAdjust(ctx, me, String(target), -Math.abs(Number(amount)), reason)));
    case 'reset':
      return res.json(wire(core.adminReset(ctx, me, String(target), reason)));
    case 'jackpot':
      return res.json(wire(core.adminJackpot(ctx, me, Number(amount), reason)));
    default:
      return res.status(400).json({ error: `Unknown action "${action}"` });
  }
});

app.use(express.static(join(import.meta.dirname, 'public')));

app.listen(config.webPort, config.webHost, () => {
  const where = `http://${config.webHost === '0.0.0.0' ? 'localhost' : config.webHost}:${config.webPort}`;
  console.log(`Slot console on ${where}`);
  if (config.webHost === '0.0.0.0') {
    console.log('Bound to all interfaces — reachable from your LAN. Token required.');
  }
  if (!config.webToken && config.webHost !== '127.0.0.1' && config.webHost !== 'localhost') {
    console.warn('WEB_TOKEN is unset; API calls will be refused until you set one.');
  }
});
