// Configurazione Jest per i test API del backend (Supertest).
// I test E2E Playwright hanno configurazione separata in playwright.config.js.

/** @type {import('jest').Config} */
module.exports = {
  // Cerca i test solo nella cartella tests/api
  testMatch: ['**/tests/api/**/*.test.js'],

  // Carica le variabili d'ambiente di test prima di ogni suite
  globalSetup: './tests/setup.js',

  // Chiude il pool pg dell'app (backend/config/db.js) alla fine di ogni file di
  // test — gira nello stesso module registry del test, a differenza di
  // globalSetup che gira in un processo separato
  setupFilesAfterEnv: ['./tests/setup-after-env.js'],

  // Timeout generoso per query PostgreSQL lente in CI
  testTimeout: 15000,

  // Output in italiano leggibile
  verbose: true,

  // archiver v8 è ESM puro — lo sostituiamo con un mock per i test
  moduleNameMapper: {
    '^archiver$': '<rootDir>/tests/__mocks__/archiver.js',
  },

  // Risolvi i pacchetti npm prima dal backend (dove sono installati) poi dalla root
  modulePaths: [
    '<rootDir>/backend/node_modules',
    '<rootDir>/node_modules',
  ],
};
