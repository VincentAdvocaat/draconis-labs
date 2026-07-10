/** Full task payload returned by planner mutation endpoints. */
export const taskResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    description: { type: ['string', 'null'] },
    lane: { type: 'string', enum: ['todo', 'doing', 'done'] },
    plannedDate: { type: ['string', 'null'] },
    dueDate: { type: ['string', 'null'] },
    dueTime: { type: ['string', 'null'] },
    timezone: { type: ['string', 'null'] },
    recurrence: { type: ['object', 'null'], additionalProperties: true },
    recurrenceParentId: { type: ['string', 'null'] },
    position: { type: 'number' },
    version: { type: 'integer' },
    createdBy: { type: 'string' },
    priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
    labels: { type: 'array', items: { type: 'string' } },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    completedAt: { type: ['string', 'null'] },
  },
} as const;

export const paginatedTaskListSchema = {
  type: 'object',
  properties: {
    items: { type: 'array', items: taskResponseSchema },
    total: { type: 'integer' },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
  },
} as const;

export const conflictResponseSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    task: taskResponseSchema,
  },
} as const;
