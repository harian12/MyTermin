# Command History Palette - Plan

- **Tanggal:** 2026-09-26
- **Spec:** `docs/superpowers/specs/2026-09-26-command-history-palette-design.md` (disetujui user)
- **Branch:** `feat/command-history-palette` (dari `main` @ `939b099`)

## Goal Capsule

- **Goal:** MyTermin bisa menjalankan ulang perintah yang pernah diketik di pane-nya lewat satu palette yang bisa dicari, dikelompokkan per project, dan bertahan lintas reload.
- **Why now:** Sub-proyek ke-2 dari peta 6 fitur; fondasi fitur #5 (deteksi cwd) sudah kerjakan, jadi `cwd` per terminal bisa dipakai sebagai pengelompok history.
- **Core deliverable:** `Ctrl+R` membuka panel history; `Enter` menjalankan ulang di pane aktif, `Ctrl+Enter` menempel, `Ctrl+C` menyalin.
- **Confidence:** High - tidak ada backend, tidak ada kontrak eksternal, semua pola UI sudah ada di repo (`CommandPalette.vue`).

## Product Contract

### Summary

History perintah dicatat dari ketikan yang masuk ke PTY (`term.onData`) plus quick-command, disimpan di `localStorage` key terpisah, lalu disajikan sebagai palette dengan filter substring dan dua scope (Project ini / Semua).

### Problem Frame

`TerminalPane.vue:547-560` sudah menjepit `inputLineBuffer` dari `term.onData` dan saat Enter memanggil `updateTerminalLastCommand` (`useWorkspaceStore.ts:601-612`), tapi hasilnya hanya satu slot `lastCommand` per terminal yang langsung tertimpa perintah berikutnya, difilter `clear`/`cls`/`exit`, dan hanya dicari di workstation aktif. Nilainya hanya memutar tombol last-command di header pane (`LayoutGrid.vue:459`).

Akibatnya tidak ada cara memanggil ulang perintah lama, tidak ada pencarian, dan tidak ada pengelompokan per project. Alternatif native (`Ctrl+R` reverse-i-search) hanya melihat history shell yang flushing-nya tidak real-time, dan backend tidak memberi akses ke file history: pencarian `history|History|HISTFILE|PROMPT_COMMAND|PS1` di `src-tauri/src/` nihil, tidak ada storage engine, dan `PtySession` tidak menyimpan output.

### Key Decisions

1. **Sumber history dari ketikan di MyTermin, bukan file history shell** (session-settled: user-approved). Nol perubahan `src-tauri/`, sinkron dan real-time, tapi perintah sebelum app dibuka tidak ikut - diterima sebagai batas.
2. **Cakupan per project, dikelompokkan `cwd`** (session-settled: user-approved). DIturunkan saat render dari `cwd` entri dibanding `folderPath` workstation aktif, tidak disimpan.
3. **Aksi: jalankan + tempel + salin** (session-settled: user-approved). `Enter` eksekusi, `Ctrl+Enter` tempel tanpa eksekusi, `Ctrl+C` salin.
4. **Pendekatan A: store history + palette baru**, bukan mode baru di `CommandPalette.vue` (session-settled: user-approved). Component `CommandPalette.vue` sudah 464 baris; mencampur dua bentuk data di sana punishing, sedangkan unit baru masing-masing satu tanggung jawab.
5. **`inputLineBuffer` diperbaiki sekalian** (session-settled: user-approved). History yang salah lebih buruk dari history yang hilang.
6. **`Ctrl+R` hanya di luar terminal** (session-settled: user-approved). `Ctrl+R` di dalam terminal milik bash/readline/PSReadLine; guard mengikuti preseden `Ctrl+P` di `app.vue:309-317`.
7. **Inti aturan ditulis sebagai fungsi murni** `app/utils/commandHistory.ts`, chassis yang sama dengan `msysPath.ts` di fitur #5 - supaya bisa diverifikasi tanpa test runner.

