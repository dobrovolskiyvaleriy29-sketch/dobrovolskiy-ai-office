import type { AgentState, Status, Tier } from '../types/agent';

export const ROLES = ['Researcher', 'Strategist', 'Scriptwriter', 'Editor'] as const;
export type Role = typeof ROLES[number];
export type Phase = 'thinking' | 'responding' | 'task_complete';
export interface ContentTask {
  id: string;
  title: string;
  stage: number;
  status: 'queued' | 'running' | 'complete';
  phase: Phase;
  results: Partial<Record<Role, string>>;
  createdAt: string;
}
export interface QueueData { version: 1; tasks: ContentTask[] }
export const emptyQueue = (): QueueData => ({ version: 1, tasks: [] });

export function createTask(title: string, id: string, now: string): ContentTask {
  const clean = title.trim();
  if (!clean || clean.length > 200) throw new Error('Название должно содержать от 1 до 200 символов.');
  return { id, title: clean, stage: 0, status: 'queued', phase: 'thinking', results: {}, createdAt: now };
}

/** Strict validation: invalid files are never silently replaced with an empty queue. */
export function decodeQueue(raw: string): QueueData {
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !Array.isArray(data.tasks)) throw new Error('Неизвестный формат очереди.');
  const ids = new Set<string>();
  let active = 0;
  for (const task of data.tasks) {
    if (!task || typeof task.id !== 'string' || !task.id || ids.has(task.id)
      || typeof task.title !== 'string' || !task.title.trim() || task.title.length > 200
      || !Number.isInteger(task.stage) || task.stage < 0 || task.stage >= ROLES.length
      || !['queued', 'running', 'complete'].includes(task.status)
      || !['thinking', 'responding', 'task_complete'].includes(task.phase)
      || typeof task.createdAt !== 'string' || !Number.isFinite(Date.parse(task.createdAt))
      || !task.results || typeof task.results !== 'object' || Array.isArray(task.results)
      || Object.entries(task.results).some(([k, v]) => !ROLES.includes(k as Role) || typeof v !== 'string')) {
      throw new Error('Повреждены данные задачи. Исходная очередь сохранена.');
    }
    if (task.status === 'running') active++;
    if (task.status === 'queued' && (task.stage !== 0 || Object.keys(task.results).length !== 0)) throw new Error('Некорректная ожидающая задача.');
    if (task.status === 'complete' && (task.stage !== 3 || task.phase !== 'task_complete')) throw new Error('Некорректная завершённая задача.');
    const required = task.status === 'complete' || task.phase === 'task_complete' ? task.stage + 1 : task.stage;
    if (ROLES.slice(0, required).some(role => !task.results[role])) throw new Error('Не найден результат предыдущего этапа.');
    ids.add(task.id);
  }
  if (active > 1) throw new Error('В очереди больше одной активной задачи.');
  return data as QueueData;
}

const topics = ['Как выбрать район для жизни', 'Три ошибки на просмотре квартиры', 'Что проверить в планировке', 'Из чего складывается бюджет переезда', 'Пять вопросов перед покупкой'];
export function mockResult(task: ContentTask): string {
  const brief = `ДЕМО · ${task.title}\n`;
  switch (ROLES[task.stage]) {
    case 'Researcher': return brief + 'Учебные гипотезы, без интернет-исследования и проверки спроса:\n' + topics.map((t, i) => `${i + 1}. ${t}`).join('\n');
    case 'Strategist': return brief + 'План на Пн–Пт. Цель: сохранения и вопросы аудитории. Формат: 25–35 секунд, один полезный тезис на ролик.\nОснова исследования:\n' + task.results.Researcher;
    case 'Scriptwriter': return brief + topics.map((t, i) => `${i + 1}. ${t}\nХук: «${['Район важнее красивой кухни?', 'Не уходите с просмотра без этих проверок', 'Посмотрите на план квартиры ещё раз', 'Цена квартиры — не весь бюджет', 'Сохраните эти вопросы для следующего просмотра'][i]}»\nКадры: ведущий → детали объекта → чек-лист.\nТекст: ${['Пройдите маршрут до транспорта, оцените шум и нужные вам места рядом.', 'Посмотрите на окна, следы влаги и состояние коммуникаций. Запишите вопросы специалисту.', 'Проверьте места хранения, проходы и расположение мебели на плане.', 'Отдельно посчитайте ремонт, мебель, переезд и резерв на непредвиденные расходы.', 'Уточните состояние объекта, расходы, документы, сроки и что входит в цену.'][i]}\nCTA: «Сохраните и напишите, что разобрать подробнее».`).join('\n\n') + '\n\nЗадание стратега:\n' + task.results.Strategist;
    case 'Editor': return brief + 'Редакторская проверка демо завершена. 5 сценариев готовы к ручному согласованию. Перед публикацией проверить факты и адаптировать под конкретный объект.\n\n' + task.results.Scriptwriter;
  }
}

/** One deterministic transition. The caller persists it before publishing to UI. */
export function advanceQueue(data: QueueData): QueueData {
  const next = structuredClone(data);
  const task = next.tasks.find(t => t.status === 'running') ?? next.tasks.find(t => t.status === 'queued');
  if (!task) return next;
  if (task.status === 'queued') { task.status = 'running'; task.phase = 'thinking'; }
  else if (task.phase === 'thinking') task.phase = 'responding';
  else if (task.phase === 'responding') {
    task.results[ROLES[task.stage]] = mockResult(task);
    task.phase = 'task_complete';
    if (task.stage === ROLES.length - 1) task.status = 'complete';
  } else { task.stage++; task.phase = 'thinking'; }
  return next;
}

export function roleAgents(data: QueueData): AgentState[] {
  const current = data.tasks.find(t => t.status === 'running');
  const latest = [...data.tasks].reverse().find(t => t.status === 'complete');
  const tiers: Tier[] = ['middle', 'senior', 'middle', 'expert'];
  return ROLES.map((role, stage) => {
    const task = current ?? latest;
    let status: Status = 'idle';
    if (current?.stage === stage) status = current.phase;
    else if (task?.results[role]) status = 'task_complete';
    return { id: `content-role:${role}`, pid: null, name: role, model: 'local-mock',
      tier: tiers[stage], role, status, idleLocation: 'desk', currentTask: task ? `${task.title}\n${task.results[role] ?? 'Ожидает результата этапа'}` : null,
      tokensIn: 0, tokensOut: 0, subAgents: [], lastActivity: task?.createdAt ?? '2026-01-01T00:00:00Z',
      startedAt: task?.createdAt ?? '2026-01-01T00:00:00Z', source: 'sdk_hook' };
  });
}
