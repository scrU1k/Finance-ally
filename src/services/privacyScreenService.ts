import { registerPlugin, Capacitor } from '@capacitor/core';

interface PrivacyScreenPluginInterface {
  enable(): Promise<{ enabled: boolean }>;
  disable(): Promise<{ enabled: boolean }>;
}

const PrivacyScreen = registerPlugin<PrivacyScreenPluginInterface>('PrivacyScreen');

let securityHoldersCount = 0;

/**
 * Enable screenshot & screen capture blocking (FLAG_SECURE on Android).
 * Reference-counted to safely support multiple open modals / sensitive views.
 */
export async function enableScreenSecurity(): Promise<void> {
  securityHoldersCount++;
  if (Capacitor.isNativePlatform()) {
    try {
      await PrivacyScreen.enable();
    } catch (err) {
      console.warn('Failed to enable screen security:', err);
    }
  }
}

/**
 * Release screenshot & screen capture blocking.
 * Clears FLAG_SECURE once all holders release it.
 */
export async function disableScreenSecurity(): Promise<void> {
  securityHoldersCount = Math.max(0, securityHoldersCount - 1);
  if (securityHoldersCount === 0 && Capacitor.isNativePlatform()) {
    try {
      await PrivacyScreen.disable();
    } catch (err) {
      console.warn('Failed to disable screen security:', err);
    }
  }
}
