import type { ApiModule } from '../../core/module.js';
import { registerPlannerRoutes } from './routes.js';

export const plannerModule: ApiModule = {
  name: 'planner',
  prefix: '/planner',
  description: 'Task planning, scheduling, and user preferences',
  register: registerPlannerRoutes,
};
