import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@draconis/ui/tokens.css';
import '@draconis/ui/button.css';
import '@draconis/ui/modal.css';
import '@draconis/ui/topbar.css';
import '@draconis/ui/app-launcher.css';
import './index.css';
import { Planner } from './Planner.tsx';
import { bookingApi, plannerApi } from './api.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Planner taskClient={plannerApi} bookingClient={bookingApi} launcherUrl={import.meta.env.VITE_DRACONIS_HOME_URL} />
  </StrictMode>,
);
