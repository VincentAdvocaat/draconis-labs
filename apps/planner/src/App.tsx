import { parseQuickTask, addDaysFrom, nextWeekFrom, nextMonthFrom } from '@draconis/planner-core';
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
  type PlannerClient,
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
import { Button, Modal, Topbar, TopbarBrand, TopbarNavItem } from '@draconis/ui';
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
        <div className="labels">{(task.labels ?? []).map((label) => <span key={label}>#{label}</span>)}</div>
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
  const [failure, setFailure] = useState<{ operation: 'save' | 'delete'; message: string; serverTask?: Task } | null>(null);
  const serverTask = failure?.serverTask;
  const dirty = isTaskDirty(task, draft);

  const requestClose = () => {
    if (mutating) return;
    if (dirty && !window.confirm(t.dirtyClose)) return;
    onClose();
  };

  const handleSave = async () => {
    setMutating(true);
    setFailure(null);
    try {
      await onSave(draft);
      onClose();
    } catch (cause) {
      setFailure({
        operation: 'save',
        message: cause instanceof Error ? cause.message : t.saveFailed,
        serverTask: cause instanceof ApiConflictError ? cause.task : undefined,
      });
    } finally {
      setMutating(false);
    }
  };

  const handleDelete = async () => {
    setMutating(true);
    setFailure(null);
    try {
      await onDelete(task);
      onClose();
    } catch (cause) {
      setFailure({ operation: 'delete', message: cause instanceof Error ? cause.message : t.deleteFailed });
      setConfirmingDelete(false);
    } finally {
      setMutating(false);
    }
  };

  return (
    <Modal
      open
      onClose={requestClose}
      eyebrow={t.editCard}
      title={t.details}
      closeLabel={t.close}
      size="lg"
      closeOnBackdrop={!mutating}
      footer={confirmingDelete ? undefined : (
        <div className="modal-actions">
          <Button variant="danger" disabled={mutating} onClick={() => setConfirmingDelete(true)}>{t.delete}</Button>
          <div>
            <Button variant="secondary" disabled={mutating} onClick={requestClose}>{t.cancel}</Button>
            <Button variant="primary" disabled={mutating || !draft.title.trim()} onClick={() => void handleSave()}>{mutating ? t.saving : t.save}</Button>
          </div>
        </div>
      )}
    >
      {failure && (
        <div className="editor-error">
          <span role="alert">{failure.message}</span>
          <div className="editor-error-actions">
            {serverTask && (
              <Button variant="secondary" disabled={mutating || confirmingDelete} onClick={() => { setDraft(serverTask); setFailure(null); }}>
                {t.loadServer}
              </Button>
            )}
            <Button
              variant={failure.operation === 'delete' ? 'danger' : 'primary'}
              disabled={mutating || confirmingDelete || (failure.operation === 'save' && !draft.title.trim())}
              onClick={() => void (failure.operation === 'delete' ? handleDelete() : handleSave())}
            >
              {t.retry}
            </Button>
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
        <label>{t.labels}<input disabled={mutating} value={draft.labels.join(', ')} onChange={(event) => setDraft({ ...draft, labels: event.target.value.split(',').map((label) => label.trim()).filter(Boolean) })} placeholder={t.labelsPlaceholder} /></label>
        {confirmingDelete ? (
          <div className="delete-confirm">
            <p>{t.confirmDelete(task.title)}</p>
            <div className="delete-confirm-actions">
              <Button variant="secondary" disabled={mutating} onClick={() => setConfirmingDelete(false)}>{t.cancel}</Button>
              <Button variant="danger" disabled={mutating} onClick={() => void handleDelete()}>{t.confirmDeleteBtn}</Button>
            </div>
          </div>
        ) : null}
    </Modal>
  );
}

export default function App({ client = plannerApi, readOnly = false, refreshVersion = 0 }: { client?: PlannerClient; readOnly?: boolean; refreshVersion?: number } = {}) {
  const [context, setContext] = useState({ client, generation: 0 });
  if (context.client !== client) {
    setContext({ client, generation: context.generation + 1 });
  }
  return <PlannerWorkspace key={context.generation} client={client} readOnly={readOnly} refreshVersion={refreshVersion} />;
}

function PlannerWorkspace({ client, readOnly, refreshVersion }: { client: PlannerClient; readOnly: boolean; refreshVersion: number }) {
  const activeClient = useRef(client);
  const readGeneration = useRef(0);
  const [loadedVersion, setLoadedVersion] = useState(0);
  const writesPaused = readOnly || loadedVersion !== refreshVersion;
  const pendingUpdates = useRef(new Set<string>());
  activeClient.current = client;
  const initialUrl = parseFiltersFromUrl(window.location.search);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [totalTasks, setTotalTasks] = useState(0);
  const [page, setPage] = useState(Number(new URLSearchParams(window.location.search).get('page')) || 1);
  const [selectedView, setSelectedView] = useState<PlannerView | undefined>(initialUrl.view);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>(initialUrl);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showPreferences, setShowPreferences] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conflictTask, setConflictTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const quickInput = useRef<HTMLInputElement>(null);
  const view = selectedView ?? preferences.defaultView;
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
    const generation = ++readGeneration.current;
    try {
      setError(null);
      const query = serverFiltered
        ? { ...taskFilter, timezone, page, pageSize: 50 }
        : undefined;
      const result = await client.list(query);
      if (activeClient.current !== client || generation !== readGeneration.current) return;
      setLoadedVersion(refreshVersion);
      if (isPaginatedTasks(result)) {
        setTasks(result.items);
        setTotalTasks(result.total);
      } else {
        setTasks(result);
        setTotalTasks(result.length);
      }
    } catch (cause) {
      if (activeClient.current === client && generation === readGeneration.current) setError(cause instanceof Error ? cause.message : t.loadFailed);
    } finally {
      if (activeClient.current === client && generation === readGeneration.current) setLoading(false);
    }
  }, [client, page, serverFiltered, taskFilter, timezone, t.loadFailed, refreshVersion]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    setTasks([]); setLoading(true); setPreferences(DEFAULT_PREFERENCES); setEditingTask(null); setConflictTask(null);
  }, [client]);
  useEffect(() => {
    let cancelled = false;
    void client.preferences.get().then(value => { if (!cancelled) setPreferences(value); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [client, refreshVersion]);
  useEffect(() => {
    syncUrl(taskFilter, selectedView, page);
  }, [taskFilter, selectedView, page]);
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
    if (!parsed.title || writesPaused) return;
    try {
      const task = await client.create(parsed);
      if (activeClient.current !== client) return;
      setTasks((current) => [...current, task]);
      setQuickTitle('');
    } catch (cause) {
      if (activeClient.current === client) setError(cause instanceof Error ? cause.message : t.createFailed);
    }
  };

  const updateTask = async (id: string, changes: UpdateTaskInput, expectedVersion?: number) => {
    if (writesPaused) throw new Error(preferences.locale === 'nl' ? 'Opslaan is gepauzeerd.' : 'Saving is paused.');
    const existing = tasks.find((task) => task.id === id);
    if (!existing) return;
    if (pendingUpdates.current.has(id)) {
      setError(t.updatePending);
      throw new Error(t.updatePending);
    }
    pendingUpdates.current.add(id);
    const optimistic = { ...existing, ...changes, labels: changes.labels ?? existing.labels, updatedAt: new Date().toISOString() };
    setConflictTask(null);
    setError(null);
    setTasks((current) => current.map((task) => task === existing ? optimistic : task));
    try {
      const updated = await client.update(id, { ...changes, version: expectedVersion ?? existing.version });
      if (activeClient.current !== client) return updated;
      if (changes.lane === 'done' && existing.lane !== 'done' && existing.recurrence) {
        await refresh();
        return updated;
      }
      if (changes.position !== undefined || changes.lane !== undefined) {
        await refresh();
        return updated;
      }
      setTasks((current) => current.map((task) => task.id === id && task.version <= updated.version ? updated : task));
      return updated;
    } catch (cause) {
      if (activeClient.current !== client) throw cause;
      setTasks((current) => current.map((task) => task === optimistic ? existing : task));
      if (cause instanceof ApiConflictError) {
        setConflictTask(cause.task);
        setError(cause.message);
      } else {
        setError(cause instanceof Error ? cause.message : t.updateFailed);
      }
      throw cause;
    } finally {
      pendingUpdates.current.delete(id);
    }
  };

  const moveLane = (task: Task, direction: -1 | 1) => {
    const index = LANES.indexOf(task.lane);
    const lane = LANES[index + direction];
    if (lane) void updateTask(task.id, { lane }).catch(() => undefined);
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
      void updateTask(task.id, { plannedDate: scheduleDates[String(over.id)] }).catch(() => undefined);
      return;
    }
    const overTask = tasks.find((item) => item.id === over.id);
    const laneId = String(over.id).startsWith('lane-') ? String(over.id).slice(5) : overTask?.lane;
    if (!LANES.includes(laneId as Lane)) return;
    const targetLane = laneId as Lane;
    const laneTasks = tasks.filter((item) => item.lane === targetLane && item.id !== task.id);
    const position = overTask ? overTask.position - 0.5 : Math.max(0, ...laneTasks.map((item) => item.position)) + 1000;
    void updateTask(task.id, { lane: targetLane, position }).catch(() => undefined);
  };

  const savePreferences = async (next: UserPreferences) => {
    if (writesPaused) throw new Error(preferences.locale === 'nl' ? 'Opslaan is gepauzeerd.' : 'Saving is paused.');
    const { locale, timezone, weekStart, defaultView } = next;
    const saved = await client.preferences.update({ locale, timezone, weekStart, defaultView });
    if (activeClient.current !== client) return;
    setPreferences((current) => ({ ...saved, savedViews: current.savedViews }));
    setSelectedView(saved.defaultView);
    setShowPreferences(false);
  };

  const saveViewList = async (savedViews: SavedView[]) => {
    if (writesPaused) return false;
    try {
      const saved = await client.preferences.update({ savedViews });
      if (activeClient.current !== client) return false;
      setPreferences((current) => ({ ...current, savedViews: saved.savedViews }));
      setError(null);
      return true;
    } catch (cause) {
      if (activeClient.current === client) setError(cause instanceof Error ? cause.message : t.saveFailed);
      return false;
    }
  };

  const saveView = (name: string) => {
    const viewEntry: SavedView = {
      id: crypto.randomUUID(),
      name,
      filter: { ...taskFilter, q: textFilter || taskFilter.q },
    };
    return saveViewList([...preferences.savedViews, viewEntry]);
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
      <Topbar
        brand={<TopbarBrand mark="D" title={t.brand} subtitle={`${t.appName} · ${client.workspaceId}`} />}
        nav={(['board', 'scheduled', 'history'] as const).map((item) => (
          <TopbarNavItem key={item} active={view === item} onClick={() => setSelectedView(item)}>
            {i18n.viewLabel(item)}{item === 'scheduled' ? <span>{futureTasks.length}</span> : null}
          </TopbarNavItem>
        ))}
        actions={(
          <>
            <input
              className="search"
              disabled={readOnly}
              value={taskFilter.q ?? ''}
              onChange={(event) => {
                setTaskFilter((current) => ({ ...current, q: event.target.value || undefined }));
                setPage(1);
              }}
              placeholder={t.search}
            />
            <Button className="prefs-button" variant="secondary" onClick={() => setShowPreferences(true)} aria-label={t.preferences}>⚙</Button>
            <button type="button" className="avatar">VA</button>
          </>
        )}
      />

      <main>
        <section className="page-heading">
          <div>
            <span className="eyebrow">{formatHeadingDate()}</span>
            <h1>{i18n.viewLabel(view)}</h1>
            <p>{t.viewCopy[view]}</p>
          </div>
          <Button variant="primary" className="page-new-task" disabled={writesPaused} onClick={() => quickInput.current?.focus()}>＋ {t.newTask} <kbd>N</kbd></Button>
        </section>

        <fieldset className="planner-read-filters" disabled={readOnly}>
        <FilterPanel
          filter={taskFilter}
          savedViews={preferences.savedViews}
          i18n={i18n}
          onChange={(filter) => { setTaskFilter(filter); setPage(1); }}
          onSaveView={saveView}
          onApplyView={(saved) => { setTaskFilter(saved.filter); setPage(1); }}
          onRenameView={(id, name) => saveViewList(preferences.savedViews.map((item) => item.id === id ? { ...item, name } : item))}
          onDeleteView={(id) => saveViewList(preferences.savedViews.filter((item) => item.id !== id))}
        />
        </fieldset>

        {error && <div className="error-banner">{error}<button onClick={() => { setError(null); setConflictTask(null); }}>×</button></div>}
        {conflictTask && (
          <div className="conflict-banner">
            <span>{t.conflict(conflictTask.title)}</span>
            <button type="button" className="secondary-button" onClick={() => {
              setTasks((current) => current.map((task) => task.id === conflictTask.id && task.version <= conflictTask.version ? conflictTask : task));
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
              <button disabled={writesPaused} onClick={() => void createTask()}>{t.addTask}</button>
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
                  <button className="show-planned" onClick={() => setSelectedView('scheduled')}>{t.showPlanned}</button>
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
              <button type="button" className="secondary-button" disabled={readOnly || page <= 1} onClick={() => setPage((value) => value - 1)}>←</button>
              <button type="button" className="secondary-button" disabled={readOnly || page >= totalPages} onClick={() => setPage((value) => value + 1)}>→</button>
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
            }, draft.version);
          }}
          onDelete={async (task) => {
            if (writesPaused) throw new Error(preferences.locale === 'nl' ? 'Opslaan is gepauzeerd.' : 'Saving is paused.');
            await client.remove(task.id);
            if (activeClient.current !== client) return;
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
