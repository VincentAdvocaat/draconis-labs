import type { PlannerClient, PlannerCommand, PlannerReply } from '@draconis/shared';

export interface ProbeBridge {
  invoke(command: PlannerCommand): Promise<PlannerReply>;
  ready(): Promise<void>;
}
declare global { interface Window { plannerProbe: ProbeBridge; plannerClient: PlannerClient } }
