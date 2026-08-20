# Handoff: slot machine Discord bot

Continuing this project locally in Claude Code. This file is the context a
fresh session won't have — read it before touching anything.

## What this is

A Discord slot machine bot: fair RNG game engine, animated GIF results
rendered from scratch (no stock assets), credits/betting economy, and a
mocked single-channel test interface. Branch: `claude/slot-machine-discord-bot-2ghd9u`.

## Built so far

**Game engine** (`src/game/`)
- `symbols.ts` — 7 symbols on a 38-stop weighted reel strip, built so no two
  identical symbols sit adjacent (matters for the near-miss "peek" effect).
- `engine.ts` — `spin()` draws 3 independent CSPRNG stops; `resolve()` scores
  a given set of stops (used by tests and the audit); `auditRtp()` exactly
  enumerates all 38³ combinations (no sampling) — current numbers: 94.65%
  total RTP, 28.11% hit rate, jackpot 1-in-6,859. Re-run the audit after any
  paytable change: `npx tsx -e "import {auditRtp} from './src/game/engine.ts'; console.log(auditRtp())"`.

**Render pipeline** (`src/render/`)
- `timeline.ts` — spin physics: staggered reel stops, ease-in/cruise/brake
  velocity curve, landing-bounce, near-miss anticipation stall on the last
  reel, lever-pull timing window.
- `gif.ts` — encodes frames via `gifenc` (note: it's CJS-only with no
  exports map, so it's imported as a default export then destructured —
  see the comment there before "fixing" the import).
- `render.ts` — `renderSpinGif(theme, input)` renders the full animation;
  `renderStill(theme, input, t)` renders one frame at time `t`, used
  constantly for iteration (see workflow below).
- `paint.ts` — shared helpers: reel drawing with motion-blur sampling,
  gradients, text.
- `pixelbox.ts` — **use this for anything in the pixel theme.** Hard-edged
  `px`/`disc`/`ring`/`line` primitives. Never use `ctx.arc`/`ctx.stroke`
  directly in pixel art — their antialiased edges turn to mush under the 4x
  nearest-neighbour upscale. This bit me once already (see the actuator
  prototype commit history).
- `pixelfont.ts` — hand-built 3x5 bitmap font (canvas fonts don't render
  crisply at this scale).
- `pixelsprites.ts` — hand-authored 16x16 symbol sprites + the `PAL` colour
  palette. Everything in the pixel theme should draw from `PAL`, not raw hex.
- `symbols-vector.ts` — gradient-shaded symbols for the classic theme.

**Themes** (`src/render/themes/`)
- `classic.ts` — red/chrome/gold Vegas cabinet, gradient shading, marquee
  bulb chase. Locked in, not under active iteration.
- `pixel.ts` — 128x104 canvas, 4x nearest-neighbour upscale, 16x16 sprites,
  26-colour palette. **This is the one still being iterated on.**
- `index.ts` — theme registry.

**Actuators** (`src/render/actuators.ts`) — the open decision, see below.

## The open decision: what replaces the pull lever

The pixel theme originally had a pull lever. It went through several
rebuilds (side-swinging arc → vertical plunge → depth-foreshortened arc)
chasing a real problem: a lever's rotation axis points into the screen, so
its motion has almost no on-screen curve to draw honestly.

Rather than keep patching the lever, I built 6 alternative actuators, all
chosen so their motion lies flat in the image plane (translation, or
rotation about an axis pointing at the viewer) — genuinely drawable, no
foreshortening trick needed:

| id | concept | verdict |
|---|---|---|
| `crank` | hand crank, freewheels with the reels | **recommended** — only one animating for the whole spin, not just the 8% pull window |
| `buttons` | BET/SPIN/MAX cabinet panel | most authentic to a real machine |
| `coin` | coin drops into a slot, swallowed | best narrative, ties to the bet |
| `dome` | big arcade SPIN button | simplest, iconic |
| `bar` | sliding grab bar | clear but generic |
| `none` | no control, just a vent + lamp | zero risk, widest cabinet |

The theme is pluggable: `createPixelTheme(ACTUATOR_BY_ID['crank'])` swaps
the control; `pixelTheme` (no args) still uses the original lever. **The
user has not yet picked one** — last message before handoff was them about
to review `out/act-strips.png` and four GIFs. Ask them, or if they've
already decided, wire their pick as the actual default and delete the
lever/`Actuator|undefined` branching in `pixel.ts` to simplify.

Key finding worth preserving: the lever/actuator only acts during roughly
the first 0.4s of a ~4.75s animation. Anything static after that reads as
dead weight — factor this into any new control (see how `crank` and
`coin`'s lamp-equivalent handle it via the `fired` latch in `Actuation`).

## Workflow: render-and-inspect, not blind editing

This whole project was built by rendering PNGs/GIFs and visually checking
them — never trust pixel math without looking at the output. The scripts
that make this fast:

- `npx tsx scripts/stills.ts <themeId>` — renders idle/lever/blur/tension/
  lose/jackpot key frames for a theme to `out/`.
- `npx tsx scripts/sheet.ts out/x.png <cols> a.png b.png ...` — composites
  PNGs into one labelled contact sheet (also upscales to a common size).
- `npx tsx scripts/upscale.ts in.png out.png [factor]` — nearest-neighbour
  upscale (pixel themes render at native res; this blows it up 4x to see
  what Discord will actually show).
- `npx tsx scripts/actuator-strips.ts` — filmstrip of every actuator across
  the pull + spin (samples the pull window densely since it's short).
- `npx tsx scripts/actuator-gifs.ts <id> <id> ...` — full animated GIFs for
  specific actuators, e.g. `crank buttons coin dome`.

Always `npx tsc --noEmit` before considering a change done — this caught
real bugs during development (gifenc's type shape, etc).

## Not built yet

- **Persistence** — credits/betting, saved to disk (JSON or SQLite; JSON is
  probably enough for a Discord toy). No `src/game/store.ts` or similar
  exists yet. Needs: per-user balance, jackpot pool (see `JACKPOT_RATE` /
  `JACKPOT_SEED` in `engine.ts`), daily top-up so nobody gets stuck at zero.
- **The discord.js bot** (`src/bot/`) — doesn't exist. `discord.js` and
  `@napi-rs/canvas`/`gifenc`/`express` are already installed
  (`package.json`). Needs: `/spin <bet>` slash command, embed with the GIF
  attached, colour changes on win (use `theme.colors` from `Theme` —
  already has `idle`/`win`/`jackpot`/`lose` fields), a spin-again button,
  near-miss/jackpot/leaderboard features per the original ask (see git log
  for the full feature list the user asked for — "Lever button + Spin
  Again, Near-miss tension, Progressive jackpot, Leaderboard + stats" were
  all requested and none are wired into a bot yet, only supported by the
  engine/renderer).
- **Mock channel test UI** (`src/mock/`) — doesn't exist.
  `src/mock/server.ts` + `src/mock/public/` referenced in `package.json`
  scripts but not yet written. Should mock a single Discord channel enough
  to test the bot's embeds/buttons/GIFs without needing a real Discord
  connection — an Express server serving a page that fakes the channel
  chrome and renders the same embed/GIF output the bot would post.

## Conventions to keep

- No comments explaining *what* code does — only *why*, when non-obvious
  (see existing files for the calibration).
- Bug fixes and feature commits get pushed individually with a commit
  message explaining the actual problem, not just "update lever.ts".
- Scratch renders go in `out/` (gitignored) — never commit generated PNGs/
  GIFs to the repo.
