import { FastifyInstance } from 'fastify';
import { ReviewModel, WorkAssignmentModel } from '@claimboard/database';
import { ReviewSubmissionSchema, API_ERROR_CODES } from '@claimboard/shared';
import { ProductionService } from '../../services/productionService';

export async function reviewRoutes(fastify: FastifyInstance) {
  // Submit Review (Approve or Request Changes)
  fastify.post('/submit', async (request, reply) => {
    const context = await request.requireAuth();
    const parse = ReviewSubmissionSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: parse.error.errors[0]?.message || 'Validation error' },
      });
    }

    try {
      const result = await ProductionService.reviewWork({
        organizationId: context.organizationId,
        assignmentId: parse.data.assignmentId,
        reviewerId: context.user.id,
        reviewerName: context.user.displayName,
        status: parse.data.status,
        comment: parse.data.comment,
        correctionRequest: parse.data.correctionRequest,
        attachmentUrl: parse.data.attachmentUrl,
        severity: parse.data.severity as any,
      });

      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: { code: err.code || API_ERROR_CODES.INTERNAL_SERVER_ERROR, message: err.message || 'Failed to submit review' },
      });
    }
  });

  // Get pending reviews queue for reviewers/managers
  fastify.get('/pending', async (request, reply) => {
    const context = await request.requireAuth();

    const assignments = await WorkAssignmentModel.find({
      organizationId: context.organizationId,
      status: { $in: ['SUBMITTED', 'IN_REVIEW'] },
    })
      .populate('workTypeId')
      .populate('mangaId', 'title coverUrl')
      .populate('chapterId', 'chapterNumber title')
      .populate('activeClaimId')
      .sort({ submittedAt: 1 })
      .lean();

    return reply.send({
      success: true,
      data: assignments.map((a: any) => ({
        ...a,
        id: a._id.toString(),
      })),
    });
  });
}
