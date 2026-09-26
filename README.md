# MyTermin 🚀

Aplikasi desktop developer workspace modern untuk Windows yang menggabungkan **Multi-Terminal Workspace** dan **Monaco Code Editor**, dibangun menggunakan **Tauri v2 (Rust `portable-pty`)**, **Nuxt 4**, **Monaco Editor**, dan **xterm.js**. Dirancang untuk workflow developer cepat, AI-assisted coding/CLI, dan multi-tasking tanpa lag.

---

## ✨ Fitur Utama (v0.2.8)

1. **Multi-Workstation Workspace**
   - Bekerja pada beberapa proyek terisolasi secara bersamaan (*isolated folder context*).
   - Tab workstation dinamis di TitleBar dengan dukungan *drag-and-drop reorder*, ganti nama, dan penutupan aman (dengan konfirmasi jika ada proses aktif).
   - Setiap workstation mempertahankan sesi terminal, file editor terbuka, dan konfigurasi layout secara mandiri.

2. **Integrated Monaco Code Editor & Split View**
   - Code editor bertenaga Monaco (seperti VS Code) dengan tema gelap terintegrasi (`mytermin-dark`), minimap, bracket matching, dan code folding.
   - Layout split horizontal & vertikal interaktif antara Code Editor dan Terminal dengan resizer *drag-and-drop*.
   - Auto-format kode otomatis menggunakan **Prettier** terintegrasi (`Shift + Alt + F` atau tombol format).
   - Git Diff Viewer side-by-side untuk memeriksa perubahan kode sebelum commit.
   - Context menu tab lengkap: Simpan, Tutup ke Kanan, Tutup Lainnya, Buka di Explorer, dan Salin Path Relatif.

3. **Project File Explorer & Git Source Control**
   - Sidebar navigasi berkas terintegrasi (`Ctrl + B`) dengan pohon folder, indikator status Git real-time (Modified, Untracked, Deleted), dan aksi cepat file (Buat File/Folder, Rename, Delete).
   - Panel Git terintegrasi: Stage/Unstage berkas, Discard changes, Git commit dengan pesan, Push & Pull, riwayat log commit, dan modal pergantian Git branch.
   - **Stash & Tag Manager**: simpan perubahan sementara, apply/pop/drop stash dengan pratinjau patch, serta buat dan daftar tag.
   - **Fetch + indikator ahead/behind** di header branch, **Amend** commit terakhir, dan **cherry-pick** dari Git Graph.

4. **Pencarian Cepat & Global Search**
   - **Quick File Picker (`Ctrl + P`)**: Cari dan buka berkas proyek secara instan dengan fuzzy search.
   - **Global Search in Files (`Ctrl + Shift + F`)**: Cari teks di seluruh berkas proyek dengan filter regex, match case, dan fitur *Replace All* langsung dari dialog.
   - **Unified Search (`Ctrl + Shift + U`)**: Cari teks di seluruh *scrollback terminal* sekaligus file project, lalu lompat ke baris yang match.
   - **Terminal Buffer Search (`Ctrl + F`)**: Pencarian buffer teks di terminal aktif.

5. **Task Runner Otomatis**
   - Deteksi task dari `package.json` (scripts), `Makefile`, dan `justfile` lalu jalankan sekali klik dari panel Tasks (`Ctrl + Shift + M`).
   - Output task mengalir ke terminal aktif sehingga bisa searched, dan task watch/dev diberi penanda.
   - `Ctrl + Shift + B` menjalankan task utama (build/dev) tanpa memilih.

6. **Shell Integration & Status Terminal**
   - Badge per terminal menampilkan command sedang berjalan / exit code / durasi, plus Git branch aktif.
   - Didukung PowerShell 5.1/7 (PS 5.1 & PS 7) dan Git Bash lewat injeksi prompt, dimatikan lewat `Shell Integration` di Pengaturan.

7. **Notification Rules**
   - Notifikasi OS berbasis aturan: keyword, regex, exit code bukan 0, nama terminal, atau durasi threshold, dengan cooldown anti-spam.
   - Kelola aturan lengkap di **Pengaturan → Sesi & Env**.

8. **Project Config & Env (`.mytermin/project.json`)**
   - Environment variable per project, bisa diisi dari `.env`, diimpor ke terminal baru, dan disimpan sebagai config yang bisa di-commit.
   - Peringatan bila key sensitif belum tercakup `.gitignore`.

9. **Dynamic Terminal Grid Layout & Sliding Viewport**
   - Pilihan layout fleksibel: **Single View**, **2-Split Horizontal**, **2-Split Vertical**, dan **4-Grid (2x2 Quad)**.
   - **Sliding Window Grid**: Tab berlebih tetap aktif di memori dan viewport bergeser otomatis saat navigasi `Ctrl + Tab`.
   - Terminal Font Zoom instan menggunakan `Ctrl + Mouse Wheel` atau `Ctrl + Plus/Minus/0`.

