// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod pty;

use pty::{PtyManager, PtyStats, ShellInfo};
use std::collections::HashMap;
use std::path::Path;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
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
    env: Option<HashMap<String, String>>,
    shell_integration: Option<bool>,
) -> Result<(), String> {
    state.spawn_pty(app, id, shell, cwd, cols, rows, env, shell_integration)
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
        // Distro WSL terinstall sebagai pilihan shell terpisah
        for distro in list_wsl_distros() {
            shells.push(ShellInfo {
                name: format!("WSL: {}", distro),
                path: format!("wsl.exe -d {}", distro),
                icon: "linux".into(),
            });
        }
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

#[derive(serde::Serialize, Clone, Debug)]
struct GitCommitItem {
    hash: String,
    short_hash: String,
    message: String,
    author: String,
    relative_time: String,
}

#[derive(serde::Serialize, Clone, Debug)]
struct GitGraphNode {
    hash: String,
    short_hash: String,
    parents: Vec<String>,
    author: String,
    author_email: String,
    date: String,
    relative_time: String,
    subject: String,
    body: String,
    refs: Vec<String>,
}

#[derive(serde::Serialize, Clone, Debug)]
struct GitCommitDiffFile {
    path: String,
    status: String, // "added", "modified", "deleted", "renamed"
    old_path: Option<String>,
    insertions: usize,
    deletions: usize,
}

#[derive(serde::Serialize, Clone, Debug)]
struct GitCommitDetail {
    hash: String,
    short_hash: String,
    parents: Vec<String>,
    author: String,
    author_email: String,
    date: String,
    relative_time: String,
    subject: String,
    body: String,
    refs: Vec<String>,
    files: Vec<GitCommitDiffFile>,
}

#[derive(serde::Serialize, Clone, Debug)]
struct GitFileDiffContent {
    path: String,
    old_path: Option<String>,
    original: String,
    modified: String,
    is_binary: bool,
    is_truncated: bool,
}

#[derive(serde::Serialize, Clone, Debug)]
struct GitBranchCompareResult {
    base_branch: String,
    compare_branch: String,
    ahead_count: usize,
    behind_count: usize,
    ahead_commits: Vec<GitCommitItem>,
    behind_commits: Vec<GitCommitItem>,
    changed_files: Vec<GitCommitDiffFile>,
}

#[derive(serde::Serialize, Clone, Debug)]
struct ListeningPortInfo {
    protocol: String,
    local_address: String,
    port: u16,
    pid: u32,
    process_name: String,
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
    cmd.arg("branch").arg("-a").arg("--format=%(refname:short)").current_dir(root);
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
    let mut unique_branches = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for l in text.lines() {
        let trimmed = l.trim();
        if trimmed.is_empty() || trimmed.ends_with("/HEAD") || trimmed == "origin" {
            continue;
        }
        let clean = if let Some(stripped) = trimmed.strip_prefix("origin/") {
            stripped
        } else {
            trimmed
        };
        if seen.insert(clean.to_string()) {
            unique_branches.push(clean.to_string());
        }
    }
    Ok(unique_branches)
}

#[tauri::command]
fn git_switch_branch(repo_path: String, branch_name: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    let mut clean_name = branch_name.trim();
    if let Some(stripped) = clean_name.strip_prefix("origin/") {
        clean_name = stripped;
    }
    let mut cmd = std::process::Command::new("git");
    cmd.arg("checkout").arg(clean_name).current_dir(root);
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
fn git_get_graph(repo_path: String, limit: Option<usize>) -> Result<Vec<GitGraphNode>, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path repo tidak ditemukan".into());
    }
    let max = limit.unwrap_or(100);
    let mut cmd = std::process::Command::new("git");
    // Format: %x1f separates fields, %x1e separates records
    // Fields: Hash, Parents, AuthorName, AuthorEmail, CommitDate, RelativeTime, Subject, Body, RefNames
    cmd.arg("log")
        .arg("--all")
        .arg("--topo-order")
        .arg(format!("-n{}", max))
        .arg("--pretty=format:%H%x1f%P%x1f%an%x1f%ae%x1f%ci%x1f%cr%x1f%s%x1f%b%x1f%D%x1e")
        .current_dir(root);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(Vec::new());
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    let mut nodes = Vec::new();

    for record in raw.split('\x1e') {
        let trimmed = record.trim();
        if trimmed.is_empty() {
            continue;
        }
        let fields: Vec<&str> = trimmed.split('\x1f').collect();
        if fields.len() >= 9 {
            let hash = fields[0].trim().to_string();
            if hash.is_empty() {
                continue;
            }
            let short_hash = if hash.len() >= 7 { hash[..7].to_string() } else { hash.clone() };
            let parents: Vec<String> = fields[1]
                .split_whitespace()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect();
            let author = fields[2].to_string();
            let author_email = fields[3].to_string();
            let date = fields[4].to_string();
            let relative_time = fields[5].to_string();
            let subject = fields[6].to_string();
            let body = fields[7].trim().to_string();
            
            let refs: Vec<String> = if !fields[8].trim().is_empty() {
                fields[8]
                    .split(',')
                    .map(|r| r.trim().to_string())
                    .filter(|r| !r.is_empty())
                    .collect()
            } else {
                Vec::new()
            };

            nodes.push(GitGraphNode {
                hash,
                short_hash,
                parents,
                author,
                author_email,
                date,
                relative_time,
                subject,
                body,
                refs,
            });
        }
    }

    Ok(nodes)
}

