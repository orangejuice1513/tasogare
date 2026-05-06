// lib.rs — Mission Control · Tauri v2 entry point
//
// The timer lives here in Rust so it keeps running even when macOS
// throttles JavaScript timers in background WebViews.
//
// How it works:
//   - JS calls start_timer()  → Rust records the current Unix timestamp
//   - JS calls pause_timer()  → Rust records elapsed so far, clears start
//   - JS calls resume_timer() → Rust sets a new start timestamp
//   - JS calls stop_timer()   → Rust resets everything, returns final seconds
//   - JS calls get_elapsed()  → Rust returns current elapsed seconds
//     (JS polls this every second only for display — accuracy is guaranteed
//      by the Rust clock regardless of how often JS polls)

use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

// ── Timer state ───────────────────────────────────────────────────────────────

#[derive(Default)]
struct TimerState {
    /// Unix timestamp (seconds) when the current running interval started.
    /// None means the timer is paused or stopped.
    start_ts: Option<u64>,
    /// Seconds already accumulated before the current interval.
    accumulated: u64,
}

impl TimerState {
    fn now() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    fn elapsed(&self) -> u64 {
        match self.start_ts {
            Some(ts) => self.accumulated + (Self::now().saturating_sub(ts)),
            None => self.accumulated,
        }
    }

    fn start(&mut self) {
        self.accumulated = 0;
        self.start_ts = Some(Self::now());
    }

    fn pause(&mut self) {
        self.accumulated = self.elapsed();
        self.start_ts = None;
    }

    fn resume(&mut self) {
        // Only resume if currently paused (start_ts is None)
        if self.start_ts.is_none() {
            self.start_ts = Some(Self::now());
        }
    }

    fn stop(&mut self) -> u64 {
        let total = self.elapsed();
        self.accumulated = 0;
        self.start_ts = None;
        total
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
fn start_timer(state: tauri::State<Mutex<TimerState>>) {
    state.lock().unwrap().start();
}

#[tauri::command]
fn pause_timer(state: tauri::State<Mutex<TimerState>>) {
    state.lock().unwrap().pause();
}

#[tauri::command]
fn resume_timer(state: tauri::State<Mutex<TimerState>>) {
    state.lock().unwrap().resume();
}

/// Stops the timer, resets it, and returns the total elapsed seconds.
#[tauri::command]
fn stop_timer(state: tauri::State<Mutex<TimerState>>) -> u64 {
    state.lock().unwrap().stop()
}

/// Returns current elapsed seconds. JS polls this for display only —
/// the value is always accurate because Rust uses the system clock.
#[tauri::command]
fn get_elapsed(state: tauri::State<Mutex<TimerState>>) -> u64 {
    state.lock().unwrap().elapsed()
}

// ── App entry point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(Mutex::new(TimerState::default()))
        .invoke_handler(tauri::generate_handler![
            start_timer,
            pause_timer,
            resume_timer,
            stop_timer,
            get_elapsed,
        ])
        .setup(|app| {
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
