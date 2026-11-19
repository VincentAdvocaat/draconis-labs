// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PublicBookingClientError,type PublicAvailability,type PublicBookingClient,type PublicConfirmation} from '@draconis/shared';
import {PublicBookingPage} from '../public-site/page';

(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const window={date:'2026-11-20',daypart:'Ochtend',zone:'Noord (fictief)',startTime:'08:00',endTime:'12:00',timezone:'Europe/Amsterdam',startAt:'2026-11-20T07:00:00Z',endAt:'2026-11-20T11:00:00Z'};
const offers:PublicAvailability={channelName:'Fictief onderhoud',zone:'Noord (fictief)',date:'2026-11-20',slots:[{id:'00000000-0000-4000-8000-000000000001',remaining:1,window}]};
const receipt:PublicConfirmation={reference:'00000000-0000-4000-8000-000000000002',status:'confirmed',window};
const fixture=():PublicBookingClient=>({channelId:crypto.randomUUID(),availability:vi.fn(async()=>offers),reserve:vi.fn(async()=>receipt)});
let root:Root;
beforeEach(()=>{sessionStorage.clear();document.body.innerHTML='<div id="test"></div>';root=createRoot(document.getElementById('test')!);});
afterEach(async()=>{await act(async()=>root.unmount());document.body.replaceChildren();});
const button=(text:string)=>{const found=[...document.querySelectorAll('button')].find(b=>b.textContent===text);if(!found)throw Error('Missing button '+text);return found;};
async function edit(selector:string,value:string){await act(async()=>{const input=document.querySelector(selector) as HTMLInputElement;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event(input.type==='date'?'change':'input',{bubbles:true}));});}
async function submit(label:string){await act(async()=>{button(label).closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});}
async function form(client:PublicBookingClient,name='Fictieve bezoeker'){
  await act(async()=>root.render(<PublicBookingPage client={client}/>));
  await edit('input[placeholder="0002 AA"]','0002 AA');await edit('input[type="date"]','2026-11-20');await submit('Beschikbare tijdvakken zoeken');
  await act(async()=>{document.querySelector('input[type="radio"]')!.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
  await edit('input[autocomplete="name"]',name);await edit('input[autocomplete="email"]','visitor@example.test');
}
it('confirms and reloads only the public receipt without persisting contact data',async()=>{
  const client=fixture();await form(client);await submit('Afspraak bevestigen');
  expect(document.body.textContent).toContain('Uw afspraak is bevestigd');
  expect(document.body.textContent).not.toContain('visitor@example.test');
  expect(JSON.parse(sessionStorage.getItem('planner-public-confirmation:'+client.channelId)!)).toEqual(receipt);
  await act(async()=>root.unmount());root=createRoot(document.getElementById('test')!);await act(async()=>root.render(<PublicBookingPage client={client}/>));
  expect(document.body.textContent).toContain(receipt.reference);expect(client.reserve).toHaveBeenCalledTimes(1);
});
it('keeps the exact payload/key while retrying an unknown outcome',async()=>{
  const client=fixture();client.reserve=vi.fn().mockRejectedValueOnce(new PublicBookingClientError({code:'UNAVAILABLE',status:503,message:'Verbinding verbroken'})).mockResolvedValue(receipt);
  await form(client);await submit('Afspraak bevestigen');
  expect((document.querySelector('input[autocomplete="name"]')!.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  await act(async()=>{button('Dezelfde aanvraag opnieuw proberen').click();});
  expect(vi.mocked(client.reserve).mock.calls[1]).toEqual(vi.mocked(client.reserve).mock.calls[0]);
  expect(document.body.textContent).toContain(receipt.reference);
});
it('does not let a late confirmation from another channel replace the new form',async()=>{
  const a=fixture(),b=fixture();let resolve!:(value:PublicConfirmation)=>void;
  a.reserve=vi.fn(()=>new Promise<PublicConfirmation>(done=>{resolve=done;}));
  await form(a);await submit('Afspraak bevestigen');await form(b,'Nieuwe kanaalbezoeker');
  await act(async()=>resolve(receipt));
  expect((document.querySelector('input[autocomplete="name"]') as HTMLInputElement).value).toBe('Nieuwe kanaalbezoeker');
  expect(document.body.textContent).not.toContain(receipt.reference);expect(b.reserve).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('planner-public-confirmation:'+b.channelId)).toBeNull();
});
it('refreshes availability after a full-slot conflict without losing the error',async()=>{
  const client=fixture();client.availability=vi.fn().mockResolvedValueOnce(offers).mockResolvedValue({...offers,slots:[]});
  client.reserve=vi.fn().mockRejectedValue(new PublicBookingClientError({code:'SLOT_FULL',status:409,message:'Dit tijdvak is inmiddels vol.'}));
  await form(client);await submit('Afspraak bevestigen');
  expect(document.querySelector('[role="alert"]')!.textContent).toContain('inmiddels vol');
  expect(document.body.textContent).toContain('Geen beschikbare tijdvakken');expect(client.availability).toHaveBeenCalledTimes(2);
});
