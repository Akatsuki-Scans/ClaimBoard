import mongoose from 'mongoose';
import { WorkAssignmentModel } from '../models/WorkAssignment';
import { ClaimModel } from '../models/Claim';
import { DeliverableModel } from '../models/Deliverable';
import { ReviewModel } from '../models/Review';
import { MangaModel } from '../models/Manga';
import { ChapterModel } from '../models/Chapter';
import { WorkTypeModel } from '../models/WorkType';
import { WorkTemplateModel } from '../models/WorkTemplate';
import { UserModel } from '../models/User';
import { ActivityLogModel, AuditLogModel, NotificationModel } from '../models/AuditAndNotificationModels';
import {
  API_ERROR_CODES,
  SOCKET_EVENTS,
  WorkAssignmentStatus,
  ClaimStatus,
  PriorityLevel,
  RevisionSeverity,
} from '@claimboard/shared';

export interface AssignWorkParams {
  organizationId: string;
  mangaId: string;
  chapterId: string;
  workTypeIds: string[];
  priority?: PriorityLevel;
  deadline?: Date;
  dependsOnPreviousInOrder?: boolean;
  actorId: string;
  actorName: string;
}

export interface ClaimWorkParams {
  organizationId: string;
  assignmentId: string;
  workerId: string;
  workerName: string;
  workerAvatarUrl?: string;
}

export interface UnclaimWorkParams {
  organizationId: string;
  assignmentId: string;
  workerId: string;
  workerName?: string;
  reason?: string;
  isAdmin?: boolean;
}

export interface SubmitWorkParams {
  organizationId: string;
  assignmentId: string;
  workerId: string;
  workerName: string;
  deliverableUrl: string;
  label: string;
  notes?: string;
}

export interface ReviewWorkParams {
  organizationId: string;
  assignmentId: string;
  reviewerId: string;
  reviewerName: string;
  status: 'Approved' | 'Changes_Requested';
  comment: string;
  correctionRequest?: string;
  attachmentUrl?: string;
  severity?: RevisionSeverity;
}

export interface ReassignWorkParams {
  organizationId: string;
  assignmentId: string;
  newWorkerId: string;
  reason: string;
  adminId: string;
  adminName: string;
}

export type ProductionLogEventType =
  | 'TASK_CLAIMED'
  | 'TASK_UNCLAIMED'
  | 'TASK_SUBMITTED'
  | 'TASK_COMPLETED'
  | 'CHAPTER_COMPLETED'
  | 'TASK_CHANGES_REQUESTED'
  | 'DEADLINE_UPDATED';

export interface ProductionLogEvent {
  type: ProductionLogEventType;
  organizationId: string;
  guildId?: string | null;
  payload: Record<string, any>;
}

// Global broadcast dispatcher function injected by server
let eventBroadcaster: ((event: string, payload: any) => void) | null = null;
let productionLogHook: ((event: ProductionLogEvent) => Promise<void> | void) | null = null;

export function setEventBroadcaster(broadcaster: (event: string, payload: any) => void) {
  eventBroadcaster = broadcaster;
}

export function setProductionLogHook(hook: (event: ProductionLogEvent) => Promise<void> | void) {
  productionLogHook = hook;
}

export function broadcastEvent(event: string, payload: any) {
  if (eventBroadcaster) {
    try {
      eventBroadcaster(event, payload);
    } catch (e) {
      console.error(`[EventBroadcaster] Failed to broadcast ${event}:`, e);
    }
  }
}

export async function emitProductionLog(event: ProductionLogEvent) {
  if (!productionLogHook) return;
  try {
    await productionLogHook(event);
  } catch (e) {
    console.error(`[ProductionLogHook] Failed to emit ${event.type}:`, e);
  }
}

export class ProductionService {
  /**
   * Assign work for a chapter with optional pipeline sequencing
   */
  static async assignWork(params: AssignWorkParams) {
    const {
      organizationId,
      mangaId,
      chapterId,
      workTypeIds,
      priority = 'Normal',
      deadline,
      dependsOnPreviousInOrder = false,
      actorId,
      actorName,
    } = params;

    const manga: any = await MangaModel.findOne({ _id: mangaId, organizationId });
    if (!manga) throw { code: API_ERROR_CODES.MANGA_NOT_FOUND, message: 'Manga not found' };

    const chapter: any = await ChapterModel.findOne({ _id: chapterId, mangaId, organizationId });
    if (!chapter) throw { code: API_ERROR_CODES.CHAPTER_NOT_FOUND, message: 'Chapter not found' };

    const workTypes = await WorkTypeModel.find({ _id: { $in: workTypeIds }, organizationId }).sort({ sortOrder: 1 });
    if (!workTypes.length) {
      throw { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'No valid work types provided' };
    }

    const createdAssignments = [];
    let newlyCreatedCount = 0;
    let previousAssignmentId: mongoose.Types.ObjectId | null = null;

    for (let i = 0; i < workTypes.length; i++) {
      const wt = workTypes[i];

      // Prevent duplicate (chapterId, workTypeId) slots on the same chapter
      const existing: any = await WorkAssignmentModel.findOne({
        organizationId,
        chapterId: chapter._id,
        workTypeId: wt._id,
      });

      if (existing) {
        if (deadline && !existing.deadline) {
          existing.deadline = deadline;
          await existing.save();
        }
        previousAssignmentId = existing._id;
        createdAssignments.push(existing);
        continue;
      }

      const dependsOn: mongoose.Types.ObjectId[] = dependsOnPreviousInOrder && previousAssignmentId ? [previousAssignmentId] : [];
      const isBlocked = dependsOn.length > 0;

      // Calculate deadline offset if specified
      let assignmentDeadline = deadline;
      if (!assignmentDeadline) {
        const hours = wt.defaultDeadlineHours || 48;
        assignmentDeadline = new Date(Date.now() + hours * 3600 * 1000);
      }

      const assignment: any = await WorkAssignmentModel.create({
        organizationId: new mongoose.Types.ObjectId(organizationId),
        mangaId: new mongoose.Types.ObjectId(mangaId),
        chapterId: new mongoose.Types.ObjectId(chapterId),
        workTypeId: wt._id,
        status: 'OPEN',
        priority,
        deadline: assignmentDeadline,
        dependsOnAssignmentIds: dependsOn,
        isBlocked,
        blockedReason: isBlocked ? 'Waiting for preceding step in pipeline' : undefined,
      });

      previousAssignmentId = assignment._id;
      createdAssignments.push(assignment);
      newlyCreatedCount++;
    }

    if (newlyCreatedCount > 0) {
      // Update manga open tasks count
      await MangaModel.updateOne(
        { _id: mangaId },
        { $inc: { openTasksCount: newlyCreatedCount } }
      );

      await ActivityLogModel.create({
        organizationId: new mongoose.Types.ObjectId(organizationId),
        actorId: new mongoose.Types.ObjectId(actorId),
        actorName,
        action: `Assigned ${newlyCreatedCount} tasks for ${manga.title} Ch. ${chapter.chapterNumber}`,
        entityType: 'chapter',
        entityId: chapter._id,
        entityName: `${manga.title} - Ch. ${chapter.chapterNumber}`,
      });

      await AuditLogModel.create({
        organizationId: new mongoose.Types.ObjectId(organizationId),
        actorId: new mongoose.Types.ObjectId(actorId),
        actorName,
        action: 'ASSIGNMENT_CREATED',
        entity: 'Chapter',
        entityId: chapter._id.toString(),
        after: { assignmentsCreated: newlyCreatedCount },
      });

      broadcastEvent(SOCKET_EVENTS.ASSIGNMENT_CREATED, {
        chapterId,
        mangaId,
        count: newlyCreatedCount,
      });
    }

    return createdAssignments;
  }

