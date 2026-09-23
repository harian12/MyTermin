import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

async function run() {
  console.log('Mengambil kredensial GitHub dari Git Credential Manager...')
  const credOutput = execSync('git credential fill', {
    input: 'protocol=https\nhost=github.com\n',
    encoding: 'utf-8'
  })

  let token = ''
  for (const line of credOutput.split('\n')) {
    if (line.startsWith('password=')) {
      token = line.replace('password=', '').trim()
    }
  }

  if (!token) {
    throw new Error('Token GitHub tidak ditemukan di credential manager.')
  }

  const owner = 'harian12'
  const repo = 'MyTermin'
  const tag = 'v0.2.1'

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'MyTermin-Release-Uploader'
  }

  console.log(`Memeriksa apakah release ${tag} sudah ada...`)
  const checkRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, { headers })

  if (checkRes.ok) {
    const existing = await checkRes.json()
    console.log(`Release lama ditemukan (ID: ${existing.id}), menghapus untuk fresh upload...`)
    await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/${existing.id}`, {
      method: 'DELETE',
      headers
    })
  }

  const releaseBody = `## MyTermin v0.2.1 🚀

Pembaruan **MyTermin v0.2.1** menghadirkan dukungan **In-App Auto Update** bawaan, perbaikan popup context menu viewport clamp, serta stabilitas sesi.

---

### ✨ Apa yang Baru di v0.2.1
1. **In-App Auto Update**:
   - Pengecekan otomatis versi baru saat startup di background.
   - Menu manual **Cek Update** di modal Pengaturan (\`SettingsModal\`).
   - Progress bar download dan auto-relaunch setelah update terpasang.
   - Keamanan dengan tanda tangan kriptografi (Minisign ed25519 signature & \`latest.json\`).

2. **Perbaikan Viewport & Context Menu**:
   - Perbaikan posisi popup context menu tree file & tab editor agar tidak pernah keluar dari batas layar (*viewport clamping*).
   - Animasi transisi context menu \`zoom-in-95\` yang lebih mulus.

---

### 📦 File Installer & Manifest Unduhan
- **Windows Installer Setup (.exe NSIS)**: \`MyTermin_0.2.1_x64-setup.exe\`
- **Signature Installer**: \`MyTermin_0.2.1_x64-setup.exe.sig\`
- **Updater Manifest**: \`latest.json\`
- **Windows MSI Installer**: \`MyTermin_0.2.1_x64_en-US.msi\`
- **Portable Binary (.exe)**: \`mytermin.exe\`
`

  console.log(`Membuat Release ${tag} baru...`)
  const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: 'main',
      name: 'MyTermin v0.2.1',
      body: releaseBody,
      draft: false,
      prerelease: false
    })
  })

  if (!createRes.ok) {
    const errText = await createRes.text()
    throw new Error(`Gagal membuat release: ${createRes.status} ${errText}`)
  }

  const releaseData = await createRes.json()
  console.log(`✓ Release berhasil dibuat! ID: ${releaseData.id}`)
  console.log(`URL Release: ${releaseData.html_url}`)

  const uploadBase = releaseData.upload_url.replace(/\{\?name,label\}/, '')

  const assets = [
    {
      path: 'D:\\MYP\\MyTermin\\src-tauri\\target\\release\\bundle\\nsis\\MyTermin_0.2.1_x64-setup.exe',
      name: 'MyTermin_0.2.1_x64-setup.exe',
      contentType: 'application/vnd.microsoft.portable-executable'
    },
    {
      path: 'D:\\MYP\\MyTermin\\src-tauri\\target\\release\\bundle\\nsis\\MyTermin_0.2.1_x64-setup.exe.sig',
      name: 'MyTermin_0.2.1_x64-setup.exe.sig',
      contentType: 'text/plain'
    },
    {
      path: 'D:\\MYP\\MyTermin\\latest.json',
      name: 'latest.json',
      contentType: 'application/json'
    },
    {
      path: 'D:\\MYP\\MyTermin\\src-tauri\\target\\release\\bundle\\msi\\MyTermin_0.2.1_x64_en-US.msi',
      name: 'MyTermin_0.2.1_x64_en-US.msi',
      contentType: 'application/x-msi'
    },
    {
      path: 'D:\\MYP\\MyTermin\\src-tauri\\target\\release\\mytermin.exe',
      name: 'mytermin.exe',
      contentType: 'application/vnd.microsoft.portable-executable'
    }
  ]

  for (const asset of assets) {
    if (!fs.existsSync(asset.path)) {
      console.error(`File tidak ditemukan: ${asset.path}`)
      continue
    }

    const fileStat = fs.statSync(asset.path)
    console.log(`Mengunggah ${asset.name} (${(fileStat.size / (1024 * 1024)).toFixed(2)} MB)...`)
    const fileBuffer = fs.readFileSync(asset.path)

    const uploadRes = await fetch(`${uploadBase}?name=${encodeURIComponent(asset.name)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': asset.contentType,
        'Content-Length': fileStat.size.toString(),
        'User-Agent': 'MyTermin-Release-Uploader'
      },
      body: fileBuffer
    })

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      console.error(`✗ Gagal mengunggah ${asset.name}: ${uploadRes.status} ${err}`)
    } else {
      const uploadedData = await uploadRes.json()
      console.log(`✓ ${asset.name} berhasil diunggah! (ID: ${uploadedData.id})`)
    }
  }

  console.log('\n🎉 Selesai! Semua file rilis installer v0.2.1 berhasil diunggah ke GitHub!')
  console.log(`Kunjungi: ${releaseData.html_url}`)
}

run().catch(err => {
  console.error('Error saat upload release:', err)
  process.exit(1)
})
