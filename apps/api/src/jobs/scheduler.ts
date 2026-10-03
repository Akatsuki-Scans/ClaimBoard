import { WorkAssignmentModel, NotificationModel, ClaimModel } from '@claimboard/database';
import { broadcastToAll } from '../plugins/websocketPlugin';

let jobInterval: NodeJS.Timeout | null = null;

export function startBackgroundJobs() {
  console.log('[BackgroundJobs] Initializing deadline and overdue monitors...');

  // Check every 60 seconds
  jobInterval = setInterval(async () => {
    try {
      await checkDeadlinesAndOverdue();
    } catch (err) {
      console.error('[BackgroundJobs] Error running periodic deadline check:', err);
    }
  }, 60000);

  // Run initial check once on startup
  setTimeout(() => {
    checkDeadlinesAndOverdue().catch((err) =>
      console.error('[BackgroundJobs] Startup check error:', err)
    );
  }, 5000);
}

export function stopBackgroundJobs() {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
  }
}

async function checkDeadlinesAndOverdue() {
  const now = new Date();

  // Find assignments past deadline that are not completed
  const overdueAssignments = await WorkAssignmentModel.find({
    status: { $in: ['CLAIMED', 'IN_PROGRESS', 'SUBMITTED', 'CHANGES_REQUESTED'] },
    deadline: { $lt: now },
  }).populate('workTypeId');

  for (const assignment of overdueAssignments) {
    if (assignment.assignedWorkerId) {
      // Check if we already notified recently to prevent spam (deduplication)
      const recentNotification = await NotificationModel.findOne({
        userId: assignment.assignedWorkerId,
        type: 'deadline',
        createdAt: { $gt: new Date(Date.now() - 6 * 3600 * 1000) }, // within 6 hours
      });

      if (!recentNotification) {
        const taskName = (assignment.workTypeId as any)?.name || 'Task';
        await NotificationModel.create({
          organizationId: assignment.organizationId,
          userId: assignment.assignedWorkerId,
          title: 'Task Overdue Notice',
          message: `Your task (${taskName}) has exceeded its deadline. Please update your progress or submit a deliverable.`,
          type: 'deadline',
          linkUrl: `/my-claims`,
        });

        broadcastToAll('notification.created', {
          userId: assignment.assignedWorkerId.toString(),
          title: 'Task Overdue Notice',
        });
      }
    }
  }
}
