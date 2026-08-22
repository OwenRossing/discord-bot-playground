'use strict';

const $ = (id) => document.getElementById(id);
const TOKEN_KEY = 'slot-console-token';
let token = localStorage.getItem(TOKEN_KEY) || '';

const num = (n) => Number(n).toLocaleString('en-US');

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-web-token': token },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    showGate('Token rejected.');
    throw new Error('unauthorised');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// --- gate -----------------------------------------------------------------
function showGate(msg) {
  $('gate').hidden = false;
  $('app').hidden = true;
  $('gate-err').textContent = msg || '';
}

async function tryEnter(candidate) {
  token = candidate;
  try {
    await api('/api/admin/state');
    localStorage.setItem(TOKEN_KEY, token);
    $('gate').hidden = true;
    $('app').hidden = false;
    loadAdmin();
  } catch (err) {
    if (err.message !== 'unauthorised') showGate(err.message);
  }
}

$('gate-go').onclick = () => tryEnter($('gate-token').value.trim());
$('gate-token').onkeydown = (e) => { if (e.key === 'Enter') $('gate-go').click(); };

// --- tabs -----------------------------------------------------------------
function selectTab(which) {
  for (const name of ['channel', 'admin']) {
    const on = name === which;
    $(`tab-${name}`).setAttribute('aria-selected', String(on));
    $(`view-${name}`).hidden = !on;
  }
  if (which === 'admin') loadAdmin();
}
$('tab-channel').onclick = () => selectTab('channel');
$('tab-admin').onclick = () => selectTab('admin');

