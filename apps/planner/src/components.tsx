import type { SavedView, TaskFilter, UserPreferences } from '@draconis/shared';
import { LANES, PRIORITIES } from '@draconis/shared';
import { useState } from 'react';
import type { createTranslator } from './i18n';

type Translator = ReturnType<typeof createTranslator>;

export function FilterPanel({
  filter,
  savedViews,
  i18n,
  onChange,
  onSaveView,
  onApplyView,
  onRenameView,
  onDeleteView,
}: {
  filter: TaskFilter;
  savedViews: SavedView[];
  i18n: Translator;
  onChange: (filter: TaskFilter) => void;
  onSaveView: (name: string) => void;
  onApplyView: (view: SavedView) => void;
  onRenameView: (id: string, name: string) => void;
  onDeleteView: (id: string) => void;
}) {
  const { t, laneLabel, priorityLabel } = i18n;
  const [open, setOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const update = (patch: Partial<TaskFilter>) => onChange({ ...filter, ...patch });

  return (
    <section className="filter-panel">
      <button type="button" className="secondary-button" onClick={() => setOpen((value) => !value)}>
        {t.advancedFilters}
      </button>
      {open && (
        <div className="filter-sheet">
          <div className="filter-grid">
            <label>
              {t.laneFilter}
              <select
                value={filter.lane ?? ''}
                onChange={(event) => update({ lane: event.target.value ? event.target.value as TaskFilter['lane'] : undefined })}
              >
                <option value="">{t.any}</option>
                {LANES.map((lane) => <option key={lane} value={lane}>{laneLabel(lane)}</option>)}
              </select>
            </label>
            <label>
              {t.priorityFilter}
              <select
                value={filter.priority ?? ''}
                onChange={(event) => update({ priority: event.target.value ? event.target.value as TaskFilter['priority'] : undefined })}
              >
                <option value="">{t.any}</option>
                {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priorityLabel(priority)}</option>)}
              </select>
            </label>
            <label>
              {t.creatorFilter}
              <input value={filter.createdBy ?? ''} onChange={(event) => update({ createdBy: event.target.value || undefined })} />
            </label>
            <label>
              {t.labelFilter}
              <input value={filter.label ?? ''} onChange={(event) => update({ label: event.target.value || undefined })} />
            </label>
            <label>
              {t.plannedDate}
              <input type="date" value={filter.plannedDate ?? ''} onChange={(event) => update({ plannedDate: event.target.value || undefined })} />
            </label>
            <label>
              {t.dueDate}
              <input type="date" value={filter.dueDate ?? ''} onChange={(event) => update({ dueDate: event.target.value || undefined })} />
            </label>
          </div>
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={Boolean(filter.overdue)}
              onChange={(event) => update({ overdue: event.target.checked || undefined })}
            />
            {t.overdueOnly}
          </label>
          <div className="filter-save">
            <input value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder={t.viewName} />
            <button
              type="button"
              className="primary-button"
              disabled={!viewName.trim()}
              onClick={() => {
                onSaveView(viewName.trim());
                setViewName('');
              }}
            >
              {t.saveView}
            </button>
          </div>
          {!!savedViews.length && (
            <div className="saved-views">
              <span className="eyebrow">{t.savedViews}</span>
              {savedViews.map((view) => (
                <div key={view.id} className="saved-view-row">
                  {renamingId === view.id ? (
                    <>
                      <input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
                      <button type="button" className="secondary-button" onClick={() => { onRenameView(view.id, renameValue.trim()); setRenamingId(null); }}>{t.save}</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="saved-view-button" onClick={() => onApplyView(view)}>{view.name}</button>
                      <button type="button" className="secondary-button" onClick={() => { setRenamingId(view.id); setRenameValue(view.name); }}>{t.renameView}</button>
                      <button type="button" className="danger-button" onClick={() => onDeleteView(view.id)}>{t.deleteView}</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function PreferencesModal({
  preferences,
  i18n,
  onClose,
  onSave,
}: {
  preferences: UserPreferences;
  i18n: Translator;
  onClose: () => void;
  onSave: (preferences: UserPreferences) => Promise<void>;
}) {
  const { t, viewLabel } = i18n;
  const [draft, setDraft] = useState(preferences);
  const [saving, setSaving] = useState(false);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal preferences-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div><span className="eyebrow">{t.preferences}</span><h2>{t.preferences}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label={t.close}>×</button>
        </div>
        <label>
          {t.locale}
          <select value={draft.locale} onChange={(event) => setDraft({ ...draft, locale: event.target.value as UserPreferences['locale'] })}>
            <option value="nl">Nederlands</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          {t.timezone}
          <select value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}>
            {['Europe/Amsterdam', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'UTC'].map((zone) => (
              <option key={zone} value={zone}>{zone}</option>
            ))}
          </select>
        </label>
        <label>
          {t.weekStart}
          <select value={draft.weekStart} onChange={(event) => setDraft({ ...draft, weekStart: Number(event.target.value) as 0 | 1 })}>
            <option value={1}>{t.weekStartMonday}</option>
            <option value={0}>{t.weekStartSunday}</option>
          </select>
        </label>
        <label>
          {t.defaultView}
          <select value={draft.defaultView} onChange={(event) => setDraft({ ...draft, defaultView: event.target.value as UserPreferences['defaultView'] })}>
            {(['board', 'scheduled', 'history'] as const).map((view) => (
              <option key={view} value={view}>{viewLabel(view)}</option>
            ))}
          </select>
        </label>
        <div className="modal-actions">
          <div />
          <div>
            <button type="button" className="secondary-button" onClick={onClose}>{t.cancel}</button>
            <button
              type="button"
              className="primary-button"
              disabled={saving}
              onClick={() => {
                setSaving(true);
                void onSave(draft).finally(() => setSaving(false));
              }}
            >
              {saving ? t.saving : t.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
