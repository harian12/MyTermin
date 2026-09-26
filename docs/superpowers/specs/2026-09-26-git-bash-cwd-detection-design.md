# Spec — Cwd Detection Git Bash (Fitur #5 dari peta 6 fitur)

- **Tanggal:** 2026-09-26
- **Status:** menunggu review user
- **Branch:** `feat/git-bash-cwd-detection` (dari `main` @ `bcdb1a7`)
- **Sub-proyek ke-5 dari urutan:** #5 Git Bash cwd → #2 Command History Palette → #1 Workspace Profile → #3 Dev server chip → #6 Pane zoom → #4 Transcript export. Setiap fitur punya siklus spec → plan → implementasi sendiri.

## Konteks

Git Bash sudah menjadi pilihan shell di MyTermin (`get_available_shells`, `src-tauri/src/main.rs:85`, `C:\Program Files\Git\bin\bash.exe`). Namun deteksi cwd di `app/components/TerminalPane.vue` hanya mengenali dua format prompt Windows:

1. OSC 9;9 dan OSC 7 (dipancarkan terminal tertentu)
2. Prompt PowerShell (`PS <jalan>>`) dan cmd (`<jalan>>`)
3. Judul jendela dengan pola `D:\...` (`onTitleChange`)
4. sysinfo lewat `fetchStats` (polling 2 detik, kini hanya saat `child_count === 0`)

Prompt default Git Bash bergaya MSYS (`user@host MINGW64 /d/MYP/MyTermin`) tidak cocok dengan pola mana pun; judulnya juga berbentuk `/d/...` sehingga regex judul meleset. Akibatnya `props.cwd` dari parse tidak pernah ter-update untuk shell ini. Setelah perbaikan #6 (sysinfo diabaikan saat child aktif), celahnya terasa: saat program lama berjalan, badge "cd project" untuk terminal Git Bash tidak bisa mengikuti prompt terbaru.

## Tujuan & kriteria sukses

Setara AE3 penuh untuk Git Bash, plus persistensi:

- `cd` ke luar folder project → tombol "cd project" muncul **dalam satu siklus prompt** — yaitu saat baris prompt berikutnya muncul di terminal, tanpa menunggu polling 2 detik.
- Klik tombol → shell kembali ke folder project, tombol hilang.
- Cwd hasil deteksi ikut tersimpan ke storage sehingga setelah reload badge tetap benar.
- Saat child process aktif setelah `cd` keluar, badge tetap mengikuti prompt (kasus khusus yang menggerakkan fitur ini).

## Scope

**Masuk:**

- Util baru `app/utils/msysPath.ts` (fungsi murni).
- Dua panggilan balik baru di `app/components/TerminalPane.vue` (`parseStreamForCwd`, `onTitleChange`).
- Baris smoke di Verification Contract plan implementasi.

**Keluar (eksplisit):**

- Perubahan `src-tauri/` apa pun.
- Menyentuh `~/.bashrc` / `~/.bash_profile` atau file rc milik user, atau menambah env `PROMPT_COMMAND` saat spawn.
- Shell lain: Cygwin (`/cygdrive/c/...`), zsh, fish.
- Custom PS1 (oh-my-bash, tmux, powerline) — mengandalkan sysinfo, didokumentasikan sebagai batasan, bukan bug.
- Perubahan perilaku deteksi cmd/PowerShell yang sudah ada.
- Perubahan UI/komponen baru.

## Kebutuhan

