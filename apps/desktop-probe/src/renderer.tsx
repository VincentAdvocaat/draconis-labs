import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createBookingClient, createPlannerClient, LOCAL_WORKSPACE_ID } from '@draconis/shared';
import { Planner } from '../../planner/src/Planner';
import '@draconis/ui/tokens.css';
import '@draconis/ui/button.css';
import '@draconis/ui/modal.css';
import '@draconis/ui/topbar.css';
import '../../planner/src/index.css';
import './bridge.js';

const client = createPlannerClient(window.plannerProbe.invoke, LOCAL_WORKSPACE_ID);
const bookings = createBookingClient(window.plannerProbe.invoke, LOCAL_WORKSPACE_ID);
window.plannerClient = client;
window.bookingClient = bookings;
function Probe() {
  useEffect(() => { window.plannerProbe.ready().catch(console.error); }, []);
  return <Planner taskClient={client} bookingClient={bookings} />;
}
createRoot(document.getElementById('root')!).render(<Probe />);
