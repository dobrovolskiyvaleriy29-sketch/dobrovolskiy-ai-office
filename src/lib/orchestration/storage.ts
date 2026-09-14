import { isTauri, invoke } from '@tauri-apps/api/core';
import { decodeQueue, emptyQueue, type QueueData } from './engine';
const KEY = 'dobrovolskiy-ai-office.queue.v1';
export async function loadQueue(): Promise<QueueData> {
  const raw = isTauri() ? await invoke<string | null>('load_content_queue') : localStorage.getItem(KEY);
  return raw === null ? emptyQueue() : decodeQueue(raw);
}
export async function saveQueue(data: QueueData): Promise<void> {
  const raw = JSON.stringify(data, null, 2);
  if (isTauri()) await invoke('save_content_queue', { data: raw });
  else localStorage.setItem(KEY, raw);
}
