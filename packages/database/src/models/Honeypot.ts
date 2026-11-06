import mongoose, { Schema, Document } from 'mongoose';

export type HoneypotAction = 'softban' | 'ban' | 'disabled';

export type HoneypotExperiment =
  | 'no-warning-msg'
  | 'no-dm'
  | 'random-channel-name'
  | 'random-channel-name-chaos'
  | 'channel-warmer'
  | 'recreate-channel'
  | 'forward-message'
  | 'reinvite'
  | 'timeout-first'
  | 'only-recent-delete'
  | 'many-honeypots'
  | 'ensure-msg-delete';

export interface IHoneypotChannel {
  channelId: string;
  msgId?: string | null;
}

export interface IHoneypotConfig extends Document {
  guildId: string;
  logChannelId?: string | null;
  action: HoneypotAction;
  experiments: HoneypotExperiment[];
  channels: IHoneypotChannel[];
  reinviteInvite?: string | null;
  warningMessage?: string | null;
  dmMessage?: string | null;
  logMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const HoneypotConfigSchema = new Schema<IHoneypotConfig>(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    logChannelId: { type: String, default: null },
    action: {
      type: String,
      enum: ['softban', 'ban', 'disabled'],
      default: 'softban',
    },
    experiments: {
      type: [String],
      default: [],
    },
    channels: [
      {
        channelId: { type: String, required: true },
        msgId: { type: String, default: null },
      },
    ],
    reinviteInvite: { type: String, default: null },
    warningMessage: { type: String, default: null },
    dmMessage: { type: String, default: null },
    logMessage: { type: String, default: null },
  },
  { timestamps: true }
);

HoneypotConfigSchema.index({ 'channels.channelId': 1 });

export const HoneypotConfigModel: mongoose.Model<IHoneypotConfig> =
  (mongoose.models.HoneypotConfig as any) ||
  mongoose.model<IHoneypotConfig>('HoneypotConfig', HoneypotConfigSchema);

export interface IHoneypotEvent extends Document {
  guildId: string;
  userId: string;
  channelId?: string | null;
  action: string;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const HoneypotEventSchema = new Schema<IHoneypotEvent>(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    channelId: { type: String, default: null, index: true },
    action: { type: String, default: 'softban' },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

HoneypotEventSchema.index({ guildId: 1, timestamp: -1 });
HoneypotEventSchema.index({ timestamp: -1, guildId: 1 });

export const HoneypotEventModel: mongoose.Model<IHoneypotEvent> =
  (mongoose.models.HoneypotEvent as any) ||
  mongoose.model<IHoneypotEvent>('HoneypotEvent', HoneypotEventSchema);

// Database helper functions mirroring honeypot-main DB interface
export async function getHoneypotConfig(guildId: string): Promise<IHoneypotConfig | null> {
  return HoneypotConfigModel.findOne({ guildId }).lean() as any;
}

export async function upsertHoneypotConfig(
  guildId: string,
  data: Partial<IHoneypotConfig>
): Promise<IHoneypotConfig> {
  const existing = await HoneypotConfigModel.findOne({ guildId });
  if (existing) {
    Object.assign(existing, data);
    return existing.save();
  }
  return HoneypotConfigModel.create({
    guildId,
    ...data,
  });
}

export async function deleteHoneypotConfig(guildId: string): Promise<void> {
  await HoneypotConfigModel.deleteOne({ guildId });
}

export async function setHoneypotChannels(
  guildId: string,
  channels: IHoneypotChannel[]
): Promise<void> {
  await HoneypotConfigModel.updateOne(
    { guildId },
    { $set: { channels } },
    { upsert: true }
  );
}

export async function unsetHoneypotChannel(guildId: string, channelId: string): Promise<void> {
  await HoneypotConfigModel.updateOne(
    { guildId },
    { $pull: { channels: { channelId } } }
  );
}

export async function unsetHoneypotLogChannel(guildId: string, channelId: string): Promise<void> {
  await HoneypotConfigModel.updateOne(
    { guildId, logChannelId: channelId },
    { $set: { logChannelId: null } }
  );
}

export async function updateHoneypotMsgId(
  guildId: string,
  channelId: string,
  msgId: string | null
): Promise<void> {
  await HoneypotConfigModel.updateOne(
    { guildId, 'channels.channelId': channelId },
    { $set: { 'channels.$.msgId': msgId } }
  );
}

export async function logHoneypotEvent(
  guildId: string,
  userId: string,
  channelId?: string | null,
  action: string = 'softban'
): Promise<IHoneypotEvent> {
  return HoneypotEventModel.create({
    guildId,
    userId,
    channelId: channelId || null,
    action,
    timestamp: new Date(),
  });
}

export async function getHoneypotModeratedCount(
  guildId: string,
  channelId?: string | null
): Promise<number> {
  const query: any = { guildId };
  if (channelId) {
    query.channelId = channelId;
  }
  return HoneypotEventModel.countDocuments(query);
}

export async function getHoneypotGlobalStats(): Promise<{
  totalGuilds: number;
  totalModerated: number;
}> {
  const [totalGuilds, totalModerated] = await Promise.all([
    HoneypotConfigModel.countDocuments(),
    HoneypotEventModel.countDocuments(),
  ]);
  return { totalGuilds, totalModerated };
}

export async function getHoneypotGuildStats(
  guildId: string
): Promise<{ channel_id: string | null; moderatedCount: number }[]> {
  const results = await HoneypotEventModel.aggregate([
    { $match: { guildId } },
    {
      $group: {
        _id: '$channelId',
        moderatedCount: { $sum: 1 },
      },
    },
  ]);
  return results.map((r) => ({
    channel_id: r._id || null,
    moderatedCount: r.moderatedCount,
  }));
}

export async function getRecentHoneypotModerationCount(
  guildId: string,
  days: number = 7
): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return HoneypotEventModel.countDocuments({
    guildId,
    timestamp: { $gte: since },
  });
}

export async function getUserHoneypotModeratedCount(userId: string): Promise<number> {
  return HoneypotEventModel.countDocuments({ userId });
}

export async function getGuildHasHoneypotHistory(guildId: string): Promise<boolean> {
  const exists = await HoneypotEventModel.exists({ guildId });
  return Boolean(exists);
}

export async function getHoneypotMessages(guildId: string): Promise<{
  warning_message: string | null;
  dm_message: string | null;
  log_message: string | null;
}> {
  const cfg = await HoneypotConfigModel.findOne({ guildId }).lean();
  return {
    warning_message: cfg?.warningMessage ?? null,
    dm_message: cfg?.dmMessage ?? null,
    log_message: cfg?.logMessage ?? null,
  };
}

export async function setHoneypotMessages(
  guildId: string,
  messages: {
    warning_message?: string | null;
    dm_message?: string | null;
    log_message?: string | null;
  }
): Promise<void> {
  await HoneypotConfigModel.updateOne(
    { guildId },
    {
      $set: {
        warningMessage: messages.warning_message ?? null,
        dmMessage: messages.dm_message ?? null,
        logMessage: messages.log_message ?? null,
      },
    },
    { upsert: true }
  );
}

export async function getHoneypotReinvite(guildId: string): Promise<string | null> {
  const cfg = await HoneypotConfigModel.findOne({ guildId }).lean();
  return cfg?.reinviteInvite ?? null;
}

export async function setHoneypotReinvite(
  guildId: string,
  invite: string | null
): Promise<void> {
  await HoneypotConfigModel.updateOne(
    { guildId },
    { $set: { reinviteInvite: invite } },
    { upsert: true }
  );
}
