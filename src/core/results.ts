/**
 * What a command produced, described without reference to Discord.
 *
 * The bot and the local web UI both render these: the bot maps them onto
 * EmbedBuilder, the mock onto HTML. Keeping the command logic ignorant of
 * either means the two surfaces cannot drift apart -- a bug fixed for one is
 * fixed for both, and the mock is a real test of the bot rather than a
 * parallel implementation of it.
 */

export interface ResultField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface ResultButton {
  id: string;
  label: string;
  style: 'primary' | 'secondary' | 'danger';
  emoji?: string;
}

/** Which of the theme's accent colours this result should carry. */
export type Accent = 'idle' | 'win' | 'jackpot' | 'lose';

export interface CommandResult {
  title: string;
  description?: string;
  fields?: ResultField[];
  accent?: Accent;
  /** Footer line, used for the fairness commitment on spins. */
  footer?: string;
  /** An attached image, named so the renderer can reference it. */
  image?: { name: string; data: Buffer; contentType: string };
  buttons?: ResultButton[];
  /** Only the invoking user should see this. */
  ephemeral?: boolean;
  /** Suppress user/role pings when the body contains mentions. */
  silenceMentions?: boolean;
}

/** A command that failed a precondition -- bad bet, cooldown, missing rights. */
export function problem(title: string, description?: string): CommandResult {
  return { title, description, accent: 'lose', ephemeral: true };
}

export interface Caller {
  id: string;
  /** Display name, for stats titles. */
  name: string;
}
