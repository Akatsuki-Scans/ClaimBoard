import { FastifyInstance } from 'fastify';
import { WorkTemplateModel } from '@claimboard/database';
import { CreateWorkTemplateSchema, API_ERROR_CODES } from '@claimboard/shared';

export async function templateRoutes(fastify: FastifyInstance) {
  // List Templates
  fastify.get('/', async (request, reply) => {
    const context = await request.requireAuth();
    const templates = await WorkTemplateModel.find({ organizationId: context.organizationId })
      .populate('steps.workTypeId')
      .lean();

    return reply.send({
      success: true,
      data: templates.map((t) => ({
        ...t,
        id: t._id.toString(),
      })),
    });
  });

  // Create Template
  fastify.post('/', async (request, reply) => {
    const context = await request.requirePermission('settings.manage');
    const parse = CreateWorkTemplateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: parse.error.errors[0]?.message || 'Validation error' },
      });
    }

    const template = await WorkTemplateModel.create({
      ...parse.data,
      organizationId: context.organizationId,
    });

    return reply.status(201).send({
      success: true,
      data: { id: template._id.toString(), ...template.toObject() },
    });
  });

  // Update Template
  fastify.put('/:id', async (request, reply) => {
    const context = await request.requirePermission('settings.manage');
    const { id } = request.params as any;

    const parse = CreateWorkTemplateSchema.partial().safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: parse.error.errors[0]?.message || 'Validation error' },
      });
    }

    const updated = await WorkTemplateModel.findOneAndUpdate(
      { _id: id, organizationId: context.organizationId },
      { $set: parse.data },
      { new: true }
    );

    return reply.send({ success: true, data: updated });
  });

  // Delete Template
  fastify.delete('/:id', async (request, reply) => {
    const context = await request.requirePermission('settings.manage');
    const { id } = request.params as any;

    await WorkTemplateModel.deleteOne({ _id: id, organizationId: context.organizationId });
    return reply.send({ success: true, data: { message: 'Template deleted' } });
  });
}
