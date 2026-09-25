# AGENTS.md - Developer & AI Instructions for MyTermin

Petunjuk dan aturan operasional wajib bagi AI Agent (termasuk OpenCode) dan developer saat memodifikasi kode, mempersiapkan rilis, memperbarui versi, serta membuat tag Git pada repositori MyTermin.

---

## 🚨 ATURAN WAJIB SEBELUM MEMBUAT TAG / RILIS UPDATE

Setiap kali ada instruksi untuk **bump version**, **membuat release**, **membuat Git tag**, atau **trigger updater sistem**, AI/Developer **WAJIB** mengeksekusi langkah-langkah berikut secara berurutan dan tidak boleh melewatkan satupun.

---

## 📋 SOP ALUR RILIS & UPDATE SISTEM (STEP-BY-STEP)

### Langkah 1: Sinkronisasi Versi (SemVer) di 3 Berkas Wajib
Pastikan nomor versi (misal `0.2.6`) sama persis di ketiga file berikut:
1. `package.json`
   ```json
   "version": "0.2.6"
   ```
2. `src-tauri/tauri.conf.json`
   ```json
   "version": "0.2.6"
   ```
3. `src-tauri/Cargo.toml`
   ```toml
   [package]
   name = "mytermin"
   version = "0.2.6"
   ```

---

### Langkah 2: Build Aplikasi & Bundle Installer
Jalankan perintah build frontend dan Tauri installer:
```powershell
npm.cmd run generate
npx.cmd @tauri-apps/cli build
```

Hasil build berada di:
- Installer: `src-tauri/target/release/bundle/nsis/MyTermin_<VERSION>_x64-setup.exe`
- Signature: `src-tauri/target/release/bundle/nsis/MyTermin_<VERSION>_x64-setup.exe.sig`

---

### Langkah 3: Update Manifest Auto-Updater (`latest.json`)
Perbarui file `latest.json` di root proyek dengan data rilis terbaru:
1. **`version`**: Versi baru (contoh `"0.2.6"`).
2. **`notes`**: Catatan rilis ringkas.
3. **`pub_date`**: Timestamp ISO 8601 UTC saat ini (contoh `"2026-09-25T10:00:00.000Z"`).
4. **`signature`**: Isi string signature dari file `.sig` yang digenerate oleh Tauri.
5. **`url`**: URL download asset GitHub Release:
   `https://github.com/harian12/MyTermin/releases/download/v<VERSION>/MyTermin_<VERSION>_x64-setup.exe`

Contoh format `latest.json`:
```json
{
  "version": "0.2.6",
  "notes": "Release v0.2.6 - Deskripsi update dan perbaikan.",
  "pub_date": "2026-09-25T10:00:00.000Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<ISI_SIGNATURE_DARI_FILE_SIG>",
      "url": "https://github.com/harian12/MyTermin/releases/download/v0.2.6/MyTermin_0.2.6_x64-setup.exe"
    },
    "windows-x86_64-nsis": {
      "signature": "<ISI_SIGNATURE_DARI_FILE_SIG>",
      "url": "https://github.com/harian12/MyTermin/releases/download/v0.2.6/MyTermin_0.2.6_x64-setup.exe"
    }
  }
}
```

---

### Langkah 4: Git Commit & Push Code Changes
Commit perubahan versi dan manifest updater ke Git:
```powershell
git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock latest.json
git commit -m "chore(release): bump version to v<VERSION>"
git push origin main
```

---

### Langkah 5: Pembuatan & Push Git Tag
Buat Git Tag berformat `v<VERSION>` (menggunakan awalan huruf `v`):
```powershell
git tag -a v<VERSION> -m "Release v<VERSION>"
git push origin v<VERSION>
```

---

### Langkah 6: Upload Release Asset ke GitHub Releases
Buat GitHub Release pada tag `v<VERSION>` dan upload berkas berikut:
1. `MyTermin_<VERSION>_x64-setup.exe`
2. `MyTermin_<VERSION>_x64-setup.exe.sig`
3. `MyTermin_<VERSION>_x64_en-US.msi` (opsional)
4. `latest.json`

---

## ⚠️ CHECKLIST SEBELUM MERILIS
- [ ] Versi di `package.json`, `src-tauri/tauri.conf.json`, dan `src-tauri/Cargo.toml` sudah identik.
- [ ] Build sukses tanpa error kompilasi.
- [ ] Signature installer sudah diekstrak ke `latest.json`.
- [ ] URL download di `latest.json` mengarah tepat ke tag rilis `v<VERSION>`.
- [ ] Commit dan tag Git sudah di-push ke remote repository.
