import { FastifyInstance } from 'fastify';
import { DeliverableModel } from '@claimboard/database';
import { SubmitDeliverableSchema, API_ERROR_CODES } from '@claimboard/shared';
import { ProductionService } from '../../services/productionService';

export async function deliverableRoutes(fastify: FastifyInstance) {
  // Submit Deliverable
  fastify.post('/submit', async (request, reply) => {
    const context = await request.requireAuth();
    const parse = SubmitDeliverableSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: parse.error.errors[0]?.message || 'Validation error' },
      });
    }

    try {
      const result = await ProductionService.submitWork({
        organizationId: context.organizationId,
        assignmentId: parse.data.assignmentId,
        workerId: context.user.id,
        workerName: context.user.displayName,
        deliverableUrl: parse.data.deliverableUrl,
        label: parse.data.label,
        notes: parse.data.notes,
      });

      return reply.status(201).send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: { code: err.code || API_ERROR_CODES.INTERNAL_SERVER_ERROR, message: err.message || 'Failed to submit deliverable' },
      });
    }
  });

  // Get deliverables for an assignment
  fastify.get('/assignment/:assignmentId', async (request, reply) => {
    const context = await request.requireAuth();
    const { assignmentId } = request.params as any;

    const deliverables = await DeliverableModel.find({
      assignmentId,
      organizationId: context.organizationId,
    }).sort({ revision: -1 }).lean();

    return reply.send({
      success: true,
      data: deliverables.map((d) => ({ ...d, id: d._id.toString() })),
    });
  });
}
