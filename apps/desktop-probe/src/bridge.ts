import type { CreateTaskInput, Task, UpdateTaskInput } from '@draconis/shared';

export interface ProbeBridge {
  list(): Promise<Task[]>;
  create(input: CreateTaskInput): Promise<Task>;
  update(id: string, input: UpdateTaskInput): Promise<Task>;
  ready(): Promise<void>;
}
declare global { interface Window { plannerProbe: ProbeBridge } }