10. **AI CLI Runner (`Ctrl + Shift + I`)**
    - Jalankan OpenCode, Claude Code, Codex, atau perintah kustom di terminal baru dengan konteks yang dipilih (file aktif, selection, status git, working directory).

11. **Keyboard Shortcuts Cheatsheet & Customization**
    - Akses daftar seluruh tombol pintas via **Cheatsheet Modal (`F1` atau `Ctrl + /`)**.
    - Kustomisasi keybinding dengan **perekam shortcut** (tekan tombolnya, bukan mengetik) di menu Pengaturan, lengkap dengan deteksi konflik.

12. **Theme Editor, Diagnostics & Backup**
    - Editor palet ANSI 20 warna + preview langsung, tersimpan lokal dan bisa diekspor.
    - **Pengaturan → Diagnostik**: jumlah error runtime, 50 log terakhir, *copy debug info* untuk bug report, plus export/import seluruh pengaturan.

13. **WSL & Port Manager**
    - Distro WSL terinstall otomatis muncul sebagai pilihan shell, dan path file yang di-drag ke terminal WSL otomatis dikonversi ke `/mnt/<drive>`.
    - Port Manager menjalankan proses (`Open in browser`) dan **kill process tree** (`/T`) agar port benar-benar lepas.

14. **Window State & Session Persistence**
    - Ukuran dan posisi jendela desktop otomatis disimpan dan dipulihkan saat aplikasi dibuka kembali.
    - Auto-restore sesi terminal dan daftar berkas terbuka saat aplikasi restart, plus onboarding sekali jalan.

---

## ⌨️ Shortcut Keyboard Utama

| Shortcut | Aksi |
|---|---|
| `F1` / `Ctrl + /` | Buka **Keyboard Shortcuts Cheatsheet** |
| `Ctrl + P` | Buka **Quick File Picker** (Cari berkas proyek) |
| `Ctrl + Shift + F` | Buka **Global Search in Files** (Cari & Ganti di semua berkas) |
| `Ctrl + Shift + U` | Buka **Unified Search** (buffer terminal + file) |
| `Ctrl + K` | Buka **Command Palette** |
| `Ctrl + B` | Toggle **Sidebar Workstation / File Explorer** |
| `Ctrl + S` | Simpan berkas aktif di Code Editor |
| `Ctrl + Shift + S` | Simpan semua berkas terbuka (*Save All*) |
| `Shift + Alt + F` | Format kode aktif dengan Prettier |
| `Alt + Z` | Toggle Word Wrap di Code Editor |
| `Ctrl + T` | Buka tab terminal baru |
| `Ctrl + W` | Tutup tab aktif (Editor tab jika fokus di editor, Terminal jika di terminal) |
| `Ctrl + Shift + T` | Buka kembali tab file yang baru ditutup (*Reopen Closed Tab*) |
| `Ctrl + Shift + W` | Tutup workstation aktif |
| `Ctrl + Tab` | Pindah ke tab terminal berikutnya |
| `Ctrl + Shift + Tab` | Pindah ke workstation berikutnya |
| `Ctrl + Shift + L` | Ubah layout ke **Single Terminal** |
| `Ctrl + Shift + E` | Ubah layout ke **2-Split Horizontal** |
| `Ctrl + Shift + O` | Ubah layout ke **2-Split Vertical** |
| `Ctrl + Shift + G` | Ubah layout ke **4-Grid (2x2)** |
| `Ctrl + Shift + D` | Duplikasi tab terminal dengan direktori kerja yang sama |
| `Ctrl + Shift + M` | Buka/tutup **Panel Tasks** |
| `Ctrl + Shift + B` | Jalankan **Task utama** project |
| `Ctrl + Shift + I` | Buka **AI CLI Runner** |
| `Ctrl + +` / `Ctrl + -` / `Ctrl + 0` | Zoom in / Zoom out / Reset ukuran font terminal |

---

## 🛠️ Prasyarat Sistem

