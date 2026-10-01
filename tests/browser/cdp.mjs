import { writeFile } from 'node:fs/promises';
const pages = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT || 9224}/json/list`)).json();
const socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, {once:true}); socket.addEventListener('error', reject, {once:true}); });
let sequence = 0;
const waiting = new Map();
export const errors = [];
socket.addEventListener('message', ({data}) => {
  const msg = JSON.parse(data);
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
  if (msg.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
  const pending = waiting.get(msg.id);
  if (!pending) return;
  waiting.delete(msg.id);
  msg.error ? pending.reject(Error(msg.error.message)) : pending.resolve(msg.result);
});
export function send(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++sequence; waiting.set(id, {resolve,reject}); socket.send(JSON.stringify({id,method,params})); });
}
export async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
export async function until(expression) {
  for (let i = 0; i < 1200; i++) { try { if (await evaluate(expression)) return; } catch (error) { if (!/navigated|context|closed/i.test(error.message)) throw error; } await new Promise(r=>setTimeout(r,100)); }
  throw Error('Timed out: ' + expression);
}
export async function screenshot(path) {
  const {data} = await send('Page.captureScreenshot', {format:'png'});
  await writeFile(path, Buffer.from(data,'base64'));
}
export const close = () => socket.close();
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {width:1440, height:1000, deviceScaleFactor:1, mobile:false});
