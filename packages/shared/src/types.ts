import {
  MangaStatus,
  ChapterStatus,
  PriorityLevel,
  WorkAssignmentStatus,
  ClaimStatus,
  UserAvailability,
  WorkloadLevel,
  RevisionSeverity,
  Permission,
  SystemRole,
  ApiErrorCode,
} from './constants';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: ApiErrorCode | string;
    message: string;
    details?: any;
  };
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  organizationId: string;
  username: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  discordId?: string;
  discordUsername?: string;
  role: SystemRole | string;
  permissions: Permission[];
  availability: UserAvailability;
  workload: WorkloadLevel;
  activeClaimsCount: number;
  completedTasksCount: number;
  isApproved?: boolean;
  approvedBy?: string;
  approvedAt?: string;
  mustChangePassword?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: Permission[];
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Manga {
  id: string;
  organizationId: string;
  title: string;
  altTitles: string[];
  coverUrl?: string;
  description: string;
  author: string;
  artist: string;
  status: MangaStatus;
  language: string;
  tags: string[];
  genres: string[];
  sourceUrl?: string;
  internalNotes?: string;
  discordGuildId?: string;
  discordChannelId?: string;
  discordCategory?: string;
  discordRoleId?: string;
  discordRoleName?: string;
  releaseSchedule?: string;
  defaultTemplateId?: string;
  defaultDeadlineHours?: number;
  totalChapters: number;
  completedChapters: number;
  activeChapters: number;
  openTasksCount: number;
  claimedTasksCount: number;
  overdueTasksCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: string;
  organizationId: string;
  mangaId: string;
  mangaTitle?: string;
  chapterNumber: string; // e.g. "1150", "10.5", "Extra", "Prologue"
  volumeNumber?: string;
  title?: string;
  releaseDate?: string;
  status: ChapterStatus;
  notes?: string;
  sourceUrl?: string;
  coverUrl?: string;
  priority: PriorityLevel;
  createdAt: string;
  updatedAt: string;
}

export interface WorkType {
  id: string;
  organizationId: string;
  name: string;
  code: string; // e.g. RAW, TL, PR, CL, RD, TS, QC, UP
  description?: string;
  icon?: string;
  color: string;
  defaultDeadlineHours: number;
  discordRoleId?: string;
  priority: PriorityLevel;
  requiresReview: boolean;
  allowMultipleWorkers: boolean;
  estimatedWorkloadHours: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkTemplateStep {
  workTypeId: string;
  order: number;
  dependsOnWorkTypeIds: string[]; // ids of work types that must finish first
  deadlineHoursOffset?: number;
}

export interface WorkTemplate {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  steps: WorkTemplateStep[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkAssignment {
  id: string;
  organizationId: string;
  mangaId: string;
  chapterId: string;
  workTypeId: string;
  workType?: WorkType;
  manga?: Pick<Manga, 'id' | 'title' | 'coverUrl'>;
  chapter?: Pick<Chapter, 'id' | 'chapterNumber' | 'title' | 'priority'>;
  status: WorkAssignmentStatus;
  priority: PriorityLevel;
  deadline?: string;
  dependsOnAssignmentIds: string[];
  isBlocked: boolean;
  blockedReason?: string;
  assignedWorkerId?: string;
  assignedWorkerName?: string;
  claimedAt?: string;
  submittedAt?: string;
  completedAt?: string;
  activeClaimId?: string;
  allowUnclaim: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Deliverable {
  id: string;
  organizationId: string;
  assignmentId: string;
  claimId: string;
  revision: number;
  url: string;
  label: string;
  notes?: string;
  submittedById: string;
  submittedByName: string;
  createdAt: string;
}

export interface ClaimRevision {
  id: string;
  claimId: string;
  revisionNumber: number;
  deliverableUrl: string;
  deliverableLabel: string;
  submittedAt: string;
  submittedById: string;
  submittedByName: string;
  reviewedAt?: string;
  reviewedById?: string;
  reviewedByName?: string;
  reviewStatus?: 'Approved' | 'Changes_Requested';
  reviewFeedback?: string;
  severity?: RevisionSeverity;
}

export interface Claim {
  id: string;
  organizationId: string;
  assignmentId: string;
  workerId: string;
  workerName: string;
  workerAvatarUrl?: string;
  status: ClaimStatus;
  claimedAt: string;
  startedAt?: string;
  submittedAt?: string;
  reviewedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  deadline?: string;
  revisions: ClaimRevision[];
  deliverables: Deliverable[];
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  organizationId: string;
  assignmentId: string;
  claimId: string;
  revisionId: string;
  reviewerId: string;
  reviewerName: string;
  status: 'Approved' | 'Changes_Requested';
  comment: string;
  correctionRequest?: string;
  attachmentUrl?: string;
  severity?: RevisionSeverity;
  createdAt: string;
}

export interface DiscordGuild {
  id: string;
  organizationId: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface DiscordChannelMapping {
  id: string;
  organizationId: string;
  guildId: string;
  channelId: string;
  channelName: string;
  mangaId: string;
  mangaTitle?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiscordRoleMapping {
  id: string;
  organizationId: string;
  guildId: string;
  roleId: string;
  roleName: string;
  workTypeId: string;
  workTypeName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  message: string;
  type: 'claim' | 'assignment' | 'review' | 'deadline' | 'mention' | 'system';
  isRead: boolean;
  linkUrl?: string;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  organizationId: string;
  actorId: string;
  actorName: string;
  action: string; // e.g. "claimed Cleaning", "assigned Chapter 1150"
  entityType: 'manga' | 'chapter' | 'assignment' | 'claim' | 'user' | 'review';
  entityId: string;
  entityName?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  actorId: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  before?: any;
  after?: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface SmartSuggestion {
  workerId: string;
  workerName: string;
  avatarUrl?: string;
  workTypeName: string;
  activeTasksCount: number;
  averageCompletionHours: number;
  overdueCount: number;
  availability: UserAvailability;
  score: number;
  reason: string;
}

export interface BottleneckMetric {
  workTypeId: string;
  workTypeName: string;
  averageWaitingHours: number;
  averageActiveHours: number;
  overdueRatePercent: number;
  revisionRatePercent: number;
}

export interface TeamStats {
  totalTasksCompleted: number;
  totalChaptersCompleted: number;
  averageTaskCompletionHours: number;
  averageReviewHours: number;
  overdueTasksCount: number;
  bottlenecks: BottleneckMetric[];
}
