// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod pty;

use pty::{PtyManager, PtyStats, ShellInfo};
use std::collections::HashMap;
use std::path::Path;
use tauri::{AppHandle, Manager, State};

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
fn kill_all_ptys(state: State<'_, PtyManager>) -> Result<(), String> {
    state.kill_all();
    Ok(())
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

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

#[tauri::command]
async fn pick_folder() -> Result<Option<String>, String> {
    let folder = rfd::AsyncFileDialog::new()
        .set_title("Pilih Folder Project")
        .pick_folder()
        .await;

    Ok(folder.map(|f| f.path().to_string_lossy().to_string()))
}

#[tauri::command]
fn read_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err("Direktori tidak ditemukan".into());
    }

    let read_res = std::fs::read_dir(p).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();

    for entry in read_res.flatten() {
        let file_type = entry.file_type().ok();
        let is_dir = file_type.map(|ft| ft.is_dir()).unwrap_or(false);
        let name = entry.file_name().to_string_lossy().to_string();

        let size = if !is_dir {
            entry.metadata().ok().map(|m| m.len())
        } else {
            None
        };

        entries.push(FileEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir,
            size,
        });
    }

    entries.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() || p.is_dir() {
        return Err("File tidak ditemukan atau berupa folder".into());
    }

    let metadata = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if metadata.len() > 5 * 1024 * 1024 {
        return Err("Ukuran file terlalu besar (> 5MB)".into());
    }

    std::fs::read_to_string(p).map_err(|e| format!("Gagal membaca file: {}", e))
}

#[tauri::command]
fn save_file_content(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        return Err("Path target berupa folder".into());
    }

    std::fs::write(p, content).map_err(|e| format!("Gagal menyimpan file: {}", e))
}

#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    if p.exists() {
        return Err("File sudah ada".into());
    }
    std::fs::write(p, "").map_err(|e| format!("Gagal membuat file: {}", e))
}

#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err("Folder sudah ada".into());
    }
    std::fs::create_dir_all(p).map_err(|e| format!("Gagal membuat folder: {}", e))
}

#[tauri::command]
fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    let old_p = Path::new(&old_path);
    let new_p = Path::new(&new_path);
    if !old_p.exists() {
        return Err("Path asal tidak ditemukan".into());
    }
    if new_p.exists() {
        return Err("Path tujuan sudah ada".into());
    }
    std::fs::rename(old_p, new_p).map_err(|e| format!("Gagal mengubah nama: {}", e))
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("Path tidak ditemukan".into());
    }
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| format!("Gagal menghapus folder: {}", e))
    } else {
        std::fs::remove_file(p).map_err(|e| format!("Gagal menghapus file: {}", e))
    }
}

#[tauri::command]
fn list_all_files(root_path: String, max_files: Option<usize>) -> Result<Vec<String>, String> {
    let root = Path::new(&root_path);
    if !root.exists() || !root.is_dir() {
        return Err("Root folder tidak valid".into());
    }

    let max_limit = max_files.unwrap_or(3000);
    let mut results = Vec::new();
    let mut stack = vec![root.to_path_buf()];

    let ignored_names: std::collections::HashSet<&str> = [
        ".git", "node_modules", "target", ".nuxt", ".output", "dist", ".cargo", ".idea", ".vscode",
    ].into_iter().collect();

    while let Some(dir) = stack.pop() {
        if results.len() >= max_limit {
            break;
        }

        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let file_name = entry.file_name();
                let name_str = file_name.to_string_lossy();

                if ignored_names.contains(name_str.as_ref()) {
                    continue;
                }

                if path.is_dir() {
                    stack.push(path);
                } else if path.is_file() {
                    if let Ok(rel) = path.strip_prefix(root) {
                        results.push(rel.to_string_lossy().replace('\\', "/"));
                    }
                    if results.len() >= max_limit {
                        break;
                    }
                }
            }
        }
    }

    results.sort();
    Ok(results)
}

#[derive(serde::Serialize)]
struct GitCommitItem {
    hash: String,
    short_hash: String,
    message: String,
    author: String,
    relative_time: String,
}

