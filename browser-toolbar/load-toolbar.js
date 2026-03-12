const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Load test page
  const testPagePath = path.join(__dirname, 'test-page.html');
  await page.goto('file://' + testPagePath);

  // Inject the toolbar
  const injectScript = fs.readFileSync(path.join(__dirname, 'inject.js'), 'utf8');
  await page.evaluate(injectScript);

  console.log('Browser opened with AI UI Editor Bridge toolbar injected.');
  console.log('The floating UI should be visible in the top-right corner.');
})();
