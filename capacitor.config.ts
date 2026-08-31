import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.DilMart.store',
  appName: 'DilMart Store',
  webDir: 'dist-mobile',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      // src/main.mobile.tsx hides the splash as soon as the customer shell has
      // rendered. This duration is only the fail-safe ceiling for the case where
      // that call never runs — the default 500ms fires before the bundle paints
      // and produces a white flash.
      launchShowDuration: 3000,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: '#ffffffff',
      showSpinner: false,
    },
  },
};

export default config;