// --- channel --------------------------------------------------------------
const feed = $('feed');

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** Renders the tiny subset of Discord markup the bot actually emits. */
function markup(s) {
  const frag = document.createDocumentFragment();
  // <t:123:R> is a live relative timestamp in Discord; approximate it here.
  const text = String(s).replace(/<t:(\d+):R>/g, (_, secs) => {
    const delta = Number(secs) * 1000 - Date.now();
    const hours = Math.round(Math.abs(delta) / 3600000);
    return delta > 0 ? `in ~${hours}h` : `${hours}h ago`;
  });
  for (const part of text.split(/(`[^`]+`)/g)) {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      frag.append(el('code', null, part.slice(1, -1)));
    } else {
      frag.append(document.createTextNode(part.replace(/\*\*/g, '').replace(/<@(\w+)>/g, '@$1')));
    }
  }
  return frag;
}

function renderEmbed(r) {
  const box = el('div', `embed ${r.accent || 'idle'}`);
  if (r.ephemeral) box.append(el('div', 'ephemeral', 'Only you can see this'));
  box.append(el('div', 'title', r.title));
  if (r.description) {
    const d = el('div', 'desc');
    d.append(markup(r.description));
    box.append(d);
  }
  if (r.fields?.length) {
    const wrap = el('div', 'fields');
    for (const f of r.fields) {
      const cell = el('div', `field${f.inline ? '' : ' block'}`);
      cell.append(el('div', 'n', f.name));
      const v = el('div', 'v');
      v.append(markup(f.value));
      cell.append(v);
      wrap.append(cell);
    }
    box.append(wrap);
  }
  if (r.imageUrl) {
    const img = new Image();
    img.src = r.imageUrl;
    box.append(img);
  }
  if (r.footer) box.append(el('div', 'foot', r.footer));
  if (r.buttons?.length) {
    const row = el('div', 'buttons');
    for (const b of r.buttons) {
      const btn = el('button', `act ${b.style === 'primary' ? 'primary' : ''}`, `${b.emoji ? b.emoji + ' ' : ''}${b.label}`);
      btn.onclick = () => {
        const [id, arg] = b.id.split(':');
        if (id === 'spin-again') return run('spin', { bet: Number(arg) });
        if (id === 'show-fairness') return run('fairness');
      };
      row.append(btn);
    }
    box.append(row);
  }
  return box;
}

function post({ who, initial, cls, body, embed }) {
  const msg = el('div', `msg ${cls || ''}`);
  msg.append(el('div', 'avatar', initial));
  const main = el('div', 'grow');
  const head = el('div');
  head.append(el('span', 'who', who));
  head.append(el('span', 'when', new Date().toLocaleTimeString()));
  main.append(head);
  if (body) main.append(el('div', 'body', body));
  if (embed) main.append(renderEmbed(embed));
  msg.append(main);
  feed.append(msg);
  msg.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

async function run(name, args = {}) {
  const userId = $('user-id').value.trim() || 'web-tester';
  const userName = $('user-name').value.trim() || 'Tester';
  const shown = name === 'spin' ? `/spin bet:${args.bet ?? $('bet').value}` : `/${name}`;
  post({ who: userName, initial: userName[0]?.toUpperCase() || '?', cls: 'cmd', body: shown });

  const buttons = document.querySelectorAll('#view-channel button');
  buttons.forEach((b) => (b.disabled = true));
  try {
    const result = await api('/api/command', { name, args, userId, userName });
    post({ who: 'Lucky 7s', initial: '7', embed: result });
  } catch (err) {
    post({ who: 'Lucky 7s', initial: '!', body: `Error: ${err.message}` });
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

$('do-spin').onclick = () => run('spin', { bet: Number($('bet').value) });
$('clear-feed').onclick = () => (feed.textContent = '');
for (const b of document.querySelectorAll('[data-cmd]')) {
  b.onclick = () => run(b.dataset.cmd);
}

// --- admin ----------------------------------------------------------------
async function loadAdmin() {
  try {
    const s = await api('/api/admin/state');
    $('admin-err').textContent = '';
    $('jackpot-value').value = s.jackpot;
    $('admin-who').textContent = s.superAdminId
      ? `Acting as super admin ${s.superAdminId}`
      : 'SUPER_ADMIN_ID is not set — admin actions are refused until it is.';

    const rows = s.users
      .slice()
      .sort((a, b) => b.balance - a.balance)
      .map((u) => {
        const net = u.won - u.wagered;
        const ret = u.wagered > 0 ? `${((u.won / u.wagered) * 100).toFixed(1)}%` : '—';
        const tr = el('tr');
        tr.innerHTML =
          `<td><code>${u.id}</code></td>` +
          `<td class="num">${num(u.balance)}</td>` +
          `<td class="num ${u.granted ? 'granted' : 'muted'}">${u.granted ? num(u.granted) : '—'}</td>` +
          `<td class="num">${num(u.spins)}</td>` +
          `<td class="num ${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${num(net)}</td>` +
          `<td class="num muted">${ret}</td>`;
        const actions = el('td');
        for (const [label, action, cls] of [['+100', 'grant', ''], ['−100', 'deduct', ''], ['Reset', 'reset', 'danger']]) {
          const btn = el('button', `act ${cls}`, label);
          btn.style.marginRight = '4px';
          btn.onclick = () => adminAction(action, u.id, 100);
          actions.append(btn);
        }
        tr.append(actions);
        return tr;
      });
    $('players').replaceChildren(...(rows.length ? rows : [rowSpan(7, 'No players yet.')]));

    const audit = s.audit.map((e) => {
      const tr = el('tr');
      tr.innerHTML =
        `<td class="muted">${new Date(e.at).toLocaleString()}</td>` +
        `<td><span class="pill">${e.action}</span></td>` +
        `<td>${e.target ? `<code>${e.target}</code>` : '<span class="muted">pool</span>'}</td>` +
        `<td class="num ${e.amount >= 0 ? 'pos' : 'neg'}">${e.amount >= 0 ? '+' : ''}${num(e.amount)}</td>` +
        `<td class="muted">${e.reason ? String(e.reason).replace(/[<>&]/g, '') : '—'}</td>`;
      return tr;
    });
    $('audit').replaceChildren(...(audit.length ? audit : [rowSpan(5, 'No admin actions recorded.')]));
  } catch (err) {
    if (err.message !== 'unauthorised') $('admin-err').textContent = err.message;
  }
}

function rowSpan(cols, text) {
  const tr = el('tr');
  const td = el('td', 'muted', text);
  td.colSpan = cols;
  tr.append(td);
  return tr;
}

async function adminAction(action, target, amount) {
  const reason = prompt(`Reason for ${action}${target ? ` on ${target}` : ''}?`) ?? undefined;
  try {
    const r = await api('/api/admin/action', { action, target, amount, reason });
    if (r.accent === 'lose') $('admin-err').textContent = `${r.title}: ${r.description ?? ''}`;
    loadAdmin();
  } catch (err) {
    $('admin-err').textContent = err.message;
  }
}

$('set-jackpot').onclick = () => adminAction('jackpot', null, Number($('jackpot-value').value));
$('refresh').onclick = loadAdmin;

// --- boot -----------------------------------------------------------------
if (token) tryEnter(token);
else {
  // No token configured server-side on localhost is a valid setup, so try once
  // before demanding one.
  tryEnter('');
}
