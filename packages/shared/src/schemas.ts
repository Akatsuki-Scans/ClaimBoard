import { z } from 'zod';
import {
  MANGA_STATUSES,
  CHAPTER_STATUSES,
  PRIORITY_LEVELS,
  USER_AVAILABILITY,
  REVISION_SEVERITIES,
} from './constants';

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const CreateMangaSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  altTitles: z.array(z.string()).default([]),
  coverUrl: z.string().url().optional().or(z.literal('')),
  description: z.string().default(''),
  author: z.string().default('Unknown'),
  artist: z.string().default('Unknown'),
  status: z.enum(MANGA_STATUSES).default('Active'),
  language: z.string().default('English'),
  tags: z.array(z.string()).default([]),
  genres: z.array(z.string()).default([]),
  sourceUrl: z.string().url().optional().or(z.literal('')),
  internalNotes: z.string().optional(),
  discordGuildId: z.string().optional(),
  discordChannelId: z.string().optional(),
  discordCategory: z.string().optional(),
  discordRoleId: z.string().optional(),
  discordRoleName: z.string().optional(),
  releaseSchedule: z.string().optional(),
  defaultTemplateId: z.string().optional(),
  defaultDeadlineHours: z.number().min(1).default(48),
});

export const UpdateMangaSchema = CreateMangaSchema.partial();

export const CreateChapterSchema = z.object({
  mangaId: z.string().min(1),
  chapterNumber: z.string().min(1),
  volumeNumber: z.string().optional(),
  title: z.string().optional(),
  releaseDate: z.string().optional(),
  deadline: z.string().optional().nullable(),
  status: z.enum(CHAPTER_STATUSES).default('Planning'),
  notes: z.string().optional(),
  sourceUrl: z.string().url().optional().or(z.literal('')),
  coverUrl: z.string().url().optional().or(z.literal('')),
  priority: z.enum(PRIORITY_LEVELS).default('Normal'),
  templateId: z.string().optional(), // optionally apply template immediately
});

export const UpdateDeadlineSchema = z.object({
  deadline: z.string().nullable().optional(),
});

export const BatchUpdateDeadlinesSchema = z.object({
  kind: z.enum(['assignment', 'chapter']),
  ids: z.array(z.string().min(1)).min(1),
  deadline: z.string().nullable().optional(),
});

export const BulkCreateChaptersSchema = z.object({
  mangaId: z.string().min(1),
  startNumber: z.number().int().min(0),
  endNumber: z.number().int().min(0),
  priority: z.enum(PRIORITY_LEVELS).default('Normal'),
  templateId: z.string().optional(),
  defaultDeadlineHours: z.number().default(48),
  deadline: z.string().optional().nullable(),
});

export const CreateAssignmentSchema = z
  .object({
    mangaId: z.string().min(1),
    chapterId: z.string().min(1),
    workTypeId: z.string().min(1).optional(),
    workTypeIds: z.array(z.string().min(1)).optional(),
    priority: z.enum(PRIORITY_LEVELS).default('Normal'),
    deadline: z.string().optional().nullable(),
    dependsOnAssignmentIds: z.array(z.string()).default([]),
    assignedWorkerId: z.string().optional(),
  })
  .refine((data) => Boolean(data.workTypeId) || (Array.isArray(data.workTypeIds) && data.workTypeIds.length > 0), {
    message: 'At least one work type / role is required',
    path: ['workTypeIds'],
  });

export const ApplyTemplateSchema = z.object({
  chapterId: z.string().min(1),
  templateId: z.string().min(1),
  priority: z.enum(PRIORITY_LEVELS).default('Normal'),
  baseDeadlineHours: z.number().optional(),
});

export const ClaimWorkSchema = z.object({
  assignmentId: z.string().min(1),
});

export const UnclaimWorkSchema = z.object({
  assignmentId: z.string().min(1),
  reason: z.string().optional().default('Released by worker'),
});

export const ReassignClaimSchema = z.object({
  assignmentId: z.string().min(1),
  newWorkerId: z.string().min(1),
  reason: z.string().min(1),
});

export const SubmitDeliverableSchema = z.object({
  assignmentId: z.string().min(1),
  deliverableUrl: z.string().url('Must be a valid URL (Google Drive, Dropbox, Mega, etc.)'),
  label: z.string().min(1, 'Label or title for this submission'),
  notes: z.string().optional(),
});

export const ReviewSubmissionSchema = z.object({
  assignmentId: z.string().min(1),
  status: z.enum(['Approved', 'Changes_Requested']),
  comment: z.string().min(1, 'Review notes or comment is required'),
  correctionRequest: z.string().optional(),
  attachmentUrl: z.string().url().optional().or(z.literal('')),
  severity: z.enum(REVISION_SEVERITIES).default('Minor'),
});

export const CreateWorkTypeSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().optional(),
  color: z.string().default('#3b82f6'),
  defaultDeadlineHours: z.number().min(1).default(48),
  discordRoleId: z.string().optional(),
  priority: z.enum(PRIORITY_LEVELS).default('Normal'),
  requiresReview: z.boolean().default(true),
  allowMultipleWorkers: z.boolean().default(false),
  estimatedWorkloadHours: z.number().default(4),
  sortOrder: z.number().default(0),
});

export const CreateWorkTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isDefault: z.boolean().default(false),
  steps: z.array(
    z.object({
      workTypeId: z.string().min(1),
      order: z.number().int().min(0),
      dependsOnWorkTypeIds: z.array(z.string()).default([]),
      deadlineHoursOffset: z.number().optional(),
    })
  ).min(1, 'At least one step is required'),
});

export const DiscordAssignCommandSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  mangaId: z.string().optional(),
  chapterNumber: z.string().min(1),
  volumeNumber: z.string().optional(),
  workTypeCodes: z.array(z.string()).min(1),
  deadlineHours: z.number().default(48),
  priority: z.enum(PRIORITY_LEVELS).default('Normal'),
  description: z.string().optional(),
  callerUserId: z.string().min(1),
});
