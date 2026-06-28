import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ntems.ems',
  appName: 'NTEMS',
  webDir: 'out',
  server: {
    // For live reload on device: set CAPACITOR_DEV_URL in .env.local, e.g. http://192.168.1.x:3000
    // Leave unset (or omit this block) for production APK — app loads from bundled /out files
    ...(process.env.CAPACITOR_DEV_URL ? {
      url: process.env.CAPACITOR_DEV_URL,
      androidScheme: 'http',
      cleartext: true,
    } : {}),
  },
  ios: {
    contentInset: 'always', // respect safe areas (notch, home bar)
  },
  android: {
    // allowMixedContent: true, // uncomment if HTTP API in dev
  },
};

export default config;
