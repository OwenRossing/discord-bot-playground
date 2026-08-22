import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type InteractionReplyOptions,
} from 'discord.js';
import type { CommandResult, ResultButton } from '../core/results.js';
import type { Theme } from '../render/types.js';

const STYLES: Record<ResultButton['style'], ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  danger: ButtonStyle.Danger,
};

/** Maps a Discord-agnostic CommandResult onto Discord's message shape. */
export function toReply(theme: Theme, r: CommandResult): InteractionReplyOptions {
  const embed = new EmbedBuilder().setColor(theme.colors[r.accent ?? 'idle']).setTitle(r.title);
  if (r.description) embed.setDescription(r.description);
  if (r.fields?.length) embed.addFields(r.fields);
  if (r.footer) embed.setFooter({ text: r.footer });
  if (r.image) embed.setImage(`attachment://${r.image.name}`);

  const reply: InteractionReplyOptions = { embeds: [embed] };
  if (r.image) reply.files = [new AttachmentBuilder(r.image.data, { name: r.image.name })];
  if (r.buttons?.length) {
    reply.components = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        r.buttons.map((b) => {
          const btn = new ButtonBuilder().setCustomId(b.id).setLabel(b.label).setStyle(STYLES[b.style]);
          if (b.emoji) btn.setEmoji(b.emoji);
          return btn;
        }),
      ),
    ];
  }
  if (r.ephemeral) reply.flags = MessageFlags.Ephemeral;
  if (r.silenceMentions) reply.allowedMentions = { parse: [] };
  return reply;
}
