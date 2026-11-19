import type { CreateTaskInput, Task } from '@draconis/shared';

export interface ProbeBridge {
  list(): Promise<Task[]>;
  create(input: CreateTaskInput): Promise<Task>;
  ready(): Promise<void>;
}
declare global { interface Window { plannerProbe: ProbeBridge } }