#[tauri::command]
fn git_get_commit_detail(repo_path: String, commit_hash: String) -> Result<GitCommitDetail, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path repo tidak ditemukan".into());
    }

    // 1. Get commit info
    let mut info_cmd = std::process::Command::new("git");
    info_cmd.arg("show")
        .arg("-s")
        .arg("--pretty=format:%H%x1f%P%x1f%an%x1f%ae%x1f%ci%x1f%cr%x1f%s%x1f%b%x1f%D")
        .arg(&commit_hash)
        .current_dir(root);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        info_cmd.creation_flags(0x08000000);
    }

    let info_output = info_cmd.output().map_err(|e| e.to_string())?;
    if !info_output.status.success() {
        return Err("Gagal membaca detail commit".into());
    }

    let raw_info = String::from_utf8_lossy(&info_output.stdout);
    let fields: Vec<&str> = raw_info.split('\x1f').collect();
    if fields.len() < 9 {
        return Err("Format commit detail tidak sesuai".into());
    }

    let hash = fields[0].trim().to_string();
    let short_hash = if hash.len() >= 7 { hash[..7].to_string() } else { hash.clone() };
    let parents: Vec<String> = fields[1].split_whitespace().map(|s| s.to_string()).collect();
    let author = fields[2].to_string();
    let author_email = fields[3].to_string();
    let date = fields[4].to_string();
    let relative_time = fields[5].to_string();
    let subject = fields[6].to_string();
    let body = fields[7].trim().to_string();
    let refs: Vec<String> = if !fields[8].trim().is_empty() {
        fields[8].split(',').map(|r| r.trim().to_string()).collect()
    } else {
        Vec::new()
    };

    // 2. Get files diff with numstat
    let mut stat_cmd = std::process::Command::new("git");
    stat_cmd.arg("show")
        .arg("--numstat")
        .arg("--format=")
        .arg(&commit_hash)
        .current_dir(root);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        stat_cmd.creation_flags(0x08000000);
    }

    let mut files = Vec::new();
    if let Ok(stat_output) = stat_cmd.output() {
        if stat_output.status.success() {
            let stat_str = String::from_utf8_lossy(&stat_output.stdout);
            for line in stat_str.lines() {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 3 {
                    let insertions = parts[0].parse::<usize>().unwrap_or(0);
                    let deletions = parts[1].parse::<usize>().unwrap_or(0);
                    let raw_path = parts[2].trim();
                    let (status, path, old_path) = if raw_path.contains(" => ") {
                        ("renamed".to_string(), raw_path.to_string(), None)
                    } else if insertions > 0 && deletions == 0 {
                        ("added".to_string(), raw_path.to_string(), None)
                    } else if insertions == 0 && deletions > 0 {
                        ("deleted".to_string(), raw_path.to_string(), None)
                    } else {
                        ("modified".to_string(), raw_path.to_string(), None)
                    };

                    files.push(GitCommitDiffFile {
                        path,
                        status,
                        old_path,
                        insertions,
                        deletions,
                    });
                }
            }
        }
    }

    Ok(GitCommitDetail {
        hash,
        short_hash,
        parents,
        author,
        author_email,
        date,
        relative_time,
        subject,
        body,
        refs,
        files,
    })
}

#[tauri::command]
fn git_checkout_commit(repo_path: String, target: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    let mut cmd = std::process::Command::new("git");
    cmd.arg("checkout").arg(&target).current_dir(root);
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
fn git_revert_commit(repo_path: String, commit_hash: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    let mut cmd = std::process::Command::new("git");
    // Revert commit safely without opening editor
    cmd.arg("revert").arg("--no-edit").arg(&commit_hash).current_dir(root);
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
fn git_get_commit_file_diff(
    repo_path: String,
    commit_hash: String,
    file_path: String,
    old_path: Option<String>,
) -> Result<GitFileDiffContent, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path repo tidak ditemukan".into());
    }

    const MAX_BYTES: usize = 2 * 1024 * 1024;

    // Parent pertama commit (merge commit -> main line). Root commit -> None.
    let parent = {
        let mut cmd = std::process::Command::new("git");
        cmd.arg("rev-parse")
            .arg("--verify")
            .arg("--quiet")
            .arg(format!("{}^", commit_hash))
            .current_dir(root);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        match cmd.output() {
            Ok(out) if out.status.success() => {
                let hash = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if hash.is_empty() { None } else { Some(hash) }
            }
            _ => None,
        }
    };

    let normalize = |p: &str| p.replace('\\', "/");

    let blob_at = |rev: &str, path: &str| -> Option<Vec<u8>> {
        let mut cmd = std::process::Command::new("git");
        cmd.arg("show")
            .arg(format!("{}:{}", rev, normalize(path)))
            .current_dir(root);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        match cmd.output() {
            Ok(out) if out.status.success() => Some(out.stdout),
            _ => None,
        }
    };

    // Path pada parent: untuk rename pakai old_path, selain itu path yang sama.
    let parent_path = old_path.clone().unwrap_or_else(|| file_path.clone());
    let original_bytes = match &parent {
        Some(rev) => blob_at(rev, &parent_path),
        None => None,
    };
    let modified_bytes = blob_at(&commit_hash, &file_path);

    // File binary tidak bisa ditampilkan sebagai diff teks.
    let is_binary = |bytes: &Option<Vec<u8>>| {
        bytes
            .as_ref()
            .map(|b| b.iter().take(8000).any(|&byte| byte == 0))
            .unwrap_or(false)
    };

    if is_binary(&original_bytes) || is_binary(&modified_bytes) {
        return Ok(GitFileDiffContent {
            path: file_path,
            old_path,
            original: String::new(),
            modified: String::new(),
            is_binary: true,
            is_truncated: false,
        });
    }

    let decode = |bytes: Option<Vec<u8>>| -> (String, bool) {
        match bytes {
            Some(raw) => {
                let truncated = raw.len() > MAX_BYTES;
                let slice = if truncated { &raw[..MAX_BYTES] } else { &raw[..] };
                (String::from_utf8_lossy(slice).to_string(), truncated)
            }
            None => (String::new(), false),
        }
    };

    let (original, original_truncated) = decode(original_bytes);
    let (modified, modified_truncated) = decode(modified_bytes);

    Ok(GitFileDiffContent {
        path: file_path,
        old_path,
        original,
        modified,
        is_binary: false,
        is_truncated: original_truncated || modified_truncated,
    })
}

