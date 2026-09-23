const fs = require('fs');
const https = require('https');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'harian12';
const REPO_NAME = 'MyTermin';
const TAG_NAME = 'v0.2.1';
const RELEASE_NAME = 'MyTermin v0.2.1';
const RELEASE_BODY = '## What\'s New in v0.2.1\n\n- ✨ **In-App Auto Update Support**: Pengecekan otomatis pembaruan saat startup & menu manual "Cek Update" di Settings.\n- 🔐 **Signed Updater Manifest**: Terintegrasi dengan Tauri Updater & Minisign signature.\n- 🛠️ **Improvements & Bugfixes**: Optimalisasi context menu clamp & window destroy freeze fix.';

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          resolve({ statusCode: res.statusCode, headers: res.headers, data: parsed, rawBody: body });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, rawBody: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function uploadAsset(uploadUrl, filePath, fileName, contentType) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(filePath);
    const urlObj = new URL(uploadUrl.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`));

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'User-Agent': 'NodeJS-Release-Script',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': contentType || 'application/octet-stream',
        'Content-Length': stat.size,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        console.log(`Uploaded ${fileName}: status ${res.statusCode}`);
        resolve();
      });
    });

    req.on('error', reject);
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(req);
  });
}

async function main() {
  console.log(`Checking release for tag ${TAG_NAME}...`);
  let res = await request({
    hostname: 'api.github.com',
    path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${TAG_NAME}`,
    method: 'GET',
    headers: {
      'User-Agent': 'NodeJS-Release-Script',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
    },
  });

  let release = res.data;
  if (res.statusCode === 404) {
    console.log(`Release not found. Creating release ${TAG_NAME}...`);
    const createRes = await request(
      {
        hostname: 'api.github.com',
        path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases`,
        method: 'POST',
        headers: {
          'User-Agent': 'NodeJS-Release-Script',
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
      JSON.stringify({
        tag_name: TAG_NAME,
        name: RELEASE_NAME,
        body: RELEASE_BODY,
        draft: false,
        prerelease: false,
      })
    );
    release = createRes.data;
  }

  console.log(`Release ID: ${release.id}`);
  const uploadUrl = release.upload_url;

  const assetsToUpload = [
    {
      filePath: path.resolve('src-tauri/target/release/bundle/nsis/MyTermin_0.2.1_x64-setup.exe'),
      fileName: 'MyTermin_0.2.1_x64-setup.exe',
      contentType: 'application/vnd.microsoft.portable-executable'
    },
    {
      filePath: path.resolve('src-tauri/target/release/bundle/nsis/MyTermin_0.2.1_x64-setup.exe.sig'),
      fileName: 'MyTermin_0.2.1_x64-setup.exe.sig',
      contentType: 'text/plain'
    },
    {
      filePath: path.resolve('src-tauri/target/release/bundle/msi/MyTermin_0.2.1_x64_en-US.msi'),
      fileName: 'MyTermin_0.2.1_x64_en-US.msi',
      contentType: 'application/x-msi'
    },
    {
      filePath: path.resolve('latest.json'),
      fileName: 'latest.json',
      contentType: 'application/json'
    },
    {
      filePath: path.resolve('src-tauri/target/release/mytermin.exe'),
      fileName: 'mytermin.exe',
      contentType: 'application/vnd.microsoft.portable-executable'
    }
  ];

  // Hapus asset lama jika ada
  if (release.assets && release.assets.length > 0) {
    for (const asset of release.assets) {
      console.log(`Deleting existing asset ${asset.name} (ID: ${asset.id})...`);
      await request({
        hostname: 'api.github.com',
        path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/assets/${asset.id}`,
        method: 'DELETE',
        headers: {
          'User-Agent': 'NodeJS-Release-Script',
          Authorization: `Bearer ${GITHUB_TOKEN}`,
        },
      });
    }
  }

  for (const item of assetsToUpload) {
    if (fs.existsSync(item.filePath)) {
      console.log(`Uploading ${item.fileName}...`);
      await uploadAsset(uploadUrl, item.filePath, item.fileName, item.contentType);
    } else {
      console.warn(`File not found: ${item.filePath}`);
    }
  }

  console.log('All assets uploaded successfully!');
}

main().catch(console.error);
