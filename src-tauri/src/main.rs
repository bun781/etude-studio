#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod models;
mod storage;

use commands::*;
use tauri::Manager;
use storage::ensure_workspace;

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let paths = ensure_workspace(&app.handle())?;
      app.manage(paths);
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      list_projects,
      create_project,
      rename_project,
      delete_project,
      load_project,
      import_score,
      save_practice_segment,
      delete_practice_segment,
      reorder_practice_segments,
      import_reference,
      delete_reference,
      set_active_reference,
      save_project_note,
      register_recording,
      set_active_recording,
      update_recording,
      delete_recording,
      duplicate_recording,
      end_practice_session
    ])
    .run(tauri::generate_context!())
    .expect("failed to run app");
}