### Requirements

- **R1.** Setiap perintah yang diketik di pane dan dijalankan (Enter) terekam satu entri berisi teks ter-trim, `cwd`, `shell`, dan waktu (epoch ms).
- **R2.** Perintah identik beruntun pada `cwd` sama tidak menggandakan entri: `runCount` naik dan entri naik ke posisi teratas.
- **R3.** Baris kosong, `clear`, `cls`, `exit` tidak terekam; aturan ini satu pemilik dan dipakai juga oleh `updateTerminalLastCommand`.
- **R4.** Entri lebih dari 500 karakter dipotong dari depan; baris hasil paste ber-newline tidak direkam.
- **R5.** Submission yang buffer-nya tersentuh navigasi shell (panah atas/bawah, `Home`, `End`) dilewati.
- **R6.** `cwd` entri memakai `props.cwd`; bila kosong jatuh ke `folderPath` workstation aktif.
- **R7.** History dipersist di `mytermin_command_history_v1`, terpisah dari `mytermin_session_v5`, bertahan lintas reload, restart app, dan reset sesi.
- **R8.** Palette dibuka lewat shortcut user-editable (`commandHistory`, default `Ctrl+R`) dan tidak memicu saat fokus di dalam terminal.
- **R9.** Scope default Project ini; `Tab` ber-toggle ke Semua.
- **R10.** `Enter` menjalankan di pane aktif dan merekam sebagai run baru; `Ctrl+Enter` menempel tanpa eksekusi; `Ctrl+C` menyalin dan palette tetap terbuka; `Esc` menutup.
- **R11.** Maksimal 500 entri global; entri terlama dibuang.
- **R12.** Filter substring case-insensitive; panah atas/bawah berpindah item dengan wrap; item menampilkan `cwd` (dipotong ke nama folder), jumlah jalan (`xN`), waktu relatif.
- **R13.** Tidak ada perubahan di luar `app/`.

### Acceptance Examples

- **AE1.** Dari project `D:\MYP\MyTermin`, jalankan `npm run generate` di pane Git Bash -> `Ctrl+R` di luar terminal -> scope "Project ini" menampilkan entri itu dengan `cwd` `D:\MYP\MyTermin`.
- **AE2.** Jalankan `npm run generate` lagi di cwd yang sama -> entri tidak berdua; `x2` muncul dan tetap satu baris di posisi teratas.
- **AE3.** Dari folder lain (`cd C:\Users`), jalankan `git status` -> `Tab` ke scope "Semua" -> `git status` ada dengan label `C:\Users`; di scope "Project ini" entri itu tidak terlihat.
- **AE4.** Di palette, pilih `npm run generate` lalu `Enter` -> perintah terkirim ke pane aktif dan dijalankan; entri `x3`.
- **AE5.** Pilih entri lalu `Ctrl+Enter` -> teks masuk ke prompt tanpa dieksekusi (bisa disunting sebelum Enter); `runCount` tidak bertambah.
- **AE6.** Pilih entri lalu `Ctrl+C` -> teks ada di clipboard, palette tetap terbuka.
- **AE7.** Reload aplikasi -> palette masih menampilkan history yang sama.
- **AE8.** Ketik `clear` lalu Enter -> tidak ada entri baru; `lastCommand` di header pane juga tidak berubah (perilaku lama terjaga).
- **AE9.** `Ctrl+R` saat kursor di dalam terminal -> tidak membuka palette; shell tetap menjalankan reverse-i-search.
- **AE10.** Ketik `echo "halo"` lalu `Ctrl+U` lalu `ls` lalu Enter -> hanya `ls` yang terekam.

### Scope Boundaries

**Masuk:** `app/utils/commandHistory.ts`, `app/composables/useCommandHistory.ts`, `app/components/CommandHistoryPalette.vue`, tipe di `app/types/terminal.ts`, `inputLineBuffer` + 2 titik pencatatan di `TerminalPane.vue`, import aturan skip di `useWorkspaceStore.ts`, 4 titik wiring shortcut, mount palette di `app.vue`.

