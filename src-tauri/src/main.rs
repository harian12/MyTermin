// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod pty;

use pty::{PtyManager, PtyStats, ShellInfo};
use std::collections::HashMap;
use std::path::Path;
use tauri::{AppHandle, State};

#[tauri::command]
fn create_pty(
    app: AppHandle,
    state: State<'_, PtyManager>,
    id: String,
    shell: Option<String>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.spawn_pty(app, id, shell, cwd, cols, rows)
}

#[tauri::command]
fn write_pty(state: State<'_, PtyManager>, id: String, data: String) -> Result<(), String> {
    state.write_pty(&id, &data)
}

#[tauri::command]
fn resize_pty(state: State<'_, PtyManager>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    state.resize_pty(&id, cols, rows)
}

#[tauri::command]
fn kill_pty(state: State<'_, PtyManager>, id: String) -> Result<(), String> {
    state.kill_pty(&id)
}

#[tauri::command]
fn get_all_pty_stats(state: State<'_, PtyManager>) -> HashMap<String, PtyStats> {
    state.get_all_stats()
}

#[tauri::command]
fn get_pty_cwd(state: State<'_, PtyManager>, id: String) -> Option<String> {
    state.get_session_cwd(&id)
}

#[tauri::command]
fn set_pty_cwd(state: State<'_, PtyManager>, id: String, cwd: String) {
    state.update_session_cwd(&id, &cwd);
}

#[tauri::command]
fn get_available_shells() -> Vec<ShellInfo> {
    let mut shells = Vec::new();

    if cfg!(target_os = "windows") {
        // PowerShell 7 (pwsh)
        if Path::new("C:\\Program Files\\PowerShell\\7\\pwsh.exe").exists() {
            shells.push(ShellInfo {
                name: "PowerShell 7".into(),
                path: "C:\\Program Files\\PowerShell\\7\\pwsh.exe".into(),
                icon: "powershell".into(),
            });
        }
        // Windows PowerShell (5.1)
        shells.push(ShellInfo {
            name: "Windows PowerShell".into(),
            path: "powershell.exe".into(),
            icon: "powershell".into(),
        });
        // Command Prompt
        shells.push(ShellInfo {
            name: "Command Prompt".into(),
            path: "cmd.exe".into(),
            icon: "terminal".into(),
        });
        // Git Bash
        if Path::new("C:\\Program Files\\Git\\bin\\bash.exe").exists() {
            shells.push(ShellInfo {
                name: "Git Bash".into(),
                path: "C:\\Program Files\\Git\\bin\\bash.exe".into(),
                icon: "git".into(),
            });
        }
        // WSL
        shells.push(ShellInfo {
            name: "WSL (Default)".into(),
            path: "wsl.exe".into(),
            icon: "linux".into(),
        });
    } else {
        shells.push(ShellInfo {
            name: "Bash".into(),
            path: "/bin/bash".into(),
            icon: "terminal".into(),
        });
        shells.push(ShellInfo {
            name: "Zsh".into(),
            path: "/bin/zsh".into(),
            icon: "terminal".into(),
        });
    }

    shells
}

#[tauri::command]
fn save_temp_image(bytes: Vec<u8>, ext: Option<String>) -> Result<String, String> {
    let extension = ext.unwrap_or_else(|| "png".to_string());
    let filename = format!("mytermin_img_{}.{}", uuid::Uuid::new_v4(), extension);
    let temp_path = std::env::temp_dir().join(filename);
    
    std::fs::write(&temp_path, bytes).map_err(|e| e.to_string())?;
    
    // Kembalikan path absolut sebagai string
    Ok(temp_path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_temp_file(bytes: Vec<u8>, filename: String) -> Result<String, String> {
    let safe_filename = if filename.is_empty() {
        format!("mytermin_file_{}.bin", uuid::Uuid::new_v4())
    } else {
        filename
    };
    let temp_path = std::env::temp_dir().join(safe_filename);
    
    std::fs::write(&temp_path, bytes).map_err(|e| e.to_string())?;
    
    Ok(temp_path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_clipboard_files() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(_clip) = clipboard_win::Clipboard::new() {
            if let Ok(files) = clipboard_win::get_clipboard(clipboard_win::formats::FileList) {
                return files;
            }
        }
    }
    Vec::new()
}

#[tauri::command]
fn paste_from_clipboard(state: State<'_, PtyManager>, id: String) -> Result<(), String> {
    // OpenCode membaca attachment dari bracketed paste, bukan input PTY biasa.
    let bracketed_paste = |content: &str| format!("\x1b[200~{}\x1b[201~", content);

    // 1. File/folder dari File Explorer: kirim path dalam bracketed paste.
    #[cfg(target_os = "windows")]
    {
        if let Ok(_clip) = clipboard_win::Clipboard::new() {
            let files: Vec<String> = clipboard_win::get_clipboard(clipboard_win::formats::FileList)
                .unwrap_or_default();
            if !files.is_empty() {
                let quoted: Vec<String> = files.iter().map(|f| format!("\"{}\"", f)).collect();
                let joined = format!("{} ", quoted.join(" "));
                let payload = bracketed_paste(&joined);
                return state.write_pty(&id, &payload);
            }
        }
    }

    // 2. Image clipboard: empty bracketed paste membuat OpenCode membaca image
    // langsung dari clipboard Windows dan membuat [Image 1]. Tidak ada file temp.
    if clipboard_has_image() {
        let payload = bracketed_paste("");
        return state.write_pty(&id, &payload);
    }

    // 3. Jika bukan file/image, kirim teks biasa.
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    if let Ok(text) = clipboard.get_text() {
        if !text.is_empty() {
            let trimmed = text.trim();
            // Jika teks berupa path Windows dengan spasi, bungkus tanda kutip
            if (trimmed.starts_with("C:\\") || trimmed.starts_with("D:\\") || trimmed.starts_with("E:\\")) && trimmed.contains(' ') && !trimmed.starts_with('"') {
                let quoted = format!("\"{}\" ", trimmed);
                return state.write_pty(&id, &quoted);
            }
            let payload = bracketed_paste(&text);
            return state.write_pty(&id, &payload);
        }
    }

    Ok(())
}

fn clipboard_has_image() -> bool {
    arboard::Clipboard::new()
        .and_then(|mut clipboard| clipboard.get_image())
        .is_ok()
}

#[tauri::command]
fn copy_to_clipboard(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(PtyManager::new())
        .invoke_handler(tauri::generate_handler![
            create_pty,
            write_pty,
            resize_pty,
            kill_pty,
            get_all_pty_stats,
            get_pty_cwd,
            set_pty_cwd,
            get_available_shells,
            save_temp_image,
            save_temp_file,
            paste_from_clipboard,
            get_clipboard_files,
            copy_to_clipboard,
            window_minimize,
            window_toggle_maximize,
            window_close
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
