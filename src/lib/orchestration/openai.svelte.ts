import { invoke, isTauri } from '@tauri-apps/api/core';

export interface OpenAiSettings {
  model: string;
  apiKeyConfigured: boolean;
}

export interface OpenAiStageResult {
  result: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

const DEFAULT: OpenAiSettings = { model: 'gpt-5.2', apiKeyConfigured: false };
let settings = $state<OpenAiSettings>({ ...DEFAULT });
let loading = $state(false);
let error = $state('');

export const openai = {
  get settings() { return settings; },
  get loading() { return loading; },
  get error() { return error; },
  get available() { return isTauri() && settings.apiKeyConfigured; },
};

export async function initOpenAi(): Promise<void> {
  if (!isTauri()) return;
  loading = true;
  try {
    settings = await invoke<OpenAiSettings>('get_openai_settings');
    error = '';
  } catch (cause) {
    error = String(cause);
  } finally { loading = false; }
}

export async function saveOpenAi(model: string, apiKey?: string): Promise<boolean> {
  if (!isTauri()) { error = 'Настройки реального OpenAI доступны только в desktop-приложении.'; return false; }
  loading = true;
  try {
    settings = await invoke<OpenAiSettings>('save_openai_settings', { settings: { model, apiKey: apiKey?.trim() || null } });
    error = '';
    return true;
  } catch (cause) {
    error = String(cause);
    return false;
  } finally { loading = false; }
}

export async function deleteOpenAiKey(): Promise<void> {
  if (!isTauri()) return;
  loading = true;
  try {
    settings = await invoke<OpenAiSettings>('delete_openai_api_key');
    error = '';
  } catch (cause) { error = String(cause); } finally { loading = false; }
}

export async function runOpenAiStage(role: string, title: string, previousResults: Record<string, string>): Promise<OpenAiStageResult> {
  if (!isTauri()) throw new Error('Реальный OpenAI доступен только в desktop-приложении.');
  return invoke<OpenAiStageResult>('run_openai_content_role', { request: { role, title, previousResults } });
}
