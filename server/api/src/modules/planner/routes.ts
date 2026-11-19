import {
  createTaskSchema,
  historyQuerySchema,
  taskListQuerySchema,
  updatePreferencesSchema,
  updateTaskSchema,
  uuidParamSchema,
} from '@draconis/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Actor } from '../../core/auth.js';
import { parseTaskListQuery } from './query.js';
import { TaskConflictError, type PlannerService } from '@draconis/planner-core';
import { taskResponseSchema, paginatedTaskListSchema, conflictResponseSchema } from './schemas.js';

export function createPlannerRoutes(plannerService: PlannerService, identifyActor: (request: FastifyRequest) => Actor) {
  return async function registerPlannerRoutes(app: FastifyInstance) {
    app.get('/tasks', {
      schema: {
        tags: ['planner'],
        summary: 'List tasks',
        querystring: { type: 'object', additionalProperties: true },
        response: {
          200: {
            oneOf: [
              { type: 'array', items: taskResponseSchema },
              paginatedTaskListSchema,
            ],
          },
        },
      },
    }, async (request) => {
      const query = taskListQuerySchema.parse(request.query);
      return plannerService.list(parseTaskListQuery(query));
    });

    app.post('/tasks', {
      schema: {
        tags: ['planner'],
        summary: 'Create task',
        security: [{ bearerAuth: [] }],
        body: { type: 'object', required: ['title'] },
        response: { 201: taskResponseSchema },
      },
    }, async (request, reply) => {
      const input = createTaskSchema.parse(request.body);
      const actor = identifyActor(request);
      const task = plannerService.create(input, actor);
      return reply.code(201).send(task);
    });

    app.patch('/tasks/:id', {
      schema: {
        tags: ['planner'],
        summary: 'Update task',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
        response: { 200: taskResponseSchema, 409: conflictResponseSchema },
      },
    }, async (request, reply) => {
      identifyActor(request);
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateTaskSchema.parse(request.body);
      try {
        return plannerService.update(id, input);
      } catch (error) {
        if (error instanceof TaskConflictError) {
          return reply.code(409).send({ message: error.message, task: error.task });
        }
        throw error;
      }
    });

    app.delete('/tasks/:id', {
      schema: {
        tags: ['planner'],
        summary: 'Delete task',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
        response: { 204: { type: 'null' } },
      },
    }, async (request, reply) => {
      identifyActor(request);
      const { id } = uuidParamSchema.parse(request.params);
      plannerService.remove(id);
      return reply.code(204).send();
    });

    app.get('/history', {
      schema: {
        tags: ['planner'],
        summary: 'Completed task history',
        response: {
          200: {
            oneOf: [
              { type: 'array', items: taskResponseSchema },
              paginatedTaskListSchema,
            ],
          },
        },
      },
    }, async (request) => {
      const query = historyQuerySchema.parse(request.query);
      return plannerService.history(query);
    });

    app.get('/preferences', {
      schema: { tags: ['planner'], summary: 'Get user preferences' },
    }, async () => plannerService.getPreferences());

    app.patch('/preferences', {
      schema: { tags: ['planner'], summary: 'Update user preferences', body: { type: 'object' } },
    }, async (request) => {
      const input = updatePreferencesSchema.parse(request.body);
      return plannerService.updatePreferences(input);
    });
  };
}