#[derive(serde::Serialize, Clone)]
struct GitFileEntry {
    path: String,
    name: String,
    status: String,
    is_staged: bool,
    is_untracked: bool,
}

#[derive(serde::Serialize)]
struct GitStatusOverview {
    branch: String,
    staged: Vec<GitFileEntry>,
    unstaged: Vec<GitFileEntry>,
    untracked: Vec<GitFileEntry>,
}

#[tauri::command]
fn get_git_status_overview(repo_path: String) -> Result<GitStatusOverview, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }

    let mut branch_cmd = std::process::Command::new("git");
    branch_cmd.arg("branch").arg("--show-current").current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        branch_cmd.creation_flags(0x08000000);
    }
    let branch_out = branch_cmd.output().map_err(|e| e.to_string())?;
    let branch = String::from_utf8_lossy(&branch_out.stdout).trim().to_string();

    let mut status_cmd = std::process::Command::new("git");
    status_cmd.arg("status").arg("--porcelain=v1").current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        status_cmd.creation_flags(0x08000000);
    }
    let status_out = status_cmd.output().map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&status_out.stdout);

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();

    for line in text.lines() {
        if line.len() < 3 {
            continue;
        }
        let x = line.chars().next().unwrap_or(' ');
        let y = line.chars().nth(1).unwrap_or(' ');
        let file_path = line[3..].trim().trim_matches('"').replace('\\', "/");
        let name = file_path.split('/').last().unwrap_or(&file_path).to_string();

        if x == '?' && y == '?' {
            untracked.push(GitFileEntry {
                path: file_path.clone(),
                name: name.clone(),
                status: "?".into(),
                is_staged: false,
                is_untracked: true,
            });
        } else {
            if x != ' ' {
                staged.push(GitFileEntry {
                    path: file_path.clone(),
                    name: name.clone(),
                    status: x.to_string(),
                    is_staged: true,
                    is_untracked: false,
                });
            }
            if y != ' ' {
                unstaged.push(GitFileEntry {
                    path: file_path.clone(),
                    name: name.clone(),
                    status: y.to_string(),
                    is_staged: false,
                    is_untracked: false,
                });
            }
        }
    }

    Ok(GitStatusOverview {
        branch,
        staged,
        unstaged,
        untracked,
    })
}

#[tauri::command]
fn git_get_file_head(repo_path: String, rel_path: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    let norm_path = rel_path.replace('\\', "/");
    let mut cmd = std::process::Command::new("git");
    cmd.arg("show").arg(format!("HEAD:{}", norm_path)).current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().map_err(|e| format!("Git show error: {}", e))?;
    if !output.status.success() {
        return Ok("".into());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn git_stage(repo_path: String, rel_path: String) -> Result<(), String> {
    let root = Path::new(&repo_path);
    let mut cmd = std::process::Command::new("git");
    cmd.arg("add").arg("--").arg(&rel_path).current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
fn git_unstage(repo_path: String, rel_path: String) -> Result<(), String> {
    let root = Path::new(&repo_path);
    let mut cmd = std::process::Command::new("git");
    cmd.arg("restore").arg("--staged").arg("--").arg(&rel_path).current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let mut reset_cmd = std::process::Command::new("git");
        reset_cmd.arg("reset").arg("HEAD").arg("--").arg(&rel_path).current_dir(root);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            reset_cmd.creation_flags(0x08000000);
        }
        let reset_out = reset_cmd.output().map_err(|e| e.to_string())?;
        if !reset_out.status.success() {
            return Err(String::from_utf8_lossy(&reset_out.stderr).to_string());
        }
    }
    Ok(())
}

#[tauri::command]
fn git_stage_all(repo_path: String) -> Result<(), String> {
    let root = Path::new(&repo_path);
    let mut cmd = std::process::Command::new("git");
    cmd.arg("add").arg("-A").current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
fn git_unstage_all(repo_path: String) -> Result<(), String> {
    let root = Path::new(&repo_path);
    let mut cmd = std::process::Command::new("git");
    cmd.arg("restore").arg("--staged").arg(".").current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let mut reset_cmd = std::process::Command::new("git");
        reset_cmd.arg("reset").arg("HEAD").current_dir(root);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            reset_cmd.creation_flags(0x08000000);
        }
        let _ = reset_cmd.output();
    }
    Ok(())
}