#[tauri::command]
fn git_reset_to_commit(repo_path: String, commit_hash: String, mode: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    let mut cmd = std::process::Command::new("git");
    let flag = match mode.as_str() {
        "hard" => "--hard",
        "soft" => "--soft",
        _ => "--mixed",
    };
    cmd.arg("reset").arg(flag).arg(&commit_hash).current_dir(root);
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
fn git_compare_branches(
    repo_path: String,
    base_branch: String,
    compare_branch: String,
) -> Result<GitBranchCompareResult, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path repo tidak ditemukan".into());
    }

    // 1. Commits Ahead (in compare_branch but not in base_branch: base..compare)
    let mut ahead_cmd = std::process::Command::new("git");
    ahead_cmd.arg("log")
        .arg(format!("{}..{}", base_branch, compare_branch))
        .arg("--pretty=format:%H|%s|%an|%cr")
        .current_dir(root);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        ahead_cmd.creation_flags(0x08000000);
    }

    let mut ahead_commits = Vec::new();
    if let Ok(output) = ahead_cmd.output() {
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                let parts: Vec<&str> = line.splitn(4, '|').collect();
                if parts.len() == 4 {
                    let hash = parts[0].to_string();
                    let short_hash = if hash.len() >= 7 { hash[..7].to_string() } else { hash.clone() };
                    ahead_commits.push(GitCommitItem {
                        hash,
                        short_hash,
                        message: parts[1].to_string(),
                        author: parts[2].to_string(),
                        relative_time: parts[3].to_string(),
                    });
                }
            }
        }
    }

    // 2. Commits Behind (in base_branch but not in compare_branch: compare..base)
    let mut behind_cmd = std::process::Command::new("git");
    behind_cmd.arg("log")
        .arg(format!("{}..{}", compare_branch, base_branch))
        .arg("--pretty=format:%H|%s|%an|%cr")
        .current_dir(root);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        behind_cmd.creation_flags(0x08000000);
    }

    let mut behind_commits = Vec::new();
    if let Ok(output) = behind_cmd.output() {
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                let parts: Vec<&str> = line.splitn(4, '|').collect();
                if parts.len() == 4 {
                    let hash = parts[0].to_string();
                    let short_hash = if hash.len() >= 7 { hash[..7].to_string() } else { hash.clone() };
                    behind_commits.push(GitCommitItem {
                        hash,
                        short_hash,
                        message: parts[1].to_string(),
                        author: parts[2].to_string(),
                        relative_time: parts[3].to_string(),
                    });
                }
            }
        }
    }

    // 3. Changed Files between base and compare
    let mut diff_cmd = std::process::Command::new("git");
    diff_cmd.arg("diff")
        .arg("--numstat")
        .arg(format!("{}...{}", base_branch, compare_branch))
        .current_dir(root);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        diff_cmd.creation_flags(0x08000000);
    }

    let mut changed_files = Vec::new();
    if let Ok(output) = diff_cmd.output() {
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 3 {
                    let insertions = parts[0].parse::<usize>().unwrap_or(0);
                    let deletions = parts[1].parse::<usize>().unwrap_or(0);
                    let raw_path = parts[2].trim();
                    let (status, path, old_path) = if raw_path.contains(" => ") {
                        ("renamed".to_string(), raw_path.to_string(), None)
                    } else if insertions > 0 && deletions == 0 {
                        ("added".to_string(), raw_path.to_string(), None)
                    } else if insertions == 0 && deletions > 0 {
                        ("deleted".to_string(), raw_path.to_string(), None)
                    } else {
                        ("modified".to_string(), raw_path.to_string(), None)
                    };

                    changed_files.push(GitCommitDiffFile {
                        path,
                        status,
                        old_path,
                        insertions,
                        deletions,
                    });
                }
            }
        }
    }

    let ahead_count = ahead_commits.len();
    let behind_count = behind_commits.len();

    Ok(GitBranchCompareResult {
        base_branch,
        compare_branch,
        ahead_count,
        behind_count,
        ahead_commits,
        behind_commits,
        changed_files,
    })
}

