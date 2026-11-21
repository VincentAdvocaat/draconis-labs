import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, release } from 'node:os';
import { resolve, join } from 'node:path';
import Database from 'better-sqlite3';

assert(process.platform === 'win32' && arch() === 'x64', 'Use Windows x64.');
assert(process.env.LOCALAPPDATA, 'LOCALAPPDATA is required.');
const results = resolve('dist/installer-acceptance');
mkdirSync(results, { recursive: true });
const output = mkdtempSync(join(results, 'run-'));
const packageId = 'DraconisPlannerProbeAcceptance' + randomUUID().replaceAll('-', '');
const install = join(process.env.LOCALAPPDATA, packageId);
const profile = join(output, 'profile');
const database = join(profile, 'probe.sqlite');
const updater = join(install, 'Update.exe');
const versions = ['0.21.0', '0.22.0'];
const exe = version => join(install, `app-${version}`, 'DraconisPlannerProbe.exe');
const env = { ...process.env, PLANNER_PROBE_PROFILE: profile, PLANNER_PROBE_INSTALLER_ID: packageId };
delete env.PLANNER_PROBE_OUTPUT;
delete env.ELECTRON_RUN_AS_NODE;
console.log(`Acceptance evidence: ${output}`);

function run(file, args, environment, log, timeout) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(file, args, { env: environment, windowsHide: true });
    let details = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out. See ${log}`));
    }, timeout);
    child.stdout.on('data', chunk => { details += chunk; });
    child.stderr.on('data', chunk => { details += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      writeFileSync(log, details);
      if (code !== 0) reject(new Error(`Exit ${code}. See ${log}`));
      else resolveRun();
    });
  });
}

const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');

async function installVersion(version) {
  const installerDir = join(output, version);
  const buildEnv = { ...env, PLANNER_PROBE_VERSION: version, PLANNER_PROBE_INSTALLER_DIR: installerDir };
  await run(process.execPath, ['scripts/build.mjs'], buildEnv, join(output, `build-${version}.log`), 120_000);
  await run(process.execPath, ['scripts/package.mjs', '--installer'], buildEnv, join(output, `package-${version}.log`), 300_000);
  const setup = join(installerDir, 'DraconisPlannerProbe-Setup.exe');
  const powershell = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const signatureLog = join(output, `authenticode-${version}.log`);
  const signedPath = setup.replaceAll("'", "''");
  const signatureEnv = { ...env };
  delete signatureEnv.PSModulePath;
  await run(powershell, ['-NoProfile', '-NonInteractive', '-Command',
    `(Get-AuthenticodeSignature -LiteralPath '${signedPath}').Status`], signatureEnv, signatureLog, 60_000);
  await run(setup, ['--silent'], env, join(output, `install-${version}.log`), 120_000);
  assert(existsSync(exe(version)), `Version ${version} did not install at ${exe(version)}`);
  return { version, sha256: sha256(setup), signature: readFileSync(signatureLog, 'utf8').trim() };
}

async function launch(version, label, userProfile = profile) {
  const result = join(output, `${label}.json`);
  await run(exe(version), [], { ...env, PLANNER_PROBE_PROFILE: userProfile, PLANNER_PROBE_OUTPUT: result },
    join(output, `${label}.log`), 60_000);
  const report = JSON.parse(readFileSync(result, 'utf8'));
  assert.equal(report.version, version);
  assert.equal(report.profile, userProfile);
  assert(report.conflictRejected && report.preferencesRoundTrip);
  assert(report.booking.uiContactCreated && report.booking.uiAppointmentCreated && report.booking.idempotent);
  assert.equal(report.booking.stale, 'VERSION_CONFLICT');
  assert(report.booking.moved.arrivalAt);
  assert.equal(report.booking.zoneProof.sourceCapacity, 2);
  return report;
}

function assertPreserved(previous, next) {
  assert.deepEqual(next.before, previous.read, 'Task fields, recurrence, order and versions must survive.');
  assert.deepEqual(next.booking.before, previous.booking.after, 'Contact cards, appointment windows and events must survive.');
}

function inspect(path) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    const migrations = db.prepare('SELECT version FROM planner_schema_migrations ORDER BY version').all();
    const counts = Object.fromEntries([
      'tasks', 'user_preferences', 'planner_contacts', 'planner_appointments', 'planner_appointment_events',
      'planner_slots', 'planner_command_receipts',
    ].map(table => [table, db.prepare(`SELECT count(*) AS total FROM ${table}`).get().total]));
    return { migrations, counts };
  } finally {
    db.close();
  }
}

assert(!existsSync(install), 'The generated installer ID must have no existing installation.');
try {
  const a = await installVersion(versions[0]);
  const first = await launch(a.version, 'first-install');
  const restarted = await launch(a.version, 'first-restart');
  assertPreserved(first, restarted);

  const restoreProfile = join(output, 'restored-profile');
  mkdirSync(restoreProfile);
  const backup = join(output, 'backup.sqlite');
  const source = new Database(database, { readonly: true, fileMustExist: true });
  try { await source.backup(backup); } finally { source.close(); }
  const before = inspect(backup);
  const backupHash = sha256(backup);
  assert.deepEqual(before, inspect(database));
  assert(before.counts.planner_command_receipts > 0);

  const b = await installVersion(versions[1]);
  assert.deepEqual(inspect(database), before, 'Setup must preserve the profile before first start.');
  const upgraded = await launch(b.version, 'upgrade');
  assertPreserved(restarted, upgraded);
  const secondRestart = await launch(b.version, 'upgrade-restart');
  assertPreserved(upgraded, secondRestart);
  copyFileSync(backup, join(restoreProfile, 'probe.sqlite'));
  const restored = await launch(b.version, 'restored-backup', restoreProfile);
  assertPreserved(restarted, restored);

  const beforeUninstall = sha256(database);
  await run(updater, ['--uninstall', '--silent'], env, join(output, 'uninstall.log'), 120_000);
  assert(!existsSync(exe(b.version)), 'Uninstall must remove the installed application binary.');
  assert.equal(sha256(database), beforeUninstall, 'Uninstall must preserve the isolated profile.');
  const evidence = {
    packageId, install, output, profile, windows: release(), arch: arch(),
    electron: upgraded.electron, node: upgraded.node, installers: [a, b],
    sqlite: before, backupHash, installPreserved: true, upgradePreserved: true, restoreVerified: true, uninstallPreserved: true,
  };
  writeFileSync(join(output, 'summary.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (existsSync(exe(versions[0])) || existsSync(exe(versions[1]))) {
    await run(updater, ['--uninstall', '--silent'], env, join(output, 'cleanup.log'), 120_000);
  }
}
