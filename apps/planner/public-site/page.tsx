import {useEffect,useRef,useState} from 'react';
import {bookingToday,LOCAL_BOOKING_POLICY,publicConfirmationSchema,type ContactInput,type PublicAvailability,type PublicBookingClient,type PublicConfirmation,type PublicReservation} from '@draconis/shared';

export function PublicBookingPage({client}:{client:PublicBookingClient}){
  const [identity,setIdentity]=useState({client,generation:0});
  if(identity.client!==client)setIdentity({client,generation:identity.generation+1});
  return <PublicBookingForm key={identity.generation} client={client}/>;
}
function storedConfirmation(key:string):PublicConfirmation|null{
  try{const parsed=publicConfirmationSchema.safeParse(JSON.parse(sessionStorage.getItem(key)??'null'));return parsed.success?parsed.data:null;}catch{return null;}
}
function PublicBookingForm({client}:{client:PublicBookingClient}){
  const storageKey='planner-public-confirmation:'+client.channelId;
  const [confirmation,setConfirmation]=useState(()=>storedConfirmation(storageKey));
  const [postcode,setPostcode]=useState(''),[date,setDate]=useState(()=>bookingToday(new Date().toISOString(),LOCAL_BOOKING_POLICY.timezone));
  const [offers,setOffers]=useState<PublicAvailability|null>(null),[slotId,setSlotId]=useState('');
  const [contact,setContact]=useState<ContactInput>({name:'',email:'',phone:''});
  const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
  const pending=useRef<PublicReservation|null>(null),alive=useRef(true);
  const mainRef=useRef<HTMLElement>(null),focusResult=useRef(false);
  useEffect(()=>{
    if(busy)return;
    if(confirmation)mainRef.current?.querySelector<HTMLElement>('h1')?.focus();
    else if(error)mainRef.current?.querySelector<HTMLElement>('[role="alert"]')?.focus();
    else if(focusResult.current){
      (mainRef.current?.querySelector<HTMLElement>('input[type="radio"]')??mainRef.current?.querySelector<HTMLElement>('[data-offers-heading]'))?.focus();
    }
    focusResult.current=false;
  },[busy,confirmation,error,offers]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  async function lookup(clearError=true){
    setBusy(true);if(clearError)setError('');
    try{const result=await client.availability(postcode,date);if(alive.current){focusResult.current=true;setOffers(result);setSlotId('');}}
    catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e));}
    finally{if(alive.current)setBusy(false);}
  }
  async function submit(){
    if(!pending.current)pending.current={key:crypto.randomUUID(),postcode,slotId,contact:{...contact}};
    setBusy(true);setError('');
    try{
      const result=await client.reserve(pending.current);
      if(!alive.current)return;
      pending.current=null;setUncertain(false);setContact({name:'',email:'',phone:''});setConfirmation(result);
      // Persist only the public receipt projection; never contact details or an arrival.
      try{sessionStorage.setItem(storageKey,JSON.stringify(result));}catch{/* Receipt remains visible in memory. */}
    }catch(e){
      if(!alive.current)return;
      const unknown=e instanceof Error&&'code'in e&&['UNAVAILABLE','RATE_LIMITED','INTERNAL_ERROR'].includes(String(e.code));
      setUncertain(unknown);
      if(!unknown){pending.current=null;await lookup(false);}
      setError(e instanceof Error?e.message:String(e));
    }finally{if(alive.current)setBusy(false);}
  }
  if(confirmation)return <main className="public-booking" ref={mainRef}><p className="demo">Lokale demonstratie</p><h1 tabIndex={-1}>Uw afspraak is bevestigd</h1>
    <p>{confirmation.window.zone} · {confirmation.window.date}</p><h2>{confirmation.window.daypart}: {confirmation.window.startTime}–{confirmation.window.endTime}</h2><p>Tijdzone: {confirmation.window.timezone}</p>
    <p>Bewaar uw bevestigingsreferentie:</p><code className="reference">{confirmation.reference}</code><p>In deze demonstratie wordt geen e-mail verstuurd.</p>
    <button onClick={()=>{try{sessionStorage.removeItem(storageKey);}catch{/* No saved receipt. */}setConfirmation(null);setOffers(null);setSlotId('');}}>Nog een afspraak maken</button>
  </main>;
  const locked=busy||uncertain;
  return <main className="public-booking" ref={mainRef}><p className="demo">Lokale demonstratie · fictieve gebieden</p><h1>Plan een onderhoudsafspraak</h1>
    <p>Kies een aangeboden tijdvak. De getoonde tijden zijn het venster dat u wordt toegezegd.</p>
    {error&&<p role="alert" tabIndex={-1}>{error}</p>}
    {busy&&<p role="status">Even wachten…</p>}
    {uncertain&&<p>De uitkomst is nog onbekend. <button disabled={busy} onClick={()=>void submit()}>Dezelfde aanvraag opnieuw proberen</button></p>}
    <form onSubmit={e=>{e.preventDefault();void lookup();}}><fieldset disabled={locked}>
      <label>Fictieve postcode <input value={postcode} required maxLength={20} placeholder="0002 AA" onChange={e=>{setPostcode(e.target.value);setOffers(null);setSlotId('');}}/></label>
      <p className="hint">Alleen democodes 0001 AA tot en met 0005 AA. Dit is geen echte geografische dekking.</p>
      <label>Datum <input type="date" required value={date} onChange={e=>{setDate(e.target.value);setOffers(null);setSlotId('');}}/></label><button>Beschikbare tijdvakken zoeken</button>
    </fieldset></form>
    {offers&&<section aria-label="Tijdvak kiezen"><h2 data-offers-heading tabIndex={-1}>{offers.channelName} · {offers.zone}</h2>
      {offers.slots.length?<form onSubmit={e=>{e.preventDefault();void submit();}}><fieldset disabled={locked}>
        <legend>Tijdvak op {offers.date}</legend>
        {offers.slots.map(slot=><label className="time-window" key={slot.id}><input type="radio" name="slot" required checked={slotId===slot.id} onChange={()=>setSlotId(slot.id)}/><span>{slot.window.daypart} · {slot.window.startTime}–{slot.window.endTime} · {slot.remaining} beschikbaar</span></label>)}
        <label>Naam <input value={contact.name} required maxLength={160} autoComplete="name" onChange={e=>setContact({...contact,name:e.target.value})}/></label>
        <label>E-mail (optioneel) <input type="email" maxLength={254} autoComplete="email" value={contact.email??''} onChange={e=>setContact({...contact,email:e.target.value})}/></label>
        <label>Telefoon (optioneel) <input maxLength={80} autoComplete="tel" value={contact.phone??''} onChange={e=>setContact({...contact,phone:e.target.value})}/></label>
        <button>Afspraak bevestigen</button>
      </fieldset></form>:<p>Geen beschikbare tijdvakken. Kies een andere datum.</p>}
    </section>}
  </main>;
}