  /**
   * ATOMIC Claim Work: Guarantees concurrency safety using atomic findOneAndUpdate
   */
  static async claimWork(params: ClaimWorkParams) {
    const { organizationId, assignmentId, workerId, workerName, workerAvatarUrl } = params;

    const assignment: any = await WorkAssignmentModel.findOne({
      _id: assignmentId,
      organizationId,
    }).populate('workTypeId');

    if (!assignment) {
      throw { code: API_ERROR_CODES.ASSIGNMENT_NOT_FOUND, message: 'Work assignment not found.' };
    }

    // Check if task is blocked by unfinished dependencies
    if (assignment.dependsOnAssignmentIds && assignment.dependsOnAssignmentIds.length > 0) {
      const unfinishedDeps = await WorkAssignmentModel.countDocuments({
        _id: { $in: assignment.dependsOnAssignmentIds },
        status: { $ne: 'COMPLETED' },
      });

      if (unfinishedDeps > 0) {
        throw {
          code: API_ERROR_CODES.ASSIGNMENT_BLOCKED,
          message: 'Cannot claim this task because preceding dependency tasks are not completed.',
        };
      }
    }

    // ATOMIC UPDATE: Only update if status is still strictly OPEN
    const updatedAssignment: any = await WorkAssignmentModel.findOneAndUpdate(
      {
        _id: assignmentId,
        organizationId,
        status: 'OPEN',
      },
      {
        $set: {
          status: 'CLAIMED',
          assignedWorkerId: new mongoose.Types.ObjectId(workerId),
          assignedWorkerName: workerName,
          claimedAt: new Date(),
        },
        $inc: { version: 1 },
      },
      { new: true }
    );

    if (!updatedAssignment) {
      throw {
        code: API_ERROR_CODES.ASSIGNMENT_ALREADY_CLAIMED,
        message: 'Conflict: This work assignment was just claimed by another worker.',
      };
    }

    // Create the Claim entity
    const claim: any = await ClaimModel.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      assignmentId: updatedAssignment._id,
      workerId: new mongoose.Types.ObjectId(workerId),
      workerName,
      workerAvatarUrl,
      status: 'ACTIVE',
      claimedAt: new Date(),
      deadline: updatedAssignment.deadline,
      revisions: [],
    });

    // Link active claim to assignment
    updatedAssignment.activeClaimId = claim._id;
    await updatedAssignment.save();

    // Increment worker's active claims count and update manga metrics
    await UserModel.updateOne(
      { _id: workerId },
      { $inc: { activeClaimsCount: 1 } }
    );
    await MangaModel.updateOne(
      { _id: updatedAssignment.mangaId },
      { $inc: { openTasksCount: -1, claimedTasksCount: 1 } }
    );

    // Activity and Audit
    const workTypeName = (assignment.workTypeId as any)?.name || 'Task';
    await ActivityLogModel.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      actorId: new mongoose.Types.ObjectId(workerId),
      actorName: workerName,
      action: `Claimed ${workTypeName}`,
      entityType: 'assignment',
      entityId: updatedAssignment._id,
      entityName: workTypeName,
    });

    await AuditLogModel.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      actorId: new mongoose.Types.ObjectId(workerId),
      actorName: workerName,
      action: 'CLAIM_CREATED',
      entity: 'WorkAssignment',
      entityId: assignmentId,
      after: { status: 'CLAIMED', claimedBy: workerName },
    });

    broadcastEvent(SOCKET_EVENTS.ASSIGNMENT_CLAIMED, {
      assignmentId,
      workerId,
      workerName,
      claimId: claim._id,
    });

    const [mangaDoc, chapterDoc, workerDoc]: any[] = await Promise.all([
      MangaModel.findById(updatedAssignment.mangaId).select('title coverUrl discordGuildId').lean(),
      ChapterModel.findById(updatedAssignment.chapterId).select('chapterNumber title').lean(),
      UserModel.findById(workerId).select('displayName discordId').lean(),
    ]);

    await emitProductionLog({
      type: 'TASK_CLAIMED',
      organizationId,
      guildId: mangaDoc?.discordGuildId || null,
      payload: {
        mangaId: updatedAssignment.mangaId?.toString(),
        mangaTitle: mangaDoc?.title || 'Manga',
        mangaCoverUrl: mangaDoc?.coverUrl,
        chapterId: updatedAssignment.chapterId?.toString(),
        chapterNumber: chapterDoc?.chapterNumber || '?',
        workTypeName,
        workTypeCode: (assignment.workTypeId as any)?.code,
        workerName: workerDoc?.displayName || workerName,
        workerDiscordId: workerDoc?.discordId,
        deadline: claim.deadline,
      },
    });

    return { assignment: updatedAssignment, claim };
  }

  /**
   * Unclaim Work
   */
  static async unclaimWork(params: UnclaimWorkParams) {
    const { organizationId, assignmentId, workerId, workerName, reason = 'Worker released claim', isAdmin = false } = params;

    const assignment: any = await WorkAssignmentModel.findOne({ _id: assignmentId, organizationId });
    if (!assignment) {
      throw { code: API_ERROR_CODES.ASSIGNMENT_NOT_FOUND, message: 'Assignment not found' };
    }

    if (!isAdmin && assignment.assignedWorkerId?.toString() !== workerId) {
      throw { code: API_ERROR_CODES.FORBIDDEN, message: 'You do not hold this claim.' };
    }

    if (!isAdmin && ['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'COMPLETED'].includes(assignment.status)) {
      throw {
        code: API_ERROR_CODES.UNCLAIM_NOT_ALLOWED,
        message: 'Cannot unclaim work that has already been submitted or completed.',
      };
    }

    // Cancel claim
    if (assignment.activeClaimId) {
      await ClaimModel.updateOne(
        { _id: assignment.activeClaimId },
        {
          $set: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelReason: reason,
          },
        }
      );
    }

    const previousWorkerId = assignment.assignedWorkerId;

    // Reset assignment back to OPEN
    assignment.status = 'OPEN';
    assignment.assignedWorkerId = undefined;
    assignment.assignedWorkerName = undefined;
    assignment.claimedAt = undefined;
    assignment.activeClaimId = undefined;
    assignment.submittedAt = undefined;
    await assignment.save();

    if (previousWorkerId) {
      await UserModel.updateOne(
        { _id: previousWorkerId },
        { $inc: { activeClaimsCount: -1 } }
      );
    }

    await MangaModel.updateOne(
      { _id: assignment.mangaId },
      { $inc: { openTasksCount: 1, claimedTasksCount: -1 } }
    );

    await ActivityLogModel.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      actorId: new mongoose.Types.ObjectId(workerId),
      actorName: workerName || 'Worker',
      action: `Unclaimed task: ${reason}`,
      entityType: 'assignment',
      entityId: assignment._id,
    });

    await AuditLogModel.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      actorId: new mongoose.Types.ObjectId(workerId),
      actorName: workerName || 'Worker',
      action: 'CLAIM_CANCELLED',
      entity: 'WorkAssignment',
      entityId: assignmentId,
      after: { status: 'OPEN', reason },
    });

    broadcastEvent(SOCKET_EVENTS.ASSIGNMENT_UNCLAIMED, {
      assignmentId,
      reason,
    });

    const [mangaDoc, chapterDoc, workTypeDoc]: any[] = await Promise.all([
      MangaModel.findById(assignment.mangaId).select('title discordGuildId').lean(),
      ChapterModel.findById(assignment.chapterId).select('chapterNumber').lean(),
      WorkTypeModel.findById(assignment.workTypeId).select('name code').lean(),
    ]);

    await emitProductionLog({
      type: 'TASK_UNCLAIMED',
      organizationId,
      guildId: mangaDoc?.discordGuildId || null,
      payload: {
        mangaTitle: mangaDoc?.title || 'Manga',
        chapterNumber: chapterDoc?.chapterNumber || '?',
        workTypeName: workTypeDoc?.name || 'Task',
        workerName: workerName || 'Worker',
        reason,
      },
    });

    return assignment;
  }

  /**
   * Submit Work with Deliverable URL
   */
  static async submitWork(params: SubmitWorkParams) {
    const { organizationId, assignmentId, workerId, workerName, deliverableUrl, label, notes } = params;

    const assignment: any = await WorkAssignmentModel.findOne({ _id: assignmentId, organizationId }).populate('workTypeId');
    if (!assignment) throw { code: API_ERROR_CODES.ASSIGNMENT_NOT_FOUND, message: 'Assignment not found' };

    if (assignment.assignedWorkerId?.toString() !== workerId) {
      throw { code: API_ERROR_CODES.FORBIDDEN, message: 'Only the assigned worker can submit deliverables.' };
    }

    const claim: any = await ClaimModel.findById(assignment.activeClaimId);
    if (!claim) throw { code: API_ERROR_CODES.CLAIM_NOT_FOUND, message: 'Active claim not found' };

    const newRevisionNumber = (claim.revisions?.length || 0) + 1;

    // Create Deliverable document
    const deliverable = await DeliverableModel.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      assignmentId: assignment._id,
      claimId: claim._id,
      revision: newRevisionNumber,
      url: deliverableUrl,
      label,
      notes,
      submittedById: new mongoose.Types.ObjectId(workerId),
      submittedByName: workerName,
    });

    // Add revision to claim
    claim.revisions.push({
      revisionNumber: newRevisionNumber,
      deliverableUrl,
      deliverableLabel: label,
      submittedAt: new Date(),
      submittedById: new mongoose.Types.ObjectId(workerId),
      submittedByName: workerName,
    } as any);

    const requiresReview = (assignment.workTypeId as any)?.requiresReview ?? true;

    if (requiresReview) {
      claim.status = 'SUBMITTED';
      claim.submittedAt = new Date();
      assignment.status = 'SUBMITTED';
      assignment.submittedAt = new Date();
    } else {
      // Direct completion without review
      claim.status = 'COMPLETED';
      claim.completedAt = new Date();
      assignment.status = 'COMPLETED';
      assignment.completedAt = new Date();

      await UserModel.updateOne({ _id: workerId }, { $inc: { activeClaimsCount: -1, completedTasksCount: 1 } });
      await MangaModel.updateOne({ _id: assignment.mangaId }, { $inc: { claimedTasksCount: -1 } });

      // Unblock downstream tasks
      await ProductionService.unblockDependentAssignments(assignment._id.toString(), organizationId);
    }

    await claim.save();
    await assignment.save();

    await ActivityLogModel.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      actorId: new mongoose.Types.ObjectId(workerId),
      actorName: workerName,
      action: `Submitted deliverable (Rev #${newRevisionNumber}) for ${(assignment.workTypeId as any)?.name || 'task'}`,
      entityType: 'assignment',
      entityId: assignment._id,
      metadata: { deliverableUrl, revision: newRevisionNumber },
    });

    broadcastEvent(SOCKET_EVENTS.ASSIGNMENT_UPDATED, {
      assignmentId,
      status: assignment.status,
      revision: newRevisionNumber,
    });

    const [mangaDoc, chapterDoc, workerDoc]: any[] = await Promise.all([
      MangaModel.findById(assignment.mangaId).select('title coverUrl discordGuildId').lean(),
      ChapterModel.findById(assignment.chapterId).select('chapterNumber title').lean(),
      UserModel.findById(workerId).select('displayName discordId').lean(),
    ]);

    const wtObj = assignment.workTypeId as any;
    await emitProductionLog({
      type: 'TASK_SUBMITTED',
      organizationId,
      guildId: mangaDoc?.discordGuildId || null,
      payload: {
        mangaId: assignment.mangaId?.toString(),
        mangaTitle: mangaDoc?.title || 'Manga',
        mangaCoverUrl: mangaDoc?.coverUrl,
        chapterId: assignment.chapterId?.toString(),
        chapterNumber: chapterDoc?.chapterNumber || '?',
        workTypeName: wtObj?.name || 'Task',
        workTypeCode: wtObj?.code,
        workerName: workerDoc?.displayName || workerName,
        workerDiscordId: workerDoc?.discordId,
        deliverableUrl,
        notes,
        revision: newRevisionNumber,
      },
    });

    if (!requiresReview) {
      await emitProductionLog({
        type: 'TASK_COMPLETED',
        organizationId,
        guildId: mangaDoc?.discordGuildId || null,
        payload: {
          mangaId: assignment.mangaId?.toString(),
          mangaTitle: mangaDoc?.title || 'Manga',
          mangaCoverUrl: mangaDoc?.coverUrl,
          chapterId: assignment.chapterId?.toString(),
          chapterNumber: chapterDoc?.chapterNumber || '?',
          chapterTitle: chapterDoc?.title,
          workTypeName: wtObj?.name || 'Task',
          workTypeCode: wtObj?.code || 'TASK',
          workerName: workerDoc?.displayName || workerName,
          workerDiscordId: workerDoc?.discordId,
          reviewerName: 'Auto-Completed',
          deliverableUrl,
          completedAt: assignment.completedAt || new Date(),
          deadline: assignment.deadline,
        },
      });
      await ProductionService.checkAndCompleteChapter(assignment.chapterId.toString(), organizationId);
    }

    return { assignment, claim, deliverable };
  }

  /**
   * Review Work: Approve or Request Changes
   */
  static async reviewWork(params: ReviewWorkParams) {
    const { organizationId, assignmentId, reviewerId, reviewerName, status, comment, correctionRequest, attachmentUrl, severity } = params;

    const assignment: any = await WorkAssignmentModel.findOne({ _id: assignmentId, organizationId }).populate('workTypeId');
    if (!assignment) throw { code: API_ERROR_CODES.ASSIGNMENT_NOT_FOUND, message: 'Assignment not found' };

    const claim: any = await ClaimModel.findById(assignment.activeClaimId);
    if (!claim) throw { code: API_ERROR_CODES.CLAIM_NOT_FOUND, message: 'Claim not found' };

    // Update the latest revision with review outcome
    if (claim.revisions && claim.revisions.length > 0) {
      const latestRev = claim.revisions[claim.revisions.length - 1];
      latestRev.reviewedAt = new Date();
      latestRev.reviewedById = new mongoose.Types.ObjectId(reviewerId);
      latestRev.reviewedByName = reviewerName;
      latestRev.reviewStatus = status;
      latestRev.reviewFeedback = comment;
      latestRev.severity = severity;
    }

    // Create Review record
    await ReviewModel.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      assignmentId: assignment._id,
      claimId: claim._id,
      reviewerId: new mongoose.Types.ObjectId(reviewerId),
      reviewerName,
      status,
      comment,
      correctionRequest,
      attachmentUrl,
      severity,
    });

    if (status === 'Approved') {
      claim.status = 'COMPLETED';
      claim.completedAt = new Date();
      assignment.status = 'COMPLETED';
      assignment.completedAt = new Date();

      if (claim.workerId) {
        await UserModel.updateOne(
          { _id: claim.workerId },
          { $inc: { activeClaimsCount: -1, completedTasksCount: 1 } }
        );
      }

      await MangaModel.updateOne(
        { _id: assignment.mangaId },
        { $inc: { claimedTasksCount: -1 } }
      );

      // Unblock downstream tasks
      await ProductionService.unblockDependentAssignments(assignment._id.toString(), organizationId);
    } else {
      // Changes requested
      claim.status = 'CHANGES_REQUESTED';
      assignment.status = 'CHANGES_REQUESTED';
    }

    await claim.save();
    await assignment.save();

    // Create notification for worker
    if (claim.workerId) {
      await NotificationModel.create({
        organizationId: new mongoose.Types.ObjectId(organizationId),
        userId: claim.workerId,
        title: status === 'Approved' ? 'Work Approved' : 'Changes Requested',
        message: `${reviewerName} ${status === 'Approved' ? 'approved' : 'requested changes on'} your ${(assignment.workTypeId as any)?.name || 'task'}.`,
        type: 'review',
        linkUrl: `/my-claims/${claim._id}`,
      });
    }

    await ActivityLogModel.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      actorId: new mongoose.Types.ObjectId(reviewerId),
      actorName: reviewerName,
      action: `${status === 'Approved' ? 'Approved' : 'Requested changes for'} ${(assignment.workTypeId as any)?.name || 'task'}`,
      entityType: 'review',
      entityId: assignment._id,
      metadata: { status, comment, severity },
    });

    broadcastEvent(SOCKET_EVENTS.ASSIGNMENT_UPDATED, {
      assignmentId,
      status: assignment.status,
      reviewStatus: status,
    });

    const [mangaDoc, chapterDoc, workerDoc, reviewerDoc]: any[] = await Promise.all([
      MangaModel.findById(assignment.mangaId).select('title coverUrl discordGuildId').lean(),
      ChapterModel.findById(assignment.chapterId).select('chapterNumber title').lean(),
      claim.workerId ? UserModel.findById(claim.workerId).select('displayName discordId').lean() : null,
      UserModel.findById(reviewerId).select('displayName discordId').lean(),
    ]);

    const wtObj = assignment.workTypeId as any;
    const latestDeliverableUrl = claim.revisions?.length
      ? claim.revisions[claim.revisions.length - 1]?.deliverableUrl
      : undefined;

    if (status === 'Approved') {
      await emitProductionLog({
        type: 'TASK_COMPLETED',
        organizationId,
        guildId: mangaDoc?.discordGuildId || null,
        payload: {
          mangaId: assignment.mangaId?.toString(),
          mangaTitle: mangaDoc?.title || 'Manga',
          mangaCoverUrl: mangaDoc?.coverUrl,
          chapterId: assignment.chapterId?.toString(),
          chapterNumber: chapterDoc?.chapterNumber || '?',
          chapterTitle: chapterDoc?.title,
          workTypeName: wtObj?.name || 'Task',
          workTypeCode: wtObj?.code || 'TASK',
          workerName: workerDoc?.displayName || assignment.assignedWorkerName || claim.workerName || 'Worker',
          workerDiscordId: workerDoc?.discordId,
          reviewerName: reviewerDoc?.displayName || reviewerName,
          reviewerDiscordId: reviewerDoc?.discordId,
          deliverableUrl: latestDeliverableUrl,
          comment,
          completedAt: assignment.completedAt || new Date(),
          deadline: assignment.deadline,
        },
      });
      await ProductionService.checkAndCompleteChapter(assignment.chapterId.toString(), organizationId);
    } else {
      await emitProductionLog({
        type: 'TASK_CHANGES_REQUESTED',
        organizationId,
        guildId: mangaDoc?.discordGuildId || null,
        payload: {
          mangaId: assignment.mangaId?.toString(),
          mangaTitle: mangaDoc?.title || 'Manga',
          mangaCoverUrl: mangaDoc?.coverUrl,
          chapterId: assignment.chapterId?.toString(),
          chapterNumber: chapterDoc?.chapterNumber || '?',
          workTypeName: wtObj?.name || 'Task',
          workTypeCode: wtObj?.code,
          workerName: workerDoc?.displayName || assignment.assignedWorkerName || claim.workerName || 'Worker',
          workerDiscordId: workerDoc?.discordId,
          reviewerName: reviewerDoc?.displayName || reviewerName,
          reviewerDiscordId: reviewerDoc?.discordId,
          comment,
        },
      });
    }

    return { assignment, claim };
  }

  /**
   * Reassign Work (Admin Action)
   */
  static async reassignWork(params: ReassignWorkParams) {
    const { organizationId, assignmentId, newWorkerId, reason, adminId, adminName } = params;

    const assignment: any = await WorkAssignmentModel.findOne({ _id: assignmentId, organizationId });
    if (!assignment) throw { code: API_ERROR_CODES.ASSIGNMENT_NOT_FOUND, message: 'Assignment not found' };

    const newWorker: any = await UserModel.findOne({ _id: newWorkerId, organizationId });
    if (!newWorker) throw { code: API_ERROR_CODES.USER_NOT_FOUND, message: 'New worker not found' };

    const previousWorkerId = assignment.assignedWorkerId;

    // Cancel old claim if active
    if (assignment.activeClaimId) {
      await ClaimModel.updateOne(
        { _id: assignment.activeClaimId },
        {
          $set: {
            status: 'REASSIGNED',
            cancelledAt: new Date(),
            cancelReason: `Reassigned to ${newWorker.displayName}: ${reason}`,
          },
        }
      );
    }

    if (previousWorkerId) {
      await UserModel.updateOne({ _id: previousWorkerId }, { $inc: { activeClaimsCount: -1 } });
    }

    // Create new claim for new worker
    const newClaim: any = await ClaimModel.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      assignmentId: assignment._id,
      workerId: newWorker._id,
      workerName: newWorker.displayName,
      workerAvatarUrl: newWorker.avatarUrl,
      status: 'ACTIVE',
      claimedAt: new Date(),
      deadline: assignment.deadline,
      revisions: [],
    });

    assignment.assignedWorkerId = newWorker._id;
    assignment.assignedWorkerName = newWorker.displayName;
    assignment.activeClaimId = newClaim._id;
    assignment.status = 'CLAIMED';
    assignment.claimedAt = new Date();
    await assignment.save();

    await UserModel.updateOne({ _id: newWorker._id }, { $inc: { activeClaimsCount: 1 } });

    await AuditLogModel.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      actorId: new mongoose.Types.ObjectId(adminId),
      actorName: adminName,
      action: 'CLAIM_REASSIGNED',
      entity: 'WorkAssignment',
      entityId: assignmentId,
      before: { previousWorkerId: previousWorkerId?.toString() },
      after: { newWorkerId, newWorkerName: newWorker.displayName, reason },
    });

    broadcastEvent(SOCKET_EVENTS.CLAIM_REASSIGNED, {
      assignmentId,
      newWorkerId,
      newWorkerName: newWorker.displayName,
    });

    return { assignment, claim: newClaim };
  }

  /**
   * Dependency resolution: Unblocks any downstream assignments whose dependencies are now all COMPLETED
   */
  static async unblockDependentAssignments(completedAssignmentId: string, organizationId: string) {
    const dependentAssignments: any[] = await WorkAssignmentModel.find({
      organizationId,
      dependsOnAssignmentIds: new mongoose.Types.ObjectId(completedAssignmentId),
      isBlocked: true,
    });

    for (const dep of dependentAssignments) {
      const remainingUnfinished = await WorkAssignmentModel.countDocuments({
        _id: { $in: dep.dependsOnAssignmentIds },
        status: { $ne: 'COMPLETED' },
      });

      if (remainingUnfinished === 0) {
        dep.isBlocked = false;
        dep.blockedReason = undefined;
        await dep.save();

        broadcastEvent(SOCKET_EVENTS.ASSIGNMENT_UPDATED, {
          assignmentId: dep._id.toString(),
          isBlocked: false,
        });
      }
    }
  }

  /**
   * Checks if all assignments for a chapter are completed. If so, marks the chapter Completed and emits log event.
   */
  static async checkAndCompleteChapter(chapterId: string, organizationId: string) {
    const assignments: any[] = await WorkAssignmentModel.find({
      chapterId,
      organizationId,
    })
      .populate('workTypeId', 'name code sortOrder')
      .populate('assignedWorkerId', 'displayName discordId')
      .lean();

    if (!assignments || assignments.length === 0) return false;

    const allDone = assignments.every(
      (a) => a.status === 'COMPLETED' || a.status === 'APPROVED'
    );
    if (!allDone) return false;

    const chapter: any = await ChapterModel.findOne({ _id: chapterId, organizationId });
    if (!chapter) return false;
    if (chapter.status === 'Completed' || chapter.status === 'Published') {
      return false;
    }

    const completedAt = new Date();
    chapter.status = 'Completed';
    chapter.completedAt = completedAt;
    await chapter.save();

    const manga: any = await MangaModel.findById(chapter.mangaId);
    if (manga) {
      manga.completedChapters = (manga.completedChapters || 0) + 1;
      manga.activeChapters = Math.max(0, (manga.activeChapters || 1) - 1);
      await manga.save();
    }

    const sortedTasks = [...assignments].sort(
      (a, b) => (a.workTypeId?.sortOrder || 0) - (b.workTypeId?.sortOrder || 0)
    );

    const tasksSummary = sortedTasks.map((a) => ({
      workTypeName: a.workTypeId?.name || 'Task',
      workTypeCode: a.workTypeId?.code || 'TASK',
      workerName: a.assignedWorkerId?.displayName || a.assignedWorkerName || 'Unassigned',
      workerDiscordId: a.assignedWorkerId?.discordId,
      completedAt: a.completedAt,
    }));

    const summaryActor = tasksSummary[tasksSummary.length - 1]?.workerName || 'System';
    const firstWorkerId = sortedTasks.find((a) => a.assignedWorkerId?._id)?.assignedWorkerId?._id || chapter.organizationId;

    await ActivityLogModel.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      actorId: new mongoose.Types.ObjectId(firstWorkerId),
      actorName: summaryActor,
      action: `Completed all stages for ${manga?.title || 'Manga'} — Ch. ${chapter.chapterNumber}`,
      entityType: 'chapter',
      entityId: chapter._id,
      entityName: `${manga?.title || 'Manga'} - Ch. ${chapter.chapterNumber}`,
      metadata: { tasks: tasksSummary },
    });

    broadcastEvent(SOCKET_EVENTS.PIPELINE_UPDATED, {
      chapterId: chapter._id.toString(),
      mangaId: chapter.mangaId?.toString(),
      status: 'Completed',
    });

    await emitProductionLog({
      type: 'CHAPTER_COMPLETED',
      organizationId,
      guildId: manga?.discordGuildId || null,
      payload: {
        mangaId: chapter.mangaId?.toString(),
        mangaTitle: manga?.title || 'Manga',
        mangaCoverUrl: manga?.coverUrl,
        chapterId: chapter._id.toString(),
        chapterNumber: chapter.chapterNumber,
        chapterTitle: chapter.title,
        deadline: chapter.deadline,
        completedAt,
        tasks: tasksSummary,
      },
    });

    return true;
  }

  /**
   * Direct assignment status update (e.g. Pipeline Kanban drag & drop)
   */
  static async updateAssignmentStatus(params: {
    organizationId: string;
    assignmentId: string;
    status: string;
    actorId: string;
    actorName: string;
  }) {
    const { organizationId, assignmentId, status, actorId, actorName } = params;

    const existing: any = await WorkAssignmentModel.findOne({ _id: assignmentId, organizationId })
      .populate('workTypeId');
    if (!existing) {
      throw { code: API_ERROR_CODES.ASSIGNMENT_NOT_FOUND, message: 'Assignment not found' };
    }

    const previousStatus = existing.status;
    existing.status = status;

    if (status === 'COMPLETED' && previousStatus !== 'COMPLETED') {
      existing.completedAt = new Date();
      if (!existing.assignedWorkerId) {
        existing.assignedWorkerId = new mongoose.Types.ObjectId(actorId);
        existing.assignedWorkerName = actorName;
      }
      if (existing.activeClaimId) {
        await ClaimModel.updateOne(
          { _id: existing.activeClaimId },
          { $set: { status: 'COMPLETED', completedAt: existing.completedAt } }
        );
      }
      if (existing.assignedWorkerId) {
        await UserModel.updateOne(
          { _id: existing.assignedWorkerId },
          { $inc: { activeClaimsCount: -1, completedTasksCount: 1 } }
        );
      }
      await MangaModel.updateOne(
        { _id: existing.mangaId },
        { $inc: { claimedTasksCount: -1 } }
      );
    } else if (status === 'IN_PROGRESS' && !existing.assignedWorkerId) {
      existing.assignedWorkerId = new mongoose.Types.ObjectId(actorId);
      existing.assignedWorkerName = actorName;
      existing.claimedAt = new Date();
    }

    await existing.save();

    await AuditLogModel.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      actorId: new mongoose.Types.ObjectId(actorId),
      actorName,
      action: 'ASSIGNMENT_STATUS_UPDATED',
      entity: 'WorkAssignment',
      entityId: assignmentId,
      before: { status: previousStatus },
      after: { status },
    });

    broadcastEvent(SOCKET_EVENTS.ASSIGNMENT_UPDATED, {
      assignmentId,
      status,
    });

    if (status === 'COMPLETED' && previousStatus !== 'COMPLETED') {
      await ProductionService.unblockDependentAssignments(assignmentId, organizationId);

      const [mangaDoc, chapterDoc, workerDoc, actorDoc, deliverableDoc]: any[] = await Promise.all([
        MangaModel.findById(existing.mangaId).select('title coverUrl discordGuildId').lean(),
        ChapterModel.findById(existing.chapterId).select('chapterNumber title').lean(),
        existing.assignedWorkerId
          ? UserModel.findById(existing.assignedWorkerId).select('displayName discordId').lean()
          : null,
        UserModel.findById(actorId).select('displayName discordId').lean(),
        DeliverableModel.findOne({ assignmentId: existing._id }).sort({ revision: -1 }).lean(),
      ]);

      const wtObj = existing.workTypeId as any;
      await emitProductionLog({
        type: 'TASK_COMPLETED',
        organizationId,
        guildId: mangaDoc?.discordGuildId || null,
        payload: {
          mangaId: existing.mangaId?.toString(),
          mangaTitle: mangaDoc?.title || 'Manga',
          mangaCoverUrl: mangaDoc?.coverUrl,
          chapterId: existing.chapterId?.toString(),
          chapterNumber: chapterDoc?.chapterNumber || '?',
          chapterTitle: chapterDoc?.title,
          workTypeName: wtObj?.name || 'Task',
          workTypeCode: wtObj?.code || 'TASK',
          workerName: workerDoc?.displayName || existing.assignedWorkerName || actorName,
          workerDiscordId: workerDoc?.discordId,
          reviewerName: actorDoc?.displayName || actorName,
          reviewerDiscordId: actorDoc?.discordId,
          deliverableUrl: deliverableDoc?.url,
          completedAt: existing.completedAt || new Date(),
          deadline: existing.deadline,
        },
      });

      await ProductionService.checkAndCompleteChapter(existing.chapterId.toString(), organizationId);
    }

    return existing;
  }

  /**
   * Update Deadline on WorkAssignment (and sync Claim + notify worker)
   */
  static async updateAssignmentDeadline(params: {
    organizationId: string;
    assignmentId: string;
    deadline: Date | null;
    actorId: string;
    actorName: string;
  }) {
    const { organizationId, assignmentId, deadline, actorId, actorName } = params;

    const assignment: any = await WorkAssignmentModel.findOne({ _id: assignmentId, organizationId })
      .populate('workTypeId', 'name code')
      .populate('mangaId', 'title coverUrl discordGuildId')
      .populate('chapterId', 'chapterNumber title');

    if (!assignment) {
      throw { code: API_ERROR_CODES.ASSIGNMENT_NOT_FOUND, message: 'Assignment not found' };
    }

    const previousDeadline = assignment.deadline;
    assignment.deadline = deadline || undefined;
    assignment.deadlineReminderSentAt = undefined;
    assignment.overdueAlertSentAt = undefined;
    await assignment.save();

    if (assignment.activeClaimId) {
      await ClaimModel.updateOne(
        { _id: assignment.activeClaimId },
        { $set: { deadline: deadline || undefined } }
      );
    }

    const mangaDoc = assignment.mangaId as any;
    const chapterDoc = assignment.chapterId as any;
    const wtDoc = assignment.workTypeId as any;

    if (assignment.assignedWorkerId) {
      const worker = await UserModel.findById(assignment.assignedWorkerId).select('displayName discordId timezone').lean();
      if (worker && worker._id.toString() !== actorId) {
        let formattedDue = '';
        if (deadline) {
          try {
            formattedDue = new Intl.DateTimeFormat('en-US', {
              timeZone: worker.timezone || 'UTC',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              timeZoneName: 'short',
            }).format(deadline);
          } catch {
            formattedDue = deadline.toISOString();
          }
        }
        await NotificationModel.create({
          organizationId: new mongoose.Types.ObjectId(organizationId),
          userId: worker._id,
          title: deadline ? 'Task Deadline Updated' : 'Task Deadline Cleared',
          message: deadline
            ? `${actorName} set the deadline for ${mangaDoc?.title || 'Manga'} Ch. ${chapterDoc?.chapterNumber || '?'} (${wtDoc?.name || 'Task'}) to ${formattedDue}.`
            : `${actorName} cleared the deadline for ${mangaDoc?.title || 'Manga'} Ch. ${chapterDoc?.chapterNumber || '?'} (${wtDoc?.name || 'Task'}).`,
          type: 'deadline',
          linkUrl: '/calendar',
        });
      }
    }

    await AuditLogModel.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      actorId: new mongoose.Types.ObjectId(actorId),
      actorName,
      action: 'ASSIGNMENT_DEADLINE_UPDATED',
      entity: 'WorkAssignment',
      entityId: assignmentId,
      before: { deadline: previousDeadline },
      after: { deadline },
    });

    broadcastEvent(SOCKET_EVENTS.ASSIGNMENT_UPDATED, {
      assignmentId,
      deadline,
    });

    await emitProductionLog({
      type: 'DEADLINE_UPDATED',
      organizationId,
      guildId: mangaDoc?.discordGuildId || null,
      payload: {
        kind: 'assignment',
        mangaTitle: mangaDoc?.title || 'Manga',
        chapterNumber: chapterDoc?.chapterNumber || '?',
        workTypeName: wtDoc?.name || 'Task',
        workTypeCode: wtDoc?.code,
        workerName: assignment.assignedWorkerName || 'Open Slot',
        deadline,
        actorName,
      },
    });

    return assignment;
  }

  /**
   * Update Deadline on Chapter
   */
  static async updateChapterDeadline(params: {
    organizationId: string;
    chapterId: string;
    deadline: Date | null;
    actorId: string;
    actorName: string;
  }) {
    const { organizationId, chapterId, deadline, actorId, actorName } = params;

    const chapter: any = await ChapterModel.findOne({ _id: chapterId, organizationId })
      .populate('mangaId', 'title coverUrl discordGuildId');
    if (!chapter) {
      throw { code: API_ERROR_CODES.CHAPTER_NOT_FOUND, message: 'Chapter not found' };
    }

    const previousDeadline = chapter.deadline;
    chapter.deadline = deadline || undefined;
    await chapter.save();

    const mangaDoc = chapter.mangaId as any;

    await AuditLogModel.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      actorId: new mongoose.Types.ObjectId(actorId),
      actorName,
      action: 'CHAPTER_DEADLINE_UPDATED',
      entity: 'Chapter',
      entityId: chapterId,
      before: { deadline: previousDeadline },
      after: { deadline },
    });

    broadcastEvent(SOCKET_EVENTS.PIPELINE_UPDATED, {
      chapterId,
      deadline,
    });

    await emitProductionLog({
      type: 'DEADLINE_UPDATED',
      organizationId,
      guildId: mangaDoc?.discordGuildId || null,
      payload: {
        kind: 'chapter',
        mangaTitle: mangaDoc?.title || 'Manga',
        chapterNumber: chapter.chapterNumber,
        deadline,
        actorName,
      },
    });

    return chapter;
  }

  /**
   * Startup maintenance: remove legacy "Upload" / "UP" role and deduplicate duplicate
   * (chapterId, workTypeId) assignment slots caused by earlier double-creation bugs.
   */
  static async cleanupLegacyRolesAndDuplicates() {
    let removedUploadTypes = 0;
    let removedUploadAssignments = 0;
    let removedDuplicateAssignments = 0;

    // 1. Remove any legacy "Upload" / "UP" / "UPLOAD" work types & their assignments/template steps
    const legacyUploadTypes = await WorkTypeModel.find({
      $or: [
        { name: { $regex: /^upload(ing|er)?$/i } },
        { code: { $in: ['UP', 'UPL', 'UPLOAD'] } },
      ],
    })
      .select('_id')
      .lean();

    if (legacyUploadTypes.length > 0) {
      const legacyIds = legacyUploadTypes.map((wt: any) => wt._id);
      const legacyAssigns = await WorkAssignmentModel.find({ workTypeId: { $in: legacyIds } })
        .select('_id')
        .lean();
      if (legacyAssigns.length > 0) {
        const assignIds = legacyAssigns.map((a: any) => a._id);
        await ClaimModel.deleteMany({ assignmentId: { $in: assignIds } });
        await DeliverableModel.deleteMany({ assignmentId: { $in: assignIds } });
        await ReviewModel.deleteMany({ assignmentId: { $in: assignIds } });
        const delAssignRes = await WorkAssignmentModel.deleteMany({ _id: { $in: assignIds } });
        removedUploadAssignments = delAssignRes.deletedCount || 0;
      }

      await WorkTemplateModel.updateMany(
        {},
        { $pull: { steps: { workTypeId: { $in: legacyIds } } } }
      );
      const delWtRes = await WorkTypeModel.deleteMany({ _id: { $in: legacyIds } });
      removedUploadTypes = delWtRes.deletedCount || 0;
    }

    // 2. Deduplicate WorkAssignments sharing the same (organizationId, chapterId, workTypeId)
    const statusWeight: Record<string, number> = {
      COMPLETED: 6,
      APPROVED: 6,
      IN_REVIEW: 5,
      SUBMITTED: 4,
      CHANGES_REQUESTED: 3,
      IN_PROGRESS: 2,
      CLAIMED: 1,
      ACTIVE: 1,
      OPEN: 0,
    };

    const allAssignments: any[] = await WorkAssignmentModel.find({})
      .select('_id organizationId chapterId workTypeId status assignedWorkerId deadline updatedAt')
      .lean();

    const groups = new Map<string, any[]>();
    for (const a of allAssignments) {
      if (!a.chapterId || !a.workTypeId) continue;
      const key = `${a.organizationId.toString()}:${a.chapterId.toString()}:${a.workTypeId.toString()}`;
      const list = groups.get(key) || [];
      list.push(a);
      groups.set(key, list);
    }

    const idsToDelete: any[] = [];
    for (const [, group] of groups) {
      if (group.length <= 1) continue;
      group.sort((a, b) => {
        const scoreA = (statusWeight[a.status] ?? 0) * 10 + (a.assignedWorkerId ? 5 : 0) + (a.deadline ? 2 : 0);
        const scoreB = (statusWeight[b.status] ?? 0) * 10 + (b.assignedWorkerId ? 5 : 0) + (b.deadline ? 2 : 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      });
      for (let i = 1; i < group.length; i++) {
        idsToDelete.push(group[i]._id);
      }
    }

    if (idsToDelete.length > 0) {
      await ClaimModel.deleteMany({ assignmentId: { $in: idsToDelete }, status: { $in: ['ACTIVE', 'IN_PROGRESS', 'SUBMITTED'] } });
      const delDupRes = await WorkAssignmentModel.deleteMany({ _id: { $in: idsToDelete } });
      removedDuplicateAssignments = delDupRes.deletedCount || 0;
    }

    if (removedUploadTypes > 0 || removedUploadAssignments > 0 || removedDuplicateAssignments > 0) {
      console.log(
        `[Cleanup] Removed ${removedUploadTypes} legacy Upload roles, ${removedUploadAssignments} Upload assignments, and ${removedDuplicateAssignments} duplicate task slots.`
      );
    }

    return { removedUploadTypes, removedUploadAssignments, removedDuplicateAssignments };
  }

  /**
   * Delete a work assignment and clean up associated claims, deliverables, reviews, and update manga stats.
   */
  static async deleteAssignment({
    organizationId,
    assignmentId,
    actorId,
    actorName,
  }: {
    organizationId: string;
    assignmentId: string;
    actorId?: string;
    actorName?: string;
  }) {
    const assignment: any = await WorkAssignmentModel.findOne({ _id: assignmentId, organizationId });
    if (!assignment) {
      const error: any = new Error('Assignment not found');
      error.code = API_ERROR_CODES.ASSIGNMENT_NOT_FOUND;
      throw error;
    }

    // Clean up claims, deliverables, reviews
    await ClaimModel.deleteMany({ assignmentId: assignment._id });
    await DeliverableModel.deleteMany({ assignmentId: assignment._id });
    await ReviewModel.deleteMany({ assignmentId: assignment._id });

    // Remove from dependent assignments if any depend on this assignment
    await WorkAssignmentModel.updateMany(
      { dependsOnAssignmentIds: assignment._id },
      { $pull: { dependsOnAssignmentIds: assignment._id } }
    );

    // Delete the assignment
    await WorkAssignmentModel.deleteOne({ _id: assignment._id });

    // Decrement openTasksCount on Manga if this assignment was open
    if (assignment.status === 'OPEN' && assignment.mangaId) {
      await MangaModel.updateOne(
        { _id: assignment.mangaId, openTasksCount: { $gt: 0 } },
        { $inc: { openTasksCount: -1 } }
      ).catch(() => null);
    }

    // Record audit log
    await AuditLogModel.create({
      organizationId,
      actorId: actorId || 'system',
      actorName: actorName || 'System',
      action: 'ASSIGNMENT_DELETED',
      entity: 'WorkAssignment',
      entityId: assignmentId,
      before: assignment.toObject ? assignment.toObject() : assignment,
    }).catch(() => null);

    return { success: true, deletedId: assignmentId };
  }
}
