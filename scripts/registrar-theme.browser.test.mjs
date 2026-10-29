// Run with the existing browser tooling: node scripts/registrar-theme.browser.test.mjs
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
  : { channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' }) });
const output = new URL('../.temp/registrar-theme/', import.meta.url);
await mkdir(output, { recursive: true });

function contrast(foreground, background) {
  const luminance = color => {
    const [r, g, b] = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

try {
  for (const root of ['../', '../review-assets/']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const source = new URL(root + 'staff/registrar-dashboard.html', import.meta.url);
    const html = await readFile(source, 'utf8');
    await page.route('**/*', route => route.abort());
    await page.setContent(await page.evaluate(source => {
      const document = new DOMParser().parseFromString(source, 'text/html');
      document.querySelectorAll('script, link').forEach(element => element.remove());
      return '<!doctype html>' + document.documentElement.outerHTML;
    }, html));
    for (const link of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/gi)) {
      await page.addStyleTag({ content: await readFile(new URL(link[1], source), 'utf8') });
    }
    await page.evaluate(() => document.documentElement.dataset.theme = 'light');
    const colors = await page.evaluate(() => ['.stat-card .head', '.stat-card .sub', '.quick-card > span:last-child', 'th', '.muted-note'].map(selector => ({
      selector, foreground: getComputedStyle(document.querySelector(selector)).color, background: getComputedStyle(document.body).backgroundColor
    })));
    for (const { selector, foreground, background } of colors) {
      assert(contrast(foreground, background) >= 4.5, `${root}${selector}: small text needs 4.5:1 contrast`);
    }
    await page.screenshot({ path: fileURLToPath(new URL(root === '../' ? 'dashboard.png' : 'demo-dashboard.png', output)), animations: 'disabled' });
    for (const view of ['messages', 'appointments']) {
      await page.evaluate(view => {
        document.querySelectorAll('section[id^="view-"]').forEach(section => section.classList.add('hidden'));
        document.getElementById('view-' + view).classList.remove('hidden');
      }, view);
      const panel = page.locator('#view-' + view + ' > .panel').first();
      assert(await panel.isVisible(), `${view}: reuse the registrar panel`);
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
        const style = await panel.evaluate(element => {
          const css = getComputedStyle(element);
          return { background: css.backgroundColor, padding: css.paddingTop };
        });
        assert.equal(style.background, theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(28, 22, 35)');
        assert.equal(style.padding, '20px');
      }
      await page.evaluate(() => document.documentElement.dataset.theme = 'light');
    }
    assert.equal(await page.locator('#apptDetailCard.panel').count(), 1, 'Appointment details reuse the registrar panel');
    await page.evaluate(() => {
      document.getElementById('view-appointments').classList.add('hidden');
      document.getElementById('view-messages').classList.remove('hidden');
    });
    const button = page.locator('#btnNewMessage');
    for (const hover of [false, true]) {
      if (hover) await button.hover();
      const colors = await button.evaluate(element => ({ foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
      assert(contrast(colors.foreground, colors.background) >= 4.5, `primary button${hover ? ' hover' : ''}: needs 4.5:1 contrast`);
    }
    if (root === '../') await page.screenshot({ path: fileURLToPath(new URL('messages.png', output)), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Messages must fit on mobile');
    if (root === '../') await page.screenshot({ path: fileURLToPath(new URL('messages-mobile.png', output)), animations: 'disabled' });
    await page.close();
  }
  console.log('Registrar themes: normal/demo light contrast, button hover, light/dark panels and mobile bounds passed.');
} finally {
  await browser.close();
}
