import type { BookingClient, BookingCommand, PlannerClient, PlannerCommand, PlannerReply } from '@draconis/shared';

export interface ProbeBridge {
  invoke(command: PlannerCommand | BookingCommand): Promise<PlannerReply>;
  ready(): Promise<void>;
}
declare global { interface Window { plannerProbe: ProbeBridge; plannerClient: PlannerClient; bookingClient: BookingClient } }
