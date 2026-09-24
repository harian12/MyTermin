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
fn get_listening_ports() -> Result<Vec<ListeningPortInfo>, String> {
    let mut ports = Vec::new();
    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("netstat");
        cmd.arg("-ano");
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
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
                                    // Process name resolution from sysinfo
                                    let proc_pid = sysinfo::Pid::from_u32(pid);
                                    let process_name = sys.process(proc_pid)
                                        .map(|p| p.name().to_string_lossy().to_string())
                                        .unwrap_or_else(|| "Unknown".to_string());

                                    // Deduplicate same port & PID
                                    if !ports.iter().any(|p: &ListeningPortInfo| p.port == port && p.pid == pid) {
                                        ports.push(ListeningPortInfo {
                                            protocol: "TCP".to_string(),
                                            local_address: local_addr.to_string(),
                                            port,
                                            pid,
                                            process_name,
                                        });
                                    }
                                }
                            }
                        }
                    }
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
fn kill_process_by_pid(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("taskkill");
        cmd.arg("/F").arg("/PID").arg(pid.to_string());
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let output = cmd.output().map_err(|e| e.to_string())?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(if err.is_empty() { "Gagal mematikan proses".to_string() } else { err });
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

#[tauri::command]
fn copy_to_clipboard(text: String) -> Result<(), String> {
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
            git_get_graph,
            git_get_commit_detail,
            git_checkout_commit,
            git_revert_commit,
            git_reset_to_commit,
            git_compare_branches,
            git_get_file_at_ref,
            git_merge_branch,
            get_listening_ports,
            kill_process_by_pid,
            git_commit,
            search_in_files,
            replace_in_files,
            reveal_in_explorer,
            is_blank_startup,
            open_new_window,
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