#[tauri::command]
fn git_discard(repo_path: String, rel_path: String, is_untracked: bool) -> Result<(), String> {
    let root = Path::new(&repo_path);
    let target = root.join(&rel_path);
    if is_untracked {
        if target.is_dir() {
            std::fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
        } else if target.is_file() {
            std::fs::remove_file(&target).map_err(|e| e.to_string())?;
        }
    } else {
        let mut cmd = std::process::Command::new("git");
        cmd.arg("restore").arg("--").arg(&rel_path).current_dir(root);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let output = cmd.output().map_err(|e| e.to_string())?;
        if !output.status.success() {
            let mut co_cmd = std::process::Command::new("git");
            co_cmd.arg("checkout").arg("HEAD").arg("--").arg(&rel_path).current_dir(root);
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                co_cmd.creation_flags(0x08000000);
            }
            let _ = co_cmd.output();
        }
    }
    Ok(())
}

#[tauri::command]
fn git_push(repo_path: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    let mut cmd = std::process::Command::new("git");
    cmd.arg("push").current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().map_err(|e| format!("Push error: {}", e))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(if err.is_empty() { String::from_utf8_lossy(&output.stdout).to_string() } else { err });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn git_pull(repo_path: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    let mut cmd = std::process::Command::new("git");
    cmd.arg("pull").current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().map_err(|e| format!("Pull error: {}", e))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(if err.is_empty() { String::from_utf8_lossy(&output.stdout).to_string() } else { err });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn git_get_branches(repo_path: String) -> Result<Vec<String>, String> {
    let root = Path::new(&repo_path);
    let mut cmd = std::process::Command::new("git");
    cmd.arg("branch").arg("--format=%(refname:short)").current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let branches: Vec<String> = text.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect();
    Ok(branches)
}

#[tauri::command]
fn git_switch_branch(repo_path: String, branch_name: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    let mut cmd = std::process::Command::new("git");
    cmd.arg("checkout").arg(&branch_name).current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(if err.is_empty() { String::from_utf8_lossy(&output.stdout).to_string() } else { err });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn git_create_branch(repo_path: String, branch_name: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    let mut cmd = std::process::Command::new("git");
    cmd.arg("checkout").arg("-b").arg(&branch_name).current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(if err.is_empty() { String::from_utf8_lossy(&output.stdout).to_string() } else { err });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn git_get_log(repo_path: String, limit: Option<usize>) -> Result<Vec<GitCommitItem>, String> {
    let root = Path::new(&repo_path);
    let max = limit.unwrap_or(15);
    let mut cmd = std::process::Command::new("git");
    cmd.arg("log").arg(format!("-n{}", max)).arg("--pretty=format:%H|%s|%an|%cr").current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut items = Vec::new();
    for line in text.lines() {
        let parts: Vec<&str> = line.splitn(4, '|').collect();
        if parts.len() == 4 {
            let full_hash = parts[0].to_string();
            let short_hash = if full_hash.len() >= 7 { full_hash[..7].to_string() } else { full_hash.clone() };
            items.push(GitCommitItem {
                hash: full_hash,
                short_hash,
                message: parts[1].to_string(),
                author: parts[2].to_string(),
                relative_time: parts[3].to_string(),
            });
        }
    }
    Ok(items)
}

#[tauri::command]
fn get_git_status(repo_path: String) -> Result<HashMap<String, String>, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }

    let mut cmd = std::process::Command::new("git");
    cmd.arg("status").arg("--porcelain").current_dir(root);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| format!("Git error: {}", e))?;
    if !output.status.success() {
        return Ok(HashMap::new());
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut status_map = HashMap::new();

    for line in text.lines() {
        if line.len() < 3 {
            continue;
        }
        let status_code = line[..2].trim().to_string();
        let file_rel = line[3..].trim().trim_matches('"').replace('\\', "/");
        status_map.insert(file_rel, status_code);
    }

    Ok(status_map)
}

#[derive(serde::Serialize)]
struct SearchResultItem {
    file_path: String,
    rel_path: String,
    line_number: usize,
    line_content: String,
    col_start: usize,
    col_end: usize,
}

#[tauri::command]
fn get_git_branch(repo_path: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }

    let mut cmd = std::process::Command::new("git");
    cmd.arg("branch").arg("--show-current").current_dir(root);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| format!("Git error: {}", e))?;
    if !output.status.success() {
        return Ok("".into());
    }

    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(branch)
}

