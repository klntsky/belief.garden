import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv'; // Load environment variables

const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: envFile });

export default defineConfig({
  workers: 1,
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        headless: !!process.env.HEADLESS_BROWSER,
        // Use the custom executable path from the environment variable
        launchOptions: {
          executablePath: process.env.BROWSER_PATH,
          // args: [
          //   '--no-remote', // Disable remote connections
          // ],
        },
        contextOptions: {
          userDataDir: './dir/', // Temporary profile directory
        },
      },
    },
    // You can add other browsers (firefox, webkit) similarly
  ],
});
