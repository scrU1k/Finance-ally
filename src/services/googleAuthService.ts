import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';

const GOOGLE_CLIENT_ID = '';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

let initialized = false;

export async function initGoogleAuth() {
  if (initialized) return;
  try {
    GoogleAuth.initialize({
      clientId: GOOGLE_CLIENT_ID,
      scopes: [DRIVE_SCOPE, 'email', 'profile'],
      grantOfflineAccess: true,
    });
    initialized = true;
  } catch (e) {
    console.warn('GoogleAuth init warning:', e);
  }
}

export async function triggerGoogleOAuthSignIn(customClientId?: string): Promise<{ success: boolean; email?: string; token?: string; error?: string }> {
  const clientId = customClientId?.trim() || GOOGLE_CLIENT_ID;

  if (Capacitor.isNativePlatform()) {
    try {
      await initGoogleAuth();
      const googleUser = await GoogleAuth.signIn();
      const token = googleUser.authentication?.accessToken || googleUser.authentication?.idToken;
      const email = googleUser.email || 'connected.user@gmail.com';
      if (token) {
        return { success: true, token, email };
      }
      return { success: false, error: 'No access token returned from Google Auth.' };
    } catch (err: any) {
      console.error('Native Google Sign-In error:', err);
      return { success: false, error: err?.message || 'Native Google Sign-In failed.' };
    }
  }

  // Web Browser Flow
  return new Promise((resolve) => {
    try {
      if (typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2) {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: DRIVE_SCOPE,
          callback: (response: any) => {
            if (response.access_token) {
              resolve({
                success: true,
                token: response.access_token,
                email: response.email || 'connected.user@gmail.com'
              });
            } else {
              resolve({ success: false, error: response.error || 'Google Sign-In was cancelled.' });
            }
          },
          error_callback: (err: any) => {
            resolve({ success: false, error: err?.message || 'Google Auth Error' });
          }
        });
        client.requestAccessToken();
      } else {
        const width = 500;
        const height = 600;
        const left = (window.innerWidth - width) / 2;
        const top = (window.innerHeight - height) / 2;

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `response_type=token` +
          `&client_id=${encodeURIComponent(clientId)}` +
          `&redirect_uri=${encodeURIComponent(window.location.origin)}` +
          `&scope=${encodeURIComponent(DRIVE_SCOPE)}` +
          `&prompt=consent`;

        const popup = window.open(authUrl, 'GoogleDriveSignIn', `width=${width},height=${height},top=${top},left=${left}`);
        if (!popup) {
          resolve({ success: false, error: 'Popup blocked by browser.' });
          return;
        }

        const timer = setInterval(() => {
          try {
            if (popup.closed) {
              clearInterval(timer);
              resolve({ success: false, error: 'Sign-in window closed.' });
            }
            if (popup.location.hash) {
              const params = new URLSearchParams(popup.location.hash.substring(1));
              const token = params.get('access_token');
              if (token) {
                clearInterval(timer);
                popup.close();
                resolve({ success: true, token, email: 'user@gmail.com' });
              }
            }
          } catch {
            // Cross-origin check
          }
        }, 500);
      }
    } catch (e: any) {
      resolve({ success: false, error: e?.message || 'Failed to initiate Google OAuth' });
    }
  });
}