#[tauri::command]
fn git_get_file_at_ref(repo_path: String, git_ref: String, rel_path: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    let mut cmd = std::process::Command::new("git");
    let target = format!("{}:{}", git_ref, rel_path.replace('\\', "/"));
    cmd.arg("show").arg(&target).current_dir(root);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(String::new()); // Return empty string if file doesn't exist in that ref (new file)
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn git_merge_branch(repo_path: String, source_branch: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    let mut cmd = std::process::Command::new("git");
    cmd.arg("merge").arg(&source_branch).current_dir(root);

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

#[derive(serde::Serialize)]
struct GitBlameLine {
    commit: String,
    author: String,
    date: String,
    summary: String,
}

#[tauri::command]
fn git_blame_line(repo_path: String, file_path: String, line: usize) -> Result<Option<GitBlameLine>, String> {
    let repo = Path::new(&repo_path);
    if !repo.exists() {
        return Ok(None);
    }
    let mut cmd = std::process::Command::new("git");
    let line_arg = format!("{},{}", line, line);
    cmd.arg("blame")
        .arg("-L")
        .arg(&line_arg)
        .arg("--porcelain")
        .arg(&file_path)
        .current_dir(repo);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = match cmd.output() {
        Ok(o) => o,
        Err(_) => return Ok(None),
    };

    if !output.status.success() {
        return Ok(None);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commit = String::new();
    let mut author = String::new();
    let mut summary = String::new();
    let mut author_time: i64 = 0;

    for (idx, line_str) in stdout.lines().enumerate() {
        if idx == 0 {
            commit = line_str.split_whitespace().next().unwrap_or("").chars().take(8).collect();
        } else if line_str.starts_with("author ") {
            author = line_str.trim_start_matches("author ").to_string();
        } else if line_str.starts_with("author-time ") {
            author_time = line_str.trim_start_matches("author-time ").parse().unwrap_or(0);
        } else if line_str.starts_with("summary ") {
            summary = line_str.trim_start_matches("summary ").to_string();
        }
    }

    let date = if author_time > 0 {
        use std::time::{SystemTime, UNIX_EPOCH};
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let diff = now.saturating_sub(author_time);
        if diff < 60 {
            "baru saja".into()
        } else if diff < 3600 {
            format!("{}m lalu", diff / 60)
        } else if diff < 86400 {
            format!("{}j lalu", diff / 3600)
        } else if diff < 86400 * 30 {
            format!("{}h lalu", diff / 86400)
        } else if diff < 86400 * 365 {
            format!("{}bln lalu", diff / (86400 * 30))
        } else {
            format!("{}th lalu", diff / (86400 * 365))
        }
    } else {
        String::new()
    };

    if commit.is_empty() || commit.starts_with("0000000") {
        return Ok(Some(GitBlameLine {
            commit: "uncommitted".into(),
            author: "You".into(),
            date: "now".into(),
            summary: "Perubahan belum di-commit".into(),
        }));
    }

    Ok(Some(GitBlameLine {
        commit,
        author,
        date,
        summary,
    }))
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
fn open_path_default(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("Path tidak ditemukan".into());
    }

    #[cfg(windows)]
    {
        let win_path = path.replace('/', "\\");
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &win_path])
            .spawn()
            .map_err(|e| format!("Gagal membuka file: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Gagal membuka file: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Gagal membuka file: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
fn get_listening_ports() -> Result<Vec<ListeningPortInfo>, String> {
    let mut ports = Vec::new();

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("netstat");
        cmd.arg("-ano");
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                let mut raw_items = Vec::new();
                let mut pids = Vec::new();

                for line in text.lines() {
                    let trimmed = line.trim();
                    if !trimmed.starts_with("TCP") {
                        continue;
                    }
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    // TCP | Local Address | Foreign Address | State | PID
                    if parts.len() >= 5 && parts[3].eq_ignore_ascii_case("LISTENING") {
                        let local_addr = parts[1];
                        if let Some(port_str) = local_addr.split(':').last() {
                            if let Ok(port) = port_str.parse::<u16>() {
                                if let Ok(pid) = parts[4].parse::<u32>() {
                                    if !raw_items.iter().any(|(p, pid_val, _)| *p == port && *pid_val == pid) {
                                        raw_items.push((port, pid, local_addr.to_string()));
                                        pids.push(sysinfo::Pid::from_u32(pid));
                                    }
                                }
                            }
                        }
                    }
                }

                // Refresh HANYA proses yang sedang mendengarkan port TCP
                let mut sys = sysinfo::System::new();
                if !pids.is_empty() {
                    sys.refresh_processes_specifics(
                        sysinfo::ProcessesToUpdate::Some(&pids),
                        true,
                        sysinfo::ProcessRefreshKind::nothing().with_exe(sysinfo::UpdateKind::OnlyIfNotSet),
                    );
                }

                for (port, pid, local_addr) in raw_items {
                    let proc_pid = sysinfo::Pid::from_u32(pid);
                    let process_name = sys.process(proc_pid)
                        .map(|p| p.name().to_string_lossy().to_string())
                        .unwrap_or_else(|| "Unknown".to_string());

                    ports.push(ListeningPortInfo {
                        protocol: "TCP".to_string(),
                        local_address: local_addr,
                        port,
                        pid,
                        process_name,
                    });
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        let mut cmd = std::process::Command::new("lsof");
        cmd.arg("-iTCP").arg("-sTCP:LISTEN").arg("-n").arg("-P");
        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines().skip(1) {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 9 {
                        let proc_name = parts[0].to_string();
                        let pid = parts[1].parse::<u32>().unwrap_or(0);
                        let name_col = parts[8];
                        if let Some(port_str) = name_col.split(':').last() {
                            if let Ok(port) = port_str.parse::<u16>() {
                                ports.push(ListeningPortInfo {
                                    protocol: "TCP".to_string(),
                                    local_address: name_col.to_string(),
                                    port,
                                    pid,
                                    process_name: proc_name,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    ports.sort_by_key(|p| p.port);
    Ok(ports)
}

#[tauri::command]
fn kill_process_by_pid(pid: u32, tree: Option<bool>) -> Result<(), String> {
    // tree = true memakai /T agar seluruh process tree (node/vite/cargo) ikut mati,
    // bukan hanya parent-nya. Port pun langsung lepas tanpa sisa proses yatim.
    let kill_tree = tree.unwrap_or(true);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("taskkill");
        cmd.arg("/F");
        if kill_tree {
            cmd.arg("/T");
        }
        cmd.arg("/PID").arg(pid.to_string());
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let output = cmd.output().map_err(|e| e.to_string())?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(if err.trim().is_empty() { "Gagal mematikan proses".to_string() } else { err });
        }
        Ok(())
    }

    #[cfg(not(windows))]
    {
        let mut cmd = std::process::Command::new("kill");
        cmd.arg("-9").arg(pid.to_string());
        let output = cmd.output().map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err("Gagal mematikan proses".to_string());
        }
        Ok(())
    }
}

// ===== WSL =====
fn list_wsl_distros() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("wsl.exe");
        cmd.args(["-l", "-q"]);
        cmd.creation_flags(0x08000000);

        if let Ok(output) = cmd.output() {
            let bytes = output.stdout;
            // wsl.exe menulis UTF-16LE ke pipe; fallback ke UTF-8 bila tidak ada byte null.
            let text = if bytes.contains(&0) {
                let utf16: Vec<u16> = bytes
                    .chunks_exact(2)
                    .map(|c| u16::from_le_bytes([c[0], c[1]]))
                    .collect();
                String::from_utf16_lossy(&utf16)
            } else {
                String::from_utf8_lossy(&bytes).to_string()
            };

            return text
                .lines()
                .map(|l| l.trim().trim_start_matches('\u{feff}').trim())
                .filter(|l| !l.is_empty() && *l != "Windows Subsystem for Linux")
                .map(|l| l.to_string())
                .collect();
        }
        Vec::new()
    }

    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
}

#[tauri::command]
fn get_wsl_distros() -> Vec<ShellInfo> {
    list_wsl_distros()
        .into_iter()
        .map(|d| ShellInfo {
            name: format!("WSL: {}", d),
            path: format!("wsl.exe -d {}", d),
            icon: "linux".into(),
        })
        .collect()
}

// ===== Task Runner =====
#[derive(serde::Serialize, Clone, Debug)]
struct TaskDefinition {
    label: String,
    command: String,
    source: String,
    is_watch: bool,
}

fn task_is_watch(label: &str) -> bool {
    let lower = label.to_lowercase();
    ["watch", "dev", "serve", "start", "tauri", "nodemon"].iter().any(|k| lower.contains(k))
}

#[tauri::command]
fn discover_tasks(root_path: String) -> Vec<TaskDefinition> {
    let root = Path::new(&root_path);
    if !root.exists() || !root.is_dir() {
        return Vec::new();
    }

    let mut tasks: Vec<TaskDefinition> = Vec::new();

    // package.json scripts
    let pkg_path = root.join("package.json");
    if let Ok(raw) = std::fs::read_to_string(&pkg_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(scripts) = json.get("scripts").and_then(|s| s.as_object()) {
                let pkg_name = json
                    .get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("package");
                for (name, _) in scripts {
                    tasks.push(TaskDefinition {
                        label: name.clone(),
                        command: format!("npm run {}", name),
                        source: pkg_name.to_string(),
                        is_watch: task_is_watch(name),
                    });
                }
            }
        }
    }

    // Makefile targets (sebelum "." dan tanpa indentasi)
    let makefile = root.join("Makefile");
    let makefile_alt = root.join("makefile");
    let make_path = if makefile.exists() { Some(makefile) } else if makefile_alt.exists() { Some(makefile_alt) } else { None };
    if let Some(path) = make_path {
        if let Ok(content) = std::fs::read_to_string(&path) {
            for line in content.lines() {
                if line.starts_with('\t') || line.trim().is_empty() || line.trim_start().starts_with('#') {
                    continue;
                }
                if line.starts_with('.') || line.contains('=') && !line.contains(':') {
                    continue;
                }
                if let Some(colon) = line.find(':') {
                    let name = line[..colon].trim();
                    if name.is_empty() || name.contains(' ') && !name.contains('/') {
                        continue;
                    }
                    if name == "PHONY" || name == "DEFAULT" {
                        continue;
                    }
                    tasks.push(TaskDefinition {
                        label: name.to_string(),
                        command: format!("make {}", name),
                        source: "Makefile".into(),
                        is_watch: task_is_watch(name),
                    });
                }
            }
        }
    }

    // justfile recipes
    let just_path = root.join("justfile");
    if just_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&just_path) {
            for line in content.lines() {
                if line.starts_with(' ') || line.starts_with('\t') || line.trim_start().starts_with('#') {
                    continue;
                }
                let trimmed = line.trim();
                if let Some(colon) = trimmed.find(':') {
                    let name = trimmed[..colon].trim();
                    if name.is_empty() || name == "set" || name == "export" || name == "alias" {
                        continue;
                    }
                    // Abaikan blok variabel (baris pertama "nama = value" tanpa recipe command)
                    if line.contains('=') && !trimmed.starts_with('[') {
                        continue;
                    }
                    tasks.push(TaskDefinition {
                        label: name.to_string(),
                        command: format!("just {}", name),
                        source: "justfile".into(),
                        is_watch: task_is_watch(name),
                    });
                }
            }
        }
    }

    tasks
}

// ===== Utilitas Git =====
fn run_git_output(root: &Path, args: &[&str]) -> Result<String, String> {
    let mut cmd = std::process::Command::new("git");
    cmd.args(args).current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().map_err(|e| format!("Git error: {}", e))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let out = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if err.is_empty() {
            if out.is_empty() { format!("git {} gagal", args.join(" ")) } else { out }
        } else {
            err
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[derive(serde::Serialize, Clone, Debug)]
struct GitAheadBehind {
    ahead: u32,
    behind: u32,
    upstream: String,
    has_upstream: bool,
}

#[tauri::command]
fn git_fetch(repo_path: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    run_git_output(root, &["fetch", "--all", "--prune"])
}

#[tauri::command]
fn git_ahead_behind(repo_path: String) -> Result<GitAheadBehind, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    let upstream = run_git_output(root, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
        .unwrap_or_default();

    if upstream.is_empty() {
        return Ok(GitAheadBehind { ahead: 0, behind: 0, upstream: String::new(), has_upstream: false });
    }

    let counts = run_git_output(root, &["rev-list", "--left-right", "--count", &format!("HEAD...{}", upstream)])
        .unwrap_or_default();
    let mut parts = counts.split_whitespace();
    let ahead = parts.next().and_then(|v| v.parse::<u32>().ok()).unwrap_or(0);
    let behind = parts.next().and_then(|v| v.parse::<u32>().ok()).unwrap_or(0);

    Ok(GitAheadBehind { ahead, behind, upstream, has_upstream: true })
}

#[derive(serde::Serialize, Clone, Debug)]
struct GitStashEntry {
    index: u32,
    selector: String,
    message: String,
    branch: String,
    date: String,
}

#[tauri::command]
fn git_stash_list(repo_path: String) -> Result<Vec<GitStashEntry>, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    let raw = run_git_output(root, &["stash", "list", "--format=%gd%x1f%gs%x1f%cr"])?;
    if raw.is_empty() {
        return Ok(Vec::new());
    }

    Ok(raw
        .lines()
        .filter_map(|line| {
            let mut cols = line.split('\u{1f}');
            let selector = cols.next()?.trim().to_string();
            let message = cols.next().unwrap_or("").to_string();
            let date = cols.next().unwrap_or("").trim().to_string();
            // "On main: pesan" -> branch "main"
            let branch = message
                .strip_prefix("On ")
                .and_then(|rest| rest.split(':').next())
                .unwrap_or("")
                .trim()
                .to_string();
            let index: u32 = selector.trim_start_matches("stash@{").trim_end_matches('}').parse().unwrap_or(0);
            Some(GitStashEntry { index, selector, message, branch, date })
        })
        .collect())
}

#[tauri::command]
fn git_stash_save(repo_path: String, message: Option<String>) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    match message {
        Some(msg) if !msg.trim().is_empty() => run_git_output(root, &["stash", "push", "-m", msg.trim()]),
        _ => run_git_output(root, &["stash", "push"]),
    }
}

#[tauri::command]
fn git_stash_apply(repo_path: String, selector: String, pop: Option<bool>) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    let args = if pop.unwrap_or(false) {
        vec!["stash", "pop", selector.as_str()]
    } else {
        vec!["stash", "apply", selector.as_str()]
    };
    run_git_output(root, &args)
}

#[tauri::command]
fn git_stash_drop(repo_path: String, selector: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    run_git_output(root, &["stash", "drop", selector.as_str()])
}

#[tauri::command]
fn git_stash_show(repo_path: String, selector: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    run_git_output(root, &["stash", "show", "-p", selector.as_str()])
}

#[tauri::command]
fn git_amend(repo_path: String, message: Option<String>) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    match message {
        Some(msg) if !msg.trim().is_empty() => run_git_output(root, &["commit", "--amend", "-m", msg.trim()]),
        _ => run_git_output(root, &["commit", "--amend", "--no-edit"]),
    }
}

#[tauri::command]
fn git_cherry_pick(repo_path: String, commit_hash: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    run_git_output(root, &["cherry-pick", commit_hash.trim()])
}

#[tauri::command]
fn git_get_tags(repo_path: String) -> Result<Vec<String>, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    let raw = run_git_output(root, &["tag", "--sort=-creatordate"])?;
    Ok(raw.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct GitWorktreeEntry {
    pub path: String,
    pub head: String,
    pub branch: String,
    pub is_main: bool,
    pub is_locked: bool,
    pub lock_reason: Option<String>,
    pub is_prunable: bool,
}

#[tauri::command]
fn git_worktree_list(repo_path: String) -> Result<Vec<GitWorktreeEntry>, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    let raw = run_git_output(root, &["worktree", "list", "--porcelain"])?;
    let mut entries = Vec::new();
    let mut current_path = String::new();
    let mut current_head = String::new();
    let mut current_branch = String::new();
    let mut current_locked = false;
    let mut current_lock_reason = None;
    let mut current_prunable = false;

    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            if !current_path.is_empty() {
                entries.push(GitWorktreeEntry {
                    path: current_path.clone(),
                    head: current_head.clone(),
                    branch: current_branch.clone(),
                    is_main: entries.is_empty(),
                    is_locked: current_locked,
                    lock_reason: current_lock_reason.clone(),
                    is_prunable: current_prunable,
                });
                current_path.clear();
                current_head.clear();
                current_branch.clear();
                current_locked = false;
                current_lock_reason = None;
                current_prunable = false;
            }
            continue;
        }

        if let Some(p) = line.strip_prefix("worktree ") {
            current_path = p.trim().to_string();
        } else if let Some(h) = line.strip_prefix("HEAD ") {
            current_head = h.trim().to_string();
        } else if let Some(b) = line.strip_prefix("branch refs/heads/") {
            current_branch = b.trim().to_string();
        } else if let Some(b) = line.strip_prefix("branch ") {
            current_branch = b.trim().to_string();
        } else if line == "detached" {
            current_branch = "HEAD (detached)".to_string();
        } else if line.starts_with("locked") {
            current_locked = true;
            let reason = line.strip_prefix("locked").unwrap_or("").trim();
            if !reason.is_empty() {
                current_lock_reason = Some(reason.to_string());
            }
        } else if line.starts_with("prunable") {
            current_prunable = true;
        }
    }

    if !current_path.is_empty() {
        entries.push(GitWorktreeEntry {
            path: current_path,
            head: current_head,
            branch: current_branch,
            is_main: entries.is_empty(),
            is_locked: current_locked,
            lock_reason: current_lock_reason,
            is_prunable: current_prunable,
        });
    }

    Ok(entries)
}

