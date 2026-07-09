import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  LANES,
  PRIORITIES,
  type Lane,
  type Priority,
  type Task,
} from '@draconis/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { plannerApi } from './api';
import './App.css';

const laneLabels: Record<Lane, string> = {
  todo: 'Te doen',
  doing: 'Bezig',
  done: 'Klaar',
};

const priorityLabels: Record<Priority, string> = {
  low: 'Laag',
  normal: 'Normaal',
  high: 'Hoog',
  urgent: 'Urgent',
};

const isoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoDate(date);
};

const nextWeek = () => {
  const date = new Date();
  const untilMonday = ((8 - date.getDay()) % 7) || 7;
  date.setDate(date.getDate() + untilMonday);
  return isoDate(date);
};

const nextMonth = () => {
  const date = new Date();
  return isoDate(new Date(date.getFullYear(), date.getMonth() + 1, 1));
};

function parseQuickTask(value: string) {
  let title = value.trim();
  let plannedDate: string | undefined;
  const patterns: Array<[RegExp, () => string]> = [
    [/\s+(morgen)$/i, () => addDays(1)],
    [/\s+(volgende week)$/i, nextWeek],
    [/\s+(volgende maand)$/i, nextMonth],
    [/\s+(vandaag)$/i, () => isoDate(new Date())],
  ];
  for (const [pattern, getDate] of patterns) {
    if (pattern.test(title)) {
      title = title.replace(pattern, '').trim();
      plannedDate = getDate();
      break;
    }
  }
  return { title, plannedDate };
}

function TaskCard({
  task,
  onEdit,
  onMove,
  overlay = false,
}: {
  task: Task;
  onEdit?: (task: Task) => void;
  onMove?: (task: Task, direction: -1 | 1) => void;
  overlay?: boolean;
}) {
  const sortable = useSortable({ id: task.id, disabled: overlay });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.35 : 1,
  };

  return (
    <article
      ref={sortable.setNodeRef}
      style={style}
      className={`task-card priority-${task.priority}${overlay ? ' overlay' : ''}`}
      {...sortable.attributes}
      {...sortable.listeners}
      tabIndex={0}
      onDoubleClick={() => onEdit?.(task)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onEdit?.(task);
        if (event.altKey && event.key === 'ArrowLeft') onMove?.(task, -1);
        if (event.altKey && event.key === 'ArrowRight') onMove?.(task, 1);
      }}
    >
      <div className="task-topline">
        <span className="drag-handle" aria-hidden="true">⠿</span>
        <span className={`priority-pill ${task.priority}`}>
          {priorityLabels[task.priority]}
        </span>
        {task.createdBy !== 'user' && (
          <span className="agent-badge" title={`Aangemaakt door ${task.createdBy}`}>
            AI · {task.createdBy}
          </span>
        )}
      </div>
      <h3>{task.title}</h3>
      {task.description && <p>{task.description}</p>}
      <footer>
        <div className="labels">
          {task.labels.map((label) => <span key={label}>#{label}</span>)}
        </div>
        {task.plannedDate && <time dateTime={task.plannedDate}>{task.plannedDate}</time>}
      </footer>
    </article>
  );
}

