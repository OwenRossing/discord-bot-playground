import type { SKRSContext2D } from '@napi-rs/canvas';
import type { Scene } from './types.js';
import { PAL } from './pixelsprites.js';
import { px, bevel, disc, ring, line } from './pixelbox.js';
import { pixelTextCentered } from './pixelfont.js';

/**
 * The control the player "uses" to start a spin, mounted on the cabinet's
 * right flank.
 *
 * Why these exist: a pull lever rotates about an axis pointing into the
 * screen, so its arc has almost no on-screen curve to draw and has to be
 * faked with foreshortening. Every option below is chosen so its motion
 * lies in the image plane -- straight translation, or rotation about an axis
 * pointing at the viewer -- and can therefore be animated honestly.
 */
export interface Actuation {
  /** 0 (rest) to 1 (fully actuated), and springs back to 0 afterwards. */
  u: number;
  /**
   * Latches true once the reels are away and stays true. Controls whose state
   * should not spring back -- a swallowed coin, a lit lamp -- key off this
   * rather than `u`.
   */
  fired: boolean;
}

export interface Actuator {
  id: string;
  name: string;
  /** What it trades away, in one line. */
  note: string;
  draw(ctx: SKRSContext2D, region: Region, act: Actuation, s: Scene): void;
}

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

// ---------------------------------------------------------------------------

/** Riveted red flank matching the cabinet body, used as the backing plate. */
function flankPlate(ctx: SKRSContext2D, r: Region) {
  px(ctx, r.x, r.y, r.w, r.h, PAL.R);
  px(ctx, r.x, r.y, r.w, 3, PAL.r);
  px(ctx, r.x, r.y + r.h - 3, r.w, 3, PAL.r);
  px(ctx, r.x, r.y, 1, r.h, PAL.e);
  px(ctx, r.x + r.w - 1, r.y, 1, r.h, PAL.r);
  for (let ry = r.y + 10; ry < r.y + r.h - 8; ry += 14) {
    px(ctx, r.x + 3, ry, 1, 1, PAL.l);
    px(ctx, r.x + r.w - 4, ry, 1, 1, PAL.l);
  }
}

/**
 * Dark inset sub-panel on the red flank. Red controls washed out against the
 * red body, so anything red-bodied gets mounted on this instead.
 */
function inset(ctx: SKRSContext2D, r: Region, top: number, height: number) {
  px(ctx, r.x + 2, top, r.w - 4, height, PAL.k);
  px(ctx, r.x + 3, top + 1, r.w - 6, height - 2, PAL.d);
  px(ctx, r.x + 3, top + 1, r.w - 6, 1, PAL.g);
  px(ctx, r.x + 3, top + height - 2, r.w - 6, 1, PAL.k);
}

// --------------------------------------------------------------- 1. big dome
const domeButton: Actuator = {
  id: 'dome',
  name: 'Arcade dome button',
  note: 'Purely vertical press. Honest about the fact the player is clicking a Discord button.',
  draw(ctx, r, { u }) {
    flankPlate(ctx, r);
    const cy = r.cy;
    const press = Math.round(u * 2);
    inset(ctx, r, cy - 18, 36);

    // recessed collar the dome sits in
    disc(ctx, r.cx, cy + 1, 12, PAL.k);
    ring(ctx, r.cx, cy, 11, PAL.G, PAL.d);

    // lit rim while pressed
    if (u > 0.15) ring(ctx, r.cx, cy + press, 10, PAL.Y, PAL.d);

    disc(ctx, r.cx, cy + press, 9, u > 0.5 ? PAL.r : PAL.R);
    disc(ctx, r.cx, cy + press - 1, 7, u > 0.5 ? PAL.R : PAL.e);
    if (u < 0.4) {
      // specular cap, lost as the button goes down
      px(ctx, r.cx - 3, cy - 5, 4, 2, PAL.p);
      px(ctx, r.cx - 4, cy - 4, 2, 2, PAL.p);
    }
    pixelTextCentered(ctx, 'SPIN', r.cx, cy + press - 2, u > 0.5 ? PAL.l : PAL.r, 1, 1);
  },
};

