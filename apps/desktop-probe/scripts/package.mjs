import { packager } from '@electron/packager';
import installer from 'electron-winstaller';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const paths = await packager({
  dir: 'dist/stage', out: 'dist/packages', name: 'DraconisPlannerProbe',
  electronVersion: require('electron/package.json').version,
  platform: 'win32', arch: 'x64', overwrite: true, asar: false,
});
if (process.argv.includes('--installer')) {
  const packageId = process.env.PLANNER_PROBE_INSTALLER_ID;
  if (packageId && !/^DraconisPlannerProbeAcceptance[A-Za-z0-9]+$/.test(packageId)) {
    throw new Error('An isolated installer ID must start with DraconisPlannerProbeAcceptance.');
  }
  await installer.createWindowsInstaller({
    appDirectory: paths[0],
    outputDirectory: resolve(process.env.PLANNER_PROBE_INSTALLER_DIR || 'dist/installer'),
    ...(packageId ? { name: packageId } : {}),
    authors: 'Draconis Labs', exe: 'DraconisPlannerProbe.exe',
    setupExe: 'DraconisPlannerProbe-Setup.exe', noMsi: true, noDelta: true,
  });
}
console.log(paths);

