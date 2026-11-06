import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
  ChatInputCommandInteraction,
  ButtonInteraction,
  AnySelectMenuInteraction,
  ModalSubmitInteraction,
  TextChannel,
} from 'discord.js';
import {
  HoneypotConfigModel,
  upsertHoneypotConfig,
  getHoneypotConfig,
  setHoneypotChannels,
  unsetHoneypotChannel,
  logHoneypotEvent,
  getHoneypotModeratedCount,
  getHoneypotGuildStats,
  getHoneypotGlobalStats,
  getRecentHoneypotModerationCount,
  getUserHoneypotModeratedCount,
  getHoneypotMessages,
  setHoneypotMessages,
  HoneypotAction,
  HoneypotExperiment,
} from '@claimboard/database';
import { BotModule, BotCommand, CommandContext } from '../../core/types';
import {
  honeypotWarningMessage,
  honeypotUserDMMessage,
  logActionMessage,
  statsMessage,
  defaultHoneypotWarningMessage,
  defaultHoneypotUserDMMessage,
  defaultLogActionMessage,
  getActionTextMap,
} from './messages';
import { updateChannelWarningMessage, handleHoneypotMessage, handleChannelDelete, handleGuildDelete } from './handler';
import { containsBadWord, HONEYPOT_EMOJI, HONEYPOT_THUMBNAIL_URL } from './constants';

export { handleHoneypotMessage, handleChannelDelete, handleGuildDelete };

// Builds the interactive Honeypot Dashboard components
export async function buildHoneypotDashboard(guildId: string) {
  const config = await getHoneypotConfig(guildId);
  const channels = config?.channels || [];
  const action = config?.action || 'softban';
  const experiments = config?.experiments || [];
  const logChannelId = config?.logChannelId;
  const count = await getHoneypotModeratedCount(guildId);

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle('🍯 Honeypot Configuration Dashboard')
    .setThumbnail(HONEYPOT_THUMBNAIL_URL)
    .setDescription(
      'Configure honeypot trap channels, moderation actions, logging, and experimental protection features.'
    )
    .addFields(
      {
        name: `Honeypot Channel${channels.length > 1 ? 's' : ''}`,
        value:
          channels.length > 0
            ? channels.map((c) => `<#${c.channelId}>`).join(', ')
            : '*None configured yet. Select one below.*',
        inline: true,
      },
      {
        name: 'Log Channel',
        value: logChannelId ? `<#${logChannelId}>` : '*Not set*',
        inline: true,
      },
      {
        name: 'Action',
        value: `**${getActionTextMap(action).label}** (${action})`,
        inline: true,
      },
      {
        name: 'Active Experiments',
        value:
          experiments.length > 0
            ? experiments.map((e) => `\`${e}\``).join(', ')
            : '*None enabled*',
        inline: false,
      },
      {
        name: 'Total Caught in this Server',
        value: `**${count.toLocaleString()}** spam bot(s)`,
        inline: false,
      }
    )
    .setFooter({ text: 'ClaimBoard Honeypot • Select an option below to update settings' });

  // 1. Channel Select for Honeypot Channels
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('honeypot_channel_select')
    .setPlaceholder('Select Honeypot trap channel')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(experiments.includes('many-honeypots') ? 10 : 1);

  // 2. Channel Select for Log Channel
  const logSelect = new ChannelSelectMenuBuilder()
    .setCustomId('honeypot_log_select')
    .setPlaceholder('Select moderation log channel')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread)
    .setMinValues(0)
    .setMaxValues(1);

  // 3. String Select for Action
  const actionSelect = new StringSelectMenuBuilder()
    .setCustomId('honeypot_action_select')
    .setPlaceholder('Select moderation action')
    .addOptions([
      {
        label: 'Softban (Kick)',
        value: 'softban',
        description: 'Bans & unbans to delete last 1hr of messages (recommended)',
        default: action === 'softban',
        emoji: '👢',
      },
      {
        label: 'Permanent Ban',
        value: 'ban',
        description: 'Permanently bans user and deletes last 1hr of messages',
        default: action === 'ban',
        emoji: '🔨',
      },
      {
        label: 'Disabled',
        value: 'disabled',
        description: 'Logs only; does not kick or ban',
        default: action === 'disabled',
        emoji: '⏸️',
      },
    ]);

  // 4. Experiments Select
  const experimentOptions = [
    {
      label: '💡 Reinvite',
      value: 'reinvite',
      description: 'In the DM message give an invite code to rejoin (recommended)',
      default: experiments.includes('reinvite'),
    },
    {
      label: 'Forward Message',
      value: 'forward-message',
      description: 'Forward the triggered spam message to the log channel',
      default: experiments.includes('forward-message'),
    },
    {
      label: 'Timeout First',
      value: 'timeout-first',
      description: 'Timeout users (1hr) before action',
      default: experiments.includes('timeout-first'),
    },
    {
      label: '💡 Only Recent Delete',
      value: 'only-recent-delete',
      description: 'Only delete last 15min of messages (instead of 1hr)',
      default: experiments.includes('only-recent-delete'),
    },
    {
      label: 'No Warning Msg',
      value: 'no-warning-msg',
      description: 'Do not post warning message in the honeypot channel',
      default: experiments.includes('no-warning-msg'),
    },
    {
      label: 'No DM',
      value: 'no-dm',
      description: 'Do not DM user when they trigger honeypot',
      default: experiments.includes('no-dm'),
    },
    {
      label: '💡 Many Honeypots',
      value: 'many-honeypots',
      description: 'Allow selecting up to 10 honeypot trap channels',
      default: experiments.includes('many-honeypots'),
    },
    {
      label: 'Ensure Message Delete',
      value: 'ensure-msg-delete',
      description: 'Immediately delete triggering spam message',
      default: experiments.includes('ensure-msg-delete'),
    },
  ];

  const experimentsSelect = new StringSelectMenuBuilder()
    .setCustomId('honeypot_experiments_select')
    .setPlaceholder('Toggle protection experiments')
    .setMinValues(0)
    .setMaxValues(experimentOptions.length)
    .addOptions(experimentOptions);

  // 5. Buttons
  const buttonsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('honeypot_refresh')
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔄'),
    new ButtonBuilder()
      .setCustomId('honeypot_messages_prompt')
      .setLabel('Custom Messages (/honeypot-messages)')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📝')
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(logSelect),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(actionSelect),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(experimentsSelect),
      buttonsRow,
    ],
  };
}