- **R1.** Prompt Git Bash terdeteksi dari aliran output PTY dan memanggil `updateTerminalCwd` dalam satu siklus prompt (tanpa menunggu poll 2 detik).
- **R2.** Judul jendela bergaya MSYS (`user@host MINGW64 /d/path`) terdeteksi lewat `onTitleChange` dan memperbarui cwd melalui jalur yang sama.
- **R3.** Path MSYS dikonversi ke format Windows: `/d/MYP/MyTermin` → `D:\MYP\MyTermin`; huruf drive case-insensitive dan hasil selalu huruf besar (`/d/` maupun `/D/` → `D:\`); path berspasi tetap utuh; bukan pola `/<drive>/...` → `null`.
- **R4.** Perilaku cmd/PowerShell tidak berubah: regex lama tetap diurutan pertama, jalur MSYS hanya fallback baru di belakangnya.
- **R5.** Kegagalan parsing/konversi menghasilkan `null` tanpa memanggil `updateTerminalCwd` (tanpa update palsu); sysinfo tetap fallback terakhir.
- **R6.** Frontend-only: tanpa perubahan kode di luar `app/` (khususnya `src-tauri/`), tanpa menyentuh file rc milik user; file docs/plan bukan bagian dari batasan ini.
- **R7.** Cwd hasil parse ikut persistensi (`updateTerminalCwd` → `saveSession` + `setPtyCwd`), sehingga benar setelah reload.

## Desain

### Unit: `app/utils/msysPath.ts` (murni, auto-import, tanpa state)

- `msysToWinPath(p: string): string | null` — konversi `/d/x/y` → `D:\x\y`; selain itu `null`.
- `parseMsysTitle(title: string): string | null` — ekstrak token path MSYS terakhir dari judul.
- `matchMsysPrompt(buffer: string): string | null` — cari path MSYS di akhir baris yang **diikuti penanda prompt** Git Bash (`$` atau `#`); anchor ini penekan false-positive dari output program.

### Titik masuk (ketiganya sudah ada, tidak ada komponen UI baru)

```
output PTY ──onPtyData──► parseStreamForCwd ──(baru: matchMsysPrompt)──┐
judul      ──onTitleChange──► regex D:\ (lama) + fallback parseMsysTitle ┼► msysToWinPath
sysinfo    ──fetchStats (child_count===0)──► (tetap) ────────────────────┘       │
                                                                                ▼
                                            updateTerminalCwd → store + saveSession + setPtyCwd
                                                                                │
                                                 props.cwd → isCwdMismatch → badge "cd project"
```

Prinsipnya sama seperti lapisan OSC/PS/cmd yang sudah ada: setiap jalur independen, gagal satu → yang lain menopang. Jalur judul jadi primer (nol risiko output palsu), stream untuk sinkronisasi antar-prompt, sysinfo fallback terakhir.

## Error handling

- Konversi/parsing gagal atau bukan pola → kembalikan `null`, jalur diam — tanpa `updateTerminalCwd` palsu; sysinfo 2 detik yang menopang.
- False positive stream ditekan dua lapis: anchor penanda prompt + syarat path diawali `/<drive>/`.
- Gagal menangkap format prompt yang ternyata berbeda dari asumsi ≠ krusial, karena jalur judul dan sysinfo tetap hidup.

## Verification Contract

Repo tidak punya test runner; seluruh bukti lewat smoke manual pada aplikasi berjalan + gate otomatis.

| Gate | Perintah atau aksi | Berlaku untuk |
|---|---|---|
| Type check | `npx nuxt prepare` bila `.nuxt` belum ada, lalu `npx vue-tsc --noEmit -p .nuxt/tsconfig.json` | seluruh spec |
| Build | `npm run generate` | seluruh spec |
| Smoke observasi | Jalankan Git Bash, **catat prompt + judul asli** apa adanya — pola disesuaikan bila berbeda dari asumsi | fondasi parser |
| AE-Gb1 | Git Bash: `cd` ke luar project (mis. `/d`) → tombol "cd project" muncul dalam satu siklus prompt; klik → kembali; tombol hilang | R1, R2 |
| AE-Gb2 | Git Bash: cwd di sub-direktori project → tombol **tidak** tampil | R1, R2 |
| AE-Gb3 | Reload aplikasi → badge tetap benar (persistensi storage) | R7 |
| AE-Gb4 | Setelah `cd` keluar, jalankan program lama (child aktif) → badge tetap mengikuti prompt, tidak membeku di nilai lama | R1, kasus pemicu |
| Regresi | AE1/AE2/AE3 (cmd/PowerShell) tetap berjalan seperti sebelumnya | R4 |

## Referensi

- `app/components/TerminalPane.vue` — `parseStreamForCwd` (lapisan OSC 9;9 → OSC 7 → PS → cmd), `onTitleChange`, `fetchStats`, `isCwdMismatch`.
- `app/composables/useWorkspaceStore.ts` — `updateTerminalCwd` (lintas-workstation, lihat KTD2).
- `src-tauri/src/main.rs:85` — Git Bash terdaftar di `get_available_shells`.
- `docs/plans/2026-09-26-1338-fix-terminal-cwd-containment-plan.md` — plan pendahulu, pola Verification Contract dan KTD yang mengikat fitur ini.
