use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize, Child};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ShellInfo {
    pub name: String,
    pub path: String,
    pub icon: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct PtyStats {
    pub pid: Option<u32>,
    pub process_name: String,
    pub cpu_usage: f32,
    pub memory_mb: f32,
    pub is_running: bool,
    pub child_count: usize,
    pub cwd: Option<String>,
}

pub struct PtySession {
    pub pid: Option<u32>,
    pub child: Box<dyn Child + Send>,
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub cwd: Option<String>,
}

#[derive(Clone, Default)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
    sys: Arc<Mutex<System>>,
}

impl PtyManager {
    pub fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            sys: Arc::new(Mutex::new(sys)),
        }
    }

    pub fn spawn_pty(
        &self,
        app: AppHandle,
        id: String,
        shell: Option<String>,
        cwd: Option<String>,
        cols: u16,
        rows: u16,
    ) -> Result<(), String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open pty: {}", e))?;

        let target_shell = shell.unwrap_or_else(|| {
            if cfg!(target_os = "windows") {
                "powershell.exe".to_string()
            } else {
                "bash".to_string()
            }
        });

        let mut cmd = CommandBuilder::new(&target_shell);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("PYTHONIOENCODING", "utf-8");

        if cfg!(target_os = "windows") {
            let lower = target_shell.to_lowercase();
            if lower.ends_with("powershell.exe") || lower.ends_with("pwsh.exe") || lower == "powershell" || lower == "pwsh" {
                cmd.args(["-NoExit", "-NoLogo", "-Command", "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; [Console]::InputEncoding=[System.Text.Encoding]::UTF8; chcp 65001 > $null"]);
            } else if lower.ends_with("cmd.exe") || lower == "cmd" {
                cmd.args(["/K", "chcp 65001 > nul"]);
            }
        }

        let mut effective_cwd: Option<String> = None;
        if let Some(dir) = cwd {
            let clean_dir = dir.trim_matches('"').trim();
            if !clean_dir.is_empty() && std::path::Path::new(clean_dir).exists() {
                cmd.cwd(clean_dir);
                effective_cwd = Some(clean_dir.to_string());
            }
        }
        if effective_cwd.is_none() {
            effective_cwd = std::env::current_dir().ok().map(|p| p.to_string_lossy().to_string());
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command: {}", e))?;
        
        let pid = child.process_id();

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take writer: {}", e))?;

        let session_id = id.clone();
        let app_handle = app.clone();

        // Background reader thread with UTF-8 byte boundary preservation
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            let mut leftover = Vec::new();
            let event_name = format!("pty-data-{}", session_id);
            loop {
                match reader.read(&mut buf) {
                    Ok(n) if n > 0 => {
                        let combined = if leftover.is_empty() {
                            buf[..n].to_vec()
                        } else {
                            let mut c = std::mem::take(&mut leftover);
                            c.extend_from_slice(&buf[..n]);
                            c
                        };

                        match std::str::from_utf8(&combined) {
                            Ok(valid_str) => {
                                let _ = app_handle.emit(&event_name, valid_str);
                            }
                            Err(e) => {
                                let valid_up_to = e.valid_up_to();
                                if valid_up_to > 0 {
                                    if let Ok(valid_str) = std::str::from_utf8(&combined[..valid_up_to]) {
                                        let _ = app_handle.emit(&event_name, valid_str);
                                    }
                                }
                                if let Some(error_len) = e.error_len() {
                                    // Invalid sequence encountered: drop invalid slice, try next
                                    let remaining_start = valid_up_to + error_len;
                                    if remaining_start < combined.len() {
                                        leftover = combined[remaining_start..].to_vec();
                                    }
                                } else {
                                    // Incomplete sequence at boundary: hold for next chunk
                                    leftover = combined[valid_up_to..].to_vec();
                                }
                            }
                        }
                    }
                    _ => {
                        if !leftover.is_empty() {
                            let data = String::from_utf8_lossy(&leftover).to_string();
                            let _ = app_handle.emit(&event_name, data);
                        }
                        let exit_event = format!("pty-exit-{}", session_id);
                        let _ = app_handle.emit(&exit_event, ());
                        break;
                    }
                }
            }
        });

        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        sessions.insert(
            id,
            PtySession {
                pid,
                child,
                master: pair.master,
                writer,
                cwd: effective_cwd,
            },
        );

        Ok(())
    }

    pub fn write_pty(&self, id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(session) = sessions.get_mut(id) {
            session
                .writer
                .write_all(data.as_bytes())
                .map_err(|e| format!("Write failed: {}", e))?;
            session
                .writer
                .flush()
                .map_err(|e| format!("Flush failed: {}", e))?;
            Ok(())
        } else {
            Err("Session not found".into())
        }
    }

    pub fn resize_pty(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(session) = sessions.get(id) {
            session
                .master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| format!("Resize failed: {}", e))?;
            Ok(())
        } else {
            Err("Session not found".into())
        }
    }

    pub fn kill_pty(&self, id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(mut session) = sessions.remove(id) {
            let _ = session.child.kill();
        }
        Ok(())
    }

    pub fn update_session_cwd(&self, id: &str, cwd: &str) {
        if let Ok(mut sessions) = self.sessions.lock() {
            if let Some(session) = sessions.get_mut(id) {
                let clean = cwd.trim_matches('"').trim();
                if !clean.is_empty() {
                    session.cwd = Some(clean.to_string());
                }
            }
        }
    }

    pub fn get_session_cwd(&self, id: &str) -> Option<String> {
        let mut sessions = self.sessions.lock().ok()?;
        let session = sessions.get_mut(id)?;
        let raw_pid = session.pid;

        if let Some(pid) = raw_pid {
            let parent_sys_pid = Pid::from_u32(pid);
            if let Ok(mut sys) = self.sys.lock() {
                sys.refresh_processes_specifics(
                    ProcessesToUpdate::All,
                    true,
                    ProcessRefreshKind::nothing()
                        .with_exe(UpdateKind::OnlyIfNotSet)
                        .with_cwd(UpdateKind::Always),
                );

                // Cek anak proses terlebih dahulu
                for (_p_id, p_info) in sys.processes() {
                    if let Some(p_parent) = p_info.parent() {
                        if p_parent == parent_sys_pid {
                            if let Some(child_cwd) = p_info.cwd() {
                                let c_str = child_cwd.to_string_lossy().to_string();
                                if !c_str.is_empty() {
                                    session.cwd = Some(c_str.clone());
                                    return Some(c_str);
                                }
                            }
                        }
                    }
                }

                // Cek proses shell utama
                if let Some(proc) = sys.process(parent_sys_pid) {
                    if let Some(c) = proc.cwd() {
                        let path_str = c.to_string_lossy().to_string();
                        if !path_str.is_empty() {
                            session.cwd = Some(path_str.clone());
                            return Some(path_str);
                        }
                    }
                }
            }
        }

        session.cwd.clone()
    }

    pub fn get_all_stats(&self) -> HashMap<String, PtyStats> {
        let mut sessions = match self.sessions.lock() {
            Ok(s) => s,
            Err(_) => return HashMap::new(),
        };

        let mut sys = match self.sys.lock() {
            Ok(s) => s,
            Err(_) => return HashMap::new(),
        };

        sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing()
                .with_memory()
                .with_cpu()
                .with_disk_usage()
                .with_exe(UpdateKind::OnlyIfNotSet)
                .with_cwd(UpdateKind::Always),
        );

        let mut stats_map = HashMap::new();

        for (id, session) in sessions.iter_mut() {
            if let Some(raw_pid) = session.pid {
                let parent_sys_pid = Pid::from_u32(raw_pid);
                let mut total_cpu = 0.0f32;
                let mut total_mem_bytes = 0u64;
                let mut is_running = false;
                let mut main_proc_name = String::new();
                let mut child_count = 0usize;

                let mut detected_cwd: Option<String> = None;

                // Ambil proses utama atau anak proses yang paling aktif
                let mut max_proc_mem = 0u64;
                if let Some(proc) = sys.process(parent_sys_pid) {
                    is_running = true;
                    total_cpu += proc.cpu_usage();
                    max_proc_mem = max_proc_mem.max(proc.memory());
                    main_proc_name = proc.name().to_string_lossy().to_string();
                    if let Some(c) = proc.cwd() {
                        let path_str = c.to_string_lossy().to_string();
                        if !path_str.is_empty() {
                            detected_cwd = Some(path_str);
                        }
                    }
                }

                // Temukan anak proses (misal: node.exe, cargo.exe, opencode.exe yang di-spawn di dalam PowerShell)
                let mut child_mem_sum = 0u64;
                for (_p_id, p_info) in sys.processes() {
                    if let Some(p_parent) = p_info.parent() {
                        if p_parent == parent_sys_pid {
                            child_count += 1;
                            total_cpu += p_info.cpu_usage();
                            child_mem_sum += p_info.memory();
                            let child_name = p_info.name().to_string_lossy().to_string();
                            if !child_name.is_empty() && child_name != "conhost.exe" {
                                main_proc_name = child_name;
                            }
                            if let Some(child_cwd) = p_info.cwd() {
                                let c_str = child_cwd.to_string_lossy().to_string();
                                if !c_str.is_empty() {
                                    detected_cwd = Some(c_str);
                                }
                            }
                        }
                    }
                }

                // Jika ada child process aktif (seperti opencode/node), gunakan memory child process utama
                // agar tidak overcount shared mapped DLLs antara parent dan child
                let effective_mem = if child_count > 0 {
                    child_mem_sum
                } else {
                    max_proc_mem
                };

                let memory_mb = (effective_mem as f32) / (1024.0 * 1024.0);

                if let Some(ref cwd_str) = detected_cwd {
                    session.cwd = Some(cwd_str.clone());
                } else if detected_cwd.is_none() && session.cwd.is_some() {
                    detected_cwd = session.cwd.clone();
                }

                stats_map.insert(
                    id.clone(),
                    PtyStats {
                        pid: Some(raw_pid),
                        process_name: if main_proc_name.is_empty() { "PowerShell".to_string() } else { main_proc_name },
                        cpu_usage: (total_cpu * 10.0).round() / 10.0,
                        memory_mb: (memory_mb * 10.0).round() / 10.0,
                        is_running,
                        child_count,
                        cwd: detected_cwd,
                    },
                );
            } else {
                stats_map.insert(
                    id.clone(),
                    PtyStats {
                        pid: None,
                        process_name: "PowerShell".to_string(),
                        cpu_usage: 0.0,
                        memory_mb: 0.0,
                        is_running: true,
                        child_count: 0,
                        cwd: session.cwd.clone(),
                    },
                );
            }
        }

        stats_map
    }
}
