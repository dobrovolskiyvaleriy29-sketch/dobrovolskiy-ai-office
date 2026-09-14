import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyQueue } from '../engine';
const storage = vi.hoisted(() => ({ loadQueue: vi.fn(), saveQueue: vi.fn() }));
const provider = vi.hoisted(() => ({ openai: { available: false }, runOpenAiStage: vi.fn() }));
vi.mock('../storage', () => storage);
vi.mock('../openai.svelte', () => provider);

describe('durable queue runner', () => {
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers();
    storage.loadQueue.mockReset().mockResolvedValue(emptyQueue());
    storage.saveQueue.mockReset().mockResolvedValue(undefined);
    provider.openai.available = false;
    provider.runOpenAiStage.mockReset();
  });
  afterEach(() => vi.useRealTimers());
  it('does not double-start, pauses, and completes after resuming', async () => {
    const q = await import('../queue.svelte');
    await q.initQueue(); await q.addTask('Demo');
    await q.startQueue(); await q.startQueue();
    await vi.advanceTimersByTimeAsync(1500);
    expect(q.queue.data.tasks[0].phase).toBe('thinking');
    expect(storage.saveQueue).toHaveBeenCalledTimes(2);
    q.pauseQueue(); await vi.advanceTimersByTimeAsync(6000);
    expect(storage.saveQueue).toHaveBeenCalledTimes(2);
    await q.startQueue(); await vi.advanceTimersByTimeAsync(16500);
    expect(q.queue.data.tasks[0].status).toBe('complete');
    expect(q.queue.running).toBe(false);
    q.destroyQueue();
  });
  it('stops on persistence failure without publishing an unsaved transition', async () => {
    const q = await import('../queue.svelte');
    await q.initQueue(); await q.addTask('Demo');
    storage.saveQueue.mockRejectedValueOnce(new Error('Disk full'));
    await q.startQueue(); await vi.advanceTimersByTimeAsync(1500);
    expect(q.queue.data.tasks[0].status).toBe('queued');
    expect(q.queue.running).toBe(false);
    expect(q.queue.error).toContain('Disk full');
    await q.startQueue(); await vi.advanceTimersByTimeAsync(1500);
    expect(q.queue.data.tasks[0].status).toBe('running');
    q.destroyQueue();
  });
  it('never overwrites a file that could not be loaded', async () => {
    storage.loadQueue.mockRejectedValue(new Error('Corrupt queue'));
    const q = await import('../queue.svelte');
    await q.initQueue(); await q.addTask('Demo'); await q.startQueue();
    expect(q.queue.ready).toBe(false);
    expect(storage.saveQueue).not.toHaveBeenCalled();
    expect(q.queue.error).toContain('Corrupt queue');
    q.destroyQueue();
  });
  it('calls OpenAI only at responding and commits its result after it returns', async () => {
    provider.openai.available = true;
    provider.runOpenAiStage.mockResolvedValue({ result: 'Реальный ответ', model: 'gpt-5.2', inputTokens: 5, outputTokens: 8 });
    const q = await import('../queue.svelte');
    await q.initQueue(); await q.addTask('Demo'); await q.startQueue();
    await vi.advanceTimersByTimeAsync(4500);
    expect(provider.runOpenAiStage).toHaveBeenCalledWith('Researcher', 'Demo', {});
    expect(q.queue.data.tasks[0].results.Researcher).toBe('Реальный ответ');
    expect(q.queue.data.tasks[0].usage?.Researcher).toMatchObject({ model: 'gpt-5.2', inputTokens: 5, outputTokens: 8 });
    q.destroyQueue();
  });
});
