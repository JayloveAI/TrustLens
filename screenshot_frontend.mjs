import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  // Screenshot index.html (frontend landing page)
  const indexPath = path.join(__dirname, 'index.html');
  await page.goto('file:///' + indexPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));

  // Save full landing page screenshot
  await page.screenshot({
    path: path.join(__dirname, 'screenshots', 'frontend_landing.png'),
    fullPage: true,
    type: 'png'
  });
  console.log('✅ frontend_landing.png');

  // Also take a viewport-only shot for the README hero
  await page.screenshot({
    path: path.join(__dirname, 'screenshots', 'frontend_hero.png'),
    fullPage: false,
    type: 'png'
  });
  console.log('✅ frontend_hero.png');

  // Screenshot report_summary.html for comparison view
  const summaryPath = path.join(__dirname, 'report_summary.html');
  if (fs.existsSync(summaryPath)) {
    await page.goto('file:///' + summaryPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({
      path: path.join(__dirname, 'screenshots', 'frontend_summary.png'),
      fullPage: true,
      type: 'png'
    });
    console.log('✅ frontend_summary.png');
  }

  // Screenshot a detailed report (FortiGate - highest score)
  const reportPath = path.join(__dirname, 'report_fortinet_fortigate.html');
  if (fs.existsSync(reportPath)) {
    await page.goto('file:///' + reportPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({
      path: path.join(__dirname, 'screenshots', 'frontend_detail_report.png'),
      fullPage: true,
      type: 'png'
    });
    console.log('✅ frontend_detail_report.png');
  }

  await browser.close();
  console.log('\n✅ All frontend screenshots done!');
}

main().catch(console.error);
