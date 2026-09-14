//! Local content queue storage, isolated from passive agent discovery.
use std::path::Path;
use tauri::Manager;

fn write_queue(path: &Path, data: &str) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(data).map_err(|e| e.to_string())?;
    if value["version"] != 1 || !value["tasks"].is_array() {
        return Err("Invalid queue format".into());
    }
    let parent = path.parent().ok_or("Missing queue directory")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temporary = path.with_extension("json.tmp");
    use std::io::Write;
    let mut file = std::fs::File::create(&temporary).map_err(|e| e.to_string())?;
    file.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    std::fs::rename(&temporary, path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_content_queue(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join("content-queue.json");
    match std::fs::read_to_string(path) {
        Ok(data) => Ok(Some(data)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Cannot read queue: {e}")),
    }
}

#[tauri::command]
pub fn save_content_queue(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join("content-queue.json");
    write_queue(&path, &data)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saves_and_replaces_queue() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested/content-queue.json");
        write_queue(&path, r#"{"version":1,"tasks":[]}"#).unwrap();
        let next = r#"{"version":1,"tasks":[{"id":"demo"}]}"#;
        write_queue(&path, next).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), next);
        assert!(!path.with_extension("json.tmp").exists());
    }
    #[test]
    fn invalid_write_preserves_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("queue.json");
        let original = r#"{"version":1,"tasks":[]}"#;
        write_queue(&path, original).unwrap();
        assert!(write_queue(&path, "broken").is_err());
        assert!(write_queue(&path, r#"{"version":2,"tasks":[]}"#).is_err());
        assert_eq!(std::fs::read_to_string(path).unwrap(), original);
    }
}
