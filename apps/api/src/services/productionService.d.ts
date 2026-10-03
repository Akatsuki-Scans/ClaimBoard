import mongoose from 'mongoose';
import { PriorityLevel, RevisionSeverity } from '@claimboard/shared';
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
export declare function setEventBroadcaster(broadcaster: (event: string, payload: any) => void): void;
export declare function broadcastEvent(event: string, payload: any): void;
export declare class ProductionService {
    /**
     * Assign work for a chapter with optional pipeline sequencing
     */
    static assignWork(params: AssignWorkParams): Promise<any[]>;
    /**
     * ATOMIC Claim Work: Guarantees concurrency safety using atomic findOneAndUpdate
     */
    static claimWork(params: ClaimWorkParams): Promise<{
        assignment: mongoose.Document<unknown, {}, import("@claimboard/database").IWorkAssignment, {}, {}> & import("@claimboard/database").IWorkAssignment & Required<{
            _id: mongoose.Types.ObjectId;
        }> & {
            __v: number;
        };
        claim: mongoose.Document<unknown, {}, import("@claimboard/database").IClaim, {}, {}> & import("@claimboard/database").IClaim & Required<{
            _id: mongoose.Types.ObjectId;
        }> & {
            __v: number;
        };
    }>;
    /**
     * Unclaim Work
     */
    static unclaimWork(params: UnclaimWorkParams): Promise<mongoose.Document<unknown, {}, import("@claimboard/database").IWorkAssignment, {}, {}> & import("@claimboard/database").IWorkAssignment & Required<{
        _id: mongoose.Types.ObjectId;
    }> & {
        __v: number;
    }>;
    /**
     * Submit Work with Deliverable URL
     */
    static submitWork(params: SubmitWorkParams): Promise<{
        assignment: mongoose.Document<unknown, {}, import("@claimboard/database").IWorkAssignment, {}, {}> & import("@claimboard/database").IWorkAssignment & Required<{
            _id: mongoose.Types.ObjectId;
        }> & {
            __v: number;
        };
        claim: mongoose.Document<unknown, {}, import("@claimboard/database").IClaim, {}, {}> & import("@claimboard/database").IClaim & Required<{
            _id: mongoose.Types.ObjectId;
        }> & {
            __v: number;
        };
        deliverable: mongoose.Document<unknown, {}, import("@claimboard/database").IDeliverable, {}, {}> & import("@claimboard/database").IDeliverable & Required<{
            _id: mongoose.Types.ObjectId;
        }> & {
            __v: number;
        };
    }>;
    /**
     * Review Work: Approve or Request Changes
     */
    static reviewWork(params: ReviewWorkParams): Promise<{
        assignment: mongoose.Document<unknown, {}, import("@claimboard/database").IWorkAssignment, {}, {}> & import("@claimboard/database").IWorkAssignment & Required<{
            _id: mongoose.Types.ObjectId;
        }> & {
            __v: number;
        };
        claim: mongoose.Document<unknown, {}, import("@claimboard/database").IClaim, {}, {}> & import("@claimboard/database").IClaim & Required<{
            _id: mongoose.Types.ObjectId;
        }> & {
            __v: number;
        };
    }>;
    /**
     * Reassign Work (Admin Action)
     */
    static reassignWork(params: ReassignWorkParams): Promise<{
        assignment: mongoose.Document<unknown, {}, import("@claimboard/database").IWorkAssignment, {}, {}> & import("@claimboard/database").IWorkAssignment & Required<{
            _id: mongoose.Types.ObjectId;
        }> & {
            __v: number;
        };
        claim: mongoose.Document<unknown, {}, import("@claimboard/database").IClaim, {}, {}> & import("@claimboard/database").IClaim & Required<{
            _id: mongoose.Types.ObjectId;
        }> & {
            __v: number;
        };
    }>;
    /**
     * Dependency resolution: Unblocks any downstream assignments whose dependencies are now all COMPLETED
     */
    static unblockDependentAssignments(completedAssignmentId: string, organizationId: string): Promise<void>;
}
//# sourceMappingURL=productionService.d.ts.map