import mongoose, { Schema, Document } from 'mongoose';
import { WORK_ASSIGNMENT_STATUSES, PRIORITY_LEVELS } from '@claimboard/shared';

export interface IWorkAssignment extends Document {
  organizationId: mongoose.Types.ObjectId;
  mangaId: mongoose.Types.ObjectId;
  chapterId: mongoose.Types.ObjectId;
  workTypeId: mongoose.Types.ObjectId;
  status: string;
  priority: string;
  deadline?: Date;
  dependsOnAssignmentIds: mongoose.Types.ObjectId[];
  isBlocked: boolean;
  blockedReason?: string;
  assignedWorkerId?: mongoose.Types.ObjectId;
  assignedWorkerName?: string;
  claimedAt?: Date;
  submittedAt?: Date;
  completedAt?: Date;
  deadlineReminderSentAt?: Date;
  overdueAlertSentAt?: Date;
  activeClaimId?: mongoose.Types.ObjectId;
  discordSubmissionMessageId?: string;
  discordSubmissionChannelId?: string;
  allowUnclaim: boolean;
  version: number; // for optimistic concurrency checks
  createdAt: Date;
  updatedAt: Date;
}

const WorkAssignmentSchema = new Schema<IWorkAssignment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    mangaId: { type: Schema.Types.ObjectId, ref: 'Manga', required: true, index: true },
    chapterId: { type: Schema.Types.ObjectId, ref: 'Chapter', required: true, index: true },
    workTypeId: { type: Schema.Types.ObjectId, ref: 'WorkType', required: true, index: true },
    status: { type: String, enum: WORK_ASSIGNMENT_STATUSES, default: 'OPEN', index: true },
    priority: { type: String, enum: PRIORITY_LEVELS, default: 'Normal', index: true },
    deadline: { type: Date, index: true },
    dependsOnAssignmentIds: [{ type: Schema.Types.ObjectId, ref: 'WorkAssignment' }],
    isBlocked: { type: Boolean, default: false, index: true },
    blockedReason: { type: String },
    assignedWorkerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    assignedWorkerName: { type: String },
    claimedAt: { type: Date },
    submittedAt: { type: Date },
    completedAt: { type: Date },
    deadlineReminderSentAt: { type: Date },
    overdueAlertSentAt: { type: Date },
    activeClaimId: { type: Schema.Types.ObjectId, ref: 'Claim' },
    discordSubmissionMessageId: { type: String },
    discordSubmissionChannelId: { type: String },
    allowUnclaim: { type: Boolean, default: true },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);

WorkAssignmentSchema.index({ organizationId: 1, chapterId: 1, workTypeId: 1 });
WorkAssignmentSchema.index({ organizationId: 1, status: 1, priority: 1 });
WorkAssignmentSchema.index({ organizationId: 1, assignedWorkerId: 1, status: 1 });

export const WorkAssignmentModel: mongoose.Model<IWorkAssignment> = (mongoose.models.WorkAssignment as any) || mongoose.model<IWorkAssignment>('WorkAssignment', WorkAssignmentSchema);
