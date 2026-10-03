import mongoose, { Schema, Document } from 'mongoose';

export interface IRole extends Document {
  organizationId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<IRole>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    isSystem: { type: Boolean, default: false },
    permissions: { type: [String], default: [] },
    color: { type: String, default: '#71717a' },
  },
  { timestamps: true }
);

RoleSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export const RoleModel: mongoose.Model<IRole> = (mongoose.models.Role as any) || mongoose.model<IRole>('Role', RoleSchema);
