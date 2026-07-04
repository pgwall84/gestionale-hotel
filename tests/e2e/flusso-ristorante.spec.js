// Test E2E — Flusso serata completa con 3 ruoli contemporanei
// Prerequisiti: frontend su http://localhost:7000, backend su http://localhost:7001
// Avviare entrambi i server PRIMA di eseguire: npm run test:e2e
//
// Il test usa 3 contesti browser separati (cookie isolati = sessioni distinte):
//   - Chromium: titolare
//   - Edge:     cameriere  (al posto di Firefox come da istruzioni)
//   - Chromium: cuoco      (secondo contesto Chromium)
//
// Selettori stabili basati su data-testid e data-* aggiunti ai componenti:
//   [data-tavolo-id], [data-stato], [data-testid="notifica-banner"],
//   [data-testid="comanda-card"], [data-testid="btn-avanza-cucina"]

const { test, expect, chromium, webkit } = require('@playwright/test');

const BASE = 'http://localhost:7000';

const UTENTI = {
  titolare:    { email: 'titolare@hoteldelgolfo.com',    password: 'Test1234!' },
  cameriere:   { email: 'cameriere@hoteldelgolfo.com',   password: 'Test1234!' },
  cuoco:       { email: 'cuoco@hoteldelgolfo.com',       password: 'Test1234!' },
};

// Helper: login in una pagina e attende il redirect post-login
async function loginCome(page, email, password) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /accedi/i }).click();
  // Dopo il login il redirect porta a /home o /sala o /cucina in base al ruolo
  await page.waitForURL(/\/(home|sala|cucina|ristorante|dashboard)/, { timeout: 10000 });
}

// Helper: aspetta che una card tavolo abbia lo stato atteso
async function aspettaStatoTavolo(page, tavoloNumero, statoAtteso, timeout = 15000) {
  await page.waitForSelector(
    `[data-tavolo-numero="${tavoloNumero}"][data-stato="${statoAtteso}"]`,
    { timeout }
  );
}

