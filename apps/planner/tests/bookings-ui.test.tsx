// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bookingToday, DEFAULT_PREFERENCES, LOCAL_BOOKING_POLICY, type Appointment, type Availability, type BookingClient, type Contact, type PlannerClient } from '@draconis/shared';
import { Bookings } from '../src/Bookings';
import { Planner } from '../src/Planner';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const person: Contact = { id:'person',workspaceId:'local',name:'Demo klant',email:null,phone:null,archived:false,version:1,createdAt:'',updatedAt:'' };
const today = () => bookingToday(new Date().toISOString(), LOCAL_BOOKING_POLICY.timezone);
function slot(date = today()): Availability {
  return { available:true,occupied:0,block:null,slot:{ id:'slot-'+date,workspaceId:'local',zoneId:'standard',capacity:1,version:1,date,daypartId:'morning',label:'Ochtend',startTime:'08:00',endTime:'12:00',timezone:'Europe/Amsterdam',startAt:date+'T07:00:00Z',endAt:date+'T11:00:00Z' } };
}
function fixture() {
  const client: BookingClient = { workspaceId:'local',
    zones:{list:vi.fn(async()=>[{id:'standard',workspaceId:'local',name:'Standaardgebied',defaultCapacity:1,version:1}]),resolve:vi.fn(),capacity:vi.fn()},slots:{capacity:vi.fn()},
    contacts:{ list:vi.fn(async () => [person]),create:vi.fn(async () => person),update:vi.fn(async () => person),card:vi.fn(async () => ({contact:person,upcoming:[],history:[],events:[]})) },
    availability:vi.fn(async date => [slot(date)]),
    appointments:{list:vi.fn(async () => []),create:vi.fn(),move:vi.fn(),status:vi.fn()},blocks:{create:vi.fn(),remove:vi.fn()},
  };
  const tasks: PlannerClient = {workspaceId:'local',list:vi.fn(async()=>[]),history:vi.fn(async()=>[]),create:vi.fn(),update:vi.fn(),remove:vi.fn(),preferences:{get:vi.fn(async()=>DEFAULT_PREFERENCES),update:vi.fn()}};
  return {client,tasks};
}
let root: Root;
beforeEach(() => { document.body.innerHTML='<div id="test"></div>'; root=createRoot(document.getElementById('test')!); });
afterEach(async () => { await act(async()=>root.unmount()); document.body.replaceChildren(); });
const button = (label: string) => {
  const element = [...document.querySelectorAll('button')].find(item=>item.textContent?.trim()===label);
  if (!element) throw new Error('Missing button '+label); return element;
};
const click = async (element: Element) => act(async()=>{element.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
async function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async()=>{
    const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value')!.set!.call(element,value);
    element.dispatchEvent(new Event(element.tagName === 'SELECT' || element.type === 'date' || element.type === 'time' ? 'change':'input',{bubbles:true}));
  });
}
async function submit(label: string) { await act(async()=>{button(label).closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}); }

it('retains the exact unknown command/key across navigation and retries without using changed input',async()=>{
  const {client,tasks}=fixture();
  client.contacts.create=vi.fn().mockRejectedValueOnce(Object.assign(new Error('Verbinding verbroken'),{code:'UNAVAILABLE'})).mockResolvedValue(person);
  await act(async()=>root.render(<Planner taskClient={tasks} bookingClient={client}/>));
  await click(button('Relaties'));
  const name=document.querySelector('input[maxlength="160"]') as HTMLInputElement;
  await change(name,'Nieuwe demo'); await submit('Relatie opslaan');
  expect(name.closest('fieldset')!.disabled).toBe(true);
  await click(button('Taken')); await click(button('Relaties'));
  await click(button('Dezelfde handeling opnieuw proberen'));
  expect(client.contacts.create).toHaveBeenCalledTimes(2);
  expect(vi.mocked(client.contacts.create).mock.calls[1]).toEqual(vi.mocked(client.contacts.create).mock.calls[0]);
  expect(document.querySelector('[role="alert"]')).toBeNull();
});

it('moves to another date with the original appointment version and a separate internal arrival',async()=>{
  const {client}=fixture(), current=slot();
  const appointment: Appointment={id:'visit',workspaceId:'local',zoneId:'standard',zoneName:'Standaardgebied',contactId:person.id,slotId:current.slot.id,status:'planned',source:'manual',version:4,window:current.slot,arrivalAt:null,createdAt:'',updatedAt:''};
  client.appointments.list=vi.fn(async()=>[appointment]);
  client.appointments.move=vi.fn(async()=>appointment);
  await act(async()=>root.render(<Bookings client={client} section="appointments"/>));
  await click(button('Verplaatsen'));
  const date='2026-11-21';
  await change(document.querySelector('input[type="date"]')!,date);
  await change(document.querySelector('section[aria-label="Afspraak plannen"] select')!,'slot-'+date);
  await change(document.querySelector('input[type="time"]')!,'09:15');
  await submit('Verplaatsing opslaan');
  expect(client.appointments.move).toHaveBeenCalledWith('visit',{version:4,slotId:'slot-'+date,arrivalAt:'2026-11-21T08:15:00Z'},expect.any(String));
  expect(client.appointments.create).not.toHaveBeenCalled();
});