// ------------------------------------------------------------ 2. button stack
const buttonStack: Actuator = {
  id: 'buttons',
  name: 'Cabinet button panel',
  note: 'Matches how real machines are actually operated. Room for BET / SPIN / MAX.',
  draw(ctx, r, { u }) {
    flankPlate(ctx, r);
    const labels: [string, string, string][] = [
      ['BET', PAL.y, PAL.Y],
      ['SPIN', PAL.R, PAL.e],
      ['MAX', PAL.u, PAL.U],
    ];
    labels.forEach(([text, dark, lightC], i) => {
      const by = r.y + 22 + i * 22;
      const isSpin = i === 1;
      const press = isSpin ? Math.round(u * 2) : 0;
      // socket
      px(ctx, r.cx - 10, by - 1, 20, 16, PAL.k);
      px(ctx, r.cx - 9, by, 18, 14, PAL.d);
      // keycap
      const lit = isSpin && u > 0.15;
      px(ctx, r.cx - 9, by + press, 18, 12, lit ? lightC : dark);
      px(ctx, r.cx - 9, by + press, 18, 1, lit ? PAL.F : lightC);
      px(ctx, r.cx - 9, by + press + 11, 18, 1, PAL.k);
      pixelTextCentered(ctx, text, r.cx, by + press + 4, lit ? PAL.k : PAL.l, 1, 1);
      if (lit) {
        px(ctx, r.cx - 11, by - 2, 22, 1, PAL.Y);
        px(ctx, r.cx - 11, by + 14, 22, 1, PAL.Y);
      }
    });
  },
};

// --------------------------------------------------------------- 3. crank
const crankWheel: Actuator = {
  id: 'crank',
  name: 'Hand crank',
  note: 'Rotates about an axis pointing at the viewer, so the arc is genuinely drawable -- no foreshortening trick.',
  draw(ctx, r, { u }, s) {
    flankPlate(ctx, r);
    const cy = r.cy;
    const R = 9;
    inset(ctx, r, cy - 18, 36);

    // The initial turn comes from the pull, then the crank freewheels with the
    // reels: driving it off the last reel's position means its rate matches
    // theirs exactly, so it spins up and slows to a stop along with them.
    const start = -Math.PI / 2;
    const freewheel = s.reels[2].pos * 0.22;
    const angle = start + u * Math.PI * 1.5 + freewheel;
    if (u > 0.05) {
      const steps = Math.round(u * 20);
      const sweepTo = start + u * Math.PI * 1.5;
      for (let i = 0; i <= steps; i++) {
        const a = start + (sweepTo - start) * (i / Math.max(1, steps));
        px(ctx, r.cx + Math.cos(a) * (R + 3), cy + Math.sin(a) * (R + 3), 1, 1, i % 2 ? PAL.o : PAL.Y);
      }
    }

    // wheel: dark face with a bright rim, so the spokes and knob read against it
    disc(ctx, r.cx, cy + 1, R + 1, PAL.k);
    disc(ctx, r.cx, cy, R, PAL.g);
    ring(ctx, r.cx, cy, R, PAL.W, PAL.g);

    // spokes, bright against the dark face
    for (let k = 0; k < 3; k++) {
      const a = angle + (k * Math.PI * 2) / 3;
      line(ctx, r.cx, cy, r.cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2), PAL.w);
    }
    disc(ctx, r.cx, cy, 2, PAL.k);

    // handle knob riding the rim -- traces a real circle on screen, no
    // foreshortening needed because the axis points at the viewer
    const hx = r.cx + Math.cos(angle) * R;
    const hy = cy + Math.sin(angle) * R;
    disc(ctx, hx, hy, 4, PAL.k);
    disc(ctx, hx, hy, 3, PAL.R);
    px(ctx, hx - 2, hy - 2, 2, 2, PAL.p);
  },
};

// ------------------------------------------------------------- 4. coin drop
const coinDrop: Actuator = {
  id: 'coin',
  name: 'Coin drop',
  note: 'Ties the actuation to the bet itself. Pure vertical fall, and thematically on the nose.',
  draw(ctx, r, { u, fired }, s) {
    flankPlate(ctx, r);
    // Slot plate sits low so the coin has visible room to fall above it.
    const plateY = r.y + 46;
    inset(ctx, r, plateY, 20);
    const mouthY = plateY + 7;
    px(ctx, r.cx - 6, mouthY, 12, 4, PAL.k);
    px(ctx, r.cx - 5, mouthY + 1, 10, 2, fired ? PAL.Y : PAL.g);
    pixelTextCentered(ctx, 'COIN', r.cx, plateY + 13, PAL.w, 1, 1);

    // Once swallowed the coin is gone -- keying this off `fired` rather than
    // `u` stops it flying back up when the pull springs back.
    if (fired) {
      if (!s.allStopped) {
        for (const [dx, dy] of [[-7, 1], [7, 0], [-4, 5], [5, 4], [0, 7]]) {
          px(ctx, r.cx + dx, mouthY + dy, 1, 1, PAL.l);
        }
      }
      return;
    }

    const fromY = r.y + 16;
    const coinY = fromY + (mouthY + 1 - fromY) * Math.min(1, u * 1.2);
    if (u > 0.12) {
      // fall streaks either side, sold by length rather than blur
      px(ctx, r.cx - 5, coinY - 9, 1, 6, PAL.o);
      px(ctx, r.cx + 5, coinY - 9, 1, 6, PAL.o);
    }
    disc(ctx, r.cx, coinY, 4, PAL.o);
    disc(ctx, r.cx, coinY, 3, PAL.Y);
    px(ctx, r.cx - 1, coinY - 2, 1, 4, PAL.l);
  },
};