test.describe('Flusso serata completo — titolare + cameriere + cuoco', () => {

  // Timeout più lungo: il test coinvolge SSE e navigazioni multiple
  test.setTimeout(90000);

  test('serata completa: apertura comanda → cucina → notifica → chiusura', async () => {

    // ── Apertura 3 browser con sessioni separate ──────────────────────────────

    const browserChrome = await chromium.launch();
    const browserEdge   = await chromium.launch({
      // Simula Edge usando il flag channel (richiede Edge installato)
      // Se Edge non è disponibile, cade su Chromium standard
      channel: 'msedge',
    }).catch(() => chromium.launch()); // fallback a Chromium se Edge non trovato

    const ctxTitolare  = await browserChrome.newContext();
    const ctxCameriere = await browserEdge.newContext();
    const ctxCuoco     = await browserChrome.newContext();

    const titolare  = await ctxTitolare.newPage();
    const cameriere = await ctxCameriere.newPage();
    const cuoco     = await ctxCuoco.newPage();

    try {

      // ── LOGIN ───────────────────────────────────────────────────────────────

      await loginCome(titolare,  UTENTI.titolare.email,  UTENTI.titolare.password);
      await loginCome(cameriere, UTENTI.cameriere.email, UTENTI.cameriere.password);
      await loginCome(cuoco,     UTENTI.cuoco.email,     UTENTI.cuoco.password);

      // ── CUOCO: apre monitor cucina ─────────────────────────────────────────

      await cuoco.goto(`${BASE}/cucina`);
      // Pallino verde "In diretta" o heading visibile
      await expect(cuoco.locator('h1').filter({ hasText: /cucina/i })).toBeVisible({ timeout: 8000 });

      // ── CAMERIERE: apre mappa sala ─────────────────────────────────────────

      await cameriere.goto(`${BASE}/sala`);
      // Verifica che la griglia tavoli sia caricata
      await cameriere.waitForSelector('[data-tavolo-id]', { timeout: 10000 });

      // ── Trova tavolo 1 libero ──────────────────────────────────────────────

      // Cerca il tavolo 1 — deve essere libero (data-stato="libero")
      const tavoloUno = cameriere.locator('[data-tavolo-numero="1"][data-stato="libero"]');
      const tavolo1Visibile = await tavoloUno.isVisible();
      if (!tavolo1Visibile) {
        // Il tavolo 1 potrebbe essere già occupato da una sessione precedente.
        // Trova il primo tavolo libero disponibile.
        test.info().annotations.push({ type: 'warning', description: 'Tavolo 1 occupato, uso primo tavolo libero' });
      }

      // Seleziona il primo tavolo libero
      const primoTavoloLibero = cameriere.locator('[data-stato="libero"]').first();
      await expect(primoTavoloLibero).toBeVisible({ timeout: 5000 });
      const tavoloNumero = await primoTavoloLibero.getAttribute('data-tavolo-numero');

      // ── CAMERIERE: tocca il tavolo libero ─────────────────────────────────

      await primoTavoloLibero.click();

      // Bottom sheet deve apparire con le due opzioni
      const btnApriEVai = cameriere.getByRole('button', { name: /apri comanda e aggiungi piatti/i });
      await expect(btnApriEVai).toBeVisible({ timeout: 5000 });
      const btnSoloSegna = cameriere.getByRole('button', { name: /solo segna occupato/i });
      await expect(btnSoloSegna).toBeVisible();

      // ── CAMERIERE: sceglie "Apri e vai alle comande" ───────────────────────

      await btnApriEVai.click();

      // Navigazione SPA a /ristorante?comanda=X (senza full reload)
      await cameriere.waitForURL(/\/ristorante\?comanda=/, { timeout: 10000 });
      const urlComanda = cameriere.url();
      const comandaId = new URL(urlComanda).searchParams.get('comanda');
      expect(comandaId).toBeTruthy();

      // ── CAMERIERE: aggiunge un piatto dalla prima categoria disponibile ────

      // Espandi la prima categoria menu
      const primaCategoria = cameriere.locator('button').filter({ hasText: /\S+/ })
        .nth(1); // Il primo button è "← Sala", il secondo è la prima categoria
      // Approccio più robusto: cerca i bottoni che sembrano categorie (ChevronDown icon)
      const categorieButtons = cameriere.locator('button svg.lucide-chevron-down').locator('..');
      const numCategorie = await categorieButtons.count();

      if (numCategorie === 0) {
        test.skip(true, 'Nessuna categoria menu configurata — aggiungere piatti prima del test');
        return;
      }

      await categorieButtons.first().click();

      // Seleziona il primo piatto disponibile
      const primoBottonePiatto = cameriere.locator('button').filter({ hasText: /€/ }).first();
      const piattoDaAggiungere = await primoBottonePiatto.textContent();
      await primoBottonePiatto.click();

      // Attendi che la riga appaia nella comanda
      await cameriere.waitForSelector('[data-testid="riga-comanda"]', { timeout: 5000 });

      // ── CUOCO: verifica che il piatto appaia in tempo reale (SSE) ──────────

      // Il cuoco deve vedere la card del piatto entro 5 secondi (SSE cucina)
      await expect(cuoco.locator('[data-testid="comanda-card"]').first())
        .toBeVisible({ timeout: 8000 });

      // ── CUOCO: avanza lo stato → in_preparazione ───────────────────────────

      const cardCuoco = cuoco.locator('[data-testid="comanda-card"]').first();
      const btnIniziaPrep = cardCuoco.locator('[data-testid="btn-avanza-cucina"][data-stato-corrente="in_attesa"]');
      await btnIniziaPrep.click();

      // Attendi che la card mostri in_preparazione
      await cuoco.waitForSelector(
        '[data-testid="comanda-card"][data-stato="in_preparazione"]',
        { timeout: 5000 }
      );

      // ── CUOCO: avanza lo stato → pronto ────────────────────────────────────

      const cardInPrep = cuoco.locator('[data-testid="comanda-card"][data-stato="in_preparazione"]').first();
      const btnPronte = cardInPrep.locator('[data-testid="btn-avanza-cucina"][data-stato-corrente="in_preparazione"]');
      await btnPronte.click();

      // ── CAMERIERE: banner notifica "PRONTO" appare (SSE sala) ──────────────

      const bannerNotifica = cameriere.locator('[data-testid="notifica-banner"]');
      await expect(bannerNotifica).toBeVisible({ timeout: 8000 });
      await expect(bannerNotifica).toContainText(/PRONTO/i);

      // ── CAMERIERE: segna piatto "Servito" ──────────────────────────────────

      // Il cameriere può ora avanzare la riga da "pronto" a "servito"
      const rigaPronte = cameriere.locator('[data-testid="riga-comanda"][data-stato="pronto"]');
      await expect(rigaPronte).toBeVisible({ timeout: 5000 });
      const btnServito = rigaPronte.locator('[data-testid="btn-avanza-stato"]');
      await btnServito.click();

      // Riga diventa "servito"
      await cameriere.waitForSelector(
        '[data-testid="riga-comanda"][data-stato="servito"]',
        { timeout: 5000 }
      );

      // ── CAMERIERE: apre il conto e chiude la comanda ───────────────────────

      const btnConto = cameriere.getByRole('button', { name: /conto/i });
      await btnConto.click();

      // Modale conto visibile con totale
      await expect(cameriere.locator('text=/Totale/')).toBeVisible({ timeout: 5000 });

      const btnChiudi = cameriere.getByRole('button', { name: /chiudi comanda/i });
      await btnChiudi.click();

      // Dopo chiusura: torna a /sala (Fix 3 — 1 tap)
      await cameriere.waitForURL(/\/sala/, { timeout: 8000 });

      // ── CAMERIERE: verifica che il tavolo sia tornato libero ───────────────

      await aspettaStatoTavolo(cameriere, tavoloNumero, 'libero', 10000);
      const tavoloLiberato = cameriere.locator(
        `[data-tavolo-numero="${tavoloNumero}"][data-stato="libero"]`
      );
      await expect(tavoloLiberato).toBeVisible();

      // ── TITOLARE: verifica mappa aggiornata (SSE comanda_chiusa) ───────────

      await titolare.goto(`${BASE}/sala`);
      await aspettaStatoTavolo(titolare, tavoloNumero, 'libero', 10000);
      await expect(titolare.locator(`[data-tavolo-numero="${tavoloNumero}"][data-stato="libero"]`))
        .toBeVisible();

    } finally {
      // Chiusura ordinata di tutti i contesti
      await ctxTitolare.close();
      await ctxCameriere.close();
      await ctxCuoco.close();
      await browserChrome.close();
      await browserEdge.close();
    }
  });

  // ── Test isolato: bottom sheet su tavolo libero ──────────────────────────────

  test('bottom sheet: tavolo libero mostra le due opzioni', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      await loginCome(page, UTENTI.cameriere.email, UTENTI.cameriere.password);
      await page.goto(`${BASE}/sala`);
      await page.waitForSelector('[data-stato="libero"]', { timeout: 10000 });

      // Tocca il primo tavolo libero
      await page.locator('[data-stato="libero"]').first().click();

      // Bottom sheet deve mostrare entrambe le opzioni
      await expect(page.getByRole('button', { name: /apri comanda e aggiungi piatti/i }))
        .toBeVisible({ timeout: 5000 });
      await expect(page.getByRole('button', { name: /solo segna occupato/i }))
        .toBeVisible();
      await expect(page.getByRole('button', { name: /annulla/i }))
        .toBeVisible();

      // "Annulla" chiude il bottom sheet senza azione
      await page.getByRole('button', { name: /annulla/i }).click();
      await expect(page.getByRole('button', { name: /apri comanda e aggiungi piatti/i }))
        .not.toBeVisible({ timeout: 2000 });

    } finally {
      await ctx.close();
    }
  });

  // ── Test isolato: "← Sala" torna a /sala in 1 tap ───────────────────────────

  test('navigazione: "← Sala" torna a /sala senza passare dalla lista comande', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      await loginCome(page, UTENTI.cameriere.email, UTENTI.cameriere.password);
      await page.goto(`${BASE}/sala`);
      await page.waitForSelector('[data-stato="libero"]', { timeout: 10000 });

      // Apri comanda su primo tavolo libero
      await page.locator('[data-stato="libero"]').first().click();
      await page.getByRole('button', { name: /apri comanda e aggiungi piatti/i }).click();
      await page.waitForURL(/\/ristorante\?comanda=/, { timeout: 8000 });

      // Clicca "← Sala" — deve andare direttamente a /sala
      await page.getByRole('button', { name: /← Sala/i }).click();
      await page.waitForURL(/\/sala$/, { timeout: 5000 });

      // Verifica che siamo a /sala (non a /ristorante senza comanda)
      expect(page.url()).toMatch(/\/sala$/);

    } finally {
      await ctx.close();
    }
  });

});