**Keluar:** perubahan `src-tauri/`; membaca file history shell; perintah sebelum app dibuka; exit code/durasi; riwayat per pane; perekaman paste multi-baris; sinkronisasi antar jendela/mesin; pembacaan baris dari buffer xterm (`term.buffer.active`).

## Planning Contract

### Key Technical Decisions

- **KTD1. `app/utils/commandHistory.ts` sebagai satu-satunya pemilik aturan history.** Modul ini memegang `isRecordable` (R3), `clipCommand` (R4), `recordInto` (R2, R11), dan `filterByScope` (R9) sebagai fungsi murni tanpa state. `useCommandHistory` hanya membrane `localStorage`, `useWorkspaceStore.updateTerminalLastCommand` mengimpor `isRecordable` dari sini, dan palette hanya memanggil `filterByScope`. (session-settled: user-approved - dipilih dibanding menyalin aturan: tiga tempat butuh aturan yang sama, dan daftar skip yang dobel pasti melenceng.) Governs R2, R3, R4, R9, R11.
- **KTD2. `localStorage` key terpisah, bukan field di store workspace.** `mytermin_session_v5` (lihat `useWorkspaceStore.ts:3, 91-100`) adalah payload sesi yang di-reset saat sesi direset dan ikut membawa seluruh workstation; history harus bertahan melewati itu. Bentuk dan pola diambil dari `useProjectExplorer` (`RECENT_PROJECTS_KEY` + `loadX`/`saveX` + `try/catch`, `useProjectExplorer.ts:41-108`). (session-settled: user-approved.) Governs R7.
- **KTD3. Penangkapan tetap di `term.onData`, tidak mengurai output PTY.** `term.onData` memberi baris yang diketik user; output PTY sudah di-strip ANSI per chunk dan tidak menyimpan struktur baris (`TerminalPane.vue:301`), plus menguraikannya berarti membocorkan secret yang di-echo. Konsekuensinya trade-off R5 disepakati: baris yang dipanggil navigasi shell dilewati, bukan dikoreksi. (session-settled: user-approved - pendekatan tangkap-dari-output ditolak.) Governs R1, R4, R5, R6.
- **KTD4. `CommandHistoryPalette.vue` component terpisah dengan pola interaksi yang disalin dari `CommandPalette.vue`, bukan mode di dalamnya.** `CommandPalette.vue` (464 baris) sudah memegang daftar action dengan `CommandItem { id, title, subtitle, category, icon, action }`; entri history punya bentuk lain (cmd, cwd, runCount, waktu) dan dua aksi. Poli yang disalin: `filteredCommands` substring (`:297-307`), reset `selectedIndex` saat buka (`:309-326`), `scrollIntoView` item terpilih (`:328-337`), `handleKeyDown` dengan wrap (`:339-360`), fokus input `nextTick` + `setTimeout 50` (`:309-322`), dan kelas overlay `fixed inset-0 z-[100] ... pt-20`. Guard `closest('.xterm')` mengikuti `Ctrl+P` (`app.vue:309-317`). (session-settled: user-approved.) Governs R8, R9, R10, R12.
- **KTD5. `Ctrl+Enter` dan `Ctrl+C` ditangani di `handleKeyDown` palette, bukan di `handleKeydown` global,** supaya tidak bentrok dengan `Enter` di dalam input dan modifier tidak diambil alih di level window; `Ctrl+C` disalin lewat `copyToClipboard` yang sudah ada (`useTauriPty.ts:140-148`) sehingga konsisten dengan copy terminal. (session-settled: user-approved.) Governs R10.
- **KTD6. `inputLineBuffer` berubah dari `string` menjadi `{ text, cursor }` plus flag `recallTouched`, semuanya di dalam `initTerminal`.** Sisipan di tengah baris (panah kiri/kanan, `Ctrl+A/E`, paste) tidak bisa benar dengan string polos; `recallTouched` disalakan oleh navigasi shell lalu dibaca di cabang Enter untuk memenuhi R5. Catatan: handle ini tidak dipakai `props.initialCommand` yang dikirim lewat `writePty` langsung (`:566-572`) sehingga preset awal tidak ikut terekam - sesuai Scope Boundaries. (session-settled: user-approved.) Governs R1, R4, R5.

