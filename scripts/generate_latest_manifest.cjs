const fs = require('fs');
const path = require('path');

const REPO_OWNER = 'harian12';
const REPO_NAME = 'MyTermin';

const version = require('../package.json').version;
const tagName = `v${version}`;

console.log(`[Release Helper] Memproses manifest untuk versi ${tagName}...`);

const nsisExe = path.resolve(__dirname, `../src-tauri/target/release/bundle/nsis/MyTermin_${version}_x64-setup.exe`);
const nsisSig = nsisExe + '.sig';

if (!fs.existsSync(nsisSig)) {
  console.error('Error: Signature file not found at', nsisSig);
  process.exit(1);
}

const signature = fs.readFileSync(nsisSig, 'utf8').trim();

const latestJson = {
  version: version,
  notes: `Release ${tagName} - Multi-Terminal & Code Editor Workspace with Auto Update Support.`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: signature,
      url: `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${tagName}/MyTermin_${version}_x64-setup.exe`
    }
  }
};

const latestJsonPath = path.resolve(__dirname, '../latest.json');
fs.writeFileSync(latestJsonPath, JSON.stringify(latestJson, null, 2), 'utf8');
console.log(`[Release Helper] latest.json berhasil dibuat di ${latestJsonPath}`);
console.log(JSON.stringify(latestJson, null, 2));
