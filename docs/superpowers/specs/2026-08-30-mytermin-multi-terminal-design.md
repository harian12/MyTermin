# Spesifikasi Desain: MyTermin - Multi-Terminal Desktop App (Nuxt 4 + Tauri v2)

**Tanggal**: 2026-08-30  
**Status**: Disetujui  
**Target Platform**: Windows 10/11 (x64)

---

## 1. Ringkasan Proyek
Aplikasi desktop Windows multi-terminal berbasis **Nuxt 4** dan **Tauri v2** yang mendukung pembukaan banyak sesi terminal secara paralel (termasuk preset Grid 2x2 4-terminal), dynamic split panel, multi-tab workspace, dan preset launcher otomatis untuk tooling seperti `opencode`, `codex`, dan CLI AI/developer lainnya.

---

## 2. Arsitektur Sistem

```
+-------------------------------------------------------------+
|                     Frontend (Nuxt 4 + Vue 3)               |
|  - Shadcn UI (Radix Vue + Tailwind CSS)                     |
|  - Pinia Store (Tabs, Grid Layouts, Presets, Settings)      |
|  - Terminal Panes (@xterm/xterm + FitAddon + WebLinksAddon) |
|  - Dynamic Resizable Split Panel Tree (Grid 2x2, 1x2, 2x1)   |
+------------------------------+------------------------------+
                               |
                   Tauri IPC (Commands & Events)
                               |
+------------------------------v------------------------------+
|                   Backend (Tauri v2 + Rust)                 |
|  - PtyManager (Arc<Mutex<HashMap<String, PtySession>>>)     |
|  - portable-pty (Windows ConPTY engine)                     |
|  - Background Thread Reader per PTY -> Event Stream Output  |
|  - Process Spawner: PowerShell, CMD, Git Bash, WSL          |
+-------------------------------------------------------------+
```

---

## 3. Komponen Backend (Rust / Tauri v2)

### 3.1 Dependencies Rust
- `tauri = "^2.0"`
- `portable-pty = "0.8"`
- `tokio = { version = "1", features = ["full"] }`
- `serde = { version = "1", features = ["derive"] }`
- `serde_json = "1"`
- `uuid = { version = "1", features = ["v4"] }`

### 3.2 Struktur Data & PtyManager
```rust
pub struct PtySession {
    pub id: String,
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn std::io::Write + Send>,
}

pub struct AppState {
    pub sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}
```

### 3.3 Tauri Commands
- `create_pty(id: String, shell: Option<String>, cwd: Option<String>, cols: u16, rows: u16) -> Result<(), String>`
  - Spawn child process di bawah Windows ConPTY (default: `powershell.exe` atau shell user).
  - Jalankan reader loop di thread terpisah yang mengirim chunk data via `app_handle.emit("pty-data-{id}", data)`.
- `write_pty(id: String, data: String) -> Result<(), String>`
  - Kirim input keystroke/teks dari xterm frontend ke PTY writer buffer.
- `resize_pty(id: String, cols: u16, rows: u16) -> Result<(), String>`
  - Resize ukuran PTY master agar layout ANSI menyesuaikan ukuran viewport.
- `kill_pty(id: String) -> Result<(), String>`
  - Hentikan sesi PTY dan bersihkan resource dari map.
- `get_available_shells() -> Result<Vec<ShellInfo>, String>`
  - Deteksi shell yang terinstall di Windows: PowerShell 7/5.1, Command Prompt, Git Bash, WSL distros.

---

## 4. Komponen Frontend (Nuxt 4 + Shadcn UI)

### 4.1 UI Components (Shadcn-vue)
- **AppHeader / Titlebar**: Custom frameless titlebar dengan logo, Tab bar, Quick Layout switch (Single, 2-Split, 4-Grid), Preset Trigger button, Settings dialog trigger, dan Windows control buttons (minimize, maximize, close).
- **TabBar**: Manajemen multi-tab workspace. Setiap tab memiliki layout independent.
- **LayoutManager**: Renderer dinamis struktur panel (`single`, `split-h`, `split-v`, `grid-2x2`, atau custom nested tree).
- **TerminalPane (`TerminalPane.vue`)**:
  - Inisialisasi `@xterm/xterm`.
  - Pasang addon: `@xterm/addon-fit`, `@xterm/addon-web-links`, `@xterm/addon-search`.
  - Hubungkan listener `listen("pty-data-{id}", ...)` dan handler `onData((d) => invoke("write_pty", ...))`.
  - ResizeObserver yang memicu `fitAddon.fit()` dan `invoke("resize_pty", ...)`.
  - Toolbar mini per pane: Shell indicator, Run command preset button, Clear terminal, Split pane button, Close pane.
- **PresetModal / Dialog**: Konfigurasi dan eksekusi workspace preset (misal: "AI Dev Grid" yang membuka 4 panel: Pane 1: `opencode`, Pane 2: `codex`, Pane 3: `npm run dev`, Pane 4: `git status`).
- **SettingsModal**: Pilihan default shell, font family (JetBrains Mono / Cascadia Code), font size, cursor style, color theme.

### 4.2 State Management (Pinia Store)
- `useWorkspaceStore`:
  - `tabs`: Array dari workspace tab.
  - `activeTabId`: ID tab yang sedang aktif.
  - `presets`: Daftar workspace template siap pakai.
  - Aksi: `addTab`, `removeTab`, `splitPane(direction)`, `applyLayout(type)`, `runPreset(presetId)`.
- `useSettingsStore`:
  - Font size, terminal theme (Dark, Dracula, Tokyo Night, One Dark), default shell, scrollback buffer.

---

## 5. Fitur Utama & Interaksi Pengguna

1. **Preset Grid 2x2 (4 Terminal Sekaligus)**:
   - Satu klik tombol "4-Grid" pada toolbar langsung membagi viewport menjadi 4 kuadran PTY terpisah yang aktif bersamaan.
2. **Multi-Tab**:
   - Pengguna dapat membuat tab baru (`Ctrl+T`), berpindah tab (`Ctrl+Tab` atau `Ctrl+1..9`), dan menutup tab (`Ctrl+W`).
3. **Workspace Presets untuk AI Tools**:
   - Menu dropdown / command palette (`Ctrl+Shift+P`) untuk memilih preset "Opencode + Codex Hub".
   - Otomatis membuat layout 4-grid dan mengirimkan command inisialisasi ke masing-masing pane secara otomatis.
4. **Custom Keybindings**:
   - `Ctrl+Shift+E`: Split horizontal.
   - `Ctrl+Shift+O`: Split vertical.
   - `Ctrl+Shift+G`: Ubah ke Grid 2x2.
   - `Ctrl+Shift+W`: Tutup pane aktif.

---

## 6. Rencana Pengujian & Verifikasi

- **Verifikasi Backend (Rust)**:
  - Unit test `PtyManager` untuk spawn, write, resize, dan kill PTY tanpa memory leak / zombie process.
- **Verifikasi Frontend (Nuxt 4 / Vue)**:
  - Test rendering xterm.js dan koneksi event IPC.
  - Test dynamic resizing saat window di-resize atau panel divider digeser.
  - Test preset grid 2x2 dan multi-tab switching.
- **Verifikasi End-to-End**:
  - Menjalankan perintah interaktif (cth: `opencode`, `codex`, `npm run dev`, interactive CLI prompt) di 4 terminal secara simultan untuk memastikan stream I/O lancar tanpa lag atau output terpotong.
