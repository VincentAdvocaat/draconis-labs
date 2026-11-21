import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@draconis/ui/tokens.css';
import '@draconis/ui/button.css';
import '@draconis/ui/modal.css';
import '@draconis/ui/topbar.css';
import '@draconis/ui/app-launcher.css';
import './index.css';
import { BrowserPlanner } from './BrowserPlanner.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserPlanner baseUrl={import.meta.env.VITE_API_URL ?? ''} launcherUrl={import.meta.env.VITE_DRACONIS_HOME_URL} />
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(new URL(`${import.meta.env.BASE_URL}planner-worker.js`, document.baseURI))
    .catch(error => console.warn('Planner offline shell could not be registered.', error));
}