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
  await installer.createWindowsInstaller({
    appDirectory: paths[0], outputDirectory: resolve('dist/installer'),
    authors: 'Draconis Labs', exe: 'DraconisPlannerProbe.exe',
    setupExe: 'DraconisPlannerProbe-Setup.exe', noMsi: true, noDelta: true,
  });
}
console.log(paths);