#[tauri::command]
fn git_worktree_add(
    repo_path: String,
    path: String,
    branch: String,
    new_branch: bool,
) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path repo tidak ditemukan".into());
    }
    let target_path = path.trim();
    let target_branch = branch.trim();
    if target_path.is_empty() {
        return Err("Path folder worktree tidak boleh kosong".into());
    }
    if target_branch.is_empty() {
        return Err("Branch tidak boleh kosong".into());
    }
    if new_branch {
        run_git_output(root, &["worktree", "add", "-b", target_branch, target_path])
    } else {
        run_git_output(root, &["worktree", "add", target_path, target_branch])
    }
}

#[tauri::command]
fn git_worktree_remove(repo_path: String, worktree_path: String, force: bool) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path repo tidak ditemukan".into());
    }
    if force {
        run_git_output(root, &["worktree", "remove", "--force", worktree_path.trim()])
    } else {
        run_git_output(root, &["worktree", "remove", worktree_path.trim()])
    }
}

#[tauri::command]
fn git_create_tag(repo_path: String, tag_name: String, message: Option<String>) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    let name = tag_name.trim();
    if name.is_empty() {
        return Err("Nama tag tidak boleh kosong".into());
    }
    match message {
        Some(msg) if !msg.trim().is_empty() => run_git_output(root, &["tag", "-a", name, "-m", msg.trim()]),
        _ => run_git_output(root, &["tag", name]),
    }
}

