import type { ApiModule } from '../../core/module.js';
import { identifyActor } from '../../core/auth.js';
import { createPlannerRoutes } from './routes.js';
import { plannerService } from './service.js';

export const plannerModule: ApiModule = {
  name: 'planner',
  prefix: '/planner',
  description: 'Task planning, scheduling, and user preferences',
  register: createPlannerRoutes(plannerService, identifyActor),
};
