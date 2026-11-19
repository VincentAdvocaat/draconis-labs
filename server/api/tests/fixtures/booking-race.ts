import { fork } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import type { BookingCommand, PlannerReply,PublicReservation,PublicReply,PublicConfirmation } from '@draconis/shared';
export type WriterCommand=BookingCommand|{type:'public.reserve';channelId:string;origin:string;input:PublicReservation};
type WriterReply=PlannerReply|PublicReply<PublicConfirmation>;

export async function race(path: string, binding: string, commands: WriterCommand[], gate: string) {
  const children = commands.map((command, index) => fork(new URL('./booking-writer.ts', import.meta.url), [path, binding, JSON.stringify(command), gate, ['first','second','third'][index]], { execArgv: ['--import','tsx'], stdio: ['ignore','ignore','pipe','ipc'], windowsHide: true }));
  let log = '';
  const closed = children.map(child => new Promise<void>(resolve => child.once('close', () => resolve())));
  const ready = children.map(child => new Promise<void>((resolve, reject) => {
    child.stderr?.on('data', data => { log += data; });
    child.on('message', message => { if ('ready' in (message as object)) resolve(); });
    child.once('error', reject); child.once('exit', exit => { if (exit) reject(new Error(log)); });
  }));
  const results = children.map(child => new Promise<WriterReply>((resolve, reject) => {
    child.on('message', message => { if ('ok' in (message as object)) resolve(message as WriterReply); });
    child.once('error', reject); child.once('exit', exit => { if (exit) reject(new Error(log)); });
  }));
  // Prevent unhandled rejections while waiting on the deterministic gate.
  const result = Promise.all(results); result.catch(() => undefined);
  async function marker(name: string) {
    const deadline = Date.now() + 10000;
    while (!existsSync(join(gate, name))) {
      if (Date.now() > deadline) throw new Error(`Missing gate ${name}: ${log}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  try {
    await Promise.all(ready); children[0].send('go'); await marker('first-entered');
    for (let index=1; index<children.length; index++) { children[index].send('go'); await marker(index===1?'attempt':'third-attempt'); }
    await new Promise(resolve => setTimeout(resolve, 100));
    for (const role of ['second','third'].slice(0,children.length-1)) expect(existsSync(join(gate, role+'-entered'))).toBe(false);
    writeFileSync(join(gate, 'release'), '1');
    const values = await result; await Promise.all(closed); return values;
  } finally { for (const child of children) if (child.exitCode === null) child.kill(); await Promise.all(closed); }
}
