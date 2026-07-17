// Test E2E Playwright — vista griglia planning camere (Fase 2, Sessione 5).
// Presuppone frontend su http://localhost:7000 e backend su http://localhost:7001,
// database con camere.piano già popolato (prerequisito di questa sessione).
// Avviare i due server prima di eseguire: npm run test:e2e

const { test, expect, request } = require('@playwright/test');

const BACKEND_URL = 'http://localhost:7001/api';
const ADMIN_EMAIL = 'admin@hotel.it';
const ADMIN_PASSWORD = 'Admin1234';

function traGiorni(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// NOTA: non usa getByLabel — i <label> di frontend/app/login/page.jsx non
// hanno htmlFor/id collegati all'input (bug preesistente, non di questa
// sessione), quindi getByLabel non troverebbe mai il campo. Selettori per
// placeholder, coerenti col markup reale.
async function login(page) {
  await page.goto('/login');
  await page.getByPlaceholder('nome@hotel.it').fill(ADMIN_EMAIL);
  await page.getByPlaceholder('••••••••').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /accedi/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

// Contesto API autenticato riusando il token della sessione UI già loggata
// (niente firma JWT locale: evita una dipendenza da jsonwebtoken/pg non
// risolvibile da Playwright in questo repo — vedi jest.config.js modulePaths,
// meccanismo specifico di Jest non disponibile qui).
async function contestoApi(page) {
  const cookie = (await page.context().cookies()).find(c => c.name === 'token');
  return request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${cookie.value}` } });
}

// Nessun DELETE fisico previsto dal contratto per prenotazioni (solo
// transizione a 'interrotta', che il backend traduce anche in
// soggiorni.cancellato = true) — la pulizia dei dati sintetici del test
// usa lo stesso endpoint applicativo, non un accesso diretto al DB.
async function interrompi(api, prenotazioneId) {
  await api.patch(`${BACKEND_URL}/prenotazioni/${prenotazioneId}/stato`, { data: { stato: 'interrotta' } });
}

test.describe('Planning camere — griglia', () => {
  test('griglia si carica con i gruppi per piano e la legenda stati', async ({ page }) => {
    await login(page);
    await page.goto('/planning-camere');

    await expect(page.getByText('Piano 1')).toBeVisible();
    await expect(page.getByText('Appartamento esterno')).toBeVisible();
    await expect(page.getByRole('button', { name: '7 giorni' })).toBeVisible();
    await expect(page.getByText('Opzione')).toBeVisible();
    await expect(page.getByText('Confermata')).toBeVisible();
  });

  test('cambio range 7/14/mese aggiorna le colonne visibili', async ({ page }) => {
    await login(page);
    await page.goto('/planning-camere');

    const colonneVisibili = () => page.locator('main').getByText(/^(lun|mar|mer|gio|ven|sab|dom) \d+$/).count();

    await expect.poll(colonneVisibili).toBe(7);

    await page.getByRole('button', { name: '14 giorni' }).click();
    await expect.poll(colonneVisibili).toBe(14);

    await page.getByRole('button', { name: 'Mese' }).click();
    await expect.poll(colonneVisibili).toBeGreaterThanOrEqual(28);
  });

  test('drag and drop: sposta una prenotazione, rollback su conflitto 409', async ({ page }) => {
    await login(page);
    const api = await contestoApi(page);
    let prenA, prenB;

    try {
      const camereRes = await api.get(`${BACKEND_URL}/camere?data=${traGiorni(0)}`);
      const camere = (await camereRes.json()).camere.filter(c => c.numero !== 'app');
      const [cameraA, cameraB] = camere;

      const ospiteA = await (await api.post(`${BACKEND_URL}/ospiti`, { data: { nome: 'Test', cognome: 'PlaywrightA' } })).json();
      const ospiteB = await (await api.post(`${BACKEND_URL}/ospiti`, { data: { nome: 'Test', cognome: 'PlaywrightB' } })).json();

      const dataArrivo = traGiorni(1);
      const dataPartenza = traGiorni(3);

      prenA = await (await api.post(`${BACKEND_URL}/prenotazioni`, {
        data: {
          canale_origine: 'diretta',
          soggiorno: { camera_id: cameraA.id, ospite_id: ospiteA.id, data_arrivo: dataArrivo, data_partenza: dataPartenza, num_ospiti: 1 },
        },
      })).json();

      await page.goto('/planning-camere');
      const barraA = page.getByRole('button', { name: /PlaywrightA/ });
      await expect(barraA).toBeVisible();

      // Sposta la prenotazione di un giorno in avanti nella stessa camera (successo atteso)
      const box = await barraA.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 10 });
      await page.mouse.up();

      await expect.poll(async () => {
        const res = await api.get(`${BACKEND_URL}/prenotazioni/${prenA.id}`);
        const dati = await res.json();
        return dati.soggiorni[0].data_arrivo;
      }).not.toBe(dataArrivo);

      // Crea un secondo soggiorno in conflitto sulla camera B, poi prova a trascinarci sopra
      const dettaglioA = await (await api.get(`${BACKEND_URL}/prenotazioni/${prenA.id}`)).json();
      const nuovaDataArrivo = dettaglioA.soggiorni[0].data_arrivo;
      const nuovaDataPartenza = dettaglioA.soggiorni[0].data_partenza;

      prenB = await (await api.post(`${BACKEND_URL}/prenotazioni`, {
        data: {
          canale_origine: 'diretta',
          soggiorno: { camera_id: cameraB.id, ospite_id: ospiteB.id, data_arrivo: nuovaDataArrivo, data_partenza: nuovaDataPartenza, num_ospiti: 1 },
        },
      })).json();

      await page.reload();
      const barraAAggiornata = page.getByRole('button', { name: /PlaywrightA/ });
      const boxA = await barraAAggiornata.boundingBox();
      const barraB = page.getByRole('button', { name: /PlaywrightB/ });
      const boxB = await barraB.boundingBox();

      await page.mouse.move(boxA.x + boxA.width / 2, boxA.y + boxA.height / 2);
      await page.mouse.down();
      await page.mouse.move(boxB.x + boxB.width / 2, boxB.y + boxB.height / 2, { steps: 10 });
      await page.mouse.up();

      await expect(page.getByText(/Camera già occupata/i)).toBeVisible();
      // Rollback: la barra A deve restare visibile (drag fallito, nessuno stato incoerente)
      await expect(barraAAggiornata).toBeVisible();
    } finally {
      if (prenA) await interrompi(api, prenA.id).catch(() => {});
      if (prenB) await interrompi(api, prenB.id).catch(() => {});
      await api.dispose();
    }
  });
});