### High-Level Technical Design

```
app/types/terminal.ts
  + CommandHistoryEntry { id, cmd, cwd, shell?, at, runCount }
  + KeybindingConfig.commandHistory? + DEFAULT_KEYBINDINGS.commandHistory = 'Ctrl+R'

app/utils/commandHistory.ts (murni)
  isRecordable(cmd)                     -> R3
  clipCommand(cmd)                      -> R4
  recordInto(entries, entry, cap=500)   -> R2, R11
  filterByScope(entries, scope, folder) -> R9

app/composables/useCommandHistory.ts
  useState('command-history-entries'), loadHistory/saveHistory di 'mytermin_command_history_v1'
  recordCommand(cmd, cwd, shell?) -> clipCommand -> isRecordable -> recordInto -> save
  Ambil folderPath aktif dari useWorkspaceStore untuk fallback R6

app/composables/useWorkspaceStore.ts
  updateTerminalLastCommand: ganti filter inline dengan isRecordable dari utils

app/components/TerminalPane.vue
  inputLineBuffer -> { text, cursor, recallTouched, pasteDepth }
  onData: Enter -> cmd dari buffer; skip bila recallTouched; recordCommand(cmd, props.cwd || folderPath, props.shell)
  executeCommand(): tambah recordCommand setelah writePty berhasil

app/components/CommandHistoryPalette.vue (baru)
  state buka: useState('command-history-open') + open/close/toggle
  list: filterByScope + filter substring, selectedIndex + wrap, scrollIntoView
  Enter -> writePty(pane, cmd + CR) + recordCommand + tutup
  Ctrl+Enter -> writePty(pane, cmd) tanpa CR
  Ctrl+C -> copyToClipboard(cmd), tetap terbuka
  Tab -> toggle scope; Esc -> tutup

app/app.vue
  blok keydown baru: isShortcut(e, 'commandHistory') + guard closest('.xterm')
  mount <CommandHistoryPalette /> di sebelah <CommandPalette />

app/components/SettingsModal.vue + ShortcutsCheatsheetModal.vue
  entri 'Riwayat Perintah' di keybindingList; cheatsheet pakai helper kb()
```

Data flow satu arah: ketikan -> `recordCommand` (murni dulu, baru storage) -> `useState` -> palette. Palette tidak pernah menulis storage secara langsung.

### Assumptions

- `activeWorkstation.folderPath` adalah path project yang sedang aktif; kalau kosong, scope "Project ini" jatuh ke scope semua entri tanpa crash.
- `props.shell` sudah ada di `TerminalTab` (`app/types/terminal.ts:6`) dan diteruskan ke pane.
- `navigator.clipboard` / `copyToClipboard` sudah menangani fallback native di `useTauriPty.ts:140-148`.
- Tree `app/components/CommandPalette.vue` dan `app/app.vue` tidak akan berubah diam-diam selama pengerjaan; kalau berubah, reconcile offset line di plan ini.
- Tidak ada test runner di repo; verifikasi tetap skrip skenario + `vue-tsc` + `generate` + smoke manual.

### Sequencing

U1 lebih dulu karena U2, U3, dan U4 memakai fungsi murni yang dibuatnya. U2 kedua karena U3 dan U4 butuh `recordCommand` dan state history. U3 ketiga (menambah pencatatan) sebelum U4 (menambah tampilan), supaya saat U4 diuji history sudah terisi nyata. U3 dan U4 tidak bisa paralel karena keduanya menyentuh `TerminalPane.vue`/`app.vue` yang sama.

