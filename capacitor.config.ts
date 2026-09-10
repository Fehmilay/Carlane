import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fehmilay.carlane',
  appName: 'CARLANE',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0b0b12',
    preferredContentMode: 'mobile',
    scrollEnabled: false,
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#0b0b12',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
  },
};

export default config;
