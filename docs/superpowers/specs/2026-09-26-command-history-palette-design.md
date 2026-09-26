# Spec - Command History Palette (Fitur #2 dari peta 6 fitur)

- **Tanggal:** 2026-09-26
- **Status:** menunggu review user
- **Branch:** `feat/command-history-palette` (dari `main` @ `939b099`)
- **Sub-proyek ke-2 dari urutan:** #5 Git Bash cwd -> **#2 Command History Palette** -> #1 Workspace Profile -> #3 Dev server chip -> #6 Pane zoom -> #4 Transcript export. Setiap fitur punya siklus spec -> plan -> implementasi sendiri.

## Konteks

MyTermin sudah merekam satu perintah terakhir per terminal: `TerminalPane.vue:547-560` jadi tempat `inputLineBuffer` akumulasi ketikan dari `term.onData`, lalu saat Enter memanggil `updateTerminalLastCommand(props.paneId, cmd)`. Store (`useWorkspaceStore.ts:601-612`) hanya menyimpan satu slot `lastCommand` per terminal, difilter `clear`/`cls`/`exit`, dan hanya searched di workstation aktif. Nilai itu cuma dipakai untuk tombol last-command di header pane (`LayoutGrid.vue:459`).

Artinya: begitu perintah berikutnya diketik, jejak perintah sebelumnya hilang. Tidak ada cara menjalankan ulang perintah lama lintas pane, dan tidak ada pencarian. `Ctrl+R` milik shell (reverse-i-search) hanya bisa melihat history shell yang flushing-nya tidak real-time, dan MyTermin tidak punya akses ke file history tersebut.

Di sisi backend tidak ada fasad history sama sekali: pencarian `history|History|HISTFILE|PROMPT_COMMAND|PS1` di `src-tauri/src/` nihil, tidak ada storage engine, dan `PtySession` (`pty.rs`) tidak menyimpan output. Jadi sejarah harus dibangun frontend dari input yang diketik.

## Tujuan & kriteria sukses

- Setiap perintah yang dijalankan lewat pane MyTermin dapat dipanggil ulang lewat satu panel, tanpa mengubah shell.
- Satu panel untuk mencari perintah berdasarkan potongan teks, dan history bertahan lintas reload.
- Perintah lama bisa dijalankan ulang di pane aktif, ditempel untuk disunting, atau disalin.
- `Ctrl+R` milik shell tetap milik shell.

## Scope

**Masuk:**

- Inti murni history: `app/utils/commandHistory.ts` (fungsi murni, tanpa state).
- Store history: `app/composables/useCommandHistory.ts` (persistensi).
- Tipe `CommandHistoryEntry` di `app/types/terminal.ts`.
- Palette baru: `app/components/CommandHistoryPalette.vue`.
- Penguatan `inputLineBuffer` di `TerminalPane.vue` (cursor, Ctrl+U/W/A/E, non-ASCII, bracketed paste, gate recall).
- Dua titik pencatatan di `TerminalPane.vue` (Enter dari `onData`, dan `executeCommand`).
- Shortcut `commandHistory` di 4 titik wiring yang sudah ada.

**Keluar (eksplisit):**

- Perubahan `src-tauri/` apa pun.
- Membaca `~/.bash_history`, history PowerShell, atau file history apa pun.
- Perintah yang dijalankan sebelum aplikasi dibuka atau di luar MyTermin.
- Exit code, durasi, atau status sukses per entri.
- Riwayat per pane/tab atau per workstation terpisah.
- Merekam paste multi-baris sebagai satu entri.
- Sinkronisasi history antar jendela atau antar mesin.

## Kebutuhan

