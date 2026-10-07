import type { CapacitorConfig } from '@capacitor/cli';
import { APP_ID, APP_NAME } from './src/config';

/** Native shell (T7.1). The app id comes from `src/config.ts`, its single definition. */
const config: CapacitorConfig = {
  appId: APP_ID,
  appName: APP_NAME,
  webDir: 'dist',
  backgroundColor: '#0b1020',
  android: {
    // Level codes are plain text; no mixed content or cleartext traffic is needed.
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#0b1020',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#0b1020',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#00000000',
    },
  },
};

export default config;
