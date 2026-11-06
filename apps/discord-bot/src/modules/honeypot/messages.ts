import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  User,
  GuildMember,
} from 'discord.js';
import { HoneypotAction } from '@claimboard/database';
import { HONEYPOT_EMOJI, HONEYPOT_THUMBNAIL_URL } from './constants';

export const defaultHoneypotWarningMessage =
  '## DO NOT SEND MESSAGES IN THIS CHANNEL\n\nThis channel is used to catch spam bots. Any messages sent here will result in **{{action:text}}**.';

export const defaultHoneypotUserDMMessage =
  '## Honeypot Triggered\n\nHey {{user:mention}}, you have been **{{action:text}}** from **{{server:name}}** for sending a message in the [honeypot]({{honeypot:channel:link}}) channel.\n\nThis may have happened if someone gained access to your account through malware, stolen sessions or leaked passwords. Please [recover your account](https://honeypot.riskymh.dev/blog/discord-account-hacked-recovery), scan your device and reinstall your OS if needed.';

export const defaultHoneypotUserDMMessageReinvitePart = '\n\nYou can rejoin via {{reinvite:link}}';

export const defaultLogActionMessage =
  '{{user:mention}} was {{action:text}} for triggering the honeypot in {{honeypot:channel:mention}}\n-# User ID: `{{user:id}}` • Created: {{user:created}} • Joined: {{member:joined}}';

export function getActionTextMap(action: HoneypotAction) {
  switch (action) {
    case 'ban':
      return { text: 'an immediate ban', label: 'Bans', past: 'banned' };
    case 'softban':
      return { text: 'a softban (kick)', label: 'Kicks', past: 'kicked' };
    case 'disabled':
      return { text: 'no action (honeypot is disabled)', label: 'Triggers', past: 'triggered (disabled)' };
    default:
      return { text: 'a softban (kick)', label: 'Kicks', past: 'kicked' };
  }
}

export function formatDiscordDateMention(date: Date | number): string {
  const ts = typeof date === 'number' ? Math.floor(date / 1000) : Math.floor(date.getTime() / 1000);
  return `<t:${ts}:R>`;
}

export function honeypotWarningMessage(
  moderatedCount: number = 0,
  action: HoneypotAction = 'softban',
  customText?: string | null
) {
  const { text: actionText, label: labelText } = getActionTextMap(action);

  const description = (customText || defaultHoneypotWarningMessage).replace(
    /\{\{action(:text)?\}\}/g,
    actionText
  );

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setThumbnail(HONEYPOT_THUMBNAIL_URL)
    .setDescription(description)
    .setFooter({ text: 'ClaimBoard Honeypot Protection' });

  const countButton = new ButtonBuilder()
    .setCustomId('moderated_count_button')
    .setLabel(`${labelText}: ${moderatedCount.toLocaleString()}`)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(HONEYPOT_EMOJI);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(countButton);

  return {
    embeds: [embed],
    components: [row],
  };
}

export function honeypotUserDMMessage(
  userId: string,
  action: HoneypotAction,
  guildName: string,
  discoverableLink: string | undefined,
  channelLink: string,
  reinviteUrl: string | null,
  isAdmin: boolean = false,
  customText?: string | null
) {
  const { past: actionPast } = getActionTextMap(action);

  let body = customText || defaultHoneypotUserDMMessage;
  if (reinviteUrl && !customText) {
    body += defaultHoneypotUserDMMessageReinvitePart;
  }

  const formatted = body
    .replace(/\{\{action(:text)?\}\}/g, actionPast)
    .replace(/\{\{server:name:?\}\}/g, guildName)
    .replace(
      /\{\{server:name:linked\}\}/g,
      discoverableLink ? `[${guildName}](${discoverableLink})` : guildName
    )
    .replace(/\{\{honeypot:channel:link\}\}/g, channelLink)
    .replace(/\{\{server:public-link\}\}/g, discoverableLink || 'https://discord.com/servers')
    .replace(/\{\{reinvite:link\}\}/g, reinviteUrl || '*<invite link not available>*')
    .replace(/\{\{user:mention\}\}/g, `<@${userId}>`);

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle('🍯 Honeypot Triggered')
    .setThumbnail(HONEYPOT_THUMBNAIL_URL)
    .setDescription(formatted)
    .setFooter({
      text: `Automated message sent on behalf of ${guildName}. Replies are not monitored.`,
    });

  if (isAdmin) {
    embed.addFields({
      name: '⚠️ Admin Notice',
      value: 'This is an example preview/notice: as a server admin you cannot be banned/kicked.',
    });
  }

  return {
    embeds: [embed],
  };
}