// -------------------------------------------------------------
// 1. /honeypot command
// -------------------------------------------------------------
const honeypotCommandData = new SlashCommandBuilder()
  .setName('honeypot')
  .setDescription('Configure/setup the honeypot channel and its settings')
  .setDefaultMemberPermissions(
    PermissionFlagsBits.ManageGuild |
      PermissionFlagsBits.BanMembers |
      PermissionFlagsBits.ManageMessages |
      PermissionFlagsBits.ManageChannels
  )
  .addSubcommand((sub) =>
    sub.setName('setup').setDescription('Open the interactive honeypot configuration dashboard')
  )
  .addSubcommand((sub) =>
    sub.setName('status').setDescription('View current honeypot channels, actions, and statistics')
  )
  .addSubcommand((sub) =>
    sub
      .setName('channel')
      .setDescription('Add or remove a honeypot trap channel')
      .addStringOption((opt) =>
        opt
          .setName('action')
          .setDescription('Add or remove channel')
          .setRequired(true)
          .addChoices(
            { name: 'Add Trap Channel', value: 'add' },
            { name: 'Remove Trap Channel', value: 'remove' },
            { name: 'List Trap Channels', value: 'list' }
          )
      )
      .addChannelOption((opt) =>
        opt.setName('target').setDescription('The channel to add or remove').setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('log')
      .setDescription('Set or clear the moderation log channel')
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('Channel to send honeypot ban/kick logs').setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('action')
      .setDescription('Set moderation action when honeypot is triggered')
      .addStringOption((opt) =>
        opt
          .setName('type')
          .setDescription('Action to take')
          .setRequired(true)
          .addChoices(
            { name: 'Softban (Kick and delete 1hr messages)', value: 'softban' },
            { name: 'Permanent Ban', value: 'ban' },
            { name: 'Disabled (Log only, no moderation)', value: 'disabled' }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('experiment')
      .setDescription('Toggle experimental features')
      .addStringOption((opt) =>
        opt
          .setName('feature')
          .setDescription('Experiment to toggle')
          .setRequired(true)
          .addChoices(
            { name: 'Reinvite Link in DM', value: 'reinvite' },
            { name: 'Forward Message to Log', value: 'forward-message' },
            { name: 'Timeout First (1hr)', value: 'timeout-first' },
            { name: 'Only Recent Delete (15m instead of 1hr)', value: 'only-recent-delete' },
            { name: 'No DM to User', value: 'no-dm' },
            { name: 'No Warning Msg in Honeypot Channel', value: 'no-warning-msg' },
            { name: 'Many Honeypots (multiple trap channels)', value: 'many-honeypots' },
            { name: 'Ensure Message Deletion', value: 'ensure-msg-delete' }
          )
      )
      .addBooleanOption((opt) =>
        opt.setName('enabled').setDescription('Enable or disable this experiment').setRequired(true)
      )
  );

export const honeypotCommand: BotCommand = {
  name: 'honeypot',
  description: 'Configure/setup the honeypot channel and its settings',
  data: honeypotCommandData,
  execute: async ({ interaction }) => {
    if (!interaction.guild || !interaction.guildId) {
      await interaction.reply({
        content: '❌ The `/honeypot` command can only be used inside a Discord server.',
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand(false) || 'setup';

    if (subcommand === 'setup' || subcommand === 'status') {
      const dashboard = await buildHoneypotDashboard(interaction.guildId);
      await interaction.reply({
        ...dashboard,
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'channel') {
      const act = interaction.options.getString('action', true);
      const targetChannel = interaction.options.getChannel('target');
      const config = (await getHoneypotConfig(interaction.guildId)) || {
        guildId: interaction.guildId,
        channels: [],
        action: 'softban',
        experiments: [],
        warningMessage: null,
      };

      if (act === 'list') {
        const listText =
          config.channels && config.channels.length > 0
            ? config.channels.map((c) => `• <#${c.channelId}>`).join('\n')
            : '*No honeypot channels configured.*';
        await interaction.reply({
          content: `🍯 **Honeypot Trap Channels:**\n${listText}`,
          ephemeral: true,
        });
        return;
      }

      if (!targetChannel) {
        await interaction.reply({
          content: '❌ You must specify a target channel to add or remove.',
          ephemeral: true,
        });
        return;
      }

      if (act === 'add') {
        const exists = config.channels.some((c) => c.channelId === targetChannel.id);
        if (exists) {
          await interaction.reply({
            content: `ℹ️ <#${targetChannel.id}> is already registered as a honeypot trap channel.`,
            ephemeral: true,
          });
          return;
        }

        const count = await getHoneypotModeratedCount(interaction.guildId, targetChannel.id);
        const postedMsgId = await updateChannelWarningMessage(
          interaction.guild,
          targetChannel.id,
          null,
          count,
          config.action as any,
          config.warningMessage
        );

        const updatedChannels = [
          ...config.channels,
          { channelId: targetChannel.id, msgId: postedMsgId },
        ];
        await upsertHoneypotConfig(interaction.guildId, { channels: updatedChannels });

        await interaction.reply({
          content: `✅ Added <#${targetChannel.id}> as a Honeypot trap channel! Anyone who sends a message here will be moderated.`,
          ephemeral: true,
        });
        return;
      }

      if (act === 'remove') {
        await unsetHoneypotChannel(interaction.guildId, targetChannel.id);
        await interaction.reply({
          content: `✅ Removed <#${targetChannel.id}> from Honeypot trap channels.`,
          ephemeral: true,
        });
        return;
      }
    }

    if (subcommand === 'log') {
      const logChannel = interaction.options.getChannel('channel');
      if (logChannel) {
        await upsertHoneypotConfig(interaction.guildId, { logChannelId: logChannel.id });
        await interaction.reply({
          content: `✅ Honeypot moderation events will now be logged to <#${logChannel.id}>.`,
          ephemeral: true,
        });
      } else {
        await upsertHoneypotConfig(interaction.guildId, { logChannelId: null });
        await interaction.reply({
          content: '✅ Honeypot moderation log channel has been cleared.',
          ephemeral: true,
        });
      }
      return;
    }

    if (subcommand === 'action') {
      const actionType = interaction.options.getString('type', true) as HoneypotAction;
      await upsertHoneypotConfig(interaction.guildId, { action: actionType });
      await interaction.reply({
        content: `✅ Honeypot action updated to **${getActionTextMap(actionType).label}**.`,
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'experiment') {
      const feature = interaction.options.getString('feature', true) as HoneypotExperiment;
      const enabled = interaction.options.getBoolean('enabled', true);
      const config = await getHoneypotConfig(interaction.guildId);
      const current = new Set<HoneypotExperiment>(config?.experiments || []);

      if (enabled) {
        current.add(feature);
        if (feature === 'reinvite' && interaction.guild) {
          try {
            const firstChannelId = config?.channels?.[0]?.channelId;
            if (firstChannelId) {
              const invite = await interaction.guild.invites.create(firstChannelId, {
                maxAge: 0,
                maxUses: 0,
                reason: 'Honeypot reinvite experiment',
              });
              await upsertHoneypotConfig(interaction.guildId, { reinviteInvite: invite.code });
            }
          } catch (invErr) {
            console.warn('[Honeypot] Could not create reinvite invite:', invErr);
          }
        }
      } else {
        current.delete(feature);
      }

      await upsertHoneypotConfig(interaction.guildId, { experiments: Array.from(current) });
      await interaction.reply({
        content: `✅ Experiment \`${feature}\` has been **${enabled ? 'enabled' : 'disabled'}**.`,
        ephemeral: true,
      });
      return;
    }
  },

  handleSelect: async (interaction: AnySelectMenuInteraction) => {
    if (!interaction.guild || !interaction.guildId) return;
    const guildId = interaction.guildId;

    if (interaction.customId === 'honeypot_channel_select') {
      await interaction.deferUpdate();
      const selected = interaction.values;
      const config = await getHoneypotConfig(guildId);
      const newChannels: { channelId: string; msgId?: string | null }[] = [];

      for (const channelId of selected) {
        const existingEntry = config?.channels?.find((c) => c.channelId === channelId);
        const count = await getHoneypotModeratedCount(guildId, channelId);
        const msgId = await updateChannelWarningMessage(
          interaction.guild,
          channelId,
          existingEntry?.msgId,
          count,
          (config?.action as any) || 'softban',
          config?.warningMessage
        );
        newChannels.push({ channelId, msgId });
      }

      await setHoneypotChannels(guildId, newChannels);
      const dashboard = await buildHoneypotDashboard(guildId);
      await interaction.editReply(dashboard);
      return;
    }

    if (interaction.customId === 'honeypot_log_select') {
      await interaction.deferUpdate();
      const logChannelId = interaction.values[0] || null;
      await upsertHoneypotConfig(guildId, { logChannelId });

      if (logChannelId) {
        const ch = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
        if (ch && ch.isTextBased()) {
          await (ch as TextChannel)
            .send('🍯 **ClaimBoard Honeypot**: Moderation events will be logged here.')
            .catch(() => null);
        }
      }

      const dashboard = await buildHoneypotDashboard(guildId);
      await interaction.editReply(dashboard);
      return;
    }

    if (interaction.customId === 'honeypot_action_select') {
      await interaction.deferUpdate();
      const action = interaction.values[0] as HoneypotAction;
      await upsertHoneypotConfig(guildId, { action });
      const dashboard = await buildHoneypotDashboard(guildId);
      await interaction.editReply(dashboard);
      return;
    }

    if (interaction.customId === 'honeypot_experiments_select') {
      await interaction.deferUpdate();
      const experiments = interaction.values as HoneypotExperiment[];

      if (experiments.includes('reinvite') && interaction.guild) {
        const config = await getHoneypotConfig(guildId);
        if (!config?.reinviteInvite && config?.channels?.[0]) {
          try {
            const invite = await interaction.guild.invites.create(config.channels[0].channelId, {
              maxAge: 0,
              maxUses: 0,
              reason: 'Honeypot reinvite experiment',
            });
            await upsertHoneypotConfig(guildId, { reinviteInvite: invite.code });
          } catch (invErr) {
            console.warn('[Honeypot] Could not create reinvite invite:', invErr);
          }
        }
      }

      await upsertHoneypotConfig(guildId, { experiments });
      const dashboard = await buildHoneypotDashboard(guildId);
      await interaction.editReply(dashboard);
      return;
    }
  },

  handleButton: async (interaction: ButtonInteraction) => {
    if (!interaction.guild || !interaction.guildId) return;

    if (interaction.customId === 'honeypot_refresh') {
      await interaction.deferUpdate();
      const dashboard = await buildHoneypotDashboard(interaction.guildId);
      await interaction.editReply(dashboard);
      return;
    }

    if (interaction.customId === 'honeypot_messages_prompt') {
      await interaction.reply({
        content:
          '💡 To configure custom honeypot messages, type `/honeypot-messages edit` to open the interactive message editor modal!',
        ephemeral: true,
      });
      return;
    }
  },
};

// -------------------------------------------------------------
// 2. /honeypot-messages command
// -------------------------------------------------------------
const honeypotMessagesCommandData = new SlashCommandBuilder()
  .setName('honeypot-messages')
  .setDescription('Configure the honeypot messages that the bot sends')
  .setDefaultMemberPermissions(
    PermissionFlagsBits.ManageGuild |
      PermissionFlagsBits.BanMembers |
      PermissionFlagsBits.ManageMessages |
      PermissionFlagsBits.ManageChannels
  )
  .addSubcommand((sub) =>
    sub.setName('edit').setDescription('Open modal editor for warning, DM, and log messages')
  )
  .addSubcommand((sub) =>
    sub
      .setName('preview')
      .setDescription('Preview how honeypot messages appear')
      .addStringOption((opt) =>
        opt
          .setName('type')
          .setDescription('Which message to preview')
          .setRequired(true)
          .addChoices(
            { name: 'Honeypot Warning Message', value: 'warning' },
            { name: 'User DM Message', value: 'dm' },
            { name: 'Moderation Log Message', value: 'log' }
          )
      )
  )
  .addSubcommand((sub) =>
    sub.setName('reset').setDescription('Reset all honeypot messages to their defaults')
  );

export const honeypotMessagesCommand: BotCommand = {
  name: 'honeypot-messages',
  description: 'Configure the honeypot messages that the bot sends',
  data: honeypotMessagesCommandData,
  execute: async ({ interaction }) => {
    if (!interaction.guild || !interaction.guildId) {
      await interaction.reply({
        content: '❌ The `/honeypot-messages` command can only be used inside a Discord server.',
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand(false) || 'edit';

    if (subcommand === 'edit') {
      const current = await getHoneypotMessages(interaction.guildId);

      const modal = new ModalBuilder()
        .setCustomId('honeypot_messages_modal')
        .setTitle("Honeypot's Messages");

      const warningInput = new TextInputBuilder()
        .setCustomId('honeypot_warning')
        .setLabel('Honeypot Warning (In Trap Channel)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(1500)
        .setValue((current.warning_message || defaultHoneypotWarningMessage).slice(0, 1500));

      const dmInput = new TextInputBuilder()
        .setCustomId('honeypot_dm_message')
        .setLabel('User DM Message (Sent to Offender)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(1000)
        .setValue((current.dm_message || defaultHoneypotUserDMMessage).slice(0, 1000));

      const logInput = new TextInputBuilder()
        .setCustomId('honeypot_log_message')
        .setLabel('Mod Log Message (Must have {{user:mention}})')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500)
        .setValue((current.log_message || defaultLogActionMessage).slice(0, 500));

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(warningInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(dmInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(logInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (subcommand === 'preview') {
      const type = interaction.options.getString('type', true);
      const config = await getHoneypotConfig(interaction.guildId);
      const action = config?.action || 'softban';

      if (type === 'warning') {
        const payload = honeypotWarningMessage(0, action, config?.warningMessage);
        await interaction.reply({ ...payload, ephemeral: true });
        return;
      }

      if (type === 'dm') {
        const reinvite = config?.experiments?.includes('reinvite') ? config?.reinviteInvite : null;
        const channelLink = config?.channels?.[0]
          ? `https://discord.com/channels/${interaction.guildId}/${config.channels[0].channelId}`
          : `https://discord.com/channels/${interaction.guildId}`;
        const payload = honeypotUserDMMessage(
          interaction.user.id,
          action,
          interaction.guild.name,
          undefined,
          channelLink,
          reinvite ? `https://discord.gg/${reinvite}` : null,
          true,
          config?.dmMessage
        );
        await interaction.reply({ ...payload, ephemeral: true });
        return;
      }

      if (type === 'log') {
        const channelId = config?.channels?.[0]?.channelId || interaction.channelId;
        const member = interaction.member as any;
        const payload = logActionMessage(
          interaction.user,
          member,
          channelId,
          action,
          config?.logMessage,
          1
        );
        await interaction.reply({ ...payload, ephemeral: true });
        return;
      }
    }

    if (subcommand === 'reset') {
      await setHoneypotMessages(interaction.guildId, {
        warning_message: null,
        dm_message: null,
        log_message: null,
      });

      const config = await getHoneypotConfig(interaction.guildId);
      if (config?.channels) {
        for (const ch of config.channels) {
          const count = await getHoneypotModeratedCount(interaction.guildId, ch.channelId);
          await updateChannelWarningMessage(
            interaction.guild,
            ch.channelId,
            ch.msgId,
            count,
            config.action,
            null
          );
        }
      }

      await interaction.reply({
        content: '✅ All honeypot messages have been reset to default templates.',
        ephemeral: true,
      });
      return;
    }
  },

  handleModal: async (interaction: ModalSubmitInteraction) => {
    if (!interaction.guild || !interaction.guildId) return;

    if (interaction.customId === 'honeypot_messages_modal') {
      const warning = interaction.fields.getTextInputValue('honeypot_warning').trim();
      const dm = interaction.fields.getTextInputValue('honeypot_dm_message').trim();
      const log = interaction.fields.getTextInputValue('honeypot_log_message').trim();

      // Check inappropriate words
      const badWordFound =
        (warning && containsBadWord(warning)) ||
        (dm && containsBadWord(dm)) ||
        (log && containsBadWord(log));

      if (badWordFound) {
        await interaction.reply({
          content: '❌ One or more messages contain inappropriate language. No changes were saved.',
          ephemeral: true,
        });
        return;
      }

      // Ensure log message includes user mention variable
      const validMentionVars = ['{{user:mention}}', '{{user:ping}}', '{{user:id}}', '{{user}}'];
      if (log && !validMentionVars.some((v) => log.includes(v))) {
        await interaction.reply({
          content:
            '❌ The log message must contain `{{user:mention}}` or `{{user:id}}` so administrators know who triggered the honeypot. No changes were saved.',
          ephemeral: true,
        });
        return;
      }

      await setHoneypotMessages(interaction.guildId, {
        warning_message: warning && warning !== defaultHoneypotWarningMessage ? warning : null,
        dm_message: dm && dm !== defaultHoneypotUserDMMessage ? dm : null,
        log_message: log && log !== defaultLogActionMessage ? log : null,
      });

      // Update active warning messages in all honeypot channels
      const config = await getHoneypotConfig(interaction.guildId);
      if (config && config.channels) {
        for (const ch of config.channels) {
          const count = await getHoneypotModeratedCount(interaction.guildId, ch.channelId);
          await updateChannelWarningMessage(
            interaction.guild,
            ch.channelId,
            ch.msgId,
            count,
            config.action,
            warning || null
          );
        }
      }

      const previewRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('preview_message:warning')
          .setLabel('Preview Warning')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('👁️'),
        new ButtonBuilder()
          .setCustomId('preview_message:dm')
          .setLabel('Preview DM')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('✉️'),
        new ButtonBuilder()
          .setCustomId('preview_message:log')
          .setLabel('Preview Log')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📋')
      );

      await interaction.reply({
        content: '✅ **Honeypot messages updated successfully!** You can preview them below:',
        components: [previewRow],
        ephemeral: true,
      });
      return;
    }
  },

  handleButton: async (interaction: ButtonInteraction) => {
    if (!interaction.customId.startsWith('preview_message:')) return;
    if (!interaction.guild || !interaction.guildId) return;

    const type = interaction.customId.split(':')[1];
    const config = await getHoneypotConfig(interaction.guildId);
    const action = config?.action || 'softban';

    if (type === 'warning') {
      const payload = honeypotWarningMessage(0, action, config?.warningMessage);
      await interaction.reply({ ...payload, ephemeral: true });
      return;
    }

    if (type === 'dm') {
      const reinvite = config?.experiments?.includes('reinvite') ? config?.reinviteInvite : null;
      const channelLink = config?.channels?.[0]
        ? `https://discord.com/channels/${interaction.guildId}/${config.channels[0].channelId}`
        : `https://discord.com/channels/${interaction.guildId}`;
      const payload = honeypotUserDMMessage(
        interaction.user.id,
        action,
        interaction.guild.name,
        undefined,
        channelLink,
        reinvite ? `https://discord.gg/${reinvite}` : null,
        true,
        config?.dmMessage
      );
      await interaction.reply({ ...payload, ephemeral: true });
      return;
    }

    if (type === 'log') {
      const channelId = config?.channels?.[0]?.channelId || interaction.channelId;
      const member = interaction.member as any;
      const payload = logActionMessage(
        interaction.user,
        member,
        channelId,
        action,
        config?.logMessage,
        1
      );
      await interaction.reply({ ...payload, ephemeral: true });
      return;
    }
  },
};

// -------------------------------------------------------------
// 3. /stats command
// -------------------------------------------------------------
const statsCommandData = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('See statistics for all servers using honeypot');

export const statsCommand: BotCommand = {
  name: 'stats',
  description: 'See statistics for all servers using honeypot',
  data: statsCommandData,
  execute: async ({ interaction }) => {
    const { totalGuilds, totalModerated } = await getHoneypotGlobalStats();
    let serverStatsText: string | null = null;
    let userStatsText: string | null = null;

    if (interaction.guildId) {
      const [guildStats, config, recentCount] = await Promise.all([
        getHoneypotGuildStats(interaction.guildId),
        getHoneypotConfig(interaction.guildId),
        getRecentHoneypotModerationCount(interaction.guildId, 7),
      ]);

      const totalInGuild = guildStats.reduce((acc, s) => acc + s.moderatedCount, 0);
      serverStatsText = `Total moderated in this server: \`${totalInGuild.toLocaleString()}\``;

      if (config?.channels) {
        for (const ch of config.channels) {
          const match = guildStats.find((s) => s.channel_id === ch.channelId);
          serverStatsText += `\n• <#${ch.channelId}>: \`${(match ? match.moderatedCount : 0).toLocaleString()}\``;
        }
      }

      if (recentCount > 0) {
        serverStatsText += `\nModerated in last 7 days: \`${recentCount.toLocaleString()}\``;
      }
    } else {
      const userCount = await getUserHoneypotModeratedCount(interaction.user.id);
      userStatsText = `Times you've been honeypot'd: \`${userCount.toLocaleString()}\``;
    }

    const globalStatsText =
      `Total servers: \`${totalGuilds.toLocaleString()}\`\n` +
      `Total moderations: \`${totalModerated.toLocaleString()}\``;

    const payload = statsMessage(globalStatsText, serverStatsText, userStatsText);
    await interaction.reply(payload);
  },

  handleButton: async (interaction: ButtonInteraction) => {
    // 1. Honey counter button in trap channel
    if (interaction.customId === 'moderated_count_button') {
      const { totalGuilds, totalModerated } = await getHoneypotGlobalStats();
      let serverStatsText: string | null = null;

      if (interaction.guildId) {
        const count = await getHoneypotModeratedCount(interaction.guildId);
        serverStatsText = `Total bots caught in this server: \`${count.toLocaleString()}\``;
      }

      const globalStatsText =
        `Total servers: \`${totalGuilds.toLocaleString()}\`\n` +
        `Total moderations: \`${totalModerated.toLocaleString()}\``;

      const payload = statsMessage(globalStatsText, serverStatsText, null);
      await interaction.reply({
        ...payload,
        ephemeral: true,
      });
      return;
    }

    // 2. Unban user button in log message
    if (interaction.customId.startsWith('unban:')) {
      if (!interaction.guild || !interaction.guildId) return;

      const member = interaction.member as any;
      const hasBanPerms = member?.permissions?.has?.(PermissionFlagsBits.BanMembers);
      if (!hasBanPerms) {
        await interaction.reply({
          content: '❌ You must have the **Ban Members** permission to unban users.',
          ephemeral: true,
        });
        return;
      }

      const userIdToUnban = interaction.customId.slice('unban:'.length);
      try {
        await interaction.guild.members.unban(
          userIdToUnban,
          `Unbanned by @${interaction.user.username} via Honeypot log button`
        );
        await interaction.reply({
          content: `🔓 User <@${userIdToUnban}> has been unbanned by <@${interaction.user.id}>.`,
        });
      } catch (err: any) {
        if (err?.code === 10026) {
          await interaction.reply({
            content: `ℹ️ User <@${userIdToUnban}> is not currently banned.`,
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: `❌ Could not unban user: ${err?.message || 'Missing permissions'}`,
            ephemeral: true,
          });
        }
      }
      return;
    }
  },
};

// -------------------------------------------------------------
// Honeypot Module Export
// -------------------------------------------------------------
export const honeypotModule: BotModule = {
  id: 'honeypot',
  name: 'Honeypot Security & Anti-Bot Protection',
  description:
    'Trap channels to detect, kick/ban, and log spam bots and compromised Discord accounts.',
  version: '1.0.0',
  enabled: true,
  commands: [honeypotCommand, honeypotMessagesCommand, statsCommand],
};
