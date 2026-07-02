// Configurazione Playwright per i test E2E del frontend.
// Presuppone frontend avviato su http://localhost:7000 e backend su 7001.
// Avviare manualmente i server prima di eseguire: npm run test:e2e

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  timeout: 30000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    // URL base del frontend
    baseURL: 'http://localhost:7000',
    // Cattura screenshot in caso di fallimento
    screenshot: 'only-on-failure',
    // Registra video in caso di fallimento
    video: 'retain-on-failure',
    // Locale italiano
    locale: 'it-IT',
  },

  projects: [
    {
      name: 'Chromium Desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