### Windows:
- **OS**: Windows 10/11 (64-bit)
- **Node.js**: v18.0.0 atau lebih baru
- **Rust & Cargo**: Versi stabil terbaru ([rustup.rs](https://rustup.rs/))
- **Visual Studio C++ Build Tools**: Komponen desktop C++ untuk kompilasi Rust di Windows

---

## 🚀 Menjalankan Mode Development

1. **Install dependensi frontend:**
   ```bash
   npm install
   ```

2. **Jalankan dev server Tauri + Nuxt:**
   ```bash
   npx @tauri-apps/cli dev
   ```

---

## 📦 Build Binary Executable (Production Release)

### 🪟 Windows (.exe & Installer NSIS)

```powershell
npm.cmd run generate
npx.cmd @tauri-apps/cli build
```

Hasil file release:
- **Installer Windows (.exe Setup)**: `src-tauri/target/release/bundle/nsis/MyTermin_0.2.0_x64-setup.exe`
- **Installer MSI**: `src-tauri/target/release/bundle/msi/MyTermin_0.2.0_x64_en-US.msi`
- **Portable Executable**: `src-tauri/target/release/mytermin.exe`

---

## 📂 Struktur Direktori Proyek

```
MyTermin/
├── app/
│   ├── app.vue                     # Root component, layout frame & global shortcuts
│   ├── components/
│   │   ├── AiPanelModal.vue          # Runner CLI AI dengan context injection
│   │   ├── AppGlobalDialog.vue       # Modal konfirmasi/alert pengganti dialog native
│   │   ├── AppLogo.vue               # Komponen logo aplikasi
│   │   ├── CodeEditorPane.vue        # Panel Monaco editor multi-tab & split view
│   │   ├── FileTreeNode.vue          # Item navigasi pohon folder & git indicator
│   │   ├── GlobalSearchModal.vue     # Pencarian & penggantian teks lintas file
│   │   ├── GitStashModal.vue         # Stash manager (list/apply/pop/drop) & tag
│   │   ├── KeybindingInput.vue       # Perekam shortcut key (key capture)
│   │   ├── LayoutGrid.vue            # Dynamic Grid terminal & viewport sliding window
│   │   ├── MonacoDiffEditor.vue      # Side-by-side Git Diff viewer
│   │   ├── MonacoEditor.vue          # Wrapper Monaco Code Editor
│   │   ├── OnboardingModal.vue       # Wizard-run pertama
│   │   ├── PresetModal.vue           # Modal template workspace multi-workstation
│   │   ├── QuickFilePickerModal.vue  # Dialog pencarian file cepat (Ctrl+P)
│   │   ├── SettingsModal.vue         # Dialog konfigurasi (6 tab: Tampilan, Sesi & Env, Pintasan, Quick Run, Diagnostik)
│   │   ├── ShortcutsCheatsheetModal.vue # Dialog cheatsheet daftar shortcut (F1)
│   │   ├── TaskPanel.vue             # Panel Task Runner (package.json/Makefile/justfile)
│   │   ├── TerminalPane.vue          # Instance xterm.js dengan font zoom & PTY bridge
│   │   ├── ThemeEditor.vue           # Editor palet ANSI + preview
│   │   ├── TitleBar.vue              # Workstation tabs bar, controls & window title
│   │   ├── UnifiedSearchModal.vue    # Cari di buffer terminal & file project
│   │   ├── WorkstationSidebar.vue    # Sidebar Explorer, Git tools, dan daftar terminal
│   │   └── ui/                       # UI Primitives (Button, Dialog, SettingRow, SettingsGroup, …)
│   ├── composables/
│   │   ├── useAppDialog.ts           # Composable dialog global
│   │   ├── useDiagnostics.ts         # Ring buffer log + debug info untuk bug report
│   │   ├── useEditorStore.ts         # State management file & tabs code editor
│   │   ├── useGitExtras.ts           # Fetch/ahead-behind/stash/amend/cherry-pick/tag
│   │   ├── useProjectConfig.ts       # .mytermin/project.json + env project
│   │   ├── useProjectExplorer.ts     # File operations & Git bridge backend
│   │   ├── useSettingsStore.ts       # Pengaturan terminal, tema, keybinding & rules
│   │   ├── useShellIntegration.ts    # Status command (exit/durasi) via OSC 1337
│   │   ├── useTauriPty.ts            # Bridge IPC Tauri ConPTY backend
│   │   ├── useTaskRunner.ts          # Deteksi & eksekusi task project
│   │   └── useWorkspaceStore.ts      # Multi-workstation state & terminal management
│   ├── utils/
│   │   └── formatter.ts            # Prettier code formatter standalone
│   └── types/
│       └── terminal.ts             # TypeScript interfaces & types
├── public/
│   ├── favicon.ico                 # Icon browser / preview
│   └── logo.svg                    # Vector brand logo MyTermin
├── src-tauri/
│   ├── Cargo.toml                  # Dependensi Rust backend
│   ├── icons/                      # Icon aplikasi multi-platform
│   ├── src/
│   │   ├── main.rs                 # Tauri commands (Git, File Ops, Search/Replace)
│   │   └── pty.rs                  # PTY manager (portable-pty)
│   └── tauri.conf.json             # Konfigurasi Tauri v2 & bundle targets
├── nuxt.config.ts                  # Konfigurasi Nuxt 4 SPA
├── package.json                    # Dependensi frontend & build scripts
└── README.md                       # Dokumentasi proyek
```
