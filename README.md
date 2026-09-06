# MyTermin 🚀

Aplikasi desktop multi-terminal modern untuk Windows yang dibangun menggunakan **Tauri v2 (Rust `portable-pty`)**, **Nuxt 4**, **Shadcn UI**, dan **xterm.js**. Dirancang khusus untuk workflow developer cepat, AI-assisted CLI, dan multi-tasking tanpa lag.

---

## ✨ Fitur Utama

1. **Dynamic Grid Layout & Sliding Window Viewport**
   - **Single View**: Tampilan 1 terminal fokus penuh.
   - **2-Split Horizontal**: 2 terminal bersebelahan (*side-by-side*).
   - **2-Split Vertical**: 2 terminal bertumpuk (*top-bottom*).
   - **4-Grid (2x2 Quad)**: Menampilkan hingga 4 sesi terminal secara simultan dalam 1 layar.
   - **Sliding Window Grid**: Jika jumlah tab melebihi kapasitas layout (misal 3 tab pada 2-split), viewport grid otomatis bergeser mengikuti tab aktif saat navigasi (`Ctrl+Tab` dari tab 2 ke 3 menampilkan tab 2 & 3, kembali ke tab 1 menampilkan tab 1 & 2). Seluruh sesi terminal tetap aktif di memori tanpa diputus.

2. **Cyclic Tab Switching & Tab Management**
   - Navigasi tab memutar (*cyclic*) memakai `Ctrl+Tab` dan `Ctrl+Shift+Tab` tanpa tertelan oleh PTY.
   - Reorder posisi tab dengan klik-tahan dan geser (*drag-and-drop*) langsung pada title bar.
   - Buka tab baru (`Ctrl+T`) atau tombol `+` di title bar.
   - Duplikasi tab aktif (`Ctrl+Shift+D` atau tombol *Copy* pada tab) dengan path & konfigurasi sama.
   - Rename tab fleksibel dengan klik dua kali (*double-click*) atau tombol *Pencil*.
   - Tutup tab terminal (`Ctrl+W` atau tombol `X`). Saat seluruh tab ditutup, aplikasi masuk ke mode *Empty State*.

3. **Workspace Presets & Quick Actions**
   - Template workspace sekali klik:
     - **AI Developer Suite**: Membuka 4 terminal sekaligus (*OpenCode*, *Codex*, *Dev Server*, *Git Watcher*).
     - **OpenCode + Terminal**: 2 terminal vertikal untuk coding & eksekusi cepat.
     - **Full Stack Dev**: Web dev, backend, dan CLI console.
   - Simpan konfigurasi workspace saat ini menjadi custom preset baru (bisa diedit dan dihapus kapan saja).
   - Quick CLI runner per panel: Jalankan perintah instan seperti `opencode`, `codex`, `bun run dev`, `npm run dev`, atau `git status`.
   - Drag & drop file dari File Explorer langsung ke panel terminal (path otomatis disisipkan).
   - Context menu klik kanan lengkap: Copy, Paste, Clear, Duplicate, Ubah Layout.

4. **Auto-Restore & Session Persistence**
   - Menyimpan daftar tab, shell, dan layout terakhir secara otomatis di local storage.
   - Dapat diaktifkan/dinonaktifkan melalui menu Settings.
   - Tombol **Save** manual di title bar untuk menyimpan snapshot sesi kerja.

5. **Kustomisasi Terminal & Tema**
   - Pilihan shell dinamis: PowerShell, Command Prompt (CMD), Git Bash, WSL Bash.
   - Tema warna bawaan: Tokyo Night, Catppuccin Mocha, Dracula, One Dark Pro, Nord, Synthwave 84.
   - Pengaturan ukuran font, opacity latar belakang, dan bentuk kursor (*bar*, *block*, *underline*).

---

## ⌨️ Shortcut Keyboard

| Shortcut | Aksi |
|---|---|
| `Ctrl + K` | Buka **Command Palette** (Pencarian cepat tab, preset, layout, command, theme) |
| `Ctrl + T` | Buka tab terminal baru |
| `Ctrl + W` | Tutup tab terminal aktif |
| `Ctrl + Tab` | Pindah ke tab berikutnya (*Next Tab*) |
| `Ctrl + Shift + Tab` | Pindah ke tab sebelumnya (*Previous Tab*) |
| `Ctrl + Shift + Left / PageUp` | Geser posisi tab aktif ke kiri |
| `Ctrl + Shift + Right / PageDown` | Geser posisi tab aktif ke kanan |
| `Ctrl + Shift + D` | Duplikasi tab aktif (*Duplicate Tab*) |
| `Ctrl + Shift + G` | Ubah layout ke **4-Grid (2x2)** |
| `Ctrl + Shift + E` | Ubah layout ke **2-Split Horizontal** |
| `Ctrl + Shift + O` | Ubah layout ke **2-Split Vertical** |
| `Ctrl + Shift + S` | Ubah layout ke **Single Terminal** |
| `Ctrl + Shift + P` | Buka dialog **Workspace Presets** |