- **R1.** Setiap perintah yang diketik di pane dan dijalankan (Enter) terekam satu entri berisi teks yang sudah di-trim, `cwd`, `shell`, dan waktu (epoch ms).
- **R2.** Perintah identik beruntun pada `cwd` yang sama tidak menggandakan entri: `runCount` naik dan entri naik ke posisi teratas.
- **R3.** Baris kosong, `clear`, `cls`, dan `exit` tidak terekam. Aturan ini punya satu pemilik; `updateTerminalLastCommand` memakai aturan yang sama, bukan daftar terpisah.
- **R4.** Entri lebih dari 500 karakter dipotong dari **depan** (ekor yang dipertahankan, karena itu bagian yang dikoreksi user). Baris hasil paste yang memuat newline tidak direkam.
- **R5.** Submission yang buffer-nya tersentuh navigasi shell (panah atas/bawah, `Home`, `End`) **dilewati**: entri yang hilang lebih baik daripada entri yang salah.
- **R6.** `cwd` entri memakai `props.cwd`; bila kosong, jatuh ke `folderPath` workstation aktif (heuristic, didokumentasikan).
- **R7.** History dipersist di `localStorage` key `mytermin_command_history_v1`, terpisah dari `mytermin_session_v5`, bertahan lintas reload, restart aplikasi, dan reset sesi.
- **R8.** Palette dibuka lewat shortcut yang dapat diubah user (`commandHistory`, default `Ctrl+R`), dan **tidak** memicu saat fokus berada di dalam terminal: `Ctrl+R` di sana tetap reverse-search milik bash/readline/PSReadLine. Preseden: guard `closest('.xterm')` pada `Ctrl+P` di `app.vue:309-317`.
- **R9.** Scope default **Project ini**: entri dengan `cwd` sama dengan `folderPath` workstation aktif. `Tab` ber-toggle ke **Semua**.
- **R10.** Aksi: `Enter` menjalankan di pane aktif (dan merekam entri sebagai run baru), `Ctrl+Enter` menempel tanpa eksekusi, `Ctrl+C` menyalin ke clipboard dan palette tetap terbuka, `Esc` menutup.
- **R11.** Maksimal 500 entri global; entri terlama dibuang.
- **R12.** Panel memfilter substring case-insensitive, panah atas/bawah berpindah item dengan wrap, dan tiap item menampilkan `cwd` (dipotong ke nama folder), jumlah jalan (`xN`), serta waktu relatif.
- **R13.** Tidak ada perubahan di luar `app/`.

## Desain

### Unit: `app/utils/commandHistory.ts` (murni, tanpa state)

Pola yang sama dengan `msysPath.ts` di fitur #5: semua aturan bisa dipanggil tanpa browser dan tanpa store.

- `isRecordable(cmd: string): boolean` - sumber tunggal aturan R3, diimpor juga oleh `useWorkspaceStore.ts`.
- `recordInto(entries, entry, cap): CommandHistoryEntry[]` - R2 dan R11 (dedupe beruntun + cap).
- `clipCommand(cmd: string): string` - R4.
- `filterByScope(entries, scope, projectFolder): CommandHistoryEntry[]` - R9.

### Unit: `app/composables/useCommandHistory.ts` (persistensi)

`useState` seperti `useProjectExplorer` (`mytermin_recent_projects_v1`), memuat dan menyimpan `mytermin_command_history_v1`. Satu-satunya tempat yang menyentuh `localStorage`; kondisi storage rusak tertangani di sini (lihat Penanganan error).

### Model

```ts
export interface CommandHistoryEntry {
  id: string
  cmd: string      // sudah trim + clipped
  cwd: string      // path Windows; '' = tidak diketahui
  shell?: string
  at: number       // epoch ms
  runCount: number
}
```

Kelompokan per project **tidak disimpan** - diturunkan saat render dari `cwd` entri dibanding `folderPath` workstation aktif, jadi tidak ada data basi saat user ganti folder.

### Titik masuk

```
ketikan di pane ------> TerminalPane: term.onData (Enter) ---+
                                                              |
quick command ----------> TerminalPane: executeCommand ------+--> recordCommand(cmd, cwd, shell)
                                                                      |
                                                                      +--> app/utils/commandHistory.ts (murni)
                                                                      |
                                                                      +--> app/composables/useCommandHistory.ts --> localStorage
                                                                                        |
Ctrl+R (di luar terminal) -> app.vue: handleKeydown             |  useCommandHistory
                                                                                        v
                                    CommandHistoryPalette.vue <-+
                                          | Enter       -> writePty(pane, cmd + CR) lalu recordCommand
                                          | Ctrl+Enter  -> writePty(pane, cmd) tanpa eksekusi
                                          | Ctrl+C      -> salin ke clipboard
                                          | Tab         -> toggle scope Project ini / Semua
                                          | Esc         -> tutup
                                          | filter + selectedIndex + wrap (pola CommandPalette.vue)
```