// ===== Utilitas GitHub CLI & Remote =====
fn run_gh_output(root: &Path, args: &[&str]) -> Result<String, String> {
    let mut cmd = std::process::Command::new("gh");
    cmd.args(args).current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().map_err(|e| format!("GH CLI error: {}", e))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let out = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if err.is_empty() {
            if out.is_empty() { format!("gh {} gagal", args.join(" ")) } else { out }
        } else {
            err
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
fn git_get_remote_url(repo_path: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    run_git_output(root, &["config", "--get", "remote.origin.url"])
        .or_else(|_| run_git_output(root, &["remote", "get-url", "origin"]))
}

#[tauri::command]
fn gh_is_available() -> bool {
    let mut cmd = std::process::Command::new("gh");
    cmd.arg("--version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.output().map(|o| o.status.success()).unwrap_or(false)
}

#[tauri::command]
fn gh_run_list(repo_path: String, branch: Option<String>, limit: Option<usize>) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    let limit_str = limit.unwrap_or(20).to_string();
    let mut args = vec![
        "run", "list",
        "--json", "databaseId,name,headBranch,headSha,status,conclusion,event,createdAt,updatedAt,url,number,workflowName,displayTitle",
        "-L", &limit_str,
    ];
    let branch_str;
    if let Some(b) = &branch {
        if !b.trim().is_empty() {
            branch_str = b.trim();
            args.push("-b");
            args.push(branch_str);
        }
    }
    run_gh_output(root, &args)
}

#[tauri::command]
fn gh_run_view_jobs(repo_path: String, run_id: u64) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    let id_str = run_id.to_string();
    run_gh_output(root, &["run", "view", &id_str, "--json", "jobs"])
}

#[tauri::command]
fn gh_run_rerun(repo_path: String, run_id: u64) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    let id_str = run_id.to_string();
    run_gh_output(root, &["run", "rerun", &id_str])
}