#[tauri::command]
fn git_commit(repo_path: String, message: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    if message.trim().is_empty() {
        return Err("Pesan commit tidak boleh kosong".into());
    }

    // git add -A
    let mut add_cmd = std::process::Command::new("git");
    add_cmd.arg("add").arg("-A").current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        add_cmd.creation_flags(0x08000000);
    }
    let add_out = add_cmd.output().map_err(|e| format!("Git add error: {}", e))?;
    if !add_out.status.success() {
        return Err(String::from_utf8_lossy(&add_out.stderr).to_string());
    }

    // git commit -m
    let mut commit_cmd = std::process::Command::new("git");
    commit_cmd.arg("commit").arg("-m").arg(&message).current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        commit_cmd.creation_flags(0x08000000);
    }
    let commit_out = commit_cmd.output().map_err(|e| format!("Git commit error: {}", e))?;
    if !commit_out.status.success() {
        let err_str = String::from_utf8_lossy(&commit_out.stderr).to_string();
        return if err_str.is_empty() {
            Err(String::from_utf8_lossy(&commit_out.stdout).to_string())
        } else {
            Err(err_str)
        };
    }

    Ok(String::from_utf8_lossy(&commit_out.stdout).to_string())
}

#[tauri::command]
fn search_in_files(
    root_path: String,
    query: String,
    match_case: bool,
    max_results: Option<usize>,
) -> Result<Vec<SearchResultItem>, String> {
    let root = Path::new(&root_path);
    if !root.exists() || !root.is_dir() {
        return Err("Folder root tidak valid".into());
    }

    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let limit = max_results.unwrap_or(200);
    let mut results = Vec::new();
    let mut stack = vec![root.to_path_buf()];

    let ignored_names: std::collections::HashSet<&str> = [
        ".git", "node_modules", "target", ".nuxt", ".output", "dist", ".cargo", ".idea", ".vscode", "package-lock.json", "Cargo.lock"
    ].into_iter().collect();

    let query_lower = if match_case { query.clone() } else { query.to_lowercase() };

    while let Some(dir) = stack.pop() {
        if results.len() >= limit {
            break;
        }

        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let file_name = entry.file_name();
                let name_str = file_name.to_string_lossy();

                if ignored_names.contains(name_str.as_ref()) {
                    continue;
                }

                if path.is_dir() {
                    stack.push(path);
                } else if path.is_file() {
                    if let Ok(metadata) = path.metadata() {
                        if metadata.len() > 1024 * 1024 {
                            continue; // Skip files > 1MB for fast search
                        }
                    }

                    if let Ok(content) = std::fs::read_to_string(&path) {
                        let rel_str = path.strip_prefix(root)
                            .map(|p| p.to_string_lossy().replace('\\', "/"))
                            .unwrap_or_else(|_| name_str.to_string());

                        let file_path_str = path.to_string_lossy().to_string();

                        for (line_idx, line) in content.lines().enumerate() {
                            let line_to_check = if match_case { line.to_string() } else { line.to_lowercase() };
                            if let Some(col_idx) = line_to_check.find(&query_lower) {
                                results.push(SearchResultItem {
                                    file_path: file_path_str.clone(),
                                    rel_path: rel_str.clone(),
                                    line_number: line_idx + 1,
                                    line_content: line.trim().to_string(),
                                    col_start: col_idx,
                                    col_end: col_idx + query.len(),
                                });

                                if results.len() >= limit {
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(results)
}

#[tauri::command]
fn replace_in_files(
    root_path: String,
    query: String,
    replacement: String,
    match_case: bool,
    target_files: Option<Vec<String>>,
) -> Result<usize, String> {
    let root = Path::new(&root_path);
    if !root.exists() || !root.is_dir() {
        return Err("Folder root tidak valid".into());
    }

    if query.is_empty() {
        return Ok(0);
    }

    let files_to_process: Vec<std::path::PathBuf> = if let Some(files) = target_files {
        files.into_iter().map(std::path::PathBuf::from).collect()
    } else {
        let mut list = Vec::new();
        let mut stack = vec![root.to_path_buf()];
        let ignored_names: std::collections::HashSet<&str> = [
            ".git", "node_modules", "target", ".nuxt", ".output", "dist", ".cargo", ".idea", ".vscode", "package-lock.json", "Cargo.lock"
        ].into_iter().collect();

        while let Some(dir) = stack.pop() {
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let name_str = entry.file_name().to_string_lossy().to_string();
                    if ignored_names.contains(name_str.as_str()) {
                        continue;
                    }
                    if path.is_dir() {
                        stack.push(path);
                    } else if path.is_file() {
                        if let Ok(meta) = path.metadata() {
                            if meta.len() <= 2 * 1024 * 1024 {
                                list.push(path);
                            }
                        }
                    }
                }
            }
        }
        list
    };

    let mut total_replacements = 0usize;

    for path in files_to_process {
        if let Ok(content) = std::fs::read_to_string(&path) {
            let (new_content, count) = if match_case {
                let count = content.matches(&query).count();
                if count > 0 {
                    (content.replace(&query, &replacement), count)
                } else {
                    (content, 0)
                }
            } else {
                let mut result = String::new();
                let mut last_idx = 0;
                let mut count = 0;
                let lower_content = content.to_lowercase();
                let lower_query = query.to_lowercase();

                while let Some(pos) = lower_content[last_idx..].find(&lower_query) {
                    let actual_idx = last_idx + pos;
                    result.push_str(&content[last_idx..actual_idx]);
                    result.push_str(&replacement);
                    last_idx = actual_idx + query.len();
                    count += 1;
                }
                result.push_str(&content[last_idx..]);
                (result, count)
            };

            if count > 0 {
                if std::fs::write(&path, new_content).is_ok() {
                    total_replacements += count;
                }
            }
        }
    }

    Ok(total_replacements)
}

#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("Path tidak ditemukan".into());
    }

    #[cfg(windows)]
    {
        let win_path = path.replace('/', "\\");
        let mut cmd = std::process::Command::new("explorer");
        if p.is_file() {
            cmd.arg(format!("/select,{}", win_path));
        } else {
            cmd.arg(win_path);
        }
        cmd.spawn().map_err(|e| format!("Gagal membuka explorer: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Gagal membuka finder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        let target = if p.is_file() {
            p.parent().unwrap_or(p).to_string_lossy().to_string()
        } else {
            path
        };
        std::process::Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| format!("Gagal membuka file manager: {}", e))?;
    }

    Ok(())
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
fn window_close(state: State<'_, PtyManager>, window: tauri::Window) -> Result<(), String> {
    state.kill_all();
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_destroy(state: State<'_, PtyManager>, window: tauri::Window) -> Result<(), String> {
    state.kill_all();
    window.destroy().map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(PtyManager::new())
        .invoke_handler(tauri::generate_handler![
            create_pty,
            write_pty,
            resize_pty,
            kill_pty,
            kill_all_ptys,
            get_all_pty_stats,
            get_pty_cwd,
            set_pty_cwd,
            get_available_shells,
            save_temp_image,
            save_temp_file,
            paste_from_clipboard,
            get_clipboard_files,
            copy_to_clipboard,
            pick_folder,
            read_directory,
            read_file_content,
            save_file_content,
            create_file,
            create_dir,
            rename_path,
            delete_path,
            list_all_files,
            get_git_status,
            get_git_status_overview,
            get_git_branch,
            git_get_file_head,
            git_stage,
            git_unstage,
            git_stage_all,
            git_unstage_all,
            git_discard,
            git_push,
            git_pull,
            git_get_branches,
            git_switch_branch,
            git_create_branch,
            git_get_log,
            git_commit,
            search_in_files,
            replace_in_files,
            reveal_in_explorer,
            window_minimize,
            window_toggle_maximize,
            window_close,
            window_destroy
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(pty) = app_handle.try_state::<PtyManager>() {
                    pty.kill_all();
                }
            }
        });
}
