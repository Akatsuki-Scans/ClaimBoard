import { WorkAssignmentModel, NotificationModel } from '@claimboard/database';
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
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  // 1. Approaching deadlines (due within 24h, reminder not yet sent)
  const dueSoonAssignments = await WorkAssignmentModel.find({
    status: { $in: ['CLAIMED', 'IN_PROGRESS', 'CHANGES_REQUESTED'] },
    deadline: { $gte: now, $lte: in24Hours },
    assignedWorkerId: { $exists: true, $ne: null },
    $or: [
      { deadlineReminderSentAt: { $exists: false } },
      { deadlineReminderSentAt: null },
    ],
  })
    .populate('workTypeId', 'name code')
    .populate('mangaId', 'title')
    .populate('chapterId', 'chapterNumber');

  for (const assignment of dueSoonAssignments as any[]) {
    const hoursLeft = Math.max(
      1,
      Math.round((new Date(assignment.deadline).getTime() - now.getTime()) / (60 * 60 * 1000))
    );
    const mangaTitle = assignment.mangaId?.title || 'Manga';
    const chapterNumber = assignment.chapterId?.chapterNumber || '?';
    const taskName = assignment.workTypeId?.name || 'Task';

    await NotificationModel.create({
      organizationId: assignment.organizationId,
      userId: assignment.assignedWorkerId,
      title: `Deadline Approaching (${hoursLeft}h left)`,
      message: `${taskName} for ${mangaTitle} Ch. ${chapterNumber} is due in ~${hoursLeft} hour(s).`,
      type: 'deadline',
      linkUrl: '/calendar',
    });

    assignment.deadlineReminderSentAt = now;
    await assignment.save();

    broadcastToAll('notification.created', {
      userId: assignment.assignedWorkerId.toString(),
      title: `Deadline Approaching (${hoursLeft}h left)`,
    });
  }

  // 2. Overdue assignments (past deadline, no alert in last 6h for this specific assignment)
  const overdueAssignments = await WorkAssignmentModel.find({
    status: { $in: ['CLAIMED', 'IN_PROGRESS', 'SUBMITTED', 'CHANGES_REQUESTED'] },
    deadline: { $lt: now },
    assignedWorkerId: { $exists: true, $ne: null },
    $or: [
      { overdueAlertSentAt: { $exists: false } },
      { overdueAlertSentAt: null },
      { overdueAlertSentAt: { $lt: sixHoursAgo } },
    ],
  })
    .populate('workTypeId', 'name code')
    .populate('mangaId', 'title')
    .populate('chapterId', 'chapterNumber');

  for (const assignment of overdueAssignments as any[]) {
    const mangaTitle = assignment.mangaId?.title || 'Manga';
    const chapterNumber = assignment.chapterId?.chapterNumber || '?';
    const taskName = assignment.workTypeId?.name || 'Task';

    await NotificationModel.create({
      organizationId: assignment.organizationId,
      userId: assignment.assignedWorkerId,
      title: 'Task Overdue Notice',
      message: `Your ${taskName} task for ${mangaTitle} Ch. ${chapterNumber} has passed its deadline. Please update progress or submit deliverables.`,
      type: 'deadline',
      linkUrl: '/my-claims',
    });

    assignment.overdueAlertSentAt = now;
    await assignment.save();

    broadcastToAll('notification.created', {
      userId: assignment.assignedWorkerId.toString(),
      title: 'Task Overdue Notice',
    });
  }
}
