import mongoose, { Schema, Document } from 'mongoose';
import { MANGA_STATUSES } from '@claimboard/shared';

export interface IManga extends Document {
  organizationId: mongoose.Types.ObjectId;
  title: string;
  altTitles: string[];
  coverUrl?: string;
  bannerUrl?: string;
  description: string;
  author: string;
  artist: string;
  status: string;
  language: string;
  tags: string[];
  genres: string[];
  sourceUrl?: string;
  internalNotes?: string;
  discordGuildId?: string;
  discordChannelId?: string;
  discordCategory?: string;
  discordRoleId?: string;
  discordRoleName?: string;
  releaseSchedule?: string;
  defaultTemplateId?: mongoose.Types.ObjectId;
  defaultDeadlineHours: number;
  totalChapters: number;
  completedChapters: number;
  activeChapters: number;
  openTasksCount: number;
  claimedTasksCount: number;
  overdueTasksCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const MangaSchema = new Schema<IManga>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    title: { type: String, required: true, index: true },
    altTitles: { type: [String], default: [] },
    coverUrl: { type: String },
    bannerUrl: { type: String },
    description: { type: String, default: '' },
    author: { type: String, default: 'Unknown' },
    artist: { type: String, default: 'Unknown' },
    status: { type: String, enum: MANGA_STATUSES, default: 'Active', index: true },
    language: { type: String, default: 'English' },
    tags: { type: [String], default: [] },
    genres: { type: [String], default: [] },
    sourceUrl: { type: String },
    internalNotes: { type: String },
    discordGuildId: { type: String, index: true },
    discordChannelId: { type: String, index: true },
    discordCategory: { type: String },
    discordRoleId: { type: String },
    discordRoleName: { type: String },
    releaseSchedule: { type: String },
    defaultTemplateId: { type: Schema.Types.ObjectId, ref: 'WorkTemplate' },
    defaultDeadlineHours: { type: Number, default: 48 },
    totalChapters: { type: Number, default: 0 },
    completedChapters: { type: Number, default: 0 },
    activeChapters: { type: Number, default: 0 },
    openTasksCount: { type: Number, default: 0 },
    claimedTasksCount: { type: Number, default: 0 },
    overdueTasksCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

MangaSchema.index({ organizationId: 1, title: 1 });
MangaSchema.index({ organizationId: 1, discordChannelId: 1 });

export const MangaModel: mongoose.Model<IManga> = (mongoose.models.Manga as any) || mongoose.model<IManga>('Manga', MangaSchema);
