/**
 * Checks the console's access control, which is the part where being wrong is
 * expensive: the panel can mint credits, and binding it to the LAN so a phone
 * can reach it also exposes it to everything else on that network.
 */
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';

// A fresh port each run, so a server that outlived its test cannot be mistaken
// for this one's -- that failure looks exactly like state leaking between runs.
const PORT = 4400 + Math.floor(Math.random() * 500);
const TOKEN = 'test-token-abc';
const ADMIN = 'admin-user-1';
const store = join(tmpdir(), `slot-auth-${Date.now()}.json`);

const server = spawn('npx', ['tsx', 'src/mock/server.ts'], {
  env: {
    ...process.env,
    WEB_PORT: String(PORT),
    WEB_HOST: '0.0.0.0',
    WEB_TOKEN: TOKEN,
    SUPER_ADMIN_ID: ADMIN,
    STORE_FILE: store,
  },
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(d));

const base = `http://127.0.0.1:${PORT}`;
const checks: [string, boolean, string?][] = [];
const check = (n: string, ok: boolean, d?: string) => checks.push([n, ok, d]);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${base}/style.css`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server never came up');
}

const post = (path: string, body: unknown, token?: string) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-web-token': token } : {}) },
    body: JSON.stringify(body),
  });

try {
  await waitForServer();

  // --- the gate ----------------------------------------------------------
  check('no token is refused', (await fetch(`${base}/api/admin/state`)).status === 401);
  check(
    'wrong token is refused',
    (await fetch(`${base}/api/admin/state`, { headers: { 'x-web-token': 'nope' } })).status === 401,
  );
  const good = await fetch(`${base}/api/admin/state`, { headers: { 'x-web-token': TOKEN } });
  check('correct token is accepted', good.status === 200);
  check(
    'spinning also needs the token',
    (await post('/api/command', { name: 'spin', args: { bet: 25 } })).status === 401,
  );
  // Static files are not behind the gate; the gate page itself has to load.
  check('static assets stay public', (await fetch(`${base}/style.css`)).ok);

  // --- admin actions ------------------------------------------------------
  const grant = await post('/api/admin/action', { action: 'grant', target: 'victim', amount: 250, reason: 'test' }, TOKEN);
  const granted = await grant.json();
  check('grant succeeds for the super admin', granted.accent !== 'lose', granted.title);

  const state = await (await fetch(`${base}/api/admin/state`, { headers: { 'x-web-token': TOKEN } })).json();
  const victim = state.users.find((u: { id: string }) => u.id === 'victim');
  check('granted credits land on the balance', victim?.balance === 1250, `balance ${victim?.balance}`);
  check('granted credits are tracked separately', victim?.granted === 250, `granted ${victim?.granted}`);
  check('the grant is in the audit log', state.audit.some((e: { action: string; amount: number }) => e.action === 'grant' && e.amount === 250));

  const over = await post('/api/admin/action', { action: 'deduct', target: 'victim', amount: 999999 }, TOKEN);
  check('cannot deduct below zero', (await over.json()).accent === 'lose');

  const jp = await post('/api/admin/action', { action: 'jackpot', amount: 12345 }, TOKEN);
  check('jackpot can be set', (await jp.json()).accent !== 'lose');

  // --- the leaderboard stays honest ---------------------------------------
  // The board only lists players who have actually spun, so the granted user
  // has to play before there is anything to flag.
  await post('/api/command', { name: 'spin', args: { bet: 25 }, userId: 'victim' }, TOKEN);
  const board = await (await post('/api/command', { name: 'leaderboard', userId: 'victim' }, TOKEN)).json();
  check('granted credits are flagged on the leaderboard', String(board.description).includes('granted'), board.description);
} finally {
  stopServer();
  rmSync(store, { force: true });
}

/**
 * On Windows `shell: true` means the child is cmd.exe, and killing it leaves
 * the node process holding the port. taskkill /T takes the whole tree.
 */
function stopServer() {
  if (server.pid === undefined) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    server.kill();
  }
}

let failed = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
