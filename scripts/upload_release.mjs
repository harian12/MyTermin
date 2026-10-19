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
  const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version
  const tag = `v${version}`

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

  const releaseBody = `## MyTermin ${tag} 🚀

Pembaruan **MyTermin ${tag}** — fitur Sidebar Search & Replace ala VS Code, perbaikan Monaco web worker, dan optimalisasi anti not-responding.

---

### ✨ Apa yang Baru di ${tag}
1. **Sidebar Search & Replace (VS Code Style)**:
   - Panel pencarian & penggantian teks lengkap di sidebar dengan opsi Case Sensitive (\`Aa\`), Whole Word (\`ab\`), dan Regular Expression (\`.*\`).
   - Filter *files to include* dan *files to exclude*.
   - Fitur **"Cari di Folder Ini... (Find in Folder)"** via klik kanan folder di File Explorer.
   - Hasil pencarian dikelompokkan per berkas dengan highlight teks dan tombol ganti satuan / ganti semua.
   - Shortcut \`Ctrl + Shift + F\` otomatis membuka tab Search di sidebar.
2. **Perbaikan Monaco Web Worker**:
   - Inisialisasi Vite worker bundler (\`?worker\`) khusus untuk Monaco Editor (Editor, JSON, HTML, CSS, TypeScript) menghilangkan error \`webWorkerBootstrap.js\`.
3. **Pintasan Komentar & Positioning Tooltip**:
   - Pintasan \`Ctrl + /\` kini mengomentari baris kode di editor tanpa salah memicu Cheatsheet modal.
   - Perbaikan selektor CSS pada tooltip find widget agar tidak terpotong container editor.
4. **Optimalisasi Anti Not-Responding**:
   - Algoritma pencarian berkas dan diff computer dilengkapi trimming prefix/suffix, skipping file biner, dan safety break agar tidak membekukan UI thread pada proyek besar.

---

### 📦 File Unduhan
- **Windows Installer (.exe)**: \`MyTermin_${version}_x64-setup.exe\`
- **Signature Installer**: \`MyTermin_${version}_x64-setup.exe.sig\`
- **Updater Manifest**: \`latest.json\`
- **Windows MSI**: \`MyTermin_${version}_x64_en-US.msi\`
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
      name: `MyTermin ${tag}`,
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
      path: `D:\\MYP\\MyTermin\\src-tauri\\target\\release\\bundle\\nsis\\MyTermin_${version}_x64-setup.exe`,
      name: `MyTermin_${version}_x64-setup.exe`,
      contentType: 'application/vnd.microsoft.portable-executable'
    },
    {
      path: `D:\\MYP\\MyTermin\\src-tauri\\target\\release\\bundle\\nsis\\MyTermin_${version}_x64-setup.exe.sig`,
      name: `MyTermin_${version}_x64-setup.exe.sig`,
      contentType: 'text/plain'
    },
    {
      path: 'D:\\MYP\\MyTermin\\latest.json',
      name: 'latest.json',
      contentType: 'application/json'
    },
    {
      path: `D:\\MYP\\MyTermin\\src-tauri\\target\\release\\bundle\\msi\\MyTermin_${version}_x64_en-US.msi`,
      name: `MyTermin_${version}_x64_en-US.msi`,
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

  console.log(`\n🎉 Selesai! Semua file rilis installer ${tag} berhasil diunggah ke GitHub!`)
  console.log(`Kunjungi: ${releaseData.html_url}`)
}

run().catch(err => {
  console.error('Error saat upload release:', err)
  process.exit(1)
})
