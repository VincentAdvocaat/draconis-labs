import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {createPublicBookingClient} from '@draconis/shared';
import {PublicBookingPage} from './page';
import '@draconis/ui/tokens.css';
import './public.css';
const channelId=new URLSearchParams(window.location.search).get('channel');
createRoot(document.getElementById('root')!).render(<StrictMode>{channelId?<PublicBookingPage client={createPublicBookingClient(channelId)}/>:<main><h1>Afspraak maken</h1><p role="alert">Deze boekingslink is onvolledig.</p></main>}</StrictMode>);
