import { FastifyInstance } from 'fastify';
import { WorkTypeModel } from '@claimboard/database';
import { CreateWorkTypeSchema, API_ERROR_CODES } from '@claimboard/shared';

export async function workTypeRoutes(fastify: FastifyInstance) {
  // List Work Types
  fastify.get('/', async (request, reply) => {
    const context = await request.requireAuth();
    const workTypes = await WorkTypeModel.find({
      organizationId: context.organizationId,
      code: { $nin: ['UP', 'UPL', 'UPLOAD'] },
      name: { $not: /^upload(ing|er)?$/i },
    })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    return reply.send({
      success: true,
      data: workTypes.map((wt) => ({
        ...wt,
        id: wt._id.toString(),
      })),
    });
  });

  // Create Work Type
  fastify.post('/', async (request, reply) => {
    const context = await request.requirePermission('settings.manage');
    const parse = CreateWorkTypeSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: parse.error.errors[0]?.message || 'Validation error' },
      });
    }

    const workType = await WorkTypeModel.create({
      ...parse.data,
      organizationId: context.organizationId,
    });

    return reply.status(201).send({
      success: true,
      data: { id: workType._id.toString(), ...workType.toObject() },
    });
  });

  // Update Work Type
  fastify.put('/:id', async (request, reply) => {
    const context = await request.requirePermission('settings.manage');
    const { id } = request.params as any;

    const parse = CreateWorkTypeSchema.partial().safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: parse.error.errors[0]?.message || 'Validation error' },
      });
    }

    const updated = await WorkTypeModel.findOneAndUpdate(
      { _id: id, organizationId: context.organizationId },
      { $set: parse.data },
      { new: true }
    );

    if (!updated) {
      return reply.status(404).send({ success: false, error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'Work type not found' } });
    }

    return reply.send({ success: true, data: updated });
  });

  // Delete Work Type
  fastify.delete('/:id', async (request, reply) => {
    const context = await request.requirePermission('settings.manage');
    const { id } = request.params as any;

    await WorkTypeModel.deleteOne({ _id: id, organizationId: context.organizationId });
    return reply.send({ success: true, data: { message: 'Work type deleted successfully' } });
  });
}
