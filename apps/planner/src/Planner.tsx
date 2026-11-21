import { useState } from 'react';
import { AppLauncherLink } from '@draconis/ui';
import { type BookingClient, type PlannerClient } from '@draconis/shared';
import App from './App';
import { Bookings } from './Bookings';

export function Planner({ taskClient, bookingClient, launcherUrl, readOnly, refreshVersion }: { taskClient: PlannerClient; bookingClient: BookingClient; launcherUrl?: string; readOnly?: boolean; refreshVersion?: number }) {
  const [section, setSection] = useState<'tasks' | 'contacts' | 'appointments'>('tasks');
  const [bookingsOpened, setBookingsOpened] = useState(false);
  const [identity, setIdentity] = useState({ taskClient, bookingClient, generation: 0 });
  if (identity.taskClient !== taskClient || identity.bookingClient !== bookingClient) setIdentity({ taskClient, bookingClient, generation: identity.generation + 1 });
  return <>
    <nav className="planner-sections" aria-label="Planner onderdelen">
      {([['tasks','Taken'], ['appointments','Afspraken'], ['contacts','Relaties']] as const).map(([value,label]) => <button key={value} aria-current={section === value ? 'page' : undefined} onClick={() => { setSection(value); if (value !== 'tasks') setBookingsOpened(true); }}>{label}</button>)}
      <AppLauncherLink href={launcherUrl} />
    </nav>
    {section === 'tasks' && <App key={identity.generation} client={taskClient} readOnly={readOnly} refreshVersion={refreshVersion} />}
    {bookingsOpened && <div hidden={section === 'tasks'}><Bookings key={identity.generation} client={bookingClient} readOnly={readOnly} refreshVersion={refreshVersion} section={section === 'contacts' ? 'contacts' : 'appointments'} /></div>}
  </>;
}
