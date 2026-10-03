import mongoose, { Schema, Document } from 'mongoose';
import { CHAPTER_STATUSES, PRIORITY_LEVELS } from '@claimboard/shared';

export interface IChapter extends Document {
  organizationId: mongoose.Types.ObjectId;
  mangaId: mongoose.Types.ObjectId;
  chapterNumber: string; // e.g. "1150", "10.5", "Extra"
  volumeNumber?: string;
  title?: string;
  releaseDate?: Date;
  status: string;
  notes?: string;
  sourceUrl?: string;
  coverUrl?: string;
  priority: string;
  createdAt: Date;
  updatedAt: Date;
}

const ChapterSchema = new Schema<IChapter>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    mangaId: { type: Schema.Types.ObjectId, ref: 'Manga', required: true, index: true },
    chapterNumber: { type: String, required: true, index: true },
    volumeNumber: { type: String },
    title: { type: String },
    releaseDate: { type: Date },
    status: { type: String, enum: CHAPTER_STATUSES, default: 'Planning', index: true },
    notes: { type: String },
    sourceUrl: { type: String },
    coverUrl: { type: String },
    priority: { type: String, enum: PRIORITY_LEVELS, default: 'Normal', index: true },
  },
  { timestamps: true }
);

ChapterSchema.index({ organizationId: 1, mangaId: 1, chapterNumber: 1 }, { unique: true });

export const ChapterModel: mongoose.Model<IChapter> = (mongoose.models.Chapter as any) || mongoose.model<IChapter>('Chapter', ChapterSchema);
