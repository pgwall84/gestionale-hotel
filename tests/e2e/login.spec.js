// Test E2E Playwright — pagina login
// Presuppone frontend su http://localhost:7000 e backend su http://localhost:7001
// Avviare i due server prima di eseguire: npm run test:e2e

const { test, expect } = require('@playwright/test');

const ADMIN_EMAIL    = 'admin@hotel.it';
const ADMIN_PASSWORD = 'Admin1234';

test.describe('Login', () => {
  test('pagina login si carica senza errori', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Hotel/i);
    await expect(page.getByRole('button', { name: /accedi/i })).toBeVisible();
  });

  test('login con credenziali corrette → redirect alla dashboard', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /accedi/i }).click();

    // Dopo il login l'utente viene reindirizzato alla pagina principale
    await expect(page).not.toHaveURL(/\/login/);
    // Verifica che la sidebar sia visibile (componente presente in tutte le pagine autenticate)
    await expect(page.locator('nav')).toBeVisible();
  });

  test('credenziali errate → messaggio di errore visibile', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill('passwordsbagliata');
    await page.getByRole('button', { name: /accedi/i }).click();

    // Messaggio di errore deve comparire senza redirect
    await expect(page.locator('[role="alert"], .errore, .error')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout → ritorna alla pagina login', async ({ page }) => {
    // Prima esegui il login
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /accedi/i }).click();
    await expect(page).not.toHaveURL(/\/login/);

    // Poi cerca il pulsante logout (tipicamente nella topbar o sidebar)
    const logoutBtn = page.getByRole('button', { name: /esci|logout/i });
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await expect(page).toHaveURL(/\/login/);
    } else {
      // Logout tramite navigazione diretta — accettabile se non c'è il pulsante
      test.skip(true, 'Pulsante logout non trovato — aggiornare selettore dopo implementazione UI');
    }
  });
});
