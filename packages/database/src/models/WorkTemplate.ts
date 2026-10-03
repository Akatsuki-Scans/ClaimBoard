import mongoose, { Schema, Document } from 'mongoose';

export interface IWorkTemplateStep {
  workTypeId: mongoose.Types.ObjectId;
  order: number;
  dependsOnWorkTypeIds: mongoose.Types.ObjectId[];
  deadlineHoursOffset?: number;
}

export interface IWorkTemplate extends Document {
  organizationId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  isDefault: boolean;
  steps: IWorkTemplateStep[];
  createdAt: Date;
  updatedAt: Date;
}

const WorkTemplateStepSchema = new Schema<IWorkTemplateStep>(
  {
    workTypeId: { type: Schema.Types.ObjectId, ref: 'WorkType', required: true },
    order: { type: Number, required: true },
    dependsOnWorkTypeIds: [{ type: Schema.Types.ObjectId, ref: 'WorkType' }],
    deadlineHoursOffset: { type: Number, default: 0 },
  },
  { _id: false }
);

const WorkTemplateSchema = new Schema<IWorkTemplate>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    isDefault: { type: Boolean, default: false },
    steps: [WorkTemplateStepSchema],
  },
  { timestamps: true }
);

WorkTemplateSchema.index({ organizationId: 1, name: 1 });

export const WorkTemplateModel: mongoose.Model<IWorkTemplate> = (mongoose.models.WorkTemplate as any) || mongoose.model<IWorkTemplate>('WorkTemplate', WorkTemplateSchema);
