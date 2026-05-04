// lib.rs — Mission Control · Tauri v2 entry point
//
// The scaffold generates this file with tauri_plugin_opener, which is not
// in Cargo.toml and causes a compile error. This replaces it entirely.
//
// The SQL plugin is registered here so that Database.load() works from
// the JS frontend. The setup() closure ensures the app-data directory
// exists before SQLite tries to open a file inside it.

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            // SQLite will NOT create missing parent directories itself.
            // We must guarantee the directory exists before the first
            // Database.load() call from the frontend.
            let dir = app
                .path()
                .app_data_dir()
                .expect("could not resolve app data directory");
            std::fs::create_dir_all(&dir)
                .expect("could not create app data directory");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
