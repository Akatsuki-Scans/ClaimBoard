import mongoose, { Schema, Document } from 'mongoose';

export interface ITeamMember {
  userId: mongoose.Types.ObjectId;
  role?: string; // e.g. "Translator", "Cleaner", "Typesetter", "Proofreader", "Quality Checker", "Team Lead"
  joinedAt: Date;
}

export interface ITeam extends Document {
  organizationId: mongoose.Types.ObjectId;
  name: string;
  mangaId?: mongoose.Types.ObjectId; // Associated Manga series
  description?: string;
  discordRoleId?: string;
  discordRoleName?: string;
  members: ITeamMember[];
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TeamMemberSchema = new Schema<ITeamMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, default: 'Member' },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const TeamSchema = new Schema<ITeam>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    mangaId: { type: Schema.Types.ObjectId, ref: 'Manga', index: true },
    description: { type: String, default: '', trim: true },
    discordRoleId: { type: String, trim: true },
    discordRoleName: { type: String, trim: true },
    members: { type: [TeamMemberSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

TeamSchema.index({ organizationId: 1, name: 1 });
TeamSchema.index({ organizationId: 1, mangaId: 1 });

export const TeamModel: mongoose.Model<ITeam> =
  (mongoose.models.Team as any) || mongoose.model<ITeam>('Team', TeamSchema);

