pub mod commands;
pub mod core;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Phase 0 registers no commands — `commands::` is the thin adapter layer that
        // Phase 1 fills in, one `#[tauri::command]` per `core::` function.
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running PenguinGit");
}
