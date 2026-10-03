import mongoose, { Schema, Document } from 'mongoose';
import { PRIORITY_LEVELS } from '@claimboard/shared';

export interface IWorkType extends Document {
  organizationId: mongoose.Types.ObjectId;
  name: string;
  code: string;
  description?: string;
  icon?: string;
  color: string;
  defaultDeadlineHours: number;
  discordRoleId?: string;
  priority: string;
  requiresReview: boolean;
  allowMultipleWorkers: boolean;
  estimatedWorkloadHours: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const WorkTypeSchema = new Schema<IWorkType>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true },
    code: { type: String, required: true, uppercase: true },
    description: { type: String },
    icon: { type: String },
    color: { type: String, default: '#3b82f6' },
    defaultDeadlineHours: { type: Number, default: 48 },
    discordRoleId: { type: String },
    priority: { type: String, enum: PRIORITY_LEVELS, default: 'Normal' },
    requiresReview: { type: Boolean, default: true },
    allowMultipleWorkers: { type: Boolean, default: false },
    estimatedWorkloadHours: { type: Number, default: 4 },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

WorkTypeSchema.index({ organizationId: 1, code: 1 }, { unique: true });

export const WorkTypeModel: mongoose.Model<IWorkType> = (mongoose.models.WorkType as any) || mongoose.model<IWorkType>('WorkType', WorkTypeSchema);
