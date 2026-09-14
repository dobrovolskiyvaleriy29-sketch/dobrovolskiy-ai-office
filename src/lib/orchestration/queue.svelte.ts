import { advanceQueue, createTask, emptyQueue, roleAgents, type QueueData } from './engine';
import { loadQueue, saveQueue } from './storage';
import { publishRoles } from './bridge';
let data = $state<QueueData>(emptyQueue());
let ready = $state(false);
let running = $state(false);
let error = $state('');
let timer: ReturnType<typeof setTimeout> | undefined;
let chain = Promise.resolve();
let disposed = false;

export const queue = {
  get data() { return data; }, get ready() { return ready; },
  get running() { return running; }, get error() { return error; },
};
function publish(next: QueueData) { data = next; publishRoles(roleAgents(next)); }
function stop() { running = false; clearTimeout(timer); }
function serialize(action: () => Promise<void>): Promise<void> {
  chain = chain.then(action).catch(e => { error = String(e); stop(); });
  return chain;
}
async function commit(next: QueueData) { await saveQueue(next); publish(next); }
function schedule() {
  if (!running || disposed) return;
  timer = setTimeout(() => { void serialize(async () => {
    if (!running || disposed) return;
    await commit(advanceQueue($state.snapshot(data)));
    if (data.tasks.every(t => t.status === 'complete')) stop();
    else schedule();
  }); }, 1500);
}
export async function initQueue() {
  disposed = false;
  await serialize(async () => {
    publish(await loadQueue()); ready = true; error = '';
  });
}
export function addTask(title: string) {
  return serialize(async () => {
    if (!ready || disposed) return;
    const next = $state.snapshot(data);
    next.tasks.push(createTask(title, crypto.randomUUID(), new Date().toISOString()));
    await commit(next); error = '';
  });
}
export function startQueue() {
  return serialize(async () => {
    if (!ready || running || disposed || data.tasks.every(t => t.status === 'complete')) return;
    error = ''; running = true; schedule();
  });
}
export function pauseQueue() { stop(); }
export function destroyQueue() { disposed = true; stop(); }