// --------------------------------------------------------------- 5. pull bar
const pullBar: Actuator = {
  id: 'bar',
  name: 'Sliding grab bar',
  note: 'A chunky handle that travels straight down a track. Big target, unambiguous motion.',
  draw(ctx, r, { u }) {
    flankPlate(ctx, r);
    const trackTop = r.y + 20;
    const trackH = 56;
    // recessed track
    px(ctx, r.cx - 7, trackTop, 14, trackH, PAL.k);
    px(ctx, r.cx - 6, trackTop + 1, 12, trackH - 2, PAL.d);
    for (let ty = trackTop + 4; ty < trackTop + trackH - 4; ty += 6) {
      px(ctx, r.cx - 5, ty, 10, 1, PAL.g);
    }

    const travel = trackH - 22;
    const barY = trackTop + 3 + Math.round(u * travel);
    // shaft above the bar, revealing travel
    px(ctx, r.cx - 1, trackTop + 2, 1, barY - trackTop - 2, PAL.G);
    px(ctx, r.cx, trackTop + 2, 1, barY - trackTop - 2, PAL.w);

    // the grab bar itself
    px(ctx, r.cx - 9, barY, 18, 14, PAL.k);
    px(ctx, r.cx - 8, barY + 1, 16, 12, u > 0.5 ? PAL.r : PAL.R);
    px(ctx, r.cx - 8, barY + 1, 16, 2, u > 0.5 ? PAL.R : PAL.e);
    px(ctx, r.cx - 8, barY + 11, 16, 2, PAL.r);
    // knurling
    for (let gx = -6; gx <= 4; gx += 3) px(ctx, r.cx + gx, barY + 5, 1, 4, PAL.p);
    if (u > 0.9) px(ctx, r.cx - 11, barY + 16, 22, 1, PAL.Y);
  },
};

// ------------------------------------------------------------ 6. no actuator
const reactive: Actuator = {
  id: 'none',
  name: 'No handle (reactive cabinet)',
  note: 'The Discord button IS the lever. Nothing to animate wrong, and the widest cabinet.',
  draw(ctx, r, { u, fired }, s) {
    flankPlate(ctx, r);
    // A vent grille and a lamp, so the flank still has something to say
    // without pretending to be a control.
    const gy = r.y + 26;
    px(ctx, r.cx - 8, gy, 16, 30, PAL.k);
    for (let i = 0; i < 7; i++) {
      px(ctx, r.cx - 7, gy + 2 + i * 4, 14, 2, i % 2 === 0 ? PAL.d : PAL.g);
    }
    // Lamp stays lit for the whole spin rather than blinking with the pull.
    const spinning = fired && !s.allStopped;
    const lit = u > 0.2 || spinning;
    const lampY = r.y + 66;
    disc(ctx, r.cx, lampY, 6, PAL.k);
    disc(ctx, r.cx, lampY, 5, lit ? PAL.Y : PAL.o);
    if (lit) {
      disc(ctx, r.cx, lampY, 3, PAL.l);
      for (const [dx, dy] of [[-8, 0], [8, 0], [0, -8], [0, 8]]) {
        px(ctx, r.cx + dx, lampY + dy, 1, 1, PAL.Y);
      }
    }
  },
};

export const ACTUATORS: Actuator[] = [domeButton, buttonStack, crankWheel, coinDrop, pullBar, reactive];

export const ACTUATOR_BY_ID: Record<string, Actuator> = Object.fromEntries(
  ACTUATORS.map((a) => [a.id, a]),
);
