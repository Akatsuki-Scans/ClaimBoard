export const SYSTEM_ROLES = [
  'Owner',
  'Administrator',
  'Manager',
  'Moderator',
  'Worker',
  'Member',
  'Reviewer',
  'Guest',
] as const;

export type SystemRole = typeof SYSTEM_ROLES[number];

export const PERMISSIONS = [
  'users.view',
  'users.create',
  'users.edit',
  'users.delete',
  'manga.view',
  'manga.create',
  'manga.edit',
  'manga.delete',
  'assignments.view',
  'assignments.create',
  'assignments.edit',
  'assignments.delete',
  'claims.create',
  'claims.cancel',
  'claims.reassign',
  'claims.complete',
  'pipeline.view',
  'pipeline.manage',
  'analytics.view',
  'discord.manage',
  'settings.manage',
  'audit.view',
] as const;

export type Permission = typeof PERMISSIONS[number];

export const DEFAULT_ROLE_PERMISSIONS: Record<SystemRole, Permission[]> = {
  Owner: [...PERMISSIONS],
  Administrator: [...PERMISSIONS],
  Manager: [
    'users.view',
    'manga.view',
    'manga.create',
    'manga.edit',
    'assignments.view',
    'assignments.create',
    'assignments.edit',
    'assignments.delete',
    'claims.create',
    'claims.cancel',
    'claims.reassign',
    'claims.complete',
    'pipeline.view',
    'pipeline.manage',
    'analytics.view',
    'discord.manage',
    'audit.view',
  ],
  Moderator: [
    'users.view',
    'manga.view',
    'assignments.view',
    'assignments.create',
    'assignments.edit',
    'claims.create',
    'claims.cancel',
    'claims.reassign',
    'claims.complete',
    'pipeline.view',
    'pipeline.manage',
    'audit.view',
  ],
  Reviewer: [
    'users.view',
    'manga.view',
    'assignments.view',
    'claims.create',
    'claims.cancel',
    'claims.complete',
    'pipeline.view',
  ],
  Worker: [
    'users.view',
    'manga.view',
    'assignments.view',
    'claims.create',
    'claims.cancel',
    'pipeline.view',
  ],
  Member: [
    'users.view',
    'manga.view',
    'assignments.view',
    'claims.create',
    'claims.cancel',
    'pipeline.view',
  ],
  Guest: [
    'manga.view',
    'assignments.view',
    'pipeline.view',
  ],
};

export const MANGA_STATUSES = [
  'Active',
  'Paused',
  'Completed',
  'Dropped',
  'Archived',
] as const;
export type MangaStatus = typeof MANGA_STATUSES[number];

export const CHAPTER_STATUSES = [
  'Planning',
  'In_Production',
  'Review',
  'Completed',
  'Published',
  'Archived',
] as const;
export type ChapterStatus = typeof CHAPTER_STATUSES[number];

export const PRIORITY_LEVELS = ['Low', 'Normal', 'High', 'Urgent'] as const;
export type PriorityLevel = typeof PRIORITY_LEVELS[number];

export const WORK_ASSIGNMENT_STATUSES = [
  'OPEN',
  'CLAIMED',
  'IN_PROGRESS',
  'SUBMITTED',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type WorkAssignmentStatus = typeof WORK_ASSIGNMENT_STATUSES[number];

export const CLAIM_STATUSES = [
  'ACTIVE',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'COMPLETED',
  'CANCELLED',
  'REASSIGNED',
] as const;
export type ClaimStatus = typeof CLAIM_STATUSES[number];

export const USER_AVAILABILITY = [
  'Available',
  'Busy',
  'Away',
  'Inactive',
] as const;
export type UserAvailability = typeof USER_AVAILABILITY[number];

export const WORKLOAD_LEVELS = [
  'Low',
  'Normal',
  'High',
  'Overloaded',
] as const;
export type WorkloadLevel = typeof WORKLOAD_LEVELS[number];

export const REVISION_SEVERITIES = [
  'Minor',
  'Moderate',
  'Major',
  'Critical',
] as const;
export type RevisionSeverity = typeof REVISION_SEVERITIES[number];

export const API_ERROR_CODES = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSION: 'INSUFFICIENT_PERMISSION',
  ORGANIZATION_ACCESS_DENIED: 'ORGANIZATION_ACCESS_DENIED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  MANGA_NOT_FOUND: 'MANGA_NOT_FOUND',
  CHAPTER_NOT_FOUND: 'CHAPTER_NOT_FOUND',
  ASSIGNMENT_NOT_FOUND: 'ASSIGNMENT_NOT_FOUND',
  CLAIM_NOT_FOUND: 'CLAIM_NOT_FOUND',
  CLAIM_ALREADY_EXISTS: 'CLAIM_ALREADY_EXISTS',
  ASSIGNMENT_ALREADY_CLAIMED: 'ASSIGNMENT_ALREADY_CLAIMED',
  ASSIGNMENT_BLOCKED: 'ASSIGNMENT_BLOCKED',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  UNCLAIM_NOT_ALLOWED: 'UNCLAIM_NOT_ALLOWED',
  DEADLINE_INVALID: 'DEADLINE_INVALID',
  DISCORD_MAPPING_NOT_FOUND: 'DISCORD_MAPPING_NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_CODES;

export const SOCKET_EVENTS = {
  ASSIGNMENT_CREATED: 'assignment.created',
  ASSIGNMENT_UPDATED: 'assignment.updated',
  ASSIGNMENT_CLAIMED: 'assignment.claimed',
  ASSIGNMENT_UNCLAIMED: 'assignment.unclaimed',
  ASSIGNMENT_COMPLETED: 'assignment.completed',
  CLAIM_CREATED: 'claim.created',
  CLAIM_UPDATED: 'claim.updated',
  CLAIM_COMPLETED: 'claim.completed',
  CLAIM_REASSIGNED: 'claim.reassigned',
  MANGA_UPDATED: 'manga.updated',
  PIPELINE_UPDATED: 'pipeline.updated',
  NOTIFICATION_CREATED: 'notification.created',
} as const;
