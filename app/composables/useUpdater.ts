import { ref, computed, shallowRef } from 'vue';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error';

const status = ref<UpdateStatus>('idle');
const statusMessage = ref('');
// Pakai shallowRef agar Vue reactivity proxy tidak merusak private fields (#rid / WeakMap) pada instance Update class
const rawUpdate = shallowRef<Update | null>(null);
const downloadProgress = ref(0);
const downloadedBytes = ref(0);
const totalBytes = ref(0);
const currentAppVersion = ref('0.2.1');
const newVersion = ref('');
const releaseNotes = ref('');

export function useUpdater() {
  const isChecking = computed(() => status.value === 'checking');
  const isDownloading = computed(() => status.value === 'downloading');
  const hasUpdate = computed(() => status.value === 'available' || status.value === 'downloaded');

  const fetchCurrentVersion = async () => {
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const v = await getVersion();
        if (v) currentAppVersion.value = v;
      }
    } catch {
      // Fallback
    }
  };

  const checkForUpdates = async (silent = false) => {
    try {
      await fetchCurrentVersion();
      status.value = 'checking';
      statusMessage.value = 'Memeriksa pembaruan...';
      
      const update = await check();
      
      if (update?.available) {
        rawUpdate.value = update;
        newVersion.value = update.version;
        releaseNotes.value = update.body || '';
        status.value = 'available';
        statusMessage.value = `Versi v${update.version} tersedia!`;
        return true;
      } else {
        rawUpdate.value = null;
        status.value = 'up-to-date';
        statusMessage.value = `Aplikasi sudah versi terbaru (v${currentAppVersion.value}).`;
        return false;
      }
    } catch (err: any) {
      console.error('Error checking for updates:', err);
      status.value = 'error';
      const detail = typeof err === 'string' 
        ? err 
        : (err?.message || (err ? JSON.stringify(err) : 'Gagal terhubung ke server update'));
      statusMessage.value = `Gagal memeriksa: ${detail}`;
      return false;
    }
  };

  const downloadAndInstall = async () => {
    const update = rawUpdate.value;
    if (!update) return;

    try {
      status.value = 'downloading';
      downloadProgress.value = 0;
      downloadedBytes.value = 0;
      totalBytes.value = 0;
      statusMessage.value = 'Mengunduh pembaruan...';

      let downloaded = 0;
      let total = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength || 0;
            totalBytes.value = total;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            downloadedBytes.value = downloaded;
            if (total > 0) {
              downloadProgress.value = Math.min(100, Math.round((downloaded / total) * 100));
            }
            break;
          case 'Finished':
            downloadProgress.value = 100;
            status.value = 'downloaded';
            statusMessage.value = 'Pembaruan siap dipasang.';
            break;
        }
      });

      status.value = 'downloaded';
      statusMessage.value = 'Pembaruan selesai diunduh. Memulai ulang aplikasi...';
      
      setTimeout(async () => {
        try {
          await relaunch();
        } catch (relaunchErr) {
          console.error('Gagal relaunch via plugin-process, coba restart manual:', relaunchErr);
        }
      }, 1000);
    } catch (err: any) {
      console.error('Gagal mendownload pembaruan:', err);
      status.value = 'error';
      const detail = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
      statusMessage.value = `Gagal mengunduh: ${detail}`;
    }
  };

  return {
    status,
    statusMessage,
    downloadProgress,
    downloadedBytes,
    totalBytes,
    currentAppVersion,
    newVersion,
    releaseNotes,
    isChecking,
    isDownloading,
    hasUpdate,
    fetchCurrentVersion,
    checkForUpdates,
    downloadAndInstall,
  };
}
