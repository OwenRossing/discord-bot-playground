import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { JACKPOT_RATE, JACKPOT_SEED, type SpinOutcome } from './engine.js';
import { newSeedPair, type SeedPair } from './fairness.js';

/**
 * Flat-file persistence. A Discord toy has a few thousand rows at most and a
 * single writer, so a JSON document held in memory and flushed on change is
 * enough -- SQLite would buy transactions we never need.
 *
 * The whole document is rewritten on every save, via a temp file and a rename,
 * so a crash mid-write leaves the previous good file rather than a truncated
 * one.
 */

export const STARTING_BALANCE = 1000;
export const DAILY_AMOUNT = 500;
export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const SCHEMA_VERSION = 1;

export interface UserStats {
  spins: number;
  wagered: number;
  won: number;
  biggestWin: number;
  jackpots: number;
  /**
   * Credits an admin created out of nothing, tracked separately from winnings.
   * The spins themselves are provably fair, so a balance that silently mixes
   * minted credits with earned ones would make the leaderboard the one part of
   * the machine nobody can check.
   */
  granted: number;
}

export interface AuditEntry {
  at: number;
  /** Discord id of the admin who did it. */
  by: string;
  action: 'grant' | 'deduct' | 'reset' | 'jackpot';
  /** Who it was done to, absent for pool-level actions. */
  target?: string;
  amount: number;
  balanceAfter: number;
  reason?: string;
}

/** A seed pair that has been retired, and so may safely be revealed. */
export interface RetiredSeed {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  /** How many spins were played on this pair; nonces run 0..spins-1. */
  spins: number;
  retiredAt: number;
}

export interface UserRecord {
  id: string;
  balance: number;
  seeds: SeedPair;
  retired: RetiredSeed[];
  lastDailyAt: number | null;
  stats: UserStats;
  createdAt: number;
}

interface StoreData {
  version: number;
  jackpot: number;
  /**
   * Sub-credit remainder of the jackpot rake, carried between spins. Flooring
   * each contribution on its own would drop the rake entirely for any bet
   * below 1/JACKPOT_RATE, so a table of 25-credit players would never grow the
   * pool at all.
   */
  jackpotFraction: number;
  users: Record<string, UserRecord>;
  /** Newest last. Trimmed to the most recent entries. */
  audit: AuditEntry[];
}

const AUDIT_LIMIT = 500;

const emptyStats = (): UserStats => ({
  spins: 0,
  wagered: 0,
  won: 0,
  biggestWin: 0,
  jackpots: 0,
  granted: 0,
});

export class Store {
  private data: StoreData;
  private dirty = false;
  private flushing: Promise<void> | null = null;

  constructor(private readonly file = join(process.cwd(), 'data', 'store.json')) {
    this.data = this.load();
  }

  private load(): StoreData {
    if (!existsSync(this.file)) {
      return { version: SCHEMA_VERSION, jackpot: JACKPOT_SEED, jackpotFraction: 0, users: {}, audit: [] };
    }
    const raw = JSON.parse(readFileSync(this.file, 'utf8')) as StoreData;
    if (raw.version !== SCHEMA_VERSION) {
      throw new Error(`store schema ${raw.version} != ${SCHEMA_VERSION}; migrate before starting`);
    }
    raw.jackpotFraction ??= 0;
    raw.audit ??= [];
    for (const u of Object.values(raw.users)) u.stats.granted ??= 0;
    return raw;
  }

  /**
   * Serialised so two overlapping saves cannot interleave their writes; the
   * later one simply re-runs after the earlier finishes, picking up whatever
   * state exists by then.
   */
  save(): Promise<void> {
    this.dirty = true;
    if (this.flushing) return this.flushing;
    this.flushing = Promise.resolve().then(() => {
      while (this.dirty) {
        this.dirty = false;
        mkdirSync(dirname(this.file), { recursive: true });
        const tmp = `${this.file}.tmp`;
        writeFileSync(tmp, JSON.stringify(this.data, null, 2));
        renameSync(tmp, this.file);
      }
      this.flushing = null;
    });
    return this.flushing;
  }

  get jackpot(): number {
    return this.data.jackpot;
  }

  user(id: string): UserRecord {
    let u = this.data.users[id];
    if (!u) {
      u = {
        id,
        balance: STARTING_BALANCE,
        seeds: newSeedPair(),
        retired: [],
        lastDailyAt: null,
        stats: emptyStats(),
        createdAt: Date.now(),
      };
      this.data.users[id] = u;
      this.save();
    }
    return u;
  }

  /**
   * Takes the stake and rakes its jackpot share before the reels are drawn, so
   * a player who hits the jackpot on this very spin has already contributed to
   * the pool they win -- which is how a real progressive behaves.
   */
  placeBet(id: string, bet: number): { ok: false; reason: string } | { ok: true; nonce: number } {
    const u = this.user(id);
    if (!Number.isInteger(bet) || bet <= 0) return { ok: false, reason: 'Bet must be a whole number above zero.' };
    if (bet > u.balance) return { ok: false, reason: `You only have ${u.balance} credits.` };
    u.balance -= bet;
    const rake = bet * JACKPOT_RATE + this.data.jackpotFraction;
    this.data.jackpot += Math.floor(rake);
    this.data.jackpotFraction = rake - Math.floor(rake);
    const nonce = u.seeds.nonce;
    u.seeds.nonce += 1;
    this.save();
    return { ok: true, nonce };
  }

