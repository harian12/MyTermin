const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const path = require('path');

const keyPath = path.join(os.homedir(), '.tauri', 'mytermin.key');
const keyContent = fs.readFileSync(keyPath, 'utf8').trim();

const targetFile = path.resolve('src-tauri/target/release/bundle/nsis/MyTermin_0.2.1_x64-setup.exe');
console.log('Signing:', targetFile);

const env = {
  ...process.env,
  TAURI_SIGNING_PRIVATE_KEY: keyContent,
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: 'mytermin12'
};

const res = execSync(`npm.cmd exec -- tauri signer sign -p mytermin12 "${targetFile}"`, { env, encoding: 'utf8' });
console.log('Output:\n', res);

// Cek apakah .sig file terbentuk
const sigPath = targetFile + '.sig';
if (fs.existsSync(sigPath)) {
  console.log('Signature generated at:', sigPath);
  console.log('Signature:', fs.readFileSync(sigPath, 'utf8').trim());
} else {
  // Jika output string adalah signature
  fs.writeFileSync(sigPath, res.trim(), 'utf8');
  console.log('Wrote signature to:', sigPath);
}
