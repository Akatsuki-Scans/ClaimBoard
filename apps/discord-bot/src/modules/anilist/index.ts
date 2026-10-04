import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from 'discord.js';
import { BotModule, BotCommand, CommandContext } from '../../core/types';
import { MangaModel, OrganizationModel } from '@claimboard/database';
import { checkIsAdmin } from '../admin';
import { BotLogger } from '../../core/botLogger';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .trim();
}

export interface AniListMedia {
  id: number;
  title: {
    romaji?: string;
    english?: string;
    native?: string;
  };
  description?: string;
  format?: string;
  status?: string;
  chapters?: number;
  volumes?: number;
  genres?: string[];
  coverImage?: {
    extraLarge?: string;
    large?: string;
    color?: string;
  };
  bannerImage?: string;
  siteUrl?: string;
  staff?: {
    edges?: Array<{
      role: string;
      node: {
        name: {
          full: string;
        };
      };
    }>;
  };
}

export async function searchAniListManga(search: string): Promise<AniListMedia | null> {
  // If search query is a numeric ID, lookup directly by ID
  const numericId = parseInt(search.trim(), 10);
  if (!isNaN(numericId) && String(numericId) === search.trim()) {
    return getAniListMangaById(numericId);
  }

  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 1) {
        media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
          id
          title {
            romaji
            english
            native
          }
          description(asHtml: false)
          format
          status
          chapters
          volumes
          genres
          coverImage {
            extraLarge
            large
            color
          }
          bannerImage
          siteUrl
          staff(perPage: 8) {
            edges {
              role
              node {
                name {
                  full
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ClaimBoardBot/1.0',
      },
      body: JSON.stringify({ query, variables: { search } }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[AniListModule] AniList returned HTTP ${res.status}:`, errText);
      return null;
    }

    const data: any = await res.json();
    const mediaList = data?.data?.Page?.media;
    if (Array.isArray(mediaList) && mediaList.length > 0) {
      return mediaList[0];
    }
    return null;
  } catch (err) {
    console.error('[AniListModule] Search error:', err);
    return null;
  }
}

export async function getAniListMangaById(id: number): Promise<AniListMedia | null> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: MANGA) {
        id
        title {
          romaji
          english
          native
        }
        description(asHtml: false)
        format
        status
        chapters
        volumes
        genres
        coverImage {
          extraLarge
          large
          color
        }
        bannerImage
        siteUrl
        staff(perPage: 8) {
          edges {
            role
            node {
              name {
                full
              }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ClaimBoardBot/1.0',
      },
      body: JSON.stringify({ query, variables: { id } }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[AniListModule] getAniListMangaById returned HTTP ${res.status}:`, errText);
      return null;
    }

    const data: any = await res.json();
    return data?.data?.Media || null;
  } catch (err) {
    console.error('[AniListModule] Query by ID error:', err);
    return null;
  }
}

// /manga slash command in dedicated AniList module
export const mangaCommand: BotCommand = {
  name: 'manga',
  description: 'Search manga details on AniList with option to import into ClaimBoard (Admin only)',
  data: new SlashCommandBuilder()
    .setName('manga')
    .setDescription('Search manga details on AniList with option to import into ClaimBoard')
    .setDMPermission(true)
    .addStringOption((opt) =>
      opt
        .setName('title')
        .setDescription('Manga series title or keyword to search on AniList')
        .setRequired(true)
    ),

  execute: async ({ interaction, webUrl }: CommandContext) => {
    await interaction.deferReply();
    const query = interaction.options.getString('title', true).trim();

    const media = await searchAniListManga(query);
    if (!media) {
      await interaction.editReply({
        content: `❌ Could not find any manga matching **"${query}"** on AniList.`,
      });
      return;
    }

    const primaryTitle = media.title.english || media.title.romaji || media.title.native || query;
    let author = 'Unknown';
    let artist = 'Unknown';

    if (media.staff?.edges) {
      for (const edge of media.staff.edges) {
        const role = edge.role.toLowerCase();
        const name = edge.node.name.full;
        if (role.includes('story') || role.includes('original') || role.includes('author')) {
          if (author === 'Unknown') author = name;
        }
        if (role.includes('art') || role.includes('illustrat') || role.includes('comic')) {
          if (artist === 'Unknown') artist = name;
        }
      }
    }

    const formattedStatus =
      media.status === 'FINISHED'
        ? 'Completed'
        : media.status === 'RELEASING'
        ? 'Releasing'
        : media.status === 'NOT_YET_RELEASED'
        ? 'Upcoming'
        : media.status === 'HIATUS'
        ? 'Hiatus'
        : media.status || 'Active';

    // Check if series is already in ClaimBoard
    const escTitle = escapeRegex(primaryTitle);
    const existingManga = await MangaModel.findOne({
      $or: [
        { title: { $regex: `^${escTitle}$`, $options: 'i' } },
        ...(media.title.romaji ? [{ title: { $regex: `^${escapeRegex(media.title.romaji)}$`, $options: 'i' } }] : []),
        ...(media.title.english ? [{ title: { $regex: `^${escapeRegex(media.title.english)}$`, $options: 'i' } }] : []),
      ],
    });

    const cleanDesc = stripHtml(media.description || 'No description available from AniList.');
    const truncatedDesc = cleanDesc.length > 350 ? `${cleanDesc.slice(0, 347)}...` : cleanDesc;

    const embedColor = media.coverImage?.color
      ? parseInt(media.coverImage.color.replace('#', ''), 16)
      : 0x0284c7;

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(primaryTitle)
      .setDescription(truncatedDesc)
      .addFields(
        { name: 'Format', value: media.format || 'Manga', inline: true },
        { name: 'Status', value: formattedStatus, inline: true },
        { name: 'Chapters', value: media.chapters ? `${media.chapters}` : 'Ongoing / Unknown', inline: true },
        { name: 'Author', value: author, inline: true },
        { name: 'Artist', value: artist, inline: true },
        {
          name: 'ClaimBoard Status',
          value: existingManga
            ? `✅ **Already Added** ([Open Board](${webUrl}/manga/${existingManga._id}))`
            : '⚪ **Not in ClaimBoard** (Option to add below)',
          inline: true,
        },
        { name: 'Genres', value: media.genres?.slice(0, 6).join(', ') || 'N/A', inline: false }
      )
      .setFooter({ text: 'AniList Module • ClaimBoard Scanlation Management' })
      .setTimestamp();

    if (media.siteUrl) {
      embed.setURL(media.siteUrl);
    }

    if (media.coverImage?.extraLarge || media.coverImage?.large) {
      embed.setThumbnail(media.coverImage.extraLarge || media.coverImage.large || null);
    }

    if (media.bannerImage) {
      embed.setImage(media.bannerImage);
    }

    const row = new ActionRowBuilder<ButtonBuilder>();

    if (existingManga) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('cb_manga_added_disabled')
          .setLabel('Already on ClaimBoard')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('✅')
          .setDisabled(true),
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('Open in ClaimBoard')
          .setURL(`${webUrl}/manga/${existingManga._id}`)
          .setEmoji('📖')
      );
    } else {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`cb_anilist_add:${media.id}`)
          .setLabel('Add to ClaimBoard')
          .setStyle(ButtonStyle.Success)
          .setEmoji('➕')
      );
    }

    if (media.siteUrl) {
      row.addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('View on AniList')
          .setURL(media.siteUrl)
          .setEmoji('🌐')
      );
    }

    await interaction.editReply({ embeds: [embed], components: [row] });
  },

  handleButton: async (interaction: ButtonInteraction) => {
    if (!interaction.customId.startsWith('cb_anilist_add:')) return;

    // 1. Permission check: Only Admin can add manga to ClaimBoard
    const isAdmin = await checkIsAdmin(interaction.user.id);
    if (!isAdmin) {
      await interaction.reply({
        content: '❌ **Permission Denied**: Only administrators and managers can add manga to ClaimBoard.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();

    const anilistId = parseInt(interaction.customId.replace('cb_anilist_add:', '').trim(), 10);
    const media = await getAniListMangaById(anilistId);
    if (!media) {
      await interaction.followUp({ content: '❌ Could not retrieve details from AniList.', ephemeral: true });
      return;
    }

    const primaryTitle = media.title.english || media.title.romaji || media.title.native || 'Untitled Manga';
    const altTitles = [media.title.romaji, media.title.english, media.title.native].filter(
      (t): t is string => Boolean(t) && t !== primaryTitle
    );

    // Check if already in ClaimBoard
    const escTitle = escapeRegex(primaryTitle);
    let manga = await MangaModel.findOne({
      $or: [
        { title: { $regex: `^${escTitle}$`, $options: 'i' } },
        ...(media.title.romaji ? [{ title: { $regex: `^${escapeRegex(media.title.romaji)}$`, $options: 'i' } }] : []),
      ],
    });

    const webUrl = process.env.WEB_URL || 'http://localhost:5173';

    if (manga) {
      await interaction.followUp({
        content: `ℹ️ **${manga.title}** is already registered in ClaimBoard. [View Series](${webUrl}/manga/${manga._id})`,
        ephemeral: true,
      });
      return;
    }

    let org = await OrganizationModel.findOne();
    if (!org) {
      org = await OrganizationModel.create({
        name: 'Scanlation Workspace',
        slug: 'scanlation',
      });
    }

    let author = 'Unknown';
    let artist = 'Unknown';
    if (media.staff?.edges) {
      for (const edge of media.staff.edges) {
        const role = edge.role.toLowerCase();
        const name = edge.node.name.full;
        if (role.includes('story') || role.includes('original') || role.includes('author')) {
          if (author === 'Unknown') author = name;
        }
        if (role.includes('art') || role.includes('illustrat') || role.includes('comic')) {
          if (artist === 'Unknown') artist = name;
        }
      }
    }

    manga = await MangaModel.create({
      organizationId: org._id,
      title: primaryTitle,
      altTitles,
      coverUrl: media.coverImage?.extraLarge || media.coverImage?.large,
      bannerUrl: media.bannerImage,
      description: stripHtml(media.description || ''),
      author,
      artist,
      status: media.status === 'FINISHED' ? 'Completed' : 'Active',
      genres: media.genres || [],
      sourceUrl: media.siteUrl,
      totalChapters: media.chapters || 0,
      defaultDeadlineHours: 48,
      openTasksCount: 0,
      claimedTasksCount: 0,
      overdueTasksCount: 0,
    });

    // Update the message components and embed
    const originalEmbed = interaction.message.embeds[0];
    const updatedEmbed = originalEmbed ? EmbedBuilder.from(originalEmbed) : new EmbedBuilder();

    // Update ClaimBoard Status field
    const updatedFields = (originalEmbed?.fields || []).map((f) => {
      if (f.name.includes('ClaimBoard Status')) {
        return {
          name: 'ClaimBoard Status',
          value: `✅ **Added to ClaimBoard** by <@${interaction.user.id}>!\n[Open Series in Web App](${webUrl}/manga/${manga!._id})`,
          inline: f.inline ?? true,
        };
      }
      return f;
    });

    updatedEmbed.setFields(updatedFields);

    const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('cb_manga_added_disabled')
        .setLabel('Added to ClaimBoard')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
        .setDisabled(true),
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Open in ClaimBoard')
        .setURL(`${webUrl}/manga/${manga._id}`)
        .setEmoji('📖')
    );

    if (media.siteUrl) {
      updatedRow.addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('View on AniList')
          .setURL(media.siteUrl)
          .setEmoji('🌐')
      );
    }

    await interaction.editReply({
      embeds: [updatedEmbed],
      components: [updatedRow],
    });

    await interaction.followUp({
      content: `🎉 **${manga.title}** has been successfully added to ClaimBoard!\nManage production here: [${manga.title}](${webUrl}/manga/${manga._id})`,
      ephemeral: true,
    });

    // Send audit log to bot log channels
    await BotLogger.mangaAdded({
      client: interaction.client,
      guildId: interaction.guildId,
      mangaTitle: manga.title,
      anilistId: media.id,
      adminTag: interaction.user.tag || interaction.user.username,
      adminId: interaction.user.id,
      coverUrl: manga.coverUrl,
      status: manga.status,
      totalChapters: manga.totalChapters,
    });
  },
};

export const anilistModule: BotModule = {
  id: 'anilist',
  name: 'AniList Manga Search & Integration',
  description: 'Search manga details directly from AniList with options for administrators to import series to ClaimBoard',
  version: '1.0.0',
  enabled: true,
  commands: [mangaCommand],
  onLoad: () => {
    console.log('[AniListModule] AniList module loaded with /manga search and ClaimBoard import.');
  },
};
