//! OpenAI Responses API integration. Secrets live in the OS keychain, never in queue JSON.
use keyring::Entry;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::Manager;

const SERVICE: &str = "com.dobrovolskiy.ai-office.openai";
const ACCOUNT: &str = "api-key";
const SETTINGS_FILE: &str = "openai-settings.json";
const DEFAULT_MODEL: &str = "gpt-5.2";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiSettings {
    pub model: String,
    pub api_key_configured: bool,
}

impl Default for OpenAiSettings {
    fn default() -> Self {
        Self { model: DEFAULT_MODEL.to_string(), api_key_configured: false }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveOpenAiSettings {
    pub model: String,
    pub api_key: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunContentRole {
    pub role: String,
    pub title: String,
    pub previous_results: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunContentRoleResult {
    pub result: String,
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
}

fn key_entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("Не удалось открыть Keychain: {e}"))
}

fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join(SETTINGS_FILE))
}

fn load_settings(app: &tauri::AppHandle) -> Result<OpenAiSettings, String> {
    let path = settings_path(app)?;
    let mut settings = match std::fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str(&raw).map_err(|_| "Повреждены настройки OpenAI.".to_string())?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => OpenAiSettings::default(),
        Err(e) => return Err(format!("Не удалось прочитать настройки OpenAI: {e}")),
    };
    settings.api_key_configured = key_entry()?.get_password().is_ok();
    Ok(settings)
}

fn save_settings(app: &tauri::AppHandle, settings: &OpenAiSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let parent = path.parent().ok_or("Не найден каталог настроек.")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    // The serialized file intentionally excludes the API key.
    let public = json!({ "model": settings.model });
    std::fs::write(path, serde_json::to_string_pretty(&public).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Не удалось сохранить настройки OpenAI: {e}"))
}

fn validate_model(model: &str) -> Result<String, String> {
    let model = model.trim();
    if model.is_empty() || model.len() > 100 || !model.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')) {
        return Err("Некорректное имя модели OpenAI.".to_string());
    }
    Ok(model.to_string())
}

#[tauri::command]
pub fn get_openai_settings(app: tauri::AppHandle) -> Result<OpenAiSettings, String> {
    load_settings(&app)
}

#[tauri::command]
pub fn save_openai_settings(app: tauri::AppHandle, settings: SaveOpenAiSettings) -> Result<OpenAiSettings, String> {
    let model = validate_model(&settings.model)?;
    if let Some(key) = settings.api_key.as_deref().map(str::trim).filter(|key| !key.is_empty()) {
        if key.len() < 20 || key.len() > 512 { return Err("Некорректный API-ключ OpenAI.".to_string()); }
        key_entry()?.set_password(key).map_err(|e| format!("Не удалось сохранить ключ в Keychain: {e}"))?;
    }
    let result = OpenAiSettings { model, api_key_configured: key_entry()?.get_password().is_ok() };
    save_settings(&app, &result)?;
    Ok(result)
}

#[tauri::command]
pub fn delete_openai_api_key(app: tauri::AppHandle) -> Result<OpenAiSettings, String> {
    match key_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(format!("Не удалось удалить ключ из Keychain: {e}")),
    }
    let mut settings = load_settings(&app)?;
    settings.api_key_configured = false;
    Ok(settings)
}

fn instructions(role: &str) -> Result<&'static str, String> {
    match role {
        "Researcher" => Ok("You are a content researcher. Produce evidence-aware topic ideas in Russian. Do not invent sources, statistics, or current facts. Clearly distinguish hypotheses from verified facts."),
        "Strategist" => Ok("You are a Russian-speaking Reels content strategist. Turn the research into a concrete weekly plan. Preserve uncertainty and never claim unverified research is fact."),
        "Scriptwriter" => Ok("You are a Russian-speaking short-form video scriptwriter. Create five practical Reels scripts with a hook, shots, spoken text, and CTA. Keep claims accurate and actionable."),
        "Editor" => Ok("You are a Russian-speaking editor. Review the supplied scripts for clarity, unsupported claims, and publication readiness. Return a polished final package and explicitly flag claims that need human fact-checking."),
        _ => Err("Неизвестная роль контент-команды.".to_string()),
    }
}

fn extract_text(body: &Value) -> Result<String, String> {
    let output = body.get("output").and_then(Value::as_array).ok_or("OpenAI вернул ответ без output.")?;
    for item in output {
        for content in item.get("content").and_then(Value::as_array).into_iter().flatten() {
            if let Some(text) = content.get("text").and_then(Value::as_str) {
                let result: Value = serde_json::from_str(text).map_err(|_| "OpenAI вернул результат в неверном формате.".to_string())?;
                return result.get("result").and_then(Value::as_str).map(str::to_string)
                    .filter(|text| !text.trim().is_empty())
                    .ok_or("OpenAI вернул пустой результат.".to_string());
            }
        }
    }
    Err("OpenAI не вернул текстовый результат.".to_string())
}

#[tauri::command]
pub async fn run_openai_content_role(app: tauri::AppHandle, request: RunContentRole) -> Result<RunContentRoleResult, String> {
    if request.title.trim().is_empty() || request.title.len() > 200 { return Err("Некорректное название задачи.".to_string()); }
    let settings = load_settings(&app)?;
    let api_key = key_entry()?.get_password().map_err(|_| "Добавьте API-ключ OpenAI в настройках приложения.".to_string())?;
    let system = instructions(&request.role)?;
    let input = format!("Задача: {}\n\nРезультаты предыдущих этапов (JSON):\n{}", request.title.trim(), serde_json::to_string(&request.previous_results).map_err(|e| e.to_string())?);
    let payload = json!({
        "model": settings.model,
        "store": false,
        "instructions": system,
        "input": input,
        "max_output_tokens": 3000,
        "text": { "format": { "type": "json_schema", "name": "content_stage_result", "strict": true,
            "schema": { "type": "object", "properties": { "result": { "type": "string" } }, "required": ["result"], "additionalProperties": false } } }
    });
    let response = Client::new().post("https://api.openai.com/v1/responses")
        .bearer_auth(api_key).json(&payload).send().await.map_err(|e| format!("Сеть OpenAI недоступна: {e}"))?;
    let status = response.status();
    let body: Value = response.json().await.map_err(|e| format!("Некорректный ответ OpenAI: {e}"))?;
    if !status.is_success() {
        let message = body.pointer("/error/message").and_then(Value::as_str).unwrap_or("Неизвестная ошибка OpenAI.");
        return Err(format!("OpenAI ({status}): {message}"));
    }
    let usage = body.get("usage").unwrap_or(&Value::Null);
    Ok(RunContentRoleResult { result: extract_text(&body)?, model: settings.model,
        input_tokens: usage.get("input_tokens").and_then(Value::as_u64).unwrap_or(0),
        output_tokens: usage.get("output_tokens").and_then(Value::as_u64).unwrap_or(0) })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn model_validation_rejects_unsafe_value() { assert!(validate_model("gpt-5.2").is_ok()); assert!(validate_model("gpt;bad").is_err()); }
    #[test] fn extracts_structured_result() {
        let body = json!({"output":[{"content":[{"type":"output_text","text":"{\"result\":\"готово\"}"}]}]});
        assert_eq!(extract_text(&body).unwrap(), "готово");
    }
}
