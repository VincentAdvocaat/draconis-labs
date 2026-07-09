export const LANES = ['todo', 'doing', 'done'] as const;
export type Lane = (typeof LANES)[number];

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface Task {
  id: string;
  title: string;
  description: string | null;
  lane: Lane;
  plannedDate: string | null;
  position: number;
  createdBy: string;
  priority: Priority;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  plannedDate?: string | null;
  priority?: Priority;
  labels?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  lane?: Lane;
  plannedDate?: string | null;
  position?: number;
  priority?: Priority;
  labels?: string[];
}
