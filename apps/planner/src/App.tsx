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
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DEFAULT_PREFERENCES,
  LANES,
  PRIORITIES,
  RECURRENCE_FREQUENCIES,
  type Lane,
  type PlannerView,
  type Priority,
  type RecurrenceRule,
  type SavedView,
  type Task,
  type TaskFilter,
  type UpdateTaskInput,
  type UserPreferences,
  isTaskOverdue,
  todayInTimezone,
} from '@draconis/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiConflictError, isPaginatedTasks, plannerApi } from './api';
import { FilterPanel, PreferencesModal } from './components';
import { parseFiltersFromUrl, syncUrl } from './filters';
import { createTranslator } from './i18n';
import './App.css';

function hasActiveFilters(filter: TaskFilter) {
  return Boolean(
    filter.lane ||
    filter.priority ||
    filter.plannedDate ||
    filter.dueDate ||
    filter.label ||
    filter.createdBy ||
    filter.q ||
    filter.overdue,
  );
}

function addDaysFrom(baseIso: string, days: number) {
  const [year, month, day] = baseIso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function nextWeekFrom(baseIso: string, weekStart: 0 | 1) {
  const [year, month, day] = baseIso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const target = weekStart;
  const until = ((7 + target - date.getDay()) % 7) || 7;
  date.setDate(date.getDate() + until);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function nextMonthFrom(baseIso: string) {
  const [year, month] = baseIso.split('-').map(Number);
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

function parseQuickTask(value: string, locale: 'nl' | 'en', today: string, weekStart: 0 | 1) {
  let title = value.trim();
  let plannedDate: string | undefined;
  const patterns: Array<[RegExp, () => string]> = locale === 'nl'
    ? [
        [/\s+(morgen)$/i, () => addDaysFrom(today, 1)],
        [/\s+(volgende week)$/i, () => nextWeekFrom(today, weekStart)],
        [/\s+(volgende maand)$/i, () => nextMonthFrom(today)],
        [/\s+(vandaag)$/i, () => today],
      ]
    : [
        [/\s+(tomorrow)$/i, () => addDaysFrom(today, 1)],
        [/\s+(next week)$/i, () => nextWeekFrom(today, weekStart)],
        [/\s+(next month)$/i, () => nextMonthFrom(today)],
        [/\s+(today)$/i, () => today],
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

function taskDraftFields(task: Task) {
  return {
    title: task.title,
    description: task.description,
    plannedDate: task.plannedDate,
    dueDate: task.dueDate,
    dueTime: task.dueTime,
    timezone: task.timezone,
    recurrence: task.recurrence,
    priority: task.priority,
    labels: task.labels,
  };
}

function isTaskDirty(original: Task, draft: Task) {
  return JSON.stringify(taskDraftFields(original)) !== JSON.stringify(taskDraftFields(draft));
}

function TaskCard({
  task,
  i18n,
  timezone,
  onEdit,
  onMove,
  overlay = false,
}: {
  task: Task;
  i18n: ReturnType<typeof createTranslator>;
  timezone: string;
  onEdit?: (task: Task) => void;
  onMove?: (task: Task, direction: -1 | 1) => void;
  overlay?: boolean;
}) {
  const sortable = useSortable({ id: task.id, disabled: overlay });
  const overdue = isTaskOverdue(task, timezone);
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.35 : 1,
  };

  return (
    <article
      ref={sortable.setNodeRef}
      style={style}
      className={`task-card priority-${task.priority}${overdue ? ' overdue' : ''}${overlay ? ' overlay' : ''}`}
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
        <span className={`priority-pill ${task.priority}`}>{i18n.priorityLabel(task.priority)}</span>
        {overdue && <span className="overdue-pill">{i18n.t.overdue}</span>}
        {task.recurrence && <span className="recurrence-pill">↻</span>}
        {task.createdBy !== 'user' && (
          <span className="agent-badge" title={task.createdBy}>AI · {task.createdBy}</span>
        )}
      </div>
      <h3>{task.title}</h3>
      {task.description && <p>{task.description}</p>}
      <footer>
        <div className="labels">{task.labels.map((label) => <span key={label}>#{label}</span>)}</div>
        <div className="task-dates">
          {task.plannedDate && <time dateTime={task.plannedDate}>{task.plannedDate}</time>}
          {task.dueDate && <time className="due-date" dateTime={task.dueDate}>{task.dueDate}{task.dueTime ? ` ${task.dueTime}` : ''}</time>}
        </div>
      </footer>
    </article>
  );
}

function LaneColumn({
  lane,
  tasks,
  i18n,
  timezone,
  onEdit,
  onMove,
}: {
  lane: Lane;
  tasks: Task[];
  i18n: ReturnType<typeof createTranslator>;
  timezone: string;
  onEdit: (task: Task) => void;
  onMove: (task: Task, direction: -1 | 1) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane-${lane}` });
  return (
    <section ref={setNodeRef} className={`lane ${isOver ? 'is-over' : ''}`}>
      <header>
        <span className={`lane-dot ${lane}`} />
        <h2>{i18n.laneLabel(lane)}</h2>
        <span className="count">{tasks.length}</span>
      </header>
      <SortableContext items={tasks.map(({ id }) => id)} strategy={verticalListSortingStrategy}>
        <div className="lane-list">
          {tasks.map((task) => <TaskCard key={task.id} task={task} i18n={i18n} timezone={timezone} onEdit={onEdit} onMove={onMove} />)}
          {!tasks.length && <div className="empty-lane">{i18n.t.emptyLane}</div>}
        </div>
      </SortableContext>
    </section>
  );
}

function ScheduleZone({ id, icon, title, subtitle }: { id: string; icon: string; title: string; subtitle: string }) {
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
  i18n,
  onClose,
  onSave,
  onDelete,
}: {
  task: Task;
  i18n: ReturnType<typeof createTranslator>;
  onClose: () => void;
  onSave: (task: Task) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
}) {
  const { t } = i18n;
  const [draft, setDraft] = useState(task);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [serverTask, setServerTask] = useState<Task | null>(null);
  const dirty = isTaskDirty(task, draft);

  const requestClose = () => {
    if (mutating) return;
    if (dirty && !window.confirm(t.dirtyClose)) return;
    onClose();
  };

  const handleSave = async () => {
    setMutating(true);
    setSaveError(null);
    setServerTask(null);
    try {
      await onSave(draft);
      onClose();
    } catch (cause) {
      if (cause instanceof ApiConflictError) {
        setServerTask(cause.task);
        setSaveError(cause.message);
      } else {
        setSaveError(cause instanceof Error ? cause.message : t.saveFailed);
      }
    } finally {
      setMutating(false);
    }
  };

  const handleDelete = async () => {
    setMutating(true);
    setSaveError(null);
    try {
      await onDelete(task);
      onClose();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : t.deleteFailed);
      setConfirmingDelete(false);
    } finally {
      setMutating(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={requestClose}>
      <div className="modal task-editor-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div><span className="eyebrow">{t.editCard}</span><h2>{t.details}</h2></div>
          <button className="icon-button" onClick={requestClose} aria-label={t.close} disabled={mutating}>×</button>
        </div>
        {saveError && (
          <div className="editor-error">
            <span>{saveError}</span>
            <div className="editor-error-actions">
              {serverTask && (
                <button type="button" className="secondary-button" disabled={mutating} onClick={() => { setDraft(serverTask); setServerTask(null); setSaveError(null); }}>
                  {t.loadServer}
                </button>
              )}
              <button type="button" className="primary-button" disabled={mutating} onClick={() => void handleSave()}>{t.retry}</button>
            </div>
          </div>
        )}
        <label>{t.title}<input value={draft.title} disabled={mutating} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label>{t.description}<textarea rows={4} disabled={mutating} value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <div className="form-row">
          <label>{t.plannedDate}<input type="date" disabled={mutating} value={draft.plannedDate ?? ''} onChange={(event) => setDraft({ ...draft, plannedDate: event.target.value || null })} /></label>
          <label>{t.dueDate}<input type="date" disabled={mutating} value={draft.dueDate ?? ''} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value || null })} /></label>
        </div>
        <div className="form-row">
          <label>{t.dueTime}<input type="time" disabled={mutating} value={draft.dueTime ?? ''} onChange={(event) => setDraft({ ...draft, dueTime: event.target.value || null })} /></label>
          <label>{t.timezone}<input disabled={mutating} value={draft.timezone ?? ''} onChange={(event) => setDraft({ ...draft, timezone: event.target.value || null })} placeholder="Europe/Amsterdam" /></label>
        </div>
        <div className="form-row">
          <label>
            {t.recurrenceLabel}
            <select
              disabled={mutating}
              value={draft.recurrence?.frequency ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                setDraft({
                  ...draft,
                  recurrence: value
                    ? { frequency: value as RecurrenceRule['frequency'] }
                    : null,
                });
              }}
            >
              <option value="">{t.recurrence.none}</option>
              {RECURRENCE_FREQUENCIES.map((frequency) => (
                <option key={frequency} value={frequency}>{t.recurrence[frequency]}</option>
              ))}
            </select>
          </label>
          <label>
            {t.priority}
            <select disabled={mutating} value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}>
              {PRIORITIES.map((priority) => <option key={priority} value={priority}>{i18n.priorityLabel(priority)}</option>)}
            </select>
          </label>
        </div>
        <label>{t.labels}<input disabled={mutating} value={draft.labels.join(', ')} onChange={(event) => setDraft({ ...draft, labels: event.target.value.split(',').map((label) => label.trim()).filter(Boolean) })} placeholder="werk, persoonlijk" /></label>
        {confirmingDelete ? (
          <div className="delete-confirm">
            <p>{t.confirmDelete(task.title)}</p>
            <div className="delete-confirm-actions">
              <button type="button" className="secondary-button" disabled={mutating} onClick={() => setConfirmingDelete(false)}>{t.cancel}</button>
              <button type="button" className="danger-button" disabled={mutating} onClick={() => void handleDelete()}>{t.confirmDeleteBtn}</button>
            </div>
          </div>
        ) : (
          <div className="modal-actions">
            <button type="button" className="danger-button" disabled={mutating} onClick={() => setConfirmingDelete(true)}>{t.delete}</button>
            <div>
              <button type="button" className="secondary-button" disabled={mutating} onClick={requestClose}>{t.cancel}</button>
              <button type="button" className="primary-button" disabled={mutating || !draft.title.trim()} onClick={() => void handleSave()}>{mutating ? t.saving : t.save}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const initialUrl = parseFiltersFromUrl(window.location.search);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [totalTasks, setTotalTasks] = useState(0);
  const [page, setPage] = useState(Number(new URLSearchParams(window.location.search).get('page')) || 1);
  const [view, setView] = useState<PlannerView>(initialUrl.view ?? DEFAULT_PREFERENCES.defaultView);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>(initialUrl);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showPreferences, setShowPreferences] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conflictTask, setConflictTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const quickInput = useRef<HTMLInputElement>(null);
  const i18n = useMemo(() => createTranslator(preferences.locale), [preferences.locale]);
  const { t, formatDate, formatHeadingDate } = i18n;
  const timezone = preferences.timezone;
  const today = todayInTimezone(timezone);
  const serverFiltered = hasActiveFilters(taskFilter) || page > 1;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const query = serverFiltered
        ? { ...taskFilter, timezone, page, pageSize: 50 }
        : undefined;
      const result = await plannerApi.list(query);
      if (isPaginatedTasks(result)) {
        setTasks(result.items);
        setTotalTasks(result.total);
      } else {
        setTasks(result);
        setTotalTasks(result.length);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [page, serverFiltered, taskFilter, timezone, t.loadFailed]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    void plannerApi.preferences.get().then(setPreferences).catch(() => undefined);
  }, []);
  useEffect(() => {
    syncUrl(taskFilter, view, page);
  }, [taskFilter, view, page]);
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

  const textFilter = taskFilter.q?.trim().toLowerCase() ?? '';
  const visibleTasks = useMemo(() => {
    if (serverFiltered) return tasks;
    return tasks.filter((task) => !textFilter ||
      task.title.toLowerCase().includes(textFilter) ||
      task.labels.some((label) => label.toLowerCase().includes(textFilter)));
  }, [tasks, textFilter, serverFiltered]);

  const boardTasks = visibleTasks.filter((task) =>
    task.lane === 'done'
      ? task.completedAt != null && todayInTimezone(timezone, new Date(task.completedAt)) === today
      : !task.plannedDate || task.plannedDate <= today,
  );
  const futureTasks = visibleTasks.filter((task) => task.lane !== 'done' && task.plannedDate && task.plannedDate > today);
  const historyTasks = visibleTasks.filter((task) => task.lane === 'done' && task.completedAt);

  const createTask = async () => {
    const parsed = parseQuickTask(quickTitle, preferences.locale, today, preferences.weekStart);
    if (!parsed.title) return;
    try {
      const task = await plannerApi.create(parsed);
      setTasks((current) => [...current, task]);
      setQuickTitle('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.createFailed);
    }
  };

  const updateTask = async (id: string, changes: UpdateTaskInput) => {
    const existing = tasks.find((task) => task.id === id);
    if (!existing) return;
    const snapshot = tasks;
    setConflictTask(null);
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...changes, labels: changes.labels ?? task.labels, updatedAt: new Date().toISOString() } : task));
    try {
      const updated = await plannerApi.update(id, { ...changes, version: existing.version });
      if (changes.lane === 'done' && existing.lane !== 'done' && existing.recurrence) {
        await refresh();
        return updated;
      }
      if (changes.position !== undefined || changes.lane !== undefined) {
        await refresh();
        return updated;
      }
      setTasks((current) => current.map((task) => task.id === id ? updated : task));
      return updated;
    } catch (cause) {
      setTasks(snapshot);
      if (cause instanceof ApiConflictError) {
        setConflictTask(cause.task);
        setError(cause.message);
      } else {
        setError(cause instanceof Error ? cause.message : t.updateFailed);
      }
      throw cause;
    }
  };

  const moveLane = (task: Task, direction: -1 | 1) => {
    const index = LANES.indexOf(task.lane);
    const lane = LANES[index + direction];
    if (lane) void updateTask(task.id, { lane });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveTask(null);
    if (!over) return;
    const task = tasks.find((item) => item.id === active.id);
    if (!task) return;
    const scheduleDates: Record<string, string> = {
      'schedule-tomorrow': addDaysFrom(today, 1),
      'schedule-week': nextWeekFrom(today, preferences.weekStart),
      'schedule-month': nextMonthFrom(today),
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

  const savePreferences = async (next: UserPreferences) => {
    const saved = await plannerApi.preferences.update(next);
    setPreferences(saved);
    setView(saved.defaultView);
    setShowPreferences(false);
  };

  const saveView = async (name: string) => {
    const viewEntry: SavedView = {
      id: crypto.randomUUID(),
      name,
      filter: { ...taskFilter, q: textFilter || taskFilter.q },
    };
    const savedViews = [...preferences.savedViews, viewEntry];
    await savePreferences({ ...preferences, savedViews });
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
      const key = todayInTimezone(timezone, new Date(task.completedAt!));
      groups[key] ??= [];
      groups[key].push(task);
      return groups;
    }, {}),
  ).sort(([first], [second]) => second.localeCompare(first));

  const totalPages = Math.max(1, Math.ceil(totalTasks / 50));

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">D</div><div><strong>{t.brand}</strong><span>{t.appName}</span></div></div>
        <nav>
          {(['board', 'scheduled', 'history'] as const).map((item) => (
            <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>
              {i18n.viewLabel(item)}{item === 'scheduled' ? <span>{futureTasks.length}</span> : null}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <input
            className="search"
            value={taskFilter.q ?? ''}
            onChange={(event) => {
              setTaskFilter((current) => ({ ...current, q: event.target.value || undefined }));
              setPage(1);
            }}
            placeholder={t.search}
          />
          <button className="secondary-button prefs-button" onClick={() => setShowPreferences(true)} aria-label={t.preferences}>⚙</button>
          <button className="avatar">VA</button>
        </div>
      </header>

      <main>
        <section className="page-heading">
          <div>
            <span className="eyebrow">{formatHeadingDate()}</span>
            <h1>{i18n.viewLabel(view)}</h1>
            <p>{t.viewCopy[view]}</p>
          </div>
          <button className="primary-button" onClick={() => quickInput.current?.focus()}>＋ {t.newTask} <kbd>N</kbd></button>
        </section>

        <FilterPanel
          filter={taskFilter}
          savedViews={preferences.savedViews}
          i18n={i18n}
          onChange={(filter) => { setTaskFilter(filter); setPage(1); }}
          onSaveView={(name) => void saveView(name)}
          onApplyView={(saved) => { setTaskFilter(saved.filter); setPage(1); }}
          onRenameView={(id, name) => {
            const savedViews = preferences.savedViews.map((item) => item.id === id ? { ...item, name } : item);
            void savePreferences({ ...preferences, savedViews });
          }}
          onDeleteView={(id) => {
            const savedViews = preferences.savedViews.filter((item) => item.id !== id);
            void savePreferences({ ...preferences, savedViews });
          }}
        />

        {error && <div className="error-banner">{error}<button onClick={() => { setError(null); setConflictTask(null); }}>×</button></div>}
        {conflictTask && (
          <div className="conflict-banner">
            <span>{t.conflict(conflictTask.title)}</span>
            <button type="button" className="secondary-button" onClick={() => {
              setTasks((current) => current.map((task) => task.id === conflictTask.id ? conflictTask : task));
              setConflictTask(null);
              setError(null);
            }}>{t.applyServer}</button>
          </div>
        )}

        {view === 'board' && (
          <>
            <div className="quick-add">
              <span>＋</span>
              <input ref={quickInput} value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createTask(); }} placeholder={t.quickAddPlaceholder} />
              <button onClick={() => void createTask()}>{t.addTask}</button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={({ active }) => setActiveTask(tasks.find((task) => task.id === active.id) ?? null)} onDragEnd={handleDragEnd}>
              <div className="workspace">
                <div className="board">
                  {LANES.map((lane) => (
                    <LaneColumn
                      key={lane}
                      lane={lane}
                      i18n={i18n}
                      timezone={timezone}
                      tasks={boardTasks.filter((task) => task.lane === lane).sort((a, b) => a.position - b.position)}
                      onEdit={setEditingTask}
                      onMove={moveLane}
                    />
                  ))}
                </div>
                <aside className="schedule-panel">
                  <div><span className="eyebrow">{t.scheduleLater}</span><h2>{t.scheduleTitle}</h2><p>{t.scheduleHint}</p></div>
                  <ScheduleZone id="schedule-tomorrow" icon="☀" title={t.tomorrow} subtitle={addDaysFrom(today, 1)} />
                  <ScheduleZone id="schedule-week" icon="▦" title={t.nextWeek} subtitle={nextWeekFrom(today, preferences.weekStart)} />
                  <ScheduleZone id="schedule-month" icon="◷" title={t.nextMonth} subtitle={nextMonthFrom(today)} />
                  <button className="show-planned" onClick={() => setView('scheduled')}>{t.showPlanned}</button>
                </aside>
              </div>
              <DragOverlay>{activeTask ? <TaskCard task={activeTask} i18n={i18n} timezone={timezone} overlay /> : null}</DragOverlay>
            </DndContext>
          </>
        )}

        {view === 'scheduled' && (
          <div className="timeline">
            {!groupedFuture.length && <div className="empty-view">{t.emptyScheduled}</div>}
            {groupedFuture.map(([date, items]) => (
              <section key={date}>
                <header><time>{formatDate(date)}</time><span>{items.length}</span></header>
                <div className="timeline-cards">{items.map((task) => <TaskCard key={task.id} task={task} i18n={i18n} timezone={timezone} onEdit={setEditingTask} onMove={moveLane} />)}</div>
              </section>
            ))}
          </div>
        )}

        {view === 'history' && (
          <div className="timeline history">
            {!groupedHistory.length && <div className="empty-view">{t.emptyHistory}</div>}
            {groupedHistory.map(([date, items]) => (
              <section key={date}>
                <header><time>{formatDate(date)}</time><span>{t.doneCount(items.length)}</span></header>
                <div className="history-list">
                  {items.map((task) => (
                    <button key={task.id} onClick={() => setEditingTask(task)}>
                      <span>✓</span>
                      <strong>{task.title}</strong>
                      <small>{task.createdBy !== 'user' ? `AI · ${task.createdBy}` : t.byYou}</small>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {serverFiltered && (
          <div className="pagination">
            <span>{t.totalTasks(totalTasks)} · {t.page} {page} {t.of} {totalPages}</span>
            <div>
              <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>←</button>
              <button type="button" className="secondary-button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>→</button>
            </div>
          </div>
        )}

        {loading && <div className="loading">{t.loading}</div>}
      </main>

      <footer className="app-footer">
        <span>{t.footer}</span>
        <span><kbd>Alt</kbd> + <kbd>←</kbd>/<kbd>→</kbd> {t.footerHint}</span>
      </footer>

      {editingTask && (
        <TaskEditor
          task={editingTask}
          i18n={i18n}
          onClose={() => setEditingTask(null)}
          onSave={async (draft) => {
            await updateTask(draft.id, {
              title: draft.title,
              description: draft.description,
              plannedDate: draft.plannedDate,
              dueDate: draft.dueDate,
              dueTime: draft.dueTime,
              timezone: draft.timezone,
              recurrence: draft.recurrence,
              priority: draft.priority,
              labels: draft.labels,
            });
          }}
          onDelete={async (task) => {
            await plannerApi.remove(task.id);
            setTasks((current) => current.filter(({ id }) => id !== task.id));
          }}
        />
      )}

      {showPreferences && (
        <PreferencesModal
          preferences={preferences}
          i18n={i18n}
          onClose={() => setShowPreferences(false)}
          onSave={savePreferences}
        />
      )}
    </div>
  );
}
