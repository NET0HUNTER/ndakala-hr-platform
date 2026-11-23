import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve('docs/zoho_people_spec/screenshots/leave');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function getPageWsUrl() {
  const res = await fetch('http://127.0.0.1:9222/json');
  const pages = await res.json();
  const page = pages.find(p => p.type === 'page' && p.url.includes('ndakalahr.duckdns.org')) || pages.find(p => p.type === 'page');
  if (!page) throw new Error('No target page found in Chrome');
  return page.webSocketDebuggerUrl;
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      };
    });
  }

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const buffer = Buffer.from(res.data, 'base64');
    fs.writeFileSync(filePath, buffer);
    console.log(`Saved screenshot: ${filePath} (${buffer.length} bytes)`);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const wsUrl = await getPageWsUrl();
  console.log('Connecting to Chrome CDP at:', wsUrl);
  const client = new CDPClient(wsUrl);
  await client.connect();

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  console.log('Ensuring we are on Leave Tracker...');
  const currentTitle = await client.eval('document.title');
  console.log('Page Title:', currentTitle);

  // Check if Leave Tracker view is open or click Leave Tracker button
  await client.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const leaveBtn = btns.find(b => b.innerText.includes('Leave Tracker') || b.getAttribute('title')?.includes('Leave Tracker'));
    if (leaveBtn) leaveBtn.click();
  })()`);
  await sleep(1500);

  // 1. Capture 01_leave_tracker_listview.png
  console.log('1. Capturing Leave Tracker List View...');
  await client.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const listBtn = btns.find(b => b.innerText.includes('List view') || b.getAttribute('title')?.includes('List view'));
    if (listBtn) listBtn.click();
  })()`);
  await sleep(1000);
  await client.screenshot(path.join(SCREENSHOT_DIR, '01_leave_tracker_listview.png'));

  // 2. Switch to Calendar View and capture 02_leave_tracker_calendar_view.png
  console.log('2. Switching to Calendar View...');
  await client.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const calBtn = btns.find(b => b.innerText.includes('Calendar view') || b.getAttribute('title')?.includes('Calendar view') || b.innerHTML.includes('Calendar') || b.innerHTML.includes('lucide-calendar'));
    if (calBtn) calBtn.click();
  })()`);
  await sleep(1200);
  await client.screenshot(path.join(SCREENSHOT_DIR, '02_leave_tracker_calendar_view.png'));

  // 3. Open Apply Leave Modal and capture 03_leave_apply_modal.png
  console.log('3. Opening Apply Leave Modal...');
  await client.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const applyBtn = btns.find(b => b.innerText.includes('Apply Leave'));
    if (applyBtn) applyBtn.click();
  })()`);
  await sleep(1200);
  await client.screenshot(path.join(SCREENSHOT_DIR, '03_leave_apply_modal.png'));

  // Inspect Modal Fields
  const modalFields = await client.eval(`(() => {
    const modal = document.querySelector('[role="dialog"], .modal, div[class*="fixed"]');
    if (!modal) return { open: false };
    const selects = Array.from(modal.querySelectorAll('select')).map(s => s.name || s.id || 'select');
    const inputs = Array.from(modal.querySelectorAll('input')).map(i => ({ type: i.type, name: i.name || i.id }));
    const textareas = Array.from(modal.querySelectorAll('textarea')).map(t => t.placeholder || t.name);
    return {
      open: true,
      selects,
      inputs,
      textareas,
      textSnippet: modal.innerText.slice(0, 500)
    };
  })()`);
  console.log('Modal fields detected:', JSON.stringify(modalFields, null, 2));

  // Close Modal
  console.log('Closing Apply Leave Modal...');
  await client.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const cancelBtn = btns.find(b => b.innerText.trim() === 'Cancel' || b.innerText.trim() === 'Close');
    if (cancelBtn) cancelBtn.click();
    else {
      const closeX = document.querySelector('[aria-label="Close"], button.close');
      if (closeX) closeX.click();
    }
  })()`);
  await sleep(1000);

  // 4. Click Shift & Schedules sub-tab and capture 04_leave_shifts_schedules.png
  console.log('4. Navigating to Shift & Schedules...');
  await client.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const shiftTab = btns.find(b => b.innerText.includes('Shift & Schedules') || b.innerText.includes('Shift'));
    if (shiftTab) shiftTab.click();
  })()`);
  await sleep(1200);
  await client.screenshot(path.join(SCREENSHOT_DIR, '04_leave_shifts_schedules.png'));

  // 5. Click Team Leave Requests sub-tab and capture 05_leave_team_queue.png
  console.log('5. Navigating to Team Leave Requests / Team space...');
  await client.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const teamTab = btns.find(b => b.innerText.includes('Team Leave Requests') || b.innerText.includes('Team'));
    if (teamTab) teamTab.click();
  })()`);
  await sleep(1200);
  await client.screenshot(path.join(SCREENSHOT_DIR, '05_leave_team_queue.png'));

  client.close();
  console.log('CDP Leave Tracker verification completed successfully!');
}

run().catch(err => {
  console.error('CDP verification error:', err);
  process.exit(1);
});
