// main.rs — delegates to lib.rs
// This file only exists to satisfy Cargo's bin target requirement.
// All real setup lives in lib.rs so it can also be used as a library
// target (required for Tauri's iOS/Android mobile builds).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tasogare_lib::run();
}
