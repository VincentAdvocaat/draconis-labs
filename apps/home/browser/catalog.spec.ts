import { once } from 'node:events';
import { createServer } from 'node:http';
import type { Server } from 'node:net';
import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { preview } from 'vite';
import { catalogPath } from '../src/catalog.js';

type CatalogFixture = { home: string; planner: string; cms: string; setCmsOnline: (online: boolean) => void };

function getOrigin(server: Server) {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a loopback port');
  return `http://127.0.0.1:${address.port}`;
}

const test = base.extend<object, { catalog: CatalogFixture }>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright reads fixture dependencies from this parameter.
  catalog: [async ({}, run) => {
    let cmsOnline = false;
    const planner = createServer((request, response) => {
      if (request.url === '/health') response.writeHead(204).end();
      else response.writeHead(200, { 'Content-Type': 'text/html' }).end('<h1>Planner-fixture</h1>');
    });
    const cms = createServer((_request, response) => {
      response.writeHead(cmsOnline ? 200 : 503, { 'Content-Type': 'text/html' }).end('<h1>CMS-fixture</h1>');
    });

    try {
      await Promise.all([planner, cms].map(async (server) => {
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
      }));
      const plannerOrigin = getOrigin(planner);
      const cmsOrigin = getOrigin(cms);
      process.env.DRACONIS_HOME_PERMISSIONS = 'cms.draft.read,cms.draft.write,cms.release.publish';
      process.env.DRACONIS_HOME_ORIGINS = JSON.stringify({
        planner: { launch: plannerOrigin, health: plannerOrigin },
        cms: { launch: cmsOrigin, health: cmsOrigin },
      });
      const server = await preview({ preview: { port: 0 } });
      try {
        await run({
          home: getOrigin(server.httpServer),
          planner: plannerOrigin,
          cms: cmsOrigin,
          setCmsOnline: (online) => { cmsOnline = online; },
        });
      } finally {
        await server.close();
      }
    } finally {
      await Promise.all([planner, cms].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    }
  }, { scope: 'worker' }],
});

const sizes = [
  { label: 'telefoon', width: 320, height: 740, isMobile: true },
  { label: 'tablet', width: 768, height: 1024, isMobile: true },
  { label: 'desktop', width: 1440, height: 900, isMobile: false },
];

for (const { label, width, height, isMobile } of sizes) {
  test.describe(label, () => {
    test.use({ viewport: { width, height }, isMobile, hasTouch: isMobile });

    test('toont en opent beide apps via bedienbare kaarten', async ({ page, catalog }) => {
      catalog.setCmsOnline(false);
      await page.goto(catalog.home);
      await expect(page.getByRole('status')).toHaveText('1 van 2 apps bereikbaar.');

      const launchLinks = page.getByRole('link', { name: /^Open/ });
      await expect(launchLinks).toHaveCount(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      for (const link of await launchLinks.all()) {
        const bounds = await link.boundingBox();
        expect(bounds?.width).toBeGreaterThanOrEqual(44);
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
      }
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([]);

      const refresh = page.getByRole('button', { name: 'Status vernieuwen' });
      await page.keyboard.press('Tab');
      await expect(refresh).toBeFocused();
      catalog.setCmsOnline(true);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('status')).toHaveText('2 van 2 apps bereikbaar.');
      await expect(refresh).toBeFocused();

      await page.keyboard.press('Tab');
      const cms = page.getByRole('link', { name: 'Open CMS-proef' });
      await expect(cms).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(catalog.cms + '/');
      await expect(page.getByRole('heading', { name: 'CMS-fixture' })).toBeVisible();

      await page.goBack();
      const planner = page.getByRole('link', { name: 'Open Planner' });
      if (isMobile) await planner.tap();
      else await planner.click();
      await expect(page).toHaveURL(catalog.planner + '/');
      await expect(page.getByRole('heading', { name: 'Planner-fixture' })).toBeVisible();
    });
  });
}

test('herstel na een tijdelijke catalogusfout', async ({ page, catalog }) => {
  catalog.setCmsOnline(true);
  const endpoint = '**' + catalogPath;
  await page.route(endpoint, (route) => route.fulfill({ status: 503, body: '' }));
  await page.goto(catalog.home);
  await expect(page.getByRole('status')).toHaveText('De appcatalogus is onbereikbaar. Probeer opnieuw.');
  await expect(page.getByRole('link', { name: /^Open/ })).toHaveCount(0);
  await page.unroute(endpoint);
  await page.getByRole('button', { name: 'Status vernieuwen' }).click();
  await expect(page.getByRole('status')).toHaveText('2 van 2 apps bereikbaar.');
});

test('meet het HTTP-budget bij beschikbare diensten', async ({ request, catalog }) => {
  catalog.setCmsOnline(true);
  const endpoint = catalog.home + catalogPath;
  await request.get(endpoint);
  const durations: number[] = [];
  for (let iteration = 0; iteration < 40; iteration++) {
    const start = performance.now();
    const response = await request.get(endpoint);
    expect(response.ok()).toBe(true);
    const { apps } = await response.json() as { apps: { status: string }[] };
    durations.push(performance.now() - start);
    expect(apps.map((app) => app.status)).toEqual(['reachable', 'reachable']);
  }

  durations.sort((first, second) => first - second);
  const percentile = (fraction: number) => durations[Math.ceil(durations.length * fraction) - 1];
  console.log(`Catalogus HTTP (ms), p50 ${percentile(.5).toFixed(1)}, p95 ${percentile(.95).toFixed(1)}, p99 ${percentile(.99).toFixed(1)}`);
  expect(percentile(.95)).toBeLessThanOrEqual(250);
});
