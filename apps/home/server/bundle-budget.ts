import { gzipSync } from 'node:zlib';
import type { Plugin } from 'vite';

const javascriptBudget = 65 * 1024;
const stylesheetBudget = 4 * 1024;

export function bundleBudget(): Plugin {
  return {
    name: 'draconis-home-bundle-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      let javascriptBytes = 0;
      let stylesheetBytes = 0;
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') javascriptBytes += gzipSync(output.code).length;
        else if (output.fileName.endsWith('.css')) stylesheetBytes += gzipSync(output.source).length;
      }
      const limits = [
        { label: 'JavaScript', bytes: javascriptBytes, ceiling: javascriptBudget },
        { label: 'CSS', bytes: stylesheetBytes, ceiling: stylesheetBudget },
      ];
      for (const { label, bytes, ceiling } of limits) {
        const summary = `${label} gzip: ${bytes} / ${ceiling} bytes`;
        if (bytes > ceiling) this.error(`Home bundle budget exceeded. ${summary}`);
        this.info(summary);
      }
    },
  };
}