  /** Credits a resolved spin and folds it into the player's lifetime stats. */
  settle(id: string, outcome: SpinOutcome): UserRecord {
    const u = this.user(id);
    u.balance += outcome.payout;
    u.stats.spins += 1;
    u.stats.wagered += outcome.bet;
    u.stats.won += outcome.payout;
    u.stats.biggestWin = Math.max(u.stats.biggestWin, outcome.payout);
    if (outcome.jackpotWon) {
      u.stats.jackpots += 1;
      this.data.jackpot = JACKPOT_SEED;
    }
    this.save();
    return u;
  }

  claimDaily(id: string): { ok: false; nextAt: number } | { ok: true; amount: number; balance: number } {
    const u = this.user(id);
    const now = Date.now();
    if (u.lastDailyAt !== null && now - u.lastDailyAt < DAILY_COOLDOWN_MS) {
      return { ok: false, nextAt: u.lastDailyAt + DAILY_COOLDOWN_MS };
    }
    u.lastDailyAt = now;
    u.balance += DAILY_AMOUNT;
    this.save();
    return { ok: true, amount: DAILY_AMOUNT, balance: u.balance };
  }

  /**
   * Retires the active seed pair and issues a new one. This is the only path
   * that reveals a server seed: everything played on the old pair becomes
   * checkable, and nothing played on the new one is, since its seed stays
   * secret until it is retired in turn.
   */
  rotateSeeds(id: string, clientSeed?: string): { revealed: RetiredSeed; next: SeedPair } {
    const u = this.user(id);
    const revealed: RetiredSeed = {
      serverSeed: u.seeds.serverSeed,
      serverSeedHash: u.seeds.serverSeedHash,
      clientSeed: u.seeds.clientSeed,
      spins: u.seeds.nonce,
      retiredAt: Date.now(),
    };
    u.retired.push(revealed);
    // Only the most recent pairs are worth keeping; the commitment for older
    // ones was published at the time and players who cared have already checked.
    if (u.retired.length > 10) u.retired.splice(0, u.retired.length - 10);
    u.seeds = newSeedPair(clientSeed);
    this.save();
    return { revealed, next: u.seeds };
  }

  /**
   * Credit or debit a balance directly. Every call is recorded, and grants add
   * to the user's `granted` total so earned credits stay distinguishable from
   * minted ones -- an admin can move any number they like, but not invisibly.
   */
  adjust(
    by: string,
    target: string,
    amount: number,
    reason?: string,
  ): { ok: false; reason: string } | { ok: true; entry: AuditEntry } {
    if (!Number.isInteger(amount) || amount === 0) {
      return { ok: false, reason: 'Amount must be a non-zero whole number.' };
    }
    const u = this.user(target);
    if (u.balance + amount < 0) {
      return { ok: false, reason: `That would take ${target} below zero (balance ${u.balance}).` };
    }
    u.balance += amount;
    if (amount > 0) u.stats.granted += amount;
    return { ok: true, entry: this.record({ by, action: amount > 0 ? 'grant' : 'deduct', target, amount, balanceAfter: u.balance, reason }) };
  }

  /** Wipes a player back to a fresh start, keeping their audit history. */
  resetUser(by: string, target: string, reason?: string): AuditEntry {
    const u = this.user(target);
    u.balance = STARTING_BALANCE;
    u.stats = emptyStats();
    u.lastDailyAt = null;
    return this.record({ by, action: 'reset', target, amount: STARTING_BALANCE, balanceAfter: u.balance, reason });
  }

  setJackpot(by: string, value: number, reason?: string): { ok: false; reason: string } | { ok: true; entry: AuditEntry } {
    if (!Number.isInteger(value) || value < 0) return { ok: false, reason: 'Jackpot must be a whole number of credits, zero or more.' };
    this.data.jackpot = value;
    return { ok: true, entry: this.record({ by, action: 'jackpot', amount: value, balanceAfter: value, reason }) };
  }

  private record(entry: Omit<AuditEntry, 'at'>): AuditEntry {
    const full: AuditEntry = { at: Date.now(), ...entry };
    this.data.audit.push(full);
    if (this.data.audit.length > AUDIT_LIMIT) {
      this.data.audit.splice(0, this.data.audit.length - AUDIT_LIMIT);
    }
    this.save();
    return full;
  }

  auditLog(limit = 50): AuditEntry[] {
    return this.data.audit.slice(-limit).reverse();
  }

  allUsers(): UserRecord[] {
    return Object.values(this.data.users);
  }

  leaderboard(limit = 10): UserRecord[] {
    return Object.values(this.data.users)
      .filter((u) => u.stats.spins > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, limit);
  }
}