#[tauri::command]
fn gh_run_cancel(repo_path: String, run_id: u64) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    let id_str = run_id.to_string();
    run_gh_output(root, &["run", "cancel", &id_str])
}

#[tauri::command]
fn gh_workflow_run(repo_path: String, workflow: String, branch: Option<String>) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    let mut args = vec!["workflow", "run", workflow.trim()];
    let branch_str;
    if let Some(b) = &branch {
        if !b.trim().is_empty() {
            branch_str = b.trim();
            args.push("--ref");
            args.push(branch_str);
        }
    }
    run_gh_output(root, &args)
}

// ===== Utilitas GitLab CLI =====
fn run_glab_output(root: &Path, args: &[&str]) -> Result<String, String> {
    let mut cmd = std::process::Command::new("glab");
    cmd.args(args).current_dir(root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().map_err(|e| format!("GLab CLI error: {}", e))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let out = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if err.is_empty() {
            if out.is_empty() { format!("glab {} gagal", args.join(" ")) } else { out }
        } else {
            err
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
fn glab_is_available() -> bool {
    let mut cmd = std::process::Command::new("glab");
    cmd.arg("--version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.output().map(|o| o.status.success()).unwrap_or(false)
}

#[tauri::command]
fn glab_pipeline_list(repo_path: String, limit: Option<usize>) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    let limit_str = limit.unwrap_or(20).to_string();
    run_glab_output(root, &["pipeline", "list", "--output", "json", "-p", "1", "-P", &limit_str])
}

#[tauri::command]
fn glab_pipeline_view(repo_path: String, pipeline_id: u64) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    let id_str = pipeline_id.to_string();
    run_glab_output(root, &["ci", "view", &id_str, "--output", "json"])
}

#[tauri::command]
fn glab_pipeline_retry(repo_path: String, pipeline_id: u64) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    let id_str = pipeline_id.to_string();
    run_glab_output(root, &["ci", "retry", &id_str])
}

#[tauri::command]
fn glab_pipeline_cancel(repo_path: String, pipeline_id: u64) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.exists() {
        return Err("Path tidak ditemukan".into());
    }
    let id_str = pipeline_id.to_string();
    run_glab_output(root, &["ci", "cancel", &id_str])
}

#[tauri::command]
fn git_get_credential_token(host: String) -> Result<String, String> {
    use std::io::Write;
    let mut cmd = std::process::Command::new("git");
    cmd.args(&["credential", "fill"]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::null());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    if let Some(mut stdin) = child.stdin.take() {
        let input = format!("protocol=https\nhost={}\n\n", host.trim());
        let _ = stdin.write_all(input.as_bytes());
    }

    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("Gagal mengambil credential dari git".into());
    }

    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if let Some(token) = line.strip_prefix("password=") {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }
    Err("Password tidak ditemukan di credential helper".into())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err("URL tidak valid".into());
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("cmd");
        cmd.args(["/C", "start", "", trimmed]);
        cmd.creation_flags(0x08000000);
        cmd.spawn().map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[tauri::command]
fn copy_to_clipboard(text: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if clipboard_win::set_clipboard_string(&text).is_ok() {
            return Ok(());
        }
    }
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
fn is_blank_startup() -> bool {
    std::env::args().any(|arg| arg == "--blank")
}

