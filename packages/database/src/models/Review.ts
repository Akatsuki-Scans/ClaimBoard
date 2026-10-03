import mongoose, { Schema, Document } from 'mongoose';
import { REVISION_SEVERITIES } from '@claimboard/shared';

export interface IReview extends Document {
  organizationId: mongoose.Types.ObjectId;
  assignmentId: mongoose.Types.ObjectId;
  claimId: mongoose.Types.ObjectId;
  revisionId?: mongoose.Types.ObjectId;
  reviewerId: mongoose.Types.ObjectId;
  reviewerName: string;
  status: string; // 'Approved' | 'Changes_Requested'
  comment: string;
  correctionRequest?: string;
  attachmentUrl?: string;
  severity?: string;
  createdAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: 'WorkAssignment', required: true, index: true },
    claimId: { type: Schema.Types.ObjectId, ref: 'Claim', required: true, index: true },
    revisionId: { type: Schema.Types.ObjectId },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewerName: { type: String, required: true },
    status: { type: String, enum: ['Approved', 'Changes_Requested'], required: true },
    comment: { type: String, required: true },
    correctionRequest: { type: String },
    attachmentUrl: { type: String },
    severity: { type: String, enum: REVISION_SEVERITIES, default: 'Minor' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const ReviewModel: mongoose.Model<IReview> = (mongoose.models.Review as any) || mongoose.model<IReview>('Review', ReviewSchema);
