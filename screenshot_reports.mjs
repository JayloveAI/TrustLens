import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WATERMARK = '@JenWhit33102969';
const OUTPUT_DIR = path.join(__dirname, 'screenshots');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const REPORTS = [
  'report_crowdstrike.html',
  'report_cursor.html',
  'report_fortinet_fortigate.html',
  'report_github_copilot_enterprise.html',
  'report_microsoft_entra_id.html',
  'report_okta_workforce_identity.html',
  'report_sentinelone.html',
  'report_summary.html',
  'report_traditional_security.html',
  'report_windsurf__codeium_.html',
  'report_zscaler_internet_access.html',
];

async function addWatermark(page) {
  await page.evaluate((text) => {
    // Create watermark overlay at the very top of the page
    const overlay = document.createElement('div');
    overlay.id = 'trustlens-watermark';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;'
      + 'background:linear-gradient(135deg,rgba(79,127,255,.95),rgba(124,58,237,.95));'
      + 'color:#fff;font-size:14px;font-weight:700;letter-spacing:1px;'
      + 'padding:8px 24px;text-align:center;'
      + 'font-family:Inter,system-ui,sans-serif;'
      + 'box-shadow:0 2px 16px rgba(0,0,0,.4);';
    overlay.textContent = text;
    document.body.prepend(overlay);

    // Push page content down to avoid overlap
    const spacer = document.createElement('div');
    spacer.style.cssText = 'height:44px;';
    document.body.prepend(spacer);

    // Also add a diagonal repeating watermark across the page
    const diagWrap = document.createElement('div');
    diagWrap.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;'
      + 'z-index:99998;pointer-events:none;overflow:hidden;';
    for (let i = 0; i < 20; i++) {
      const line = document.createElement('div');
      line.style.cssText = 'position:absolute;white-space:nowrap;'
        + 'color:rgba(255,255,255,.06);font-size:18px;font-weight:700;letter-spacing:2px;'
        + 'transform:rotate(-30deg);'
        + 'top:' + (i * 150 - 200) + 'px;left:-100px;';
      line.textContent = text + '    ' + text + '    ' + text + '    ' + text;
      diagWrap.appendChild(line);
    }
    document.body.appendChild(diagWrap);
  }, WATERMARK);
}

async function screenshotReport(browser, filename) {
  const filePath = path.join(__dirname, filename);
  if (!fs.existsSync(filePath)) {
    console.log('SKIP', filename);
    return;
  }

  const page = await browser.newPage();

  // Set viewport to full HD width
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });

  // Load the HTML file
  await page.goto('file:///' + filePath.replace(/\\/g, '/'), {
    waitUntil: 'networkidle0',
    timeout: 30000
  });

  // Add watermark
  await addWatermark(page);

  // Wait for fonts and styles to settle
  await new Promise(r => setTimeout(r, 1000));

  // Get full page height
  const bodyHeight = await page.evaluate(() => document.body.scrollHeight);

  // Generate output filename
  const baseName = filename.replace('.html', '');
  const outputPath = path.join(OUTPUT_DIR, baseName + '.png');

  // Take full-page screenshot
  await page.screenshot({
    path: outputPath,
    fullPage: true,
    type: 'png'
  });

  await page.close();

  const sizeKB = Math.round(fs.statSync(outputPath).size / 1024);
  console.log('📸', filename, '→', baseName + '.png', '(' + sizeKB + 'KB, height: ' + bodyHeight + 'px)');
}

async function main() {
  console.log('🚀 Launching Puppeteer...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  console.log('📸 Taking screenshots of', REPORTS.length, 'reports...\n');

  for (const report of REPORTS) {
    try {
      await screenshotReport(browser, report);
    } catch (e) {
      console.error('❌ Error:', report, e.message);
    }
  }

  await browser.close();
  console.log('\n✅ All screenshots saved to:', OUTPUT_DIR);
}

main().catch(console.error);
