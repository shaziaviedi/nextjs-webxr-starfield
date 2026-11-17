// Node 22+; no test dependencies. Uses a dedicated temporary tab in a debugging-enabled Chrome.
// Start StarField and an isolated Chrome profile, then:
// node scripts/audit-pointer-lock.mjs http://localhost:3037 http://127.0.0.1:9229
const appUrl = process.argv[2] ?? 'http://localhost:3037';
const debugUrl = process.argv[3] ?? 'http://127.0.0.1:9229';
const version = await (await fetch(`${debugUrl}/json/version`)).json();
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let sequence = 0;
let sessionId;
let targetId;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timeout);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});
const send = (method, params = {}, session = sessionId) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
  pending.set(id, { resolve, reject, timeout });
  socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }));
});
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mode = async (label) => {
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent === ${JSON.stringify(label)}).click(); true`);
  await pause(150);
};
const restore = () => evaluate(`
  delete document.pointerLockElement;
  delete document.exitPointerLock;
  delete document.querySelector('canvas').requestPointerLock;
  true
`);
try {
  ({ targetId } = await send('Target.createTarget', { url: 'about:blank' }, null));
  ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }, null));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: appUrl });
  await send('Page.bringToFront');
  let loaded = false;
  for (let i = 0; i < 100; i++) {
    await pause(100);
    loaded = await evaluate(`!!document.querySelector('canvas') && [...document.querySelectorAll('button')].some(button => button.textContent === 'First person')`);
    if (loaded) break;
  }
  if (!loaded) throw new Error('StarField did not load');
  await pause(500);
  const results = [];
  for (const cancellation of ['blur', 'escape', 'mode']) {
    await mode('First person');
    // Deliberately delay the browser API's Promise to reproduce a cancellation/grant race.
    await evaluate(`
      document.querySelector('canvas').requestPointerLock = () => new Promise(resolve => { window.__resolveAuditLock = resolve; });
      document.querySelector('canvas').click(); true
    `);
    if (cancellation === 'blur') await evaluate(`window.dispatchEvent(new Event('blur')); true`);
    else if (cancellation === 'escape') {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
    } else await mode('Overview');
    try {
      await evaluate(`
        window.__auditLock = document.querySelector('canvas');
        window.__auditExits = 0;
        Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => window.__auditLock });
        document.exitPointerLock = () => { window.__auditExits++; window.__auditLock = null; };
        window.__resolveAuditLock(); true
      `);
      await pause(100);
      const exits = await evaluate('window.__auditExits');
      results.push({ cancellation, passed: exits === 1, exits });
    } finally {
      await restore();
      await mode('Overview');
    }
  }
  for (const result of results) console.log(`${result.passed ? 'PASS' : 'FAIL'}: delayed pointer lock after ${result.cancellation} (${result.exits} releases)`);
  if (results.some((result) => !result.passed)) throw new Error('Cancelled input must not be reactivated by a late pointer-lock grant');
} finally {
  if (targetId) await send('Target.closeTarget', { targetId }, null);
  socket.close();
}