Shortcut: 4 titik, semuanya generik tanpa mengubah `useSettingsStore.ts` - `KeybindingConfig` + `DEFAULT_KEYBINDINGS` (`app/types/terminal.ts:91-113`), `keybindingList` (`SettingsModal.vue:48-58`), blok baru di `handleKeydown` (`app.vue:394-459`), entri di `ShortcutsCheatsheetModal.vue:73-95`.

### Penguatan `inputLineBuffer`

Buffer menjadi `{ text, cursor }` agar sisipan di tengah baris benar. Ditangani: `Ctrl+U` (hapus baris), `Ctrl+W` (hapus kata), `Ctrl+A`/`Ctrl+E` (home/end), backspace/delete yang hormati kursor, karakter non-ASCII termasuk pasangan surrogate emoji, dan bracketed paste (`ESC[200~ ... ESC[201~`, marker dibuang). Navigasi shell (panah atas/bawah, `Home`, `End`) menyalakan gate `recallTouched` yang membuat submission berikutnya dilewat (R5).

## Penanganan error

- `localStorage` tidak tersedia (kuota, mode privat) atau `JSON.parse` gagal: load mengembalikan daftar kosong dan penulisan ditelan tanpa exception - history jadi in-memory untuk sesi itu, aplikasi tetap jalan.
- `recordCommand` dengan input kosong atau oversize dinormalisasi di `app/utils/commandHistory.ts`, bukan di pemanggil.
- Palette tanpa hasil filter atau tanpa entri menampilkan empty state; `Enter` tanpa item aktif adalah no-op.
- `writePty` gagal karena pane sudah mati: tidak ada entri baru dari replay palette; pencatatan dari `onData` tidak terpengaruh karena shell sudah menerimanya.

## Batas yang diketahui

- **Secret ikut terekam.** Password yang diketik di prompt yang tidak me-echo (mis. `mysql -p`) akan masuk history - perilaku yang sama dengan bash. Tidak ada cara app membedakan tanpa mengurai output.
- **Perintah yang dipanggil shell (panah atas) tidak terekam.** `inputLineBuffer` hanya tahu yang diketik. R5 memastikan tidak ada entri salah; pembacaan baris dari buffer xterm (`term.buffer.active`) adalah opsi perbaikan untuk siklus berikutnya, tapi bergantung pada state render (wrap, char lebar, scrollback).
- **`cwd` bisa jadi heuristic.** Bila deteksi cwd belum jalan (Git Bash pada sesi awal), entri memakai `folderPath` workstation.
- **Dua jendela app** berbagi `localStorage`, last-write-wins - sama seperti `mytermin_session_v5` sekarang.

## Verifikasi

Repo tidak punya test runner, jadi verifikasi tetap kombinasi skrip skenario, gate build, dan smoke manual, seperti fitur #5.

1. **Skrip skenario** (di luar repo, tidak di-commit) memanggil fungsi murni di `app/utils/commandHistory.ts`: skip-list, dedupe plus naik ke atas, cap 500, clipping 500 karakter dari depan, filter scope Project ini dan Semua.
2. **Gate:** `npx.cmd nuxt prepare`, `npx.cmd vue-tsc --noEmit -p .nuxt/tsconfig.json`, `npm.cmd run generate`.
3. **Smoke manual:** ketik 3 perintah berbeda di satu pane (satu diulang) -> `Ctrl+R` di luar terminal -> scope "Project ini" menampilkan 2 entri (entri yang diulang bertanda `x2`) -> filter substring menyaring -> `Enter` mengeksekusi di pane aktif -> `Ctrl+Enter` menempel tanpa eksekusi -> `Ctrl+C` menyalin -> `Tab` ke "Semua" -> reload aplikasi -> history tetap ada. Plus regresi: last-command di header pane tetap bekerja, dan `Ctrl+R` di dalam terminal masih reverse-search shell.
