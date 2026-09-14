<script lang="ts">
  import { queue, addTask, startQueue, pauseQueue } from '$lib/orchestration/queue.svelte';
  import { ROLES, roleAgents } from '$lib/orchestration/engine';
  import { selectAgent } from '$lib/stores/office.svelte';
  let open = $state(true);
  let title = $state('Подготовить 5 Reels на неделю');
  let selected = $state('');
  const roles = $derived(roleAgents(queue.data));
  const task = $derived(queue.data.tasks.find(t => t.id === selected) ?? queue.data.tasks.at(-1));
  const labels = { queued: 'В очереди', running: 'В работе', complete: 'Готово' };
  async function submit() {
    await addTask(title);
    if (!queue.error) selected = queue.data.tasks.at(-1)?.id ?? '';
  }
</script>

<button class="office-brand" onclick={() => open = !open} aria-expanded={open} aria-controls="content-panel">
  <strong>Dobrovolskiy AI Office</strong><span>Контент-команда · {open ? 'Свернуть' : 'Задачи'}</span>
</button>
{#if open}
  <section id="content-panel" class="content-panel" aria-label="Задачи контент-команды">
    <header><div><h1>Контент-команда</h1><p>Локальное демо · без платных API</p></div><span class="version">v0.1</span></header>
    <div class="role-grid">
      {#each roles as role}
        <button class="role" onclick={() => selectAgent(role.id)} title="Показать агента в офисе">
          <strong>{role.name}</strong><span class:working={role.status === 'thinking' || role.status === 'responding'}>{role.status}</span>
        </button>
      {/each}
    </div>
    <p class="pipeline">Researcher → Strategist → Scriptwriter → Editor</p>
    <form onsubmit={e => { e.preventDefault(); void submit(); }}>
      <label for="task-title">Новая задача</label>
      <div class="input-row"><input id="task-title" bind:value={title} maxlength="200" required placeholder="Название задачи" /><button disabled={!queue.ready || !title.trim()}>Добавить</button></div>
    </form>
    <div class="controls">
      <button class="primary" disabled={!queue.ready || queue.running || !queue.data.tasks.some(t => t.status !== 'complete')} onclick={() => void startQueue()}>Запустить очередь</button>
      <button disabled={!queue.running} onclick={pauseQueue}>Пауза</button>
      <span aria-live="polite">{queue.running ? 'Выполняется' : queue.data.tasks.length && queue.data.tasks.every(t => t.status === 'complete') ? 'Очередь завершена' : 'Приостановлена'}</span>
    </div>
    {#if queue.error}<p role="alert" class="error">{queue.error}</p>{/if}
    {#if !queue.ready && !queue.error}<p>Загрузка очереди…</p>{/if}
    <div class="task-list" aria-label="Очередь задач">
      {#each queue.data.tasks as item}
        <button class="task-row" class:selected={task?.id === item.id} onclick={() => selected = item.id}>
          <strong>{item.title}</strong><span>{labels[item.status]} · Этап {item.stage + 1}/4 · {ROLES[item.stage]}</span>
        </button>
      {:else}<p class="empty">Добавьте демо-задачу и запустите очередь. Пять сценариев пройдут все четыре этапа примерно за 18 секунд.</p>{/each}
    </div>
    {#if task}
      <article aria-label="Текущий результат">
        <h2>{task.title}</h2>
        <p>Ответственный: <strong>{ROLES[task.stage]}</strong> · {labels[task.status]}{task.status === 'running' ? ` · ${task.phase}` : ''}</p>
        {#each ROLES as role}
          {#if task.results[role]}<details open={role === ROLES[task.stage]}><summary>{role} · результат</summary><pre>{task.results[role]}</pre></details>{/if}
        {/each}
        {#if !Object.keys(task.results).length}<p class="empty">Результат появится после первого этапа.</p>{/if}
      </article>
    {/if}
    <footer>Сохраняется локально. После перезапуска нажмите «Запустить очередь».<br/>На основе OfficeAI · Roman Dykyi · MIT</footer>
  </section>
{/if}

<style>
  .office-brand { position: fixed; left: 130px; top: 13px; z-index: 40; display: grid; gap: 3px; text-align: left; background: #111e2ded; }
  .office-brand span { font-size: 10px; color: #a4bdcc; }
  .content-panel { position: fixed; top: 72px; left: 16px; bottom: 48px; width: min(420px, calc(100vw - 32px)); z-index: 35; overflow-y: auto; background: #101c29f5; border: 1px solid #32475d; border-radius: 14px; padding: 20px; box-shadow: 0 16px 48px #0007; color: #e6eff5; }
  header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 18px; }
  h1 { font-size: 21px; margin: 0; } h2 { font-size: 15px; }
  p { line-height: 1.5; } header p { margin: 5px 0 0; color: #9eb3c7; font-size: 12px; }
  .version { padding: 4px 8px; background: #23364a; border-radius: 6px; color: #99dccf; }
  .role-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  button { cursor: pointer; border: 1px solid #3c5269; border-radius: 7px; background: #213449; padding: 9px 11px; color: #e6eff5; font: inherit; }
  button:hover { border-color: #7bccba; } button:focus-visible, input:focus-visible { outline: 2px solid #8de9d1; outline-offset: 2px; }
  button:disabled { opacity: .45; cursor: default; }
  .role { text-align: left; display: grid; gap: 4px; }.role span { font-size: 11px; color: #9eb3c7; }.role span.working { color: #8de9d1; }
  .pipeline { font-size: 10px; color: #a5b8c9; margin: 12px 0 22px; }
  label { font-size: 12px; display: block; margin-bottom: 7px; }
  .input-row { display: flex; gap: 6px; } input { min-width: 0; flex: 1; background: #0c1520; border: 1px solid #3c5269; border-radius: 7px; padding: 10px; color: #fff; }
  .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 12px 0 20px; }.controls span { font-size: 11px; color: #a5b8c9; }
  .primary { background: #216654; border-color: #4a9c84; }
  .task-list { display: grid; gap: 8px; max-height: 220px; overflow-y: auto; }.task-row { display: grid; text-align: left; gap: 7px; }.task-row span { font-size: 11px; color: #b0c4d4; }.task-row.selected { border-color: #8de9d1; }
  article { border-top: 1px solid #32475d; margin-top: 20px; padding-top: 4px; } article p { font-size: 12px; }
  details { margin: 10px 0; background: #0c1520; padding: 10px; border-radius: 7px; } summary { cursor: pointer; color: #9ddcca; font-size: 12px; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.6 system-ui, sans-serif; }
  .empty, footer { color: #91a9bd; font-size: 12px; line-height: 1.6; } footer { font-size: 10px; border-top: 1px solid #32475d; padding-top: 15px; margin-top: 20px; }.error { color: #ffadad; overflow-wrap: anywhere; }
</style>
