import mongoose, { Schema, Document } from 'mongoose';

export interface IDiscordGuild extends Document {
  organizationId: mongoose.Types.ObjectId;
  guildId: string;
  guildName: string;
  icon?: string;
  active: boolean;
  settings: {
    announcementChannelId?: string;
    notificationChannelId?: string;
    embedColor: string;
    sendNudges: boolean;
    pingRolesOnAssign: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const DiscordGuildSchema = new Schema<IDiscordGuild>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    guildId: { type: String, required: true, index: true },
    guildName: { type: String, required: true },
    icon: { type: String },
    active: { type: Boolean, default: true },
    settings: {
      announcementChannelId: { type: String },
      notificationChannelId: { type: String },
      embedColor: { type: String, default: '#6366f1' },
      sendNudges: { type: Boolean, default: true },
      pingRolesOnAssign: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

DiscordGuildSchema.index({ organizationId: 1, guildId: 1 }, { unique: true });

export const DiscordGuildModel: mongoose.Model<IDiscordGuild> = (mongoose.models.DiscordGuild as any) || mongoose.model<IDiscordGuild>('DiscordGuild', DiscordGuildSchema);

export interface IDiscordChannel extends Document {
  organizationId: mongoose.Types.ObjectId;
  guildId: string;
  channelId: string;
  channelName: string;
  mangaId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DiscordChannelSchema = new Schema<IDiscordChannel>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, index: true },
    channelName: { type: String, required: true },
    mangaId: { type: Schema.Types.ObjectId, ref: 'Manga', required: true, index: true },
  },
  { timestamps: true }
);

DiscordChannelSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

export const DiscordChannelModel: mongoose.Model<IDiscordChannel> = (mongoose.models.DiscordChannel as any) || mongoose.model<IDiscordChannel>('DiscordChannel', DiscordChannelSchema);

export interface IDiscordRoleMapping extends Document {
  organizationId: mongoose.Types.ObjectId;
  guildId: string;
  roleId: string;
  roleName: string;
  workTypeId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DiscordRoleMappingSchema = new Schema<IDiscordRoleMapping>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    guildId: { type: String, required: true, index: true },
    roleId: { type: String, required: true },
    roleName: { type: String, required: true },
    workTypeId: { type: Schema.Types.ObjectId, ref: 'WorkType', required: true },
  },
  { timestamps: true }
);

DiscordRoleMappingSchema.index({ guildId: 1, workTypeId: 1 }, { unique: true });

export const DiscordRoleMappingModel: mongoose.Model<IDiscordRoleMapping> = (mongoose.models.DiscordRoleMapping as any) || mongoose.model<IDiscordRoleMapping>('DiscordRoleMapping', DiscordRoleMappingSchema);

export interface IDiscordLogChannel extends Document {
  organizationId?: mongoose.Types.ObjectId;
  guildId: string;
  channelId: string;
  channelName?: string;
  addedById?: string;
  addedByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DiscordLogChannelSchema = new Schema<IDiscordLogChannel>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, index: true },
    channelName: { type: String },
    addedById: { type: String },
    addedByName: { type: String },
  },
  { timestamps: true }
);

DiscordLogChannelSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

export const DiscordLogChannelModel: mongoose.Model<IDiscordLogChannel> =
  (mongoose.models.DiscordLogChannel as any) ||
  mongoose.model<IDiscordLogChannel>('DiscordLogChannel', DiscordLogChannelSchema);

