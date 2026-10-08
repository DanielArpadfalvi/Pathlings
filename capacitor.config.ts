import type { CapacitorConfig } from '@capacitor/cli';
import { APP_ID, APP_NAME } from './src/config';

/** Native shell (T7.1). The bundle id comes from src/config.ts – its only definition. */
const BACKGROUND = '#0b1020';

const config: CapacitorConfig = {
  appId: APP_ID,
  appName: APP_NAME,
  webDir: 'dist',
  backgroundColor: BACKGROUND,
  android: {
    backgroundColor: BACKGROUND,
    // Over-scroll glow is turned off natively in MainActivity (no config key for it).
  },
  ios: {
    backgroundColor: BACKGROUND,
    contentInset: 'never',
    // The game owns every touch: no rubber-band bounce, no link previews.
    scrollEnabled: false,
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      // Hidden by the app once the first frame is ready (platform/systemUi.ts).
      launchAutoHide: false,
      backgroundColor: BACKGROUND,
    },
    SystemBars: {
      // Edge-to-edge web view; safe areas come from env(safe-area-inset-*).
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      // Light system-bar icons on the dark game.
      style: 'DARK',
    },
  },
};

export default config;