## Implementation Units

### U1. Inti murni history dan tipenya

- **Files:** `app/types/terminal.ts` (tambah `CommandHistoryEntry`), `app/utils/commandHistory.ts` (baru).
- **Changes:**
  - `CommandHistoryEntry` persis seperti di spec; `id` dan `at` diisi pemanggil.
  - `isRecordable(cmd)`: trim, kosong = false, case-insensitive check `clear`/`cls`/`exit` (bandingkan lowercase agar `CLEAR` juga kena).
  - `clipCommand(cmd, max = 500)`: dari depan dipotong, hasil diawali `...` (ASCII) agar user tahu ada bagian yang hilang.
  - `recordInto(entries, entry, cap = 500)`: bila `entries[0]` punya `cmd` dan `cwd` yang sama (case-insensitive) dengan `entry`, naikkan `runCount`-nya, perbarui `at`, `shell`, dan taruh di depan; selain itu `[{ entry, ...entries }].slice(0, cap)`.
  - `filterByScope(entries, scope, projectFolder)`: scope `'project'` menyaring `cwd` yang sama dengan `projectFolder` secara case-insensitive; scope `'all'` mengembalikan semua.
- **Notes:** Tanpa state, tanpa import. Aman dipanggil dari skrip node dengan type-stripping.
- **Verification:** skrip skenario (lihat Verification Contract) + `vue-tsc`.

### U2. Store history dengan persistensi

- **Files:** `app/composables/useCommandHistory.ts` (baru), `app/composables/useWorkspaceStore.ts` (satu baris import + penyederhanaan filter di `updateTerminalLastCommand`).
- **Changes:**
  - `HISTORY_KEY = 'mytermin_command_history_v1'`, `useState<CommandHistoryEntry[]>('command-history-entries', () => [])`.
  - `loadHistory()` dipanggil sekali (splash/init yang sudah memuat `initFromStorage` dan `loadRecentProjects`), `try/catch` returning array kosong kalau `JSON.parse` gagal atau storage tak tersedia.
  - `recordCommand(cmd, cwd, shell?)`: `clipCommand` lalu `isRecordable`; `cwd` fallback ke `folderPath` workstation aktif (R6); lalu `recordInto` + `saveHistory()` dalam `try/catch` yang menelan exception.
  - `updateTerminalLastCommand` memakai `isRecordable(cleanCmd)` sebagai syarat, menggantikan tiga perbandingan string inline.
- **Notes:** `useProjectExplorer.ts:64-95` adalah pola yang disalin. Jangan menaruh history di `mytermin_session_v5`.
- **Verification:** `vue-tsc`; skrip skenario untuk inti murni, lalu smoke AE1 dan AE2 di app.

### U3. Penangkapan perintah di TerminalPane

- **Files:** `app/components/TerminalPane.vue`.
- **Changes:**
  - Ganti `let inputLineBuffer = ''` (`:544`) dengan `{ text: '', cursor: 0, recallTouched: false }`; semua penyesuaian berikut di dalam `term.onData` (`:547-560`).
  - `Enter`/`\n`: `cmd = state.text.trim()`; `recordCommand` hanya bila `cmd` dan `!state.recallTouched`; lalu reset buffer dan `recallTouched`.
  - Backspace (``, `\b`): hapus satu char sebelum kursor; Delete (`\x1b[3~`): hapus satu char di kursor; `\x1b[D`/`\x1b[C` geser kursor; `\x1b[H`/`\x1b[F` home/end; `\x01`/`\x05` home/end; `\x0b` (`Ctrl+K`) hapus sampai akhir; `\x15` (`Ctrl+U`) hapus baris; `\x17` (`Ctrl+W`) hapus kata sebelum kursor.
  - Navigasi shell: `\x1b[A`/`\x1b[B` (dan `OA`/`OB`) menyalakan `recallTouched` tanpa mengubah teks.
  - Bracketed paste: `\x1b[200~` masuk mode paste (tandai `pasted`), `\x1b[201~` keluar; di mode paste sisipkan isi apa adanya (termasuk newline) dan set flag `hasPastedNewline`.
  - Karakter lain: sisip di kursor untuk data printable termasuk non-ASCII (pasang ulang `charCodeAt(0) >= 32` yang membuang pasangan surrogate emoji).
  - `executeCommand()` (`:190-199`): tambah `recordCommand(cmd, props.cwd, props.shell)` setelah `writePty` pada cabang `isTauri` (R1 untuk quick command); jangan rekam branch web-mode.
