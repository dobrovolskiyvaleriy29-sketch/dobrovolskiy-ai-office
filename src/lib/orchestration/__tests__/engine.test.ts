import { describe, expect, it } from 'vitest';
import { advanceQueue, createTask, decodeQueue, emptyQueue, roleAgents, ROLES } from '../engine';
import { publishRoles, subscribeRoles } from '../bridge';
const task = (id = 'one') => createTask('Подготовить 5 Reels на неделю', id, '2026-09-14T10:00:00Z');

describe('local content pipeline', () => {
  it('finishes every stage in order and produces five scripts with no APIs', () => {
    let data = emptyQueue(); data.tasks.push(task());
    const stages: string[] = [];
    for (let i = 0; i < 12; i++) {
      data = advanceQueue(data);
      expect(() => decodeQueue(JSON.stringify(data))).not.toThrow();
      const active = data.tasks[0];
      stages.push(`${ROLES[active.stage]}:${active.phase}`);
      const agent = roleAgents(data)[active.stage];
      expect(agent.status).toBe(active.phase);
    }
    expect(stages).toEqual(ROLES.flatMap(r => ['thinking', 'responding', 'task_complete'].map(p => `${r}:${p}`)));
    expect(data.tasks[0].status).toBe('complete');
    expect(Object.keys(data.tasks[0].results)).toEqual([...ROLES]);
    expect(data.tasks[0].results.Editor).toContain('5 сценариев');
    expect(data.tasks[0].results.Scriptwriter?.match(/CTA:/g)).toHaveLength(5);
    expect(advanceQueue(data)).toEqual(data);
  });
  it('serializes tasks FIFO and resumes a saved intermediate stage', () => {
    let data = emptyQueue(); data.tasks.push(task(), task('two'));
    for (let i = 0; i < 5; i++) data = advanceQueue(data);
    const restored = decodeQueue(JSON.stringify(data));
    expect(restored.tasks[1].status).toBe('queued');
    data = advanceQueue(restored);
    expect(data.tasks[0].results.Strategist).toContain(data.tasks[0].results.Researcher);
    for (let i = 0; i < 6; i++) data = advanceQueue(data);
    expect(data.tasks[0].status).toBe('complete');
    expect(data.tasks[1].status).toBe('queued');
    data = advanceQueue(data);
    expect(data.tasks[1].status).toBe('running');
    expect(roleAgents(data)[3].status).toBe('idle');
  });
  it('rejects invalid titles, corrupt files, duplicate IDs and missing results', () => {
    expect(() => createTask('  ', 'x', '')).toThrow();
    expect(() => createTask('x'.repeat(201), 'x', '')).toThrow();
    expect(() => decodeQueue('bad')).toThrow();
    expect(() => decodeQueue('{"version":2,"tasks":[]}')).toThrow();
    expect(() => decodeQueue(JSON.stringify({version: 1, tasks: [task(),task()]}))).toThrow();
    expect(() => decodeQueue(JSON.stringify({version: 1, tasks: [{...task(), status:'running',stage:2}]}))).toThrow();
  });
  it('does not mutate previous state; role IDs cannot collide with monitored processes', () => {
    const data = emptyQueue(); data.tasks.push(task());
    advanceQueue(data);
    expect(data.tasks[0].status).toBe('queued');
    expect(roleAgents(data).every(a => a.id.startsWith('content-role:') && a.pid === null && a.status === 'idle')).toBe(true);
  });
  it('replays roles to late renderer subscribers and cleans up subscriptions', () => {
    const agents = roleAgents(emptyQueue()); publishRoles(agents);
    const calls: unknown[] = [];
    const off = subscribeRoles(a => calls.push(a));
    expect(calls).toEqual([agents]);
    publishRoles(agents); off(); publishRoles([]);
    expect(calls).toHaveLength(2);
  });
});