it.each(['success','failure'])('refreshes the current appointment context after a late contact mutation (%s)',async outcome=>{
  const {client}=fixture();
  let people: Contact[]=[{...person,id:'alice',name:'Alice'},{...person,id:'bob',name:'Bob'}];
  client.contacts.list=vi.fn(async query=>people.filter(p=>(query?.archived||!p.archived)&&(!query?.q||p.name.includes(query.q))));
  client.contacts.card=vi.fn(async id=>({contact:people.find(p=>p.id===id)!,upcoming:[],history:[],events:[]}));
  let resolve!: (value:Contact)=>void, reject!: (reason:Error)=>void;
  client.contacts.update=vi.fn(()=>new Promise<Contact>((done,fail)=>{resolve=done;reject=fail;}));
  await act(async()=>root.render(<Bookings client={client} section="contacts"/>));
  await change(document.querySelector('input')!,'Alice');
  await click(button('Alice')); await click(button('Relatie archiveren'));
  await act(async()=>root.render(<Bookings client={client} section="appointments"/>));
  expect(document.querySelector('section[aria-label="Afspraak plannen"] select')!.textContent).toContain('Bob');
  await act(async()=>{
    if(outcome==='success') {people=people.map(p=>p.id==='alice'?{...p,archived:true,version:2}:p);resolve(people[0]);}
    else reject(Object.assign(new Error('Definitieve fout'),{code:'INTERNAL_ERROR'}));
  });
  expect(document.querySelector('section[aria-label="Afspraak plannen"] select')!.textContent).toContain('Bob');
  if(outcome==='success') expect(document.querySelector('section[aria-label="Afspraak plannen"] select')!.textContent).not.toContain('Alice');
});

it('moves across zones with the original version and clears the old zone selection',async()=>{
  const {client}=fixture(),current=slot();
  const appointment: Appointment={id:'visit',workspaceId:'local',zoneId:'standard',zoneName:'Standaardgebied',contactId:person.id,slotId:current.slot.id,status:'planned',source:'manual',version:4,window:current.slot,arrivalAt:null,createdAt:'',updatedAt:''};
  client.zones.list=vi.fn(async()=>[{id:'standard',workspaceId:'local',name:'Standaardgebied',defaultCapacity:1,version:1},{id:'north',workspaceId:'local',name:'Noord (fictief)',defaultCapacity:2,version:1}]);
  client.availability=vi.fn(async(date,zoneId)=>[{...slot(date),slot:{...slot(date).slot,id:zoneId==='north'?'north-slot':current.slot.id,zoneId:zoneId??'standard'}}]);
  client.appointments.list=vi.fn(async(_date,zoneId)=>zoneId==='standard'?[appointment]:[]);
  client.appointments.move=vi.fn(async()=>appointment);
  await act(async()=>root.render(<Bookings client={client} section="appointments"/>));
  await click(button('Verplaatsen'));
  await change(document.querySelector('main > label select')!,'north');
  expect((document.querySelector('section[aria-label="Afspraak plannen"] select') as HTMLSelectElement).value).toBe('');
  expect(document.querySelector('section[aria-label="Afspraak plannen"]')!.textContent).toContain('Standaardgebied');
  await change(document.querySelector('section[aria-label="Afspraak plannen"] select')!,'north-slot');
  await submit('Verplaatsing opslaan');
  expect(client.appointments.move).toHaveBeenCalledWith('visit',{version:4,slotId:'north-slot',arrivalAt:null},expect.any(String));
  expect(client.availability).toHaveBeenLastCalledWith(today(),'north');
});

it('shows a capacity conflict and submits the current slot version',async()=>{
  const {client}=fixture();
  client.slots.capacity=vi.fn().mockRejectedValue(Object.assign(new Error('De capaciteit kan niet lager worden dan de bezetting.'),{code:'CAPACITY_BELOW_OCCUPANCY'}));
  await act(async()=>root.render(<Bookings client={client} section="appointments"/>));
  await change(document.querySelector('article input[name="capacity"]')!,'0');
  await submit('Dagdeelcapaciteit opslaan');
  expect(client.slots.capacity).toHaveBeenCalledWith('slot-'+today(),{capacity:0,version:1},expect.any(String));
  expect(document.querySelector('[role="alert"]')!.textContent).toContain('lager worden dan de bezetting');
});