- **Notes:**amoeba refill careful dengan urutan: cek escape sequence sebelum char tunggal, dan `{ text, cursor }` adalah objek mutable lokal - tidak perlu `ref` karena tidak dipakai template.
- **Verification:** skrip skenario; smoke AE1, AE2, AE8, AE10, plus regresi `lastCommand` header tetap bekerja.

### U4. Palette dan wiring shortcut

- **Files:** `app/components/CommandHistoryPalette.vue` (baru), `app/app.vue`, `app/types/terminal.ts`, `app/components/SettingsModal.vue`, `app/components/ShortcutsCheatsheetModal.vue`.
- **Changes:**
  - `app/types/terminal.ts`: `commandHistory?: string` di `KeybindingConfig`, `commandHistory: 'Ctrl+R'` di `DEFAULT_KEYBINDINGS`. Tidak ada perubahan `useSettingsStore.ts` - merge default sudah generik (`useSettingsStore.ts:95-99`).
  - `app.vue`: blok baru setelah blok `commandPalette` (`:401-405`) dengan guard `closest('.xterm')` seperti `Ctrl+P` (`:309-317`), memakai `isShortcut(e, 'commandHistory')`; mount `<CommandHistoryPalette />` di samping `<CommandPalette />` (`:753`).
  - `CommandHistoryPalette.vue`: `useState` open + `open/close/toggle`; `filtered` = `filterByScope(...)` lalu filter substring `cmd` (dan `cwd`); `selectedIndex` reset saat buka dan saat query berubah; `scrollIntoView` via `data-history-item`; `Enter`/`Ctrl+Enter`/`Ctrl+C`/`Tab`/`Esc` di `handleKeyDown`; `Enter`-butuh `activeTerminalId` dari `useWorkspaceStore` dan `writePty` + `copyToClipboard` dari `useTauriPty`; item menampilkan `cmd` (font mono), nama folder terakhir dari `cwd`, `xN` kalau `runCount > 1`, dan waktu relatif sederhana (`baru saja`, `Xm lalu`, `Xj lalu`); empty state untuk "Belum ada command" dan "Tidak ada yang cocok"; badge scope di header yang menunjukkan mode aktif dan hint `Tab`.
  - `SettingsModal.vue`: baris `{ key: 'commandHistory', label: 'Riwayat Perintah' }` di `keybindingList` (`:48-58`).
  - `ShortcutsCheatsheetModal.vue`: entri baru di daftar shortcut yang dirender lewat `kb()` (`:73-95`).
- **Notes:** `isRecordable` sudah menolak `clear/cls/exit`, jadi `executeCommand` tidak perlu cek tambahan.
- **Verification:** `vue-tsc` + `generate`; smoke AE1, AE3, AE4, AE5, AE6, AE7, AE9; regresi `Ctrl+K` dan `Ctrl+P` tetap berlaku.

## Verification Contract

Repo tidak punya test runner (`package.json` scripts: build/dev/generate/preview/postinstall/tauri), jadi verifikasi adalah kombinasi tiga lapis, sama seperti fitur #5.