function LaneColumn({
  lane,
  tasks,
  onEdit,
  onMove,
}: {
  lane: Lane;
  tasks: Task[];
  onEdit: (task: Task) => void;
  onMove: (task: Task, direction: -1 | 1) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane-${lane}` });
  return (
    <section ref={setNodeRef} className={`lane ${isOver ? 'is-over' : ''}`}>
      <header>
        <span className={`lane-dot ${lane}`} />
        <h2>{laneLabels[lane]}</h2>
        <span className="count">{tasks.length}</span>
      </header>
      <SortableContext items={tasks.map(({ id }) => id)} strategy={verticalListSortingStrategy}>
        <div className="lane-list">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onEdit={onEdit} onMove={onMove} />
          ))}
          {!tasks.length && <div className="empty-lane">Sleep een kaart hierheen</div>}
        </div>
      </SortableContext>
    </section>
  );
}

function ScheduleZone({
  id,
  icon,
  title,
  subtitle,
}: {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`schedule-zone ${isOver ? 'is-over' : ''}`}>
      <span>{icon}</span>
      <div><strong>{title}</strong><small>{subtitle}</small></div>
    </div>
  );
}

function TaskEditor({
  task,
  onClose,
  onSave,
  onDelete,
}: {
  task: Task;
  onClose: () => void;
  onSave: (task: Task) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
}) {
  const [draft, setDraft] = useState(task);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div><span className="eyebrow">Kaart bewerken</span><h2>Details</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Sluiten">×</button>
        </div>
        <label>Titel<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label>Beschrijving<textarea rows={4} value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <div className="form-row">
          <label>Datum<input type="date" value={draft.plannedDate ?? ''} onChange={(event) => setDraft({ ...draft, plannedDate: event.target.value || null })} /></label>
          <label>Prioriteit<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}</select></label>
        </div>
        <label>Labels<input value={draft.labels.join(', ')} onChange={(event) => setDraft({ ...draft, labels: event.target.value.split(',').map((label) => label.trim()).filter(Boolean) })} placeholder="werk, persoonlijk" /></label>
        <div className="modal-actions">
          <button className="danger-button" onClick={() => void onDelete(task)}>Verwijderen</button>
          <div><button className="secondary-button" onClick={onClose}>Annuleren</button><button className="primary-button" onClick={() => void onSave(draft)}>Opslaan</button></div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<'board' | 'scheduled' | 'history'>('board');
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const quickInput = useRef<HTMLInputElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const refresh = async () => {
    try {
      setError(null);
      setTasks(await plannerApi.list());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'n' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault();
        quickInput.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const today = isoDate(new Date());
  const visibleTasks = useMemo(() => {
    const normalized = filter.trim().toLowerCase();
    return tasks.filter((task) => !normalized ||
      task.title.toLowerCase().includes(normalized) ||
      task.labels.some((label) => label.toLowerCase().includes(normalized)));
  }, [tasks, filter]);

  const boardTasks = visibleTasks.filter((task) =>
    task.lane === 'done'
      ? task.completedAt != null && isoDate(new Date(task.completedAt)) === today
      : !task.plannedDate || task.plannedDate <= today,
  );
  const futureTasks = visibleTasks.filter((task) => task.lane !== 'done' && task.plannedDate && task.plannedDate > today);
  const historyTasks = visibleTasks.filter((task) => task.lane === 'done' && task.completedAt);

  const createTask = async () => {
    const parsed = parseQuickTask(quickTitle);
    if (!parsed.title) return;
    try {
      const task = await plannerApi.create(parsed);
      setTasks((current) => [...current, task]);
      setQuickTitle('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Aanmaken mislukt');
    }
  };

  const updateTask = async (id: string, changes: Partial<Task>) => {
    const updated = await plannerApi.update(id, changes);
    setTasks((current) => current.map((task) => task.id === id ? updated : task));
  };

  const moveLane = (task: Task, direction: -1 | 1) => {
    const index = LANES.indexOf(task.lane);
    const lane = LANES[index + direction];
    if (lane) void updateTask(task.id, { lane });
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveTask(tasks.find((task) => task.id === active.id) ?? null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveTask(null);
    if (!over) return;
    const task = tasks.find((item) => item.id === active.id);
    if (!task) return;
    const scheduleDates: Record<string, string> = {
      'schedule-tomorrow': addDays(1),
      'schedule-week': nextWeek(),
      'schedule-month': nextMonth(),
    };
    if (scheduleDates[String(over.id)]) {
      void updateTask(task.id, { plannedDate: scheduleDates[String(over.id)] });
      return;
    }
    const overTask = tasks.find((item) => item.id === over.id);
    const laneId = String(over.id).startsWith('lane-') ? String(over.id).slice(5) : overTask?.lane;
    if (!LANES.includes(laneId as Lane)) return;
    const targetLane = laneId as Lane;
    const laneTasks = tasks.filter((item) => item.lane === targetLane && item.id !== task.id);
    const position = overTask ? overTask.position - 0.5 : Math.max(0, ...laneTasks.map((item) => item.position)) + 1000;
    void updateTask(task.id, { lane: targetLane, position });
  };

  const groupedFuture = Object.entries(
    futureTasks.reduce<Record<string, Task[]>>((groups, task) => {
      const key = task.plannedDate!;
      groups[key] ??= [];
      groups[key].push(task);
      return groups;
    }, {}),
  ).sort(([first], [second]) => first.localeCompare(second));

  const groupedHistory = Object.entries(
    historyTasks.reduce<Record<string, Task[]>>((groups, task) => {
      const key = isoDate(new Date(task.completedAt!));
      groups[key] ??= [];
      groups[key].push(task);
      return groups;
    }, {}),
  ).sort(([first], [second]) => second.localeCompare(first));

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">D</div><div><strong>Draconis Labs</strong><span>Planner</span></div></div>
        <nav>
          <button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>Vandaag</button>
          <button className={view === 'scheduled' ? 'active' : ''} onClick={() => setView('scheduled')}>Gepland <span>{futureTasks.length}</span></button>
          <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>Geschiedenis</button>
        </nav>
        <div className="top-actions"><input className="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Zoeken…" /><button className="avatar">VA</button></div>
      </header>

      <main>
        <section className="page-heading">
          <div><span className="eyebrow">{new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span><h1>{view === 'board' ? 'Vandaag' : view === 'scheduled' ? 'Gepland' : 'Geschiedenis'}</h1><p>{view === 'board' ? 'Eén stap tegelijk. Dit staat er voor je klaar.' : view === 'scheduled' ? 'Werk dat je voor later hebt klaargezet.' : 'Alles wat je hebt afgerond blijft bewaard.'}</p></div>
          <button className="primary-button" onClick={() => quickInput.current?.focus()}>＋ Nieuwe taak <kbd>N</kbd></button>
        </section>

        {error && <div className="error-banner">{error}<button onClick={() => setError(null)}>×</button></div>}

        {view === 'board' && (
          <>
            <div className="quick-add"><span>＋</span><input ref={quickInput} value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createTask(); }} placeholder='Nieuwe taak… probeer "Rapport schrijven morgen"' /><button onClick={() => void createTask()}>Toevoegen</button></div>
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className="workspace">
                <div className="board">
                  {LANES.map((lane) => <LaneColumn key={lane} lane={lane} tasks={boardTasks.filter((task) => task.lane === lane).sort((first, second) => first.position - second.position)} onEdit={setEditingTask} onMove={moveLane} />)}
                </div>
                <aside className="schedule-panel">
                  <div><span className="eyebrow">Later</span><h2>Plan vooruit</h2><p>Sleep een kaart naar een moment.</p></div>
                  <ScheduleZone id="schedule-tomorrow" icon="☀" title="Morgen" subtitle={addDays(1)} />
                  <ScheduleZone id="schedule-week" icon="▦" title="Volgende week" subtitle={`vanaf ${nextWeek()}`} />
                  <ScheduleZone id="schedule-month" icon="◷" title="Volgende maand" subtitle={`vanaf ${nextMonth()}`} />
                  <button className="show-planned" onClick={() => setView('scheduled')}>Bekijk alle geplande taken →</button>
                </aside>
              </div>
              <DragOverlay>{activeTask ? <TaskCard task={activeTask} overlay /> : null}</DragOverlay>
            </DndContext>
          </>
        )}

        {view === 'scheduled' && <div className="timeline">{!groupedFuture.length && <div className="empty-view">Nog niets gepland.</div>}{groupedFuture.map(([date, items]) => <section key={date}><header><time>{new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`))}</time><span>{items.length}</span></header><div className="timeline-cards">{items.map((task) => <TaskCard key={task.id} task={task} onEdit={setEditingTask} onMove={moveLane} />)}</div></section>)}</div>}
        {view === 'history' && <div className="timeline history">{!groupedHistory.length && <div className="empty-view">Nog geen afgeronde taken.</div>}{groupedHistory.map(([date, items]) => <section key={date}><header><time>{new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`))}</time><span>{items.length} klaar</span></header><div className="history-list">{items.map((task) => <button key={task.id} onClick={() => setEditingTask(task)}><span>✓</span><strong>{task.title}</strong><small>{task.createdBy !== 'user' ? `AI · ${task.createdBy}` : 'Door jou'}</small></button>)}</div></section>)}</div>}
        {loading && <div className="loading">Planner laden…</div>}
      </main>

      <footer className="app-footer"><span>Draconis Labs · Planner</span><span><kbd>Alt</kbd> + <kbd>←</kbd>/<kbd>→</kbd> verplaatst een geselecteerde kaart</span></footer>

      {editingTask && <TaskEditor task={editingTask} onClose={() => setEditingTask(null)} onSave={async (draft) => { await updateTask(draft.id, { title: draft.title, description: draft.description, plannedDate: draft.plannedDate, priority: draft.priority, labels: draft.labels }); setEditingTask(null); }} onDelete={async (task) => { await plannerApi.remove(task.id); setTasks((current) => current.filter(({ id }) => id !== task.id)); setEditingTask(null); }} />}
    </div>
  );
}