#[tauri::command]
fn open_new_window(blank: Option<bool>) -> Result<(), String> {
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut cmd = std::process::Command::new(current_exe);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000 | 0x00000200); // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
    }
    if blank.unwrap_or(false) {
        cmd.arg("--blank");
    }
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_start_dragging(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
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

#[cfg(windows)]
fn setup_taskbar_jumplist() {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::{Interface, GUID, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::Common::{IObjectArray, IObjectCollection};
    use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
    use windows::Win32::UI::Shell::{
        DestinationList, EnumerableObjectCollection, ICustomDestinationList,
        IShellLinkW, SetCurrentProcessExplicitAppUserModelID, ShellLink,
    };

    let _ = unsafe {
        let app_id: Vec<u16> = OsStr::new("com.mytermin.workspace")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let _ = SetCurrentProcessExplicitAppUserModelID(PCWSTR(app_id.as_ptr()));
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        let custom_list: ICustomDestinationList = match CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER) {
            Ok(cl) => cl,
            Err(_) => return,
        };

        let mut max_slots: u32 = 0;
        let _removed: windows::core::Result<IObjectArray> = custom_list.BeginList(&mut max_slots);

        let exe_path = match std::env::current_exe() {
            Ok(p) => p,
            Err(_) => return,
        };
        let exe_str: Vec<u16> = exe_path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();

        // Task 1: New Blank Window
        let link_blank: IShellLinkW = match CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER) {
            Ok(l) => l,
            Err(_) => return,
        };
        let _ = link_blank.SetPath(PCWSTR(exe_str.as_ptr()));
        let args_blank: Vec<u16> = OsStr::new("--blank").encode_wide().chain(std::iter::once(0)).collect();
        let _ = link_blank.SetArguments(PCWSTR(args_blank.as_ptr()));
        let desc_blank: Vec<u16> = OsStr::new("Buka instance baru dengan workspace kosong").encode_wide().chain(std::iter::once(0)).collect();
        let _ = link_blank.SetDescription(PCWSTR(desc_blank.as_ptr()));

        // Set Title Property on IShellLink (PKEY_Title: {F29F85E0-4FF9-1068-AB91-08002B27B3D9}, 2)
        if let Ok(prop_store) = link_blank.cast::<IPropertyStore>() {
            use windows::Win32::UI::Shell::PropertiesSystem::PROPERTYKEY;
            let key = PROPERTYKEY {
                fmtid: GUID::from_u128(0xF29F85E0_4FF9_1068_AB91_08002B27B3D9),
                pid: 2,
            };
            let title_wide: Vec<u16> = OsStr::new("New Blank Window").encode_wide().chain(std::iter::once(0)).collect();
            if let Ok(pv) = windows::Win32::System::Com::StructuredStorage::InitPropVariantFromStringVector(
                Some(&[PCWSTR(title_wide.as_ptr())]),
            ) {
                let _ = prop_store.SetValue(&key, &pv);
                let _ = prop_store.Commit();
            }
        }

        // Add to Tasks category via IObjectCollection
        if let Ok(task_collection) = CoCreateInstance::<_, IObjectCollection>(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER) {
            let _ = task_collection.AddObject(&link_blank);
            if let Ok(obj_array) = task_collection.cast::<IObjectArray>() {
                let _ = custom_list.AddUserTasks(&obj_array);
            }
        }

        let _ = custom_list.CommitList();
    };
}

fn main() {
    #[cfg(windows)]
    setup_taskbar_jumplist();

    tauri::Builder::default()
        .setup(|app| {
            let show_i = MenuItem::with_id(app, "show", "Buka MyTermin", true, None::<&str>)?;
            let hide_i = MenuItem::with_id(app, "hide", "Sembunyikan ke Tray", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Keluar", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &hide_i, &quit_i])?;

            if let Some(icon) = app.default_window_icon() {
                let _ = TrayIconBuilder::new()
                    .icon(icon.clone())
                    .tooltip("MyTermin - Workspace")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                        "quit" => {
                            if let Some(pty) = app.try_state::<PtyManager>() {
                                pty.kill_all();
                            }
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                if let Ok(is_visible) = window.is_visible() {
                                    if is_visible {
                                        let _ = window.hide();
                                    } else {
                                        let _ = window.show();
                                        let _ = window.unminimize();
                                        let _ = window.set_focus();
                                    }
                                }
                            }
                        }
                    })
                    .build(app);
            }
            Ok(())
        })
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
            get_wsl_distros,
            discover_tasks,
            open_url,
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
            git_get_graph,
            git_get_commit_detail,
            git_checkout_commit,
            git_revert_commit,
            git_reset_to_commit,
            git_get_commit_file_diff,
            git_compare_branches,
            git_get_file_at_ref,
            git_merge_branch,
            git_fetch,
            git_ahead_behind,
            git_stash_list,
            git_stash_save,
            git_stash_apply,
            git_stash_drop,
            git_stash_show,
            git_amend,
            git_cherry_pick,
            git_get_tags,
            git_create_tag,
            git_get_remote_url,
            gh_is_available,
            gh_run_list,
            gh_run_view_jobs,
            gh_run_rerun,
            gh_run_cancel,
            gh_workflow_run,
            glab_is_available,
            glab_pipeline_list,
            glab_pipeline_view,
            glab_pipeline_retry,
            glab_pipeline_cancel,
            git_get_credential_token,
            git_worktree_list,
            git_worktree_add,
            git_worktree_remove,
            get_listening_ports,
            kill_process_by_pid,
            git_commit,
            git_blame_line,
            search_in_files,
            replace_in_files,
            reveal_in_explorer,
            open_path_default,
            is_blank_startup,
            open_new_window,
            window_minimize,
            window_start_dragging,
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