export function logActionMessage(
  user: User | { id: string; username?: string; globalName?: string | null; createdAt?: Date },
  member: GuildMember | null,
  channelId: string,
  action: HoneypotAction,
  customText?: string | null,
  moderatedCount: number = 0
) {
  const { past: actionPast } = getActionTextMap(action);
  const mention = `<@${user.id}>`;
  const channelMention = `<#${channelId}>`;

  const userCreated = user.createdAt
    ? formatDiscordDateMention(user.createdAt)
    : '*unknown*';
  const memberJoined = member?.joinedAt
    ? formatDiscordDateMention(member.joinedAt)
    : '*unknown*';

  const replacements: Record<string, string> = {
    'user:id': user.id,
    user: mention,
    'user:ping': mention,
    'user:mention': mention,
    'user:name': user.username || user.id,
    'user:global-name': user.globalName || user.username || user.id,
    'user:created': userCreated,
    'member:name': member?.nickname || user.username || '*none*',
    'member:nickname': member?.nickname || '*none*',
    'member:joined': memberJoined,
    'member:roles': member?.roles?.cache?.size
      ? member.roles.cache.map((r) => `<@&${r.id}>`).join(', ')
      : '*none*',
    action: actionPast,
    'action:text': actionPast,
    'honeypot:channel': channelMention,
    'honeypot:channel:mention': channelMention,
    'honeypot:channel:ping': channelMention,
    'honeypot:moderation-count': moderatedCount.toLocaleString(),
  };

  const text = (customText || defaultLogActionMessage).replace(
    /\{\{([^}]+)\}\}/g,
    (_, key) => replacements[key] || `{{${key}}}`
  );

  const embed = new EmbedBuilder()
    .setColor(action === 'ban' ? 0xef4444 : 0xf59e0b)
    .setTitle(`🍯 Honeypot Catch #${moderatedCount}`)
    .setDescription(text)
    .setTimestamp();

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (action === 'ban') {
    const unbanButton = new ButtonBuilder()
      .setCustomId(`unban:${user.id}`)
      .setLabel('Unban User')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔓');

    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(unbanButton));
  }

  return {
    embeds: [embed],
    components,
  };
}

export function statsMessage(
  globalStatsText: string,
  serverStatsText: string | null,
  userStatsText: string | null
) {
  const introEmbed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle('🍯 What is a Honeypot?')
    .setDescription(
      'A **honeypot** is a channel used to detect unwanted activity.\n\n' +
        'ClaimBoard watches designated honeypot channels that are visible to members but not intended for normal conversation. Spam bots and compromised user accounts frequently post spam messages to them.\n\n' +
        'When a message is sent to a honeypot channel, the bot automatically removes the compromised account by kicking (softban) or banning them.'
    );

  const statsEmbed = new EmbedBuilder()
    .setColor(0x10b981)
    .setThumbnail(HONEYPOT_THUMBNAIL_URL)
    .setTitle('📊 Honeypot Statistics');

  if (serverStatsText) {
    statsEmbed.addFields({
      name: 'Server Statistics',
      value: serverStatsText,
      inline: false,
    });
  } else if (userStatsText) {
    statsEmbed.addFields({
      name: 'User Statistics',
      value: userStatsText,
      inline: false,
    });
  }

  statsEmbed.addFields({
    name: 'Global Network Statistics',
    value: globalStatsText,
    inline: false,
  });

  const funMessages = [
    'Apparently, there is still plenty of spam to catch.',
    "That's a lot of spam messages caught so far.",
    'There is, unfortunately, no shortage of spam.',
    'Somehow, people are still finding the honeypot.',
  ];
  statsEmbed.setFooter({
    text: funMessages[Math.floor(Math.random() * funMessages.length)],
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Documentation')
      .setStyle(ButtonStyle.Link)
      .setURL('https://honeypot.riskymh.dev/docs'),
    new ButtonBuilder()
      .setLabel('Live Stats')
      .setStyle(ButtonStyle.Link)
      .setURL('https://honeypot.riskymh.dev/#stats')
  );

  return {
    embeds: [introEmbed, statsEmbed],
    components: [row],
  };
}
