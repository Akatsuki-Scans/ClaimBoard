import mongoose from 'mongoose';
import { WorkAssignmentModel } from '../models/WorkAssignment';
import { ClaimModel } from '../models/Claim';
import { DeliverableModel } from '../models/Deliverable';
import { ReviewModel } from '../models/Review';
import { MangaModel } from '../models/Manga';
import { ChapterModel } from '../models/Chapter';
import { WorkTypeModel } from '../models/WorkType';
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

// Global broadcast dispatcher function injected by server
let eventBroadcaster: ((event: string, payload: any) => void) | null = null;

export function setEventBroadcaster(broadcaster: (event: string, payload: any) => void) {
  eventBroadcaster = broadcaster;
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
    let previousAssignmentId: mongoose.Types.ObjectId | null = null;

    for (let i = 0; i < workTypes.length; i++) {
      const wt = workTypes[i];
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
    }

    // Update manga open tasks count
    await MangaModel.updateOne(
      { _id: mangaId },
      { $inc: { openTasksCount: createdAssignments.length } }
    );

    await ActivityLogModel.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      actorId: new mongoose.Types.ObjectId(actorId),
      actorName,
      action: `Assigned ${createdAssignments.length} tasks for ${manga.title} Ch. ${chapter.chapterNumber}`,
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
      after: { assignmentsCreated: createdAssignments.length },
    });

    broadcastEvent(SOCKET_EVENTS.ASSIGNMENT_CREATED, {
      chapterId,
      mangaId,
      count: createdAssignments.length,
    });

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
}
