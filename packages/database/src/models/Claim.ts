import mongoose, { Schema, Document } from 'mongoose';
import { CLAIM_STATUSES, REVISION_SEVERITIES } from '@claimboard/shared';

export interface IClaimRevision {
  revisionNumber: number;
  deliverableUrl: string;
  deliverableLabel: string;
  submittedAt: Date;
  submittedById: mongoose.Types.ObjectId;
  submittedByName: string;
  reviewedAt?: Date;
  reviewedById?: mongoose.Types.ObjectId;
  reviewedByName?: string;
  reviewStatus?: string;
  reviewFeedback?: string;
  severity?: string;
}

export interface IClaim extends Document {
  organizationId: mongoose.Types.ObjectId;
  assignmentId: mongoose.Types.ObjectId;
  workerId: mongoose.Types.ObjectId;
  workerName: string;
  workerAvatarUrl?: string;
  status: string;
  claimedAt: Date;
  startedAt?: Date;
  submittedAt?: Date;
  reviewedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancelReason?: string;
  deadline?: Date;
  revisions: IClaimRevision[];
  createdAt: Date;
  updatedAt: Date;
}

const ClaimRevisionSchema = new Schema<IClaimRevision>(
  {
    revisionNumber: { type: Number, required: true },
    deliverableUrl: { type: String, required: true },
    deliverableLabel: { type: String, required: true },
    submittedAt: { type: Date, default: Date.now },
    submittedById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    submittedByName: { type: String, required: true },
    reviewedAt: { type: Date },
    reviewedById: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedByName: { type: String },
    reviewStatus: { type: String, enum: ['Approved', 'Changes_Requested'] },
    reviewFeedback: { type: String },
    severity: { type: String, enum: REVISION_SEVERITIES },
  },
  { _id: true }
);

const ClaimSchema = new Schema<IClaim>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: 'WorkAssignment', required: true, index: true },
    workerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    workerName: { type: String, required: true },
    workerAvatarUrl: { type: String },
    status: { type: String, enum: CLAIM_STATUSES, default: 'ACTIVE', index: true },
    claimedAt: { type: Date, default: Date.now, index: true },
    startedAt: { type: Date },
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: { type: String },
    deadline: { type: Date, index: true },
    revisions: [ClaimRevisionSchema],
  },
  { timestamps: true }
);

ClaimSchema.index({ organizationId: 1, workerId: 1, status: 1 });
ClaimSchema.index({ organizationId: 1, assignmentId: 1 });

export const ClaimModel: mongoose.Model<IClaim> = (mongoose.models.Claim as any) || mongoose.model<IClaim>('Claim', ClaimSchema);