---

## 🛠️ Prasyarat Sistem

### Windows:
- **OS**: Windows 10/11 (64-bit)
- **Node.js**: v18.0.0 atau lebih baru
- **Rust & Cargo**: Versi stabil terbaru ([rustup.rs](https://rustup.rs/))
- **Visual Studio C++ Build Tools**: Komponen desktop C++ untuk kompilasi Rust di Windows

### Linux (Ubuntu / Debian / Arch / Fedora):
- **OS**: Linux x86_64
- **Node.js**: v18.0.0 atau lebih baru
- **Rust & Cargo**: Versi stabil terbaru ([rustup.rs](https://rustup.rs/))
- **System Packages** (Ubuntu / Debian):
  ```bash
  sudo apt update
  sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```
- **System Packages** (Arch Linux):
  ```bash
  sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget openssl libappindicator-gtk3 librsvg
  ```

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
   *Nuxt development server akan berjalan otomatis dan jendela desktop Tauri akan terbuka.*

---

## 📦 Build Binary Executable

### 🪟 Windows (.exe & Installer NSIS)

#### 1. Build Debug (Cepat, untuk testing lokal)
```powershell
npm.cmd run generate
npx.cmd @tauri-apps/cli build --debug --no-bundle
```
Hasil file: `src-tauri/target/debug/mytermin.exe`

#### 2. Build Production Release (Installer NSIS + Portable .exe)
```powershell
npm.cmd run generate
npx.cmd @tauri-apps/cli build
```
Hasil file release:
- **Portable Executable**: `src-tauri/target/release/mytermin.exe`
- **Installer Windows (.exe Setup)**: `src-tauri/target/release/bundle/nsis/MyTermin_0.1.0_x64-setup.exe`

---

### 🐧 Linux (.AppImage & .deb)

Di lingkungan Linux (atau via WSL2 / Docker / CI-CD):

```bash
# 1. Pastikan dependencies sistem terinstall
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev

# 2. Build frontend Nuxt
npm run generate

# 3. Compile binary & package Tauri
npx @tauri-apps/cli build
```

Hasil file release di Linux:
- **AppImage (Universal Standalone Linux)**:  
  `src-tauri/target/release/bundle/appimage/mytermin_0.1.0_amd64.AppImage`
- **Debian/Ubuntu Package (.deb)**:  
  `src-tauri/target/release/bundle/deb/mytermin_0.1.0_amd64.deb`
- **Binary Executable Mandiri**:  
  `src-tauri/target/release/mytermin`

---

## 📂 Struktur Direktori Proyek

```
MyTermin/
├── app/
│   ├── app.vue                 # Root component, layout frame & shortcut listener
│   ├── components/
│   │   ├── AppLogo.vue         # Logo SVG aplikasi & icon tab
│   │   ├── LayoutGrid.vue      # Dynamic Grid renderer & Empty State
│   │   ├── PresetModal.vue     # Dialog pemilihan template workspace
│   │   ├── SettingsModal.vue   # Dialog pengaturan tema, shell, font & sesi
│   │   ├── TerminalPane.vue    # Instance xterm.js & PTY bridge IPC
│   │   ├── TitleBar.vue        # Header bar, tab bar & window controls
│   │   └── ui/                 # Komponen UI (Button, Dialog, Input, Switch, dsb.)
│   ├── composables/
│   │   ├── useSettingsStore.ts  # State pengaturan terminal & tema
│   │   ├── useTauriPty.ts      # Bridge IPC Tauri ConPTY backend
│   │   ├── useThemes.ts        # Definisi palet warna tema terminal
│   │   └── useWorkspaceStore.ts# State management tab, layout & persistence
│   └── types/
│       └── terminal.ts         # Deklarasi interface TypeScript
├── src-tauri/
│   ├── Cargo.toml              # Dependensi Rust (tauri, portable-pty)
│   ├── icons/                  # Icon aplikasi multi-resolusi Windows
│   ├── src/
│   │   ├── main.rs             # Entry point backend Tauri
│   │   └── pty.rs              # ConPTY manager via portable-pty
│   └── tauri.conf.json         # Konfigurasi window & bundle Tauri
├── nuxt.config.ts              # Konfigurasi Nuxt 4 & Tailwind CSS
├── package.json                # Skrip & package frontend
└── README.md                   # Dokumentasi proyek
```
