import { useCallback, useEffect, useRef, useState } from 'react';
import { bookingInstant, bookingToday, DEFAULT_ZONE_ID, LOCAL_DEMO_POSTCODES, LOCAL_BOOKING_POLICY, type Appointment, type Availability, type BookingClient, type Contact, type ContactCard, type ContactInput, type Zone } from '@draconis/shared';
import './Bookings.css';

const emptyContact: ContactInput = { name: '', email: '', phone: '' };
const statusLabel = { planned: 'Gepland', cancelled: 'Geannuleerd', completed: 'Uitgevoerd' };
function windowLabel(a: Appointment) { return `${a.window.date} · ${a.zoneName} · ${a.window.label} ${a.window.startTime}–${a.window.endTime}`; }

export function Bookings({ client, section }: { client: BookingClient; section: 'contacts' | 'appointments' }) {
  const [date, setDate] = useState(() => bookingToday(new Date().toISOString(), LOCAL_BOOKING_POLICY.timezone));
  const [zoneId, setZoneId] = useState(DEFAULT_ZONE_ID), [zones, setZones] = useState<Zone[]>([]);
  const [query, setQuery] = useState(''), [archived, setArchived] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]), [availability, setAvailability] = useState<Availability[]>([]), [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selected, setSelected] = useState(''), [card, setCard] = useState<ContactCard | null>(null), [draft, setDraft] = useState<ContactInput>(emptyContact);
  const [contactId, setContactId] = useState(''), [slotId, setSlotId] = useState(''), [arrivalTime, setArrivalTime] = useState(''), [reason, setReason] = useState('');
  const [moving, setMoving] = useState<Appointment | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false), [loadedContext, setLoadedContext] = useState('');
  const sequence = useRef(0), alive = useRef(true);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const pending = useRef<{ key: string; execute: (key: string) => Promise<unknown> } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; invalidate(); }; }, [invalidate]);
  const reload = useCallback(async () => {
    const generation = ++sequence.current; setLoading(true);
    try {
      const [people, slots, visits, customer, areas] = await Promise.all([
        client.contacts.list(section === 'contacts' ? { q: query, archived } : { archived: true }), client.availability(date, zoneId), client.appointments.list(date, zoneId), selected ? client.contacts.card(selected) : Promise.resolve(null), client.zones.list(),
      ]);
      if (!alive.current || generation !== sequence.current) return;
      setContacts(people); setAvailability(slots); setAppointments(visits); setCard(customer); setZones(areas); setLoadedContext(date+'|'+zoneId);
    } catch (e) { if (alive.current && generation === sequence.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (alive.current && generation === sequence.current) setLoading(false); }
  }, [client, date, zoneId, query, archived, selected, section]);
  const latestReload = useRef(reload);
  useEffect(() => { latestReload.current = reload; }, [reload]);
  useEffect(() => { void reload(); return invalidate; }, [reload, invalidate]);
  const { id: cardId, version: cardVersion, name: cardName, email: cardEmail, phone: cardPhone } = card?.contact ?? {};
  useEffect(() => { setDraft(cardId ? { name: cardName!, email: cardEmail ?? '', phone: cardPhone ?? '' } : emptyContact); }, [cardId, cardVersion, cardName, cardEmail, cardPhone]);

  async function executePending() {
    const command = pending.current; if (!command) return;
    setBusy(true); setError('');
    try {
      await command.execute(command.key);
      if (!alive.current) return;
      pending.current = null; setUncertain(false); setMoving(null); setArrivalTime('');
      await latestReload.current();
    } catch (e) {
      if (!alive.current) return;
      const unavailable = e instanceof Error && 'code' in e && e.code === 'UNAVAILABLE';
      setUncertain(unavailable);
      if (!unavailable) { pending.current = null; if (e instanceof Error && 'code' in e && e.code === 'VERSION_CONFLICT') setMoving(null); await latestReload.current(); }
      setError(e instanceof Error ? e.message : String(e));
    } finally { if (alive.current) setBusy(false); }
  }
  function command(execute: (key: string) => Promise<unknown>) {
    if (busy || pending.current) return;
    pending.current = { key: crypto.randomUUID(), execute }; void executePending();
  }
  const disabled = busy || uncertain;
  const slots = loadedContext === date+'|'+zoneId ? availability : [], visits = loadedContext === date+'|'+zoneId ? appointments : [];
  const selectedZone = zones.find(zone => zone.id === zoneId);
  function arrivalAt() {
    if (!arrivalTime) return null;
    const slot = slots.find(item => item.slot.id === slotId)?.slot;
    if (!slot) throw new Error('Kies eerst een dagdeel.');
    return bookingInstant(slot.date, arrivalTime, slot.timezone);
  }
  return <main className="bookings">
    <p className="booking-mode">Werkruimte {client.workspaceId} · Lokale opslag · {LOCAL_BOOKING_POLICY.timezone}</p>
    <div aria-live="polite">{loading && <p>Gegevens laden…</p>}</div>
    {error && <p role="alert">{error}</p>}
    {uncertain ? <p>De uitkomst is nog onbekend. <button disabled={busy} onClick={() => void executePending()}>Dezelfde handeling opnieuw proberen</button></p> : <button disabled={busy} onClick={() => { setError(''); void reload(); }}>Verversen</button>}
    {section === 'contacts' ? <div className="booking-columns">
      <section aria-label="Relaties zoeken">
        <h1>Relaties</h1>
        <label>Zoeken <input value={query} disabled={disabled} onChange={e => setQuery(e.target.value)} /></label>
        <label><input type="checkbox" checked={archived} disabled={disabled} onChange={e => setArchived(e.target.checked)} /> Ook gearchiveerde relaties</label>
        <button disabled={disabled} onClick={() => { setSelected(''); setCard(null); setDraft(emptyContact); }}>Nieuwe relatie</button>
        <ul>{contacts.map(contact => <li key={contact.id}><button disabled={disabled} onClick={() => setSelected(contact.id)}>{contact.name}{contact.archived ? ' · Gearchiveerd' : ''}</button></li>)}</ul>
        {!loading && !contacts.length && <p>Geen relaties gevonden.</p>}
      </section>
      <section aria-label="Klantkaart">
        <h2>{card?.contact.name ?? 'Nieuwe relatie'}</h2>
        <form onSubmit={e => { e.preventDefault(); if (selected && !card) return; command(async key => {
          if (card) return client.contacts.update(card.contact.id, { ...draft, version: card.contact.version }, key);
          const contact = await client.contacts.create(draft, key); if (alive.current) setSelected(contact.id); return contact;
        }); }}>
          <fieldset disabled={disabled || Boolean(selected && (!card || card.contact.id !== selected))}>
            <label>Naam <input value={draft.name} required maxLength={160} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
            <label>E-mail <input type="email" value={draft.email ?? ''} maxLength={254} onChange={e => setDraft({ ...draft, email: e.target.value })} /></label>
            <label>Telefoon <input value={draft.phone ?? ''} maxLength={80} onChange={e => setDraft({ ...draft, phone: e.target.value })} /></label>
            <button>Relatie opslaan</button>
          </fieldset>
        </form>
        {card && card.contact.id === selected && <>
          <button disabled={disabled} onClick={() => command(key => client.contacts.update(card.contact.id, { version: card.contact.version, archived: !card.contact.archived }, key))}>{card.contact.archived ? 'Relatie activeren' : 'Relatie archiveren'}</button>
          <h3>Komende afspraken</h3><ul>{card.upcoming.map(a => <li key={a.id}>{windowLabel(a)}</li>)}</ul>
          <h3>Historie</h3><ul>{card.history.map(a => <li key={a.id}>{windowLabel(a)} · {statusLabel[a.status]}</li>)}</ul>
          <details><summary>Wijzigingen ({card.events.length})</summary><ul>{card.events.map(event => <li key={event.id}>{event.createdAt} · {event.actor} · {event.type}</li>)}</ul></details>
        </>}
      </section>
    </div> : <>
      <h1>Afspraken</h1>
      <label>Werkgebied <select value={zoneId} disabled={disabled || loading} onChange={e => { setZoneId(e.target.value); setSlotId(''); setArrivalTime(''); }}>{zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
      <details><summary>Fictieve postcodevoorbeelden</summary>
        <p>Alleen demonstratiecodes; deze indeling zegt niets over echte geografische dekking.</p>
        <ul>{LOCAL_DEMO_POSTCODES.map(assignment=><li key={assignment.postcode}>{assignment.postcode.slice(0,4)} {assignment.postcode.slice(4)} · {zones.find(zone=>zone.id===assignment.zoneId)?.name}</li>)}</ul>
        <form onSubmit={async e=>{e.preventDefault();const postcode=String(new FormData(e.currentTarget).get('postcode'));setBusy(true);setError('');
          try {const result=await client.zones.resolve(postcode);if(alive.current){setZoneId(result.zone.id);setSlotId('');setArrivalTime('');}}
          catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e));}
          finally{if(alive.current)setBusy(false);}
        }}><fieldset disabled={disabled || loading}><label>Fictieve postcode <input name="postcode" required maxLength={20} placeholder="0002 AA" /></label><button>Fictief werkgebied zoeken</button></fieldset></form>
      </details>
      <label>Datum <input type="date" value={date} disabled={disabled} onChange={e => { setDate(e.target.value); setSlotId(''); setArrivalTime(''); }} /></label>
      <p>Capaciteit per werkgebied en dagdeel. Het klanttijdvak en de interne aankomsttijd zijn aparte gegevens.</p>
      {selectedZone && <details><summary>Standaardcapaciteit {selectedZone.name}</summary>
        <p>Alleen voor nog niet aangemaakte dagdelen. Bestaande tijdvakken houden hun eigen capaciteit.</p>
        <form key={selectedZone.id+':'+selectedZone.version} onSubmit={e => { e.preventDefault(); const defaultCapacity=Number(new FormData(e.currentTarget).get('capacity')); command(key => client.zones.capacity(selectedZone.id,{version:selectedZone.version,defaultCapacity},key)); }}>
          <fieldset disabled={disabled || loading}><label>Standaard voor nieuwe dagdelen <input name="capacity" type="number" min={0} max={100} required defaultValue={selectedZone.defaultCapacity} /></label><button>Standaardcapaciteit opslaan</button></fieldset>
        </form>
      </details>}
      <div className="booking-columns">
        <section aria-label="Dagdeelbeschikbaarheid"><h2>Dagdelen</h2>
          {slots.map(item => <article key={item.slot.id} className="booking-slot">
            <h3>{item.slot.label} · {item.slot.startTime}–{item.slot.endTime}</h3>
            <p>{item.block ? `Geblokkeerd: ${item.block.reason}` : `${item.occupied} van ${item.slot.capacity} bezet · ${item.available ? 'Beschikbaar' : item.occupied >= item.slot.capacity ? 'Vol' : 'Buiten boekingshorizon'}`}</p>
            {item.available && <button disabled={disabled} onClick={() => setSlotId(item.slot.id)}>Kies {item.slot.label.toLowerCase()}</button>}
            {item.block ? <button disabled={disabled} onClick={() => command(key => client.blocks.remove(item.block!.id, key))}>Dagdeel vrijgeven</button> : item.occupied === 0 && <button disabled={disabled || !reason.trim()} onClick={() => command(key => client.blocks.create({ slotId: item.slot.id, reason }, key))}>Dagdeel blokkeren</button>}
            <form key={item.slot.id+':'+item.slot.version} onSubmit={e => { e.preventDefault(); const capacity=Number(new FormData(e.currentTarget).get('capacity')); command(key => client.slots.capacity(item.slot.id,{version:item.slot.version,capacity},key)); }}>
              <fieldset disabled={disabled || loading}><label>Capaciteit {item.slot.label.toLowerCase()} <input name="capacity" type="number" min={0} max={100} required defaultValue={item.slot.capacity} /></label><button>Dagdeelcapaciteit opslaan</button></fieldset>
            </form>
          </article>)}
          <label>Reden blokkade <input value={reason} disabled={disabled} maxLength={240} onChange={e => setReason(e.target.value)} /></label>
          {!loading && !slots.length && <p>Geen dagdelen binnen de boekingshorizon.</p>}
        </section>
        <section aria-label="Afspraak plannen"><h2>{moving ? 'Afspraak verplaatsen' : 'Afspraak plannen'}</h2>
          {moving && <p>Van {windowLabel(moving)}. Kies hierboven de bestemmingsdatum.</p>}
          <form onSubmit={e => { e.preventDefault(); let arrival: string | null; try { arrival = arrivalAt(); } catch { setError('Deze interne aankomsttijd bestaat niet of is dubbelzinnig in de werkruimtetijdzone.'); return; }
            command(key => moving ? client.appointments.move(moving.id, { slotId, version: moving.version, arrivalAt: arrival }, key) : client.appointments.create({ contactId, slotId, arrivalAt: arrival }, key));
          }}><fieldset disabled={disabled || loading}>
            {!moving && <label>Relatie <select value={contactId} required onChange={e => setContactId(e.target.value)}><option value="">Kies een relatie</option>{contacts.filter(contact => !contact.archived).map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>}
            <label>Dagdeel <select value={slotId} required onChange={e => setSlotId(e.target.value)}><option value="">Kies een dagdeel</option>{slots.filter(item => item.available || item.slot.id === moving?.slotId).map(item => <option key={item.slot.id} value={item.slot.id}>{item.slot.label} · {item.slot.startTime}–{item.slot.endTime}</option>)}</select></label>
            <label>Interne aankomsttijd (optioneel) <input type="time" value={arrivalTime} onChange={e => setArrivalTime(e.target.value)} /></label>
            <button>{moving ? 'Verplaatsing opslaan' : 'Afspraak plannen'}</button>
            {moving && <button type="button" onClick={() => { setMoving(null); setSlotId(''); }}>Verplaatsen sluiten</button>}
          </fieldset></form>
        </section>
      </div>
      <section aria-label="Afspraken op datum"><h2>Op deze datum</h2>
        <ul>{visits.map(a => <li key={a.id} className="booking-visit">
          <strong>{contacts.find(contact => contact.id === a.contactId)?.name ?? 'Relatie op klantkaart'}</strong> · {windowLabel(a)} · {statusLabel[a.status]}{a.source==='public'?' · Publieke boeking':''}
          <p>Interne aankomst: {a.arrivalAt ? new Intl.DateTimeFormat('nl-NL', { timeZone: a.window.timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(a.arrivalAt)) : 'Niet ingevuld'}</p>
          {a.status === 'planned' && <>
            <button disabled={disabled} onClick={() => { setMoving(a); setSlotId(''); setArrivalTime(''); }}>Verplaatsen</button>
            <button disabled={disabled} onClick={() => command(key => client.appointments.status(a.id, { version: a.version, status: 'completed' }, key))}>Afronden</button>
            <button disabled={disabled} onClick={() => command(key => client.appointments.status(a.id, { version: a.version, status: 'cancelled' }, key))}>Annuleren</button>
          </>}
        </li>)}</ul>
        {!loading && !visits.length && <p>Geen afspraken op deze datum.</p>}
      </section>
    </>}
  </main>;
}
