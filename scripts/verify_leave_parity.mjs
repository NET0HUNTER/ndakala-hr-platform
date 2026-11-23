import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve('docs/zoho_people_spec/screenshots/leave');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function run() {
  console.log('Starting puppeteer-core with:', CHROME_PATH);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors',
      '--window-size=1440,900',
    ],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(err.toString());
  });

  try {
    console.log('Navigating to https://ndakalahr.duckdns.org...');
    await page.goto('https://ndakalahr.duckdns.org', { waitUntil: 'networkidle0', timeout: 30000 });

    // Check if on login page
    const emailInput = await page.$('input[type="email"], input[name="email"], #email');
    if (emailInput) {
      console.log('Logging in as managing.partner@ndakalaadvisory.co.ke...');
      await emailInput.type('managing.partner@ndakalaadvisory.co.ke');
      const passInput = await page.$('input[type="password"], input[name="password"], #password');
      await passInput.type('Ndakala@Secure2026!');
      const submitBtn = await page.$('button[type="submit"]');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {}),
        submitBtn.click(),
      ]);
      await page.waitForTimeout(2000);
    }

    console.log('Current URL after login:', page.url());

    // Navigate to Leave Tracker
    console.log('Clicking Leave Tracker in sidebar...');
    const leaveNav = await page.waitForSelector('button[title*="Leave"], button[data-tab="inbox"], nav button:has-text("Leave")', { timeout: 10000 }).catch(async () => {
      // Find button with text containing Leave
      const btns = await page.$$('button');
      for (const btn of btns) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text && text.includes('Leave')) return btn;
      }
      return null;
    });

    if (leaveNav) {
      await leaveNav.click();
      await page.waitForTimeout(1500);
    } else {
      console.log('Finding leave button via evaluation...');
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const leaveBtn = buttons.find(b => b.innerText.includes('Leave') || b.getAttribute('title')?.includes('Leave'));
        if (leaveBtn) leaveBtn.click();
      });
      await page.waitForTimeout(1500);
    }

    // Step 1: Verify Leave Summary List View
    console.log('Capturing Leave Summary List View...');
    await page.waitForSelector('text=Leave Summary', { timeout: 10000 }).catch(() => {});
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_leave_tracker_listview.png'), fullPage: false });
    console.log('Saved 01_leave_tracker_listview.png');

    // Step 2: Switch to Calendar View
    console.log('Switching to Calendar View...');
    const calToggle = await page.evaluate(() => {
      // Look for calendar icon button next to list icon
      const svgs = Array.from(document.querySelectorAll('button svg, button'));
      const calBtn = Array.from(document.querySelectorAll('button')).find(b => 
        b.getAttribute('title')?.toLowerCase().includes('calendar') || 
        b.innerHTML.includes('lucide-calendar') ||
        b.innerHTML.includes('Calendar')
      );
      if (calBtn) {
        calBtn.click();
        return true;
      }
      return false;
    });
    console.log('Calendar toggle clicked:', calToggle);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_leave_tracker_calendar_view.png'), fullPage: false });
    console.log('Saved 02_leave_tracker_calendar_view.png');

    // Step 3: Open Apply Leave Modal
    console.log('Opening Apply Leave Modal...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const applyBtn = btns.find(b => b.innerText.includes('Apply Leave'));
      if (applyBtn) applyBtn.click();
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_leave_apply_modal.png'), fullPage: false });
    console.log('Saved 03_leave_apply_modal.png');

    // Close modal
    console.log('Closing Apply Leave Modal...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cancelBtn = btns.find(b => b.innerText.trim() === 'Cancel' || b.innerText.trim() === 'Close');
      if (cancelBtn) cancelBtn.click();
      else {
        const closeX = document.querySelector('[aria-label="Close"], button.close, svg.lucide-x');
        if (closeX) closeX.closest('button')?.click();
      }
    });
    await page.waitForTimeout(1000);

    // Step 4: Click Shift & Schedules
    console.log('Clicking Shift & Schedules sub-tab...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const shiftTab = btns.find(b => b.innerText.includes('Shift & Schedules') || b.innerText.includes('Shift'));
      if (shiftTab) shiftTab.click();
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_leave_shifts_schedules.png'), fullPage: false });
    console.log('Saved 04_leave_shifts_schedules.png');

    // Step 5: Click Team Leave Requests
    console.log('Clicking Team Leave Requests sub-tab...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const teamTab = btns.find(b => b.innerText.includes('Team Leave Requests') || b.innerText.includes('Leave Requests'));
      if (teamTab) teamTab.click();
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_leave_team_queue.png'), fullPage: false });
    console.log('Saved 05_leave_team_queue.png');

    console.log('All screenshots captured successfully!');
    console.log('Console Errors encountered:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.warn('Errors:', consoleErrors);
    }
  } catch (err) {
    console.error('Execution error:', err);
  } finally {
    await browser.close();
  }
}

run();
