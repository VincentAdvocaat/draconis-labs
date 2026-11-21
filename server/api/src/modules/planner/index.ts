import type { PlannerCommandService } from '@draconis/planner-core';
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

import { LOCAL_WORKSPACE_ID } from '@draconis/shared';
import type { AuthorizePlanner } from '../../core/local-identity.js';
import { createWorkspacePlannerRoutes } from './workspace-routes.js';

export const plannerWorkspaceModule: ApiModule = {
  name: 'planner-workspaces', prefix: '/workspaces/:workspaceId', legacyAlias: false,
  description: 'Explicit local workspace task contract',
  register: createWorkspacePlannerRoutes(plannerService, LOCAL_WORKSPACE_ID, identifyActor),
};

export function protectedPlannerWorkspaceModule(authorize: AuthorizePlanner, service: PlannerCommandService = plannerService): ApiModule {
  return {
    ...plannerWorkspaceModule,
    description: 'Authenticated local workspace task contract',
    register: createWorkspacePlannerRoutes(service, LOCAL_WORKSPACE_ID, identifyActor, authorize),
  };
}