1. **Skrip skenario** - file `.mjs` di luar repo (jangan di-commit), mengimpor `file:///D:/MYP/MyTermin/app/utils/commandHistory.ts` dan dijalankan dengan `node` (Node v24, type-stripping). Kasus minimal:
   - `isRecordable`: `''` false, `'   '` false, `'clear'`/`'CLEAR'`/`'Cls'`/`'exit'` false, `'  ls -la  '` true, `'clear all'` true (bukan skip-list).
   - `clipCommand`: 499 char utuh; 501 char -> 500 char dengan prefiks `...`; string pendek utuh.
   - `recordInto`: entri baru masuk depan; duplikat beruntun menaikkan `runCount` tanpa menambah panjang array; duplikat dengan `cwd` berbeda jadi entri baru; cap 500 memotong yang paling lama; entri di tengah yang diulang tetap jadi duplikat beruntun (hanya posisi 0 yang digabung).
   - `filterByScope`: scope project menyaring `cwd` sama case-insensitif; entri `cwd` `''` tidak muncul di scope project; scope all mengembalikan semua apa adanya.
2. **Gate build** - `npx.cmd nuxt prepare`, `npx.cmd vue-tsc --noEmit -p .nuxt/tsconfig.json`, `npm.cmd run generate`. Semua harus keluar 0.
3. **Smoke manual** - app dibangun dari perubahan ini:
   - AE1-AE10 berurutan di pane Git Bash.
   - AE2 unstoppable: tekan `Enter` ulang pada entri teratas, pastikan `x2` dan tidak ada baris duplikat.
   - Regresi: `Ctrl+K` (Command Palette) dan `Ctrl+P` (Quick File Picker) tetap membuka overlay yang benar; `Ctrl+R` di dalam terminal tetap reverse-search shell; header pane masih menampilkan last-command.

## Definition of Done

- Semua R1-R13 terpenuhi dan AE1-AE10 terverifikasi.
- Semua gate lapis 1 dan 2 hijau.
- `vue-tsc` tanpa error untuk `app/`; tidak ada perubahan di luar `app/`.
- `updateTerminalLastCommand` dan palette tidak punya daftar skip terpisah - keduanya memakai `isRecordable`.
- Tidak ada `console.log` debugging yang tertinggal; tidak ada key `localStorage` baru selain `mytermin_command_history_v1`.
- Smoke manual AE1-AE10 dicatat hasilnya (termasuk bagian yang gagal) pada respons akhir.
- Plan dan spec ikut ter-commit; commit per unit dengan pesan yang menjelaskan perilalubangnya, bukan hanya "update".

## Sources & Research

- Spec fitur ini: `docs/superpowers/specs/2026-09-26-command-history-palette-design.md`.
- Roadmap 6 fitur: `docs/superpowers/specs/2026-09-26-git-bash-cwd-detection-design.md:6`.
- Pola UI: `app/components/CommandPalette.vue:59-66, 297-373`; guard terminal `app/app.vue:309-317`; wiring keybinding `app/app.vue:394-405`; `app/types/terminal.ts:91-113`; `app/components/SettingsModal.vue:48-58`; `app/components/ShortcutsCheatsheetModal.vue:73-95`.
- Pola store: `app/composables/useProjectExplorer.ts:41-108`; `app/composables/useWorkspaceStore.ts:3, 91-113, 601-612`.
- Tangkapan perintah: `app/components/TerminalPane.vue:190-199, 301-302, 544-572`.
- Clipboard: `app/composables/useTauriPty.ts:140-148`.
- Preseden fitur #5 (util murni + verifikasi tanpa test runner): `app/utils/msysPath.ts`, `docs/plans/2026-09-26-1713-feat-git-bash-cwd-detection-plan.md`.
- Backend diperiksa dan tidak punya fasad history: `src-tauri/src/pty.rs`, `src-tauri/src/main.rs` (nihil `history`/`HISTFILE`/`PS1`/storage engine).
