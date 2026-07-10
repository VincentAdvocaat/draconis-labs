import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@draconis/ui/tokens.css';
import '@draconis/ui/button.css';
import '@draconis/ui/topbar.css';
import { App } from './App';
import './app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
