import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir, release, arch, cpus } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const outputDir = resolve(process.env.PLANNER_PROBE_RESULTS || `dist/results/run-${Date.now()}`);
mkdirSync(outputDir, { recursive: true });
assert.equal(readdirSync(outputDir).length, 0, 'Choose an empty result directory to preserve earlier evidence');
const profile = process.env.PLANNER_PROBE_PROFILE || mkdtempSync(join(tmpdir(), 'draconis-desktop-probe-'));
const exe = resolve('dist/packages/DraconisPlannerProbe-win32-x64/DraconisPlannerProbe.exe');
function run(file, args, env, input) {
  return new Promise((done, fail) => {
    const started = performance.now();
    const startedEpochMs = Date.now();
    const child = spawn(file, args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timeout = setTimeout(() => { child.kill(); fail(new Error('Probe timed out')); }, 25_000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timeout); fail(error); });
    child.on('exit', code => {
      clearTimeout(timeout);
      if (code !== 0) fail(new Error(`Probe exit ${code}: ${stderr}`));
      else done({ startedEpochMs, elapsedMs: performance.now() - started, stdout, stderr });
    });
    child.stdin.end(input);
  });
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const runs = [];
let previous = process.env.PLANNER_PROBE_PREVIOUS
  ? JSON.parse(readFileSync(process.env.PLANNER_PROBE_PREVIOUS, 'utf8')).read : undefined;
for (let index = 0; index < 5; index++) {
  const output = join(outputDir, `launch-${index + 1}.json`);
  const processResult = await run(exe, [], { ...env, PLANNER_PROBE_PROFILE: profile, PLANNER_PROBE_OUTPUT: output });
  const result = JSON.parse(readFileSync(output, 'utf8'));
  assert(result.rejected, 'main process must reject invalid payload');
  assert(result.tokenRoundTrip, 'Windows safeStorage must round-trip a synthetic token');
  assert.deepEqual(result.read, [...result.before, result.task]);
  if (previous) assert.deepEqual(result.before, previous, 'SQLite records must survive process restart');
  previous = result.read;
  runs.push({ ...result, spawnToReadyMs: result.readyEpochMs - processResult.startedEpochMs, elapsedMs: processResult.elapsedMs, invalidInputLogged: processResult.stderr.includes('ZodError') });
}
// Rehearse the Node sidecar's write, rejection and EOF lifecycle independently of Tauri.
const sidecarDb = join(profile, 'node-sidecar.sqlite');
const first = await run(process.execPath, ['dist/sidecar.cjs', sidecarDb], env,
  '{"type":"create","input":{"title":"Fictieve sidecartaak"}}\n{"type":"create","input":{"title":""}}\n{"type":"list"}\n');
const messages = first.stdout.trim().split('\n').map(line => JSON.parse(line));
assert.equal(messages[1].error, 'INVALID_COMMAND');
assert.equal(messages[2].tasks.at(-1).title, 'Fictieve sidecartaak');
const second = await run(process.execPath, ['dist/sidecar.cjs', sidecarDb], env, '{"type":"list"}\n');
assert.deepEqual(JSON.parse(second.stdout).tasks, messages[2].tasks);
function bytes(path) {
  return readdirSync(path).reduce((total, entry) => {
    const target = join(path, entry), stat = statSync(target);
    return total + (stat.isDirectory() ? bytes(target) : stat.size);
  }, 0);
}
const report = {
  measuredAt: new Date().toISOString(), os: `Windows ${release()} ${arch()}`,
  cpu: cpus()[0].model, hostNode: process.version, hostAbi: process.versions.modules,
  machine: 'Existing developer workstation, no clean VM; process-cold starts, OS cache not cleared',
  packageBytes: bytes(resolve('dist/packages/DraconisPlannerProbe-win32-x64')),
  runs: runs.map(({ profile: _profile, before, task, read, ...result }) => ({
    ...result, beforeCount: before.length, afterCount: read.length, createdId: task.id,
  })),
  sidecar: { runtime: process.version, abi: process.versions.modules, firstMs: first.elapsedMs,
    secondMs: second.elapsedMs, recordsPreserved: true, invalidCommandRejected: true, eofExits: true,
    tauriShell: 'Not built: rustc/cargo unavailable. This is a Node protocol rehearsal only.' },
};
writeFileSync(join(outputDir, 'summary.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`Disposable profile retained at ${profile}`);
