import mongoose, { Schema, Document } from 'mongoose';

export interface IDeliverable extends Document {
  organizationId: mongoose.Types.ObjectId;
  assignmentId: mongoose.Types.ObjectId;
  claimId: mongoose.Types.ObjectId;
  revision: number;
  url: string;
  label: string;
  notes?: string;
  submittedById: mongoose.Types.ObjectId;
  submittedByName: string;
  createdAt: Date;
}

const DeliverableSchema = new Schema<IDeliverable>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: 'WorkAssignment', required: true, index: true },
    claimId: { type: Schema.Types.ObjectId, ref: 'Claim', required: true, index: true },
    revision: { type: Number, required: true },
    url: { type: String, required: true },
    label: { type: String, required: true },
    notes: { type: String },
    submittedById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    submittedByName: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const DeliverableModel: mongoose.Model<IDeliverable> = (mongoose.models.Deliverable as any) || mongoose.model<IDeliverable>('Deliverable', DeliverableSchema);
