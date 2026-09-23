import { ref, computed } from 'vue';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error';

const status = ref<UpdateStatus>('idle');
const statusMessage = ref('');
const availableUpdate = ref<Update | null>(null);
const downloadProgress = ref(0);
const downloadedBytes = ref(0);
const totalBytes = ref(0);
const newVersion = ref('');
const releaseNotes = ref('');

export function useUpdater() {
  const isChecking = computed(() => status.value === 'checking');
  const isDownloading = computed(() => status.value === 'downloading');
  const hasUpdate = computed(() => status.value === 'available' || status.value === 'downloaded');

  const checkForUpdates = async (silent = false) => {
    try {
      status.value = 'checking';
      statusMessage.value = 'Memeriksa pembaruan...';
      
      const update = await check();
      
      if (update?.available) {
        availableUpdate.value = update;
        newVersion.value = update.version;
        releaseNotes.value = update.body || '';
        status.value = 'available';
        statusMessage.value = `Versi ${update.version} tersedia!`;
        return true;
      } else {
        availableUpdate.value = null;
        status.value = 'up-to-date';
        statusMessage.value = 'Aplikasi sudah versi terbaru.';
        return false;
      }
    } catch (err: any) {
      console.error('Error checking for updates:', err);
      status.value = 'error';
      statusMessage.value = err?.message || 'Gagal memeriksa pembaruan';
      if (!silent) {
        // Biarkan error terlihat di UI
      }
      return false;
    }
  };

  const downloadAndInstall = async () => {
    if (!availableUpdate.value) return;

    try {
      status.value = 'downloading';
      downloadProgress.value = 0;
      downloadedBytes.value = 0;
      totalBytes.value = 0;
      statusMessage.value = 'Mengunduh pembaruan...';

      let downloaded = 0;
      let total = 0;

      await availableUpdate.value.downloadAndInstall((event) => {
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
      
      // Berikan jeda sejenak sebelum restart
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
      statusMessage.value = err?.message || 'Gagal mengunduh atau memasang pembaruan';
    }
  };

  return {
    status,
    statusMessage,
    availableUpdate,
    downloadProgress,
    downloadedBytes,
    totalBytes,
    newVersion,
    releaseNotes,
    isChecking,
    isDownloading,
    hasUpdate,
    checkForUpdates,
    downloadAndInstall,
  };
}
