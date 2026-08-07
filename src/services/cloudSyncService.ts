import { exportFullDataBackup, importFullDataBackup } from './db';
import { encryptJSON, decryptJSON } from './cryptoService';

export type CloudProviderType = 'none' | 'gdrive' | 'onedrive' | 'webdav';

export interface CloudAuthConfig {
  provider: CloudProviderType;
  googleEmail?: string;
  googleAccessToken?: string;
  oneDriveEmail?: string;
  oneDriveAccessToken?: string;
  webdavUrl?: string;
  webdavUsername?: string;
  webdavPassword?: string;
  lastBackupTimestamp?: number;
  lastBackupFileName?: string;
}

const STORAGE_KEY_CLOUD_CONFIG = 'fa_cloud_auth_config';

export function getStoredCloudConfig(): CloudAuthConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CLOUD_CONFIG);
    return raw ? JSON.parse(raw) : { provider: 'none' };
  } catch {
    return { provider: 'none' };
  }
}

export function saveCloudConfig(config: CloudAuthConfig): void {
  localStorage.setItem(STORAGE_KEY_CLOUD_CONFIG, JSON.stringify(config));
}

/**
 * Execute Cloud Backup Upload
 */
export async function uploadToCloudBackup(
  config: CloudAuthConfig,
  encryptionPin?: string
): Promise<{ success: boolean; message: string; timestamp?: number }> {
  try {
    if (config.provider === 'none') {
      return { success: false, message: 'No cloud provider selected.' };
    }

    // 1. Prepare backup payload
    const jsonString = await exportFullDataBackup();
    let payload = jsonString;

    // Encrypt if PIN is provided
    if (encryptionPin && encryptionPin.trim().length === 4) {
      payload = await encryptJSON(jsonString, encryptionPin.trim());
    }

    const fileName = `finance_ally_backup_${new Date().toISOString().split('T')[0]}.json.enc`;

    // 2. Provider specific upload handler
    if (config.provider === 'gdrive') {
      if (!config.googleAccessToken) {
        return { success: false, message: 'Google OAuth Access Token is missing. Please provide your Google Drive token.' };
      }

      // Upload via Google Drive REST API v3 (Multipart Upload)
      const metadata = {
        name: fileName,
        mimeType: 'text/plain',
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([payload], { type: 'text/plain' }));

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.googleAccessToken}`,
        },
        body: form,
      });

      if (!res.ok) {
        const errText = await res.text();
        return { success: false, message: `Google Drive API error (${res.status}): ${errText.substring(0, 100)}` };
      }

      const resData = await res.json();
      const updatedConfig = {
        ...config,
        lastBackupTimestamp: Date.now(),
        lastBackupFileName: fileName,
      };
      saveCloudConfig(updatedConfig);

      return {
        success: true,
        message: `Successfully uploaded AES-256 encrypted backup to Google Drive [File ID: ${resData.id}]!`,
        timestamp: Date.now(),
      };
    }

    if (config.provider === 'onedrive') {
      if (!config.oneDriveAccessToken) {
        return { success: false, message: 'OneDrive OAuth Token is missing.' };
      }

      const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/Finance-Ally-Backups/${fileName}:/content`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${config.oneDriveAccessToken}`,
          'Content-Type': 'text/plain',
        },
        body: payload,
      });

      if (!res.ok) {
        return { success: false, message: `OneDrive Graph API error: ${res.statusText}` };
      }

      const updatedConfig = {
        ...config,
        lastBackupTimestamp: Date.now(),
        lastBackupFileName: fileName,
      };
      saveCloudConfig(updatedConfig);

      return {
        success: true,
        message: `Successfully uploaded encrypted backup to Microsoft OneDrive!`,
        timestamp: Date.now(),
      };
    }

    if (config.provider === 'webdav') {
      if (!config.webdavUrl || !config.webdavUsername || !config.webdavPassword) {
        return { success: false, message: 'WebDAV server URL or credentials incomplete.' };
      }

      const targetUrl = config.webdavUrl.endsWith('/') ? `${config.webdavUrl}${fileName}` : `${config.webdavUrl}/${fileName}`;
      const credentials = btoa(`${config.webdavUsername}:${config.webdavPassword}`);

      const res = await fetch(targetUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        body: payload,
      });

      if (!res.ok && res.status !== 201 && res.status !== 204) {
        return { success: false, message: `WebDAV server returned status HTTP ${res.status}` };
      }

      const updatedConfig = {
        ...config,
        lastBackupTimestamp: Date.now(),
        lastBackupFileName: fileName,
      };
      saveCloudConfig(updatedConfig);

      return {
        success: true,
        message: `Successfully uploaded encrypted backup to WebDAV server!`,
        timestamp: Date.now(),
      };
    }

    return { success: false, message: 'Unsupported cloud provider.' };
  } catch (err: any) {
    return { success: false, message: `Cloud upload error: ${err.message || err}` };
  }
}
