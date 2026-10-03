import mongoose, { Schema, Document } from 'mongoose';
import { USER_AVAILABILITY } from '@claimboard/shared';

export interface INotification extends Document {
  organizationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  linkUrl?: string;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, default: 'system' },
    isRead: { type: Boolean, default: false, index: true },
    linkUrl: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const NotificationModel: mongoose.Model<INotification> = (mongoose.models.Notification as any) || mongoose.model<INotification>('Notification', NotificationSchema);

export interface IActivityLog extends Document {
  organizationId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  actorName: string;
  action: string;
  entityType: string;
  entityId: mongoose.Types.ObjectId;
  entityName?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorName: { type: String, required: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    entityName: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ActivityLogSchema.index({ organizationId: 1, createdAt: -1 });

export const ActivityLogModel: mongoose.Model<IActivityLog> = (mongoose.models.ActivityLog as any) || mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);

export interface IAuditLog extends Document {
  organizationId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  before?: any;
  after?: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorName: { type: String, required: true },
    action: { type: String, required: true },
    entity: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ organizationId: 1, createdAt: -1 });

export const AuditLogModel: mongoose.Model<IAuditLog> = (mongoose.models.AuditLog as any) || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

export interface IUserAvailabilityRecord extends Document {
  organizationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  status: string;
  notes?: string;
  availableDays: number[]; // 0 = Sunday, 6 = Saturday
  maxConcurrentClaims: number;
  updatedAt: Date;
}

const UserAvailabilitySchema = new Schema<IUserAvailabilityRecord>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    status: { type: String, enum: USER_AVAILABILITY, default: 'Available' },
    notes: { type: String },
    availableDays: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
    maxConcurrentClaims: { type: Number, default: 5 },
  },
  { timestamps: true }
);

export const UserAvailabilityModel: mongoose.Model<IUserAvailabilityRecord> = (mongoose.models.UserAvailability as any) || mongoose.model<IUserAvailabilityRecord>('UserAvailability', UserAvailabilitySchema);
