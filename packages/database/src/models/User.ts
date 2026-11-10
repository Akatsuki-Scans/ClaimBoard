import mongoose, { Schema, Document } from 'mongoose';
import { SYSTEM_ROLES, USER_AVAILABILITY, WORKLOAD_LEVELS } from '@claimboard/shared';

export interface IUser extends Document {
  organizationId: mongoose.Types.ObjectId;
  username: string;
  displayName: string;
  email?: string;
  passwordHash?: string;
  avatarUrl?: string;
  discordId?: string;
  discordUsername?: string;
  role: string; // e.g. Owner, Administrator, Manager, Worker, etc.
  customPermissions: string[];
  availability: string;
  workload: string;
  activeClaimsCount: number;
  completedTasksCount: number;
  isApproved: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  mustChangePassword?: boolean;
  timezone?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    username: { type: String, required: true, index: true },
    displayName: { type: String, required: true },
    email: { type: String, sparse: true, index: true },
    passwordHash: { type: String },
    avatarUrl: { type: String },
    discordId: { type: String, sparse: true, index: true },
    discordUsername: { type: String },
    role: { type: String, enum: SYSTEM_ROLES, default: 'Worker', index: true },
    customPermissions: { type: [String], default: [] },
    availability: { type: String, enum: USER_AVAILABILITY, default: 'Available' },
    workload: { type: String, enum: WORKLOAD_LEVELS, default: 'Low' },
    activeClaimsCount: { type: Number, default: 0 },
    completedTasksCount: { type: Number, default: 0 },
    isApproved: { type: Boolean, default: false, index: true },
    approvedBy: { type: String },
    approvedAt: { type: Date },
    mustChangePassword: { type: Boolean, default: false },
    timezone: { type: String },
  },
  { timestamps: true }
);

UserSchema.index({ organizationId: 1, email: 1 }, { unique: true, sparse: true });
UserSchema.index({ organizationId: 1, username: 1 }, { unique: true });

export const UserModel: mongoose.Model<IUser> = (mongoose.models.User as any) || mongoose.model<IUser>('User', UserSchema);
