# Booking Engine Diretto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prenotazione diretta con caparra Stripe sul sito (`sito-hotel`), che parla con nuove route pubbliche del gestionale esistente (`gestionale-hotel`), riusando motore tariffe, state machine prenotazioni e pipeline email pre-checkin già in produzione.

**Architecture:** Nessun servizio intermedio. `sito-hotel` (Next.js/Vercel) chiama direttamente nuove route pubbliche non autenticate sul backend Express esistente (`gestionale-hotel`), stesso pattern già in produzione per `/api/pre-checkin-pubblico`. Stripe gestisce il pagamento (PaymentIntent + Payment Element embedded, PCI scope minimo); un webhook dedicato conferma lo stato lato gestionale. Spec di riferimento: `docs/superpowers/specs/2026-08-19-booking-engine-diretto-design.md`.

**Tech Stack:** Node.js/Express/PostgreSQL (gestionale-hotel, esistente), Next.js 16/React 19 App Router (sito-hotel, esistente), Stripe (`stripe` SDK backend, `@stripe/stripe-js` + `@stripe/react-stripe-js` frontend — dipendenze nuove).

## Global Constraints

- Query SQL sempre con parametri preparati ($1, $2...), mai concatenazione stringhe (CLAUDE.md Sezione 5).
- `tariffa_totale`/prezzo non è MAI accettato dal client sulle route pubbliche — sempre ricalcolato server-side via `calcolaTariffa`.
- Nessuna nuova tabella/colonna: `prenotazioni.stato/data_scadenza_opzione`, `pagamenti.tipo/stato/external_payment_id` bastano già (verificato su `docs/PRENOTAZIONI_FASE2.md`).
- `canale_origine = 'sito_diretto'` è il marcatore esclusivo delle prenotazioni di questo modulo — non tocca mai `canale_origine = 'diretta'` (telefono) né la sua evolutiva separata (opzione 48h, `docs/EVOLUTIVE.md`).
- Cron nuovi si avviano solo in `backend/server.js`, mai in `backend/app.js` (i test Jest/Supertest importano `app.js` direttamente — un cron lì girerebbe anche in test, convenzione già in uso per `promemoriaEmail.js`/`invioAlloggiatiWeb.js`).
- Commenti nel codice in italiano, spiegano cosa fa la funzione, chi può accedervi, dipendenze rilevanti (CLAUDE.md Sezione 5).
- `sito-hotel` non ha oggi un test runner configurato (nessun Jest/RTL in `package.json`) — i task frontend si verificano con `npm run build` + QA manuale, non con test automatici. Non introdurre un test runner nuovo in questo piano: fuori scope.

---

## Backend — gestionale-hotel

### Task 1: Estrarre `calcolaTariffa` da `tariffeController.calcola`

Refactor a comportamento invariato (stesso pattern già usato in questo repo per `gestisciConflittoCamera`, estratto da `prenotazioniController.crea`) — prerequisito per Task 3, che deve calcolare il prezzo senza una chiamata HTTP interna.

**Files:**
- Modify: `backend/controllers/tariffeController.js`
- Test: `tests/api/tariffe.test.js` (test di regressione, non nuovo file)

**Interfaces:**
- Produce: `calcolaTariffa(tipoCameraId, dataArrivo, dataPartenza)` → `Promise<{ num_notti, prezzo_totale, notti_scoperte }>`, usata da Task 3 e Task 4.

- [ ] **Step 1: Scrivi il test di regressione (comportamento HTTP invariato)**

Aggiungi in `tests/api/tariffe.test.js`, vicino agli altri test di `GET /api/tariffe/calcola`:

```js
test('GET /api/tariffe/calcola continua a rispondere con lo stesso formato dopo il refactor', async () => {
  const res = await request(app)
    .get(`/api/tariffe/calcola?tipo_camera_id=${tipoCameraTestId}&data_arrivo=2099-03-01&data_partenza=2099-03-03`)
    .set(headerReceptionist);
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('num_notti');
  expect(res.body).toHaveProperty('prezzo_totale');
  expect(res.body).toHaveProperty('notti_scoperte');
});
```

- [ ] **Step 2: Esegui il test — deve già passare (comportamento attuale, prima del refactor)**

Run: `npm test -- tests/api/tariffe.test.js -t "continua a rispondere"`
Expected: PASS (verifica il comportamento attuale prima di toccare il codice).

- [ ] **Step 3: Estrai la funzione pura**

In `backend/controllers/tariffeController.js`, sostituisci il corpo di `calcola` estraendo la query in una funzione dedicata:

```js
// Calcola il prezzo totale di un soggiorno per una categoria camera, notte
// per notte, dal listino tariffe (modulo 2.2). Funzione pura riusabile sia
// dall'endpoint HTTP GET /api/tariffe/calcola sia dalle route pubbliche del
// booking engine (backend/controllers/bookingPubblicoController.js) — il
// prezzo non deve mai essere accettato dal client, va sempre ricalcolato
// da qui. Ritorna prezzo_totale: null se una o più notti non hanno una
// tariffa configurata (mai un totale silenziosamente incompleto).
async function calcolaTariffa(tipoCameraId, dataArrivo, dataPartenza) {
  const result = await pool.query(
    `SELECT n.notte::date AS notte, t.prezzo_notte
     FROM generate_series($2::date, $3::date - INTERVAL '1 day', INTERVAL '1 day') AS n(notte)
     LEFT JOIN tariffe t
       ON t.tipo_camera_id = $1
      AND n.notte::date BETWEEN t.data_inizio AND t.data_fine
     ORDER BY n.notte`,
    [tipoCameraId, dataArrivo, dataPartenza]
  );

  const nottiScoperte = result.rows.filter(r => r.prezzo_notte === null).map(r => r.notte);
  const prezzoTotale = result.rows.reduce((somma, r) => somma + (r.prezzo_notte ? Number(r.prezzo_notte) : 0), 0);

  return {
    num_notti: result.rows.length,
    prezzo_totale: nottiScoperte.length === 0 ? prezzoTotale : null,
    notti_scoperte: nottiScoperte,
  };
}

// GET /api/tariffe/calcola — invariato nel comportamento, ora chiama
// calcolaTariffa invece di ripetere la query.
async function calcola(req, res) {
  const { tipo_camera_id, data_arrivo, data_partenza } = req.query;
  if (!tipo_camera_id || !data_arrivo || !data_partenza) {
    return res.status(400).json({ error: 'tipo_camera_id, data_arrivo e data_partenza sono obbligatori.' });
  }
  if (data_partenza <= data_arrivo) {
    return res.status(400).json({ error: 'data_partenza deve essere successiva a data_arrivo.' });
  }
  try {
    const risultato = await calcolaTariffa(tipo_camera_id, data_arrivo, data_partenza);
    res.json(risultato);
  } catch (err) {
    console.error('calcola tariffa error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}
```

Aggiorna `module.exports` in fondo al file aggiungendo `calcolaTariffa` a quanto già esportato.

- [ ] **Step 4: Esegui di nuovo il test — deve passare identico**

Run: `npm test -- tests/api/tariffe.test.js`
Expected: PASS, incluso l'intero file (nessuna regressione sugli altri test già presenti).

- [ ] **Step 5: Commit**

```bash
git add backend/controllers/tariffeController.js tests/api/tariffe.test.js
git commit -m "refactor: estrae calcolaTariffa da tariffeController.calcola per riuso nel booking engine"
```

---

### Task 2: Client Stripe backend + dipendenza + variabili d'ambiente

**Files:**
- Create: `backend/lib/stripeClient.js`
- Modify: `backend/package.json`
- Modify: `backend/.env.example`
- Modify: `backend/.env.test` (chiave fittizia, mai reale nei test)

**Interfaces:**
- Produce: `stripe` (istanza client Stripe SDK), importata da Task 4 e Task 6.

- [ ] **Step 1: Aggiungi la dipendenza**

Motivo da riportare nel changelog del commit (CLAUDE.md: "non installare nuove dipendenze senza descrivere il motivo"): SDK ufficiale Stripe, necessaria per creare PaymentIntent e verificare la firma dei webhook — nessuna alternativa più leggera per queste due operazioni.

```bash
cd backend && npm install stripe
```

- [ ] **Step 2: Crea il client**

```js
// backend/lib/stripeClient.js — istanza condivisa dell'SDK Stripe.
// Usata da bookingPubblicoController (creazione PaymentIntent) e da
// stripeWebhookController (verifica firma webhook). Modulo Booking Engine
// Diretto, 19/08/2026 — vedi docs/superpowers/specs/2026-08-19-booking-engine-diretto-design.md.

const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV !== 'test') {
  console.error('STRIPE_SECRET_KEY non configurata in .env — le route booking-pubblico falliranno.');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder_solo_per_test');

module.exports = stripe;
```

- [ ] **Step 3: Aggiungi le variabili d'ambiente**

In `backend/.env.example`, in fondo al file:

```
# Stripe (Booking Engine Diretto, modulo 19/08/2026) — caparra 30% via
# PaymentIntent, saldo incassato in hotel con il POS Nexi esistente.
# Chiavi di test (sk_test_/pk_test_) finché non si passa in produzione.
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

In `backend/.env.test`, aggiungi una chiave fittizia (mai una vera — stesso principio già in uso per Alloggiati Web in questo file):

```
STRIPE_SECRET_KEY=sk_test_fittizia_per_i_test
STRIPE_WEBHOOK_SECRET=whsec_fittizia_per_i_test
```

- [ ] **Step 4: Verifica che l'app si avvii ancora senza errori**

Run: `cd backend && node -e "require('./app.js'); console.log('OK')"`
Expected: stampa `OK`, nessuna eccezione.

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/lib/stripeClient.js backend/.env.example backend/.env.test
git commit -m "feat: aggiunge client Stripe e variabili d'ambiente per il booking engine diretto"
```

---

### Task 3: `GET /api/booking-pubblico/disponibilita`

**Files:**
- Create: `backend/controllers/bookingPubblicoController.js`
- Test: `tests/api/bookingPubblico.test.js`

**Interfaces:**
- Consumes: `calcolaTariffa(tipoCameraId, dataArrivo, dataPartenza)` da Task 1.
- Produces: `disponibilita(req, res)`, esportata per Task 5.

- [ ] **Step 1: Scrivi il test che deve fallire**

```js
// tests/api/bookingPubblico.test.js
// Test suite — Booking Engine Diretto (modulo 19/08/2026). Route pubbliche,
// nessun token: GET disponibilita, POST prenota, POST webhook Stripe.
// Usa date fittizie nel 2099 e una camera/tipo camera dedicati, stesso
// pattern di prenotazioni.test.js.

const request = require('supertest');
const app     = require('../../backend/app');
const { getPool, chiudiPool } = require('../helpers/db');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
let tipoCameraTestId;
let cameraTestId;
const prenotazioniCreate = [];

beforeAll(async () => {
  const db = getPool();
  const tipo = await db.query(
    `INSERT INTO tipi_camera (nome, capienza_max) VALUES ($1, 2) RETURNING id`,
    [`TestBookingEngine${SUFFISSO}`]
  );
  tipoCameraTestId = tipo.rows[0].id;

  const camera = await db.query(
    `INSERT INTO camere (numero, nome, piano, tipo_camera_id, attivo) VALUES ($1, 'Camera Test Booking Engine', 9, $2, true) RETURNING id`,
    [`TEST-BE${SUFFISSO}`, tipoCameraTestId]
  );
  cameraTestId = camera.rows[0].id;

  await db.query(
    `INSERT INTO tariffe (tipo_camera_id, nome_stagione, data_inizio, data_fine, prezzo_notte)
     VALUES ($1, 'Test', '2099-01-01', '2099-12-31', 100)`,
    [tipoCameraTestId]
  );
});

afterAll(async () => {
  const db = getPool();
  if (prenotazioniCreate.length) {
    await db.query('DELETE FROM pagamenti WHERE prenotazione_id = ANY($1)', [prenotazioniCreate]);
    await db.query('DELETE FROM soggiorno_ospiti WHERE soggiorno_id IN (SELECT id FROM soggiorni WHERE prenotazione_id = ANY($1))', [prenotazioniCreate]);
    await db.query('DELETE FROM soggiorni WHERE prenotazione_id = ANY($1)', [prenotazioniCreate]);
    await db.query('DELETE FROM prenotazioni WHERE id = ANY($1)', [prenotazioniCreate]);
  }
  await db.query('DELETE FROM tariffe WHERE tipo_camera_id = $1', [tipoCameraTestId]);
  await db.query('DELETE FROM camere WHERE id = $1', [cameraTestId]);
  await db.query('DELETE FROM tipi_camera WHERE id = $1', [tipoCameraTestId]);
  await chiudiPool();
});

describe('GET /api/booking-pubblico/disponibilita', () => {
  test('senza token, ritorna il tipo camera con prezzo calcolato', async () => {
    const res = await request(app)
      .get('/api/booking-pubblico/disponibilita')
      .query({ data_arrivo: '2099-06-01', data_partenza: '2099-06-03', ospiti: 2 });

    expect(res.status).toBe(200);
    const trovato = res.body.find(t => t.id === tipoCameraTestId);
    expect(trovato).toBeDefined();
    expect(trovato.prezzo_totale).toBe(200);
  });

  test('400 se mancano le date', async () => {
    const res = await request(app).get('/api/booking-pubblico/disponibilita').query({ ospiti: 2 });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Esegui il test — deve fallire (route non esiste ancora)**

Run: `npm test -- tests/api/bookingPubblico.test.js`
Expected: FAIL — `Cannot find module '../../backend/routes/bookingPubblico'` o 404, a seconda di cosa è già montato (a questo punto niente).

- [ ] **Step 3: Implementa il controller**

```js
// backend/controllers/bookingPubblicoController.js
// Booking Engine Diretto (modulo 19/08/2026) — route pubbliche, NESSUNA
// autenticazione, stesso principio di sicurezza di
// preCheckinPubblicoController.js: protette da rate limit dedicato
// (backend/routes/bookingPubblico.js), mai da verificaToken. Vedi
// docs/superpowers/specs/2026-08-19-booking-engine-diretto-design.md.

const pool = require('../config/db');
const { calcolaTariffa } = require('./tariffeController');
const { gestisciConflittoCamera } = require('../utils/erroriDb');
const stripe = require('../lib/stripeClient');

const CANALE_ORIGINE_BOOKING_ENGINE = 'sito_diretto';
const MINUTI_VALIDITA_HOLD = 15;
const PERCENTUALE_CAPARRA = 0.30;

// GET /api/booking-pubblico/disponibilita?data_arrivo=&data_partenza=&ospiti=
// Ritorna i tipi camera con almeno una camera attiva libera nell'intervallo
// richiesto, con il prezzo totale dal motore tariffe (modulo 2.2). Il
// prezzo non è mai fidato dal client: viene sempre ricalcolato qui e di
// nuovo in prenota() prima di generare il PaymentIntent.
async function disponibilita(req, res) {
  const { data_arrivo, data_partenza, ospiti } = req.query;
  if (!data_arrivo || !data_partenza) {
    return res.status(400).json({ error: 'data_arrivo e data_partenza sono obbligatori.' });
  }
  if (data_partenza <= data_arrivo) {
    return res.status(400).json({ error: 'data_partenza deve essere successiva a data_arrivo.' });
  }
  const numOspiti = parseInt(ospiti, 10) || 1;

  try {
    const tipiResult = await pool.query(
      `SELECT DISTINCT tc.id, tc.nome, tc.capienza_max
       FROM tipi_camera tc
       WHERE (tc.capienza_max IS NULL OR tc.capienza_max >= $3)
         AND EXISTS (
           SELECT 1 FROM camere c
           WHERE c.tipo_camera_id = tc.id AND c.attivo = true
             AND NOT EXISTS (
               SELECT 1 FROM soggiorni s
               WHERE s.camera_id = c.id AND s.cancellato = false
                 AND daterange(s.data_arrivo, s.data_partenza, '[)') && daterange($1::date, $2::date, '[)')
             )
         )
       ORDER BY tc.nome`,
      [data_arrivo, data_partenza, numOspiti]
    );

    const tipiConPrezzo = await Promise.all(
      tipiResult.rows.map(async (tipo) => {
        const tariffa = await calcolaTariffa(tipo.id, data_arrivo, data_partenza);
        return { ...tipo, ...tariffa };
      })
    );

    res.json(tipiConPrezzo.filter(t => t.prezzo_totale !== null));
  } catch (err) {
    console.error('disponibilita booking pubblico error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}

module.exports = { disponibilita, CANALE_ORIGINE_BOOKING_ENGINE, MINUTI_VALIDITA_HOLD, PERCENTUALE_CAPARRA };
```

- [ ] **Step 4: Crea la route e montala (minimo indispensabile per far passare il test di questo task)**

```js
// backend/routes/bookingPubblico.js
// Route pubbliche Booking Engine Diretto — /api/booking-pubblico (modulo
// 19/08/2026). NESSUN verificaToken: protette da rate limit dedicato,
// stesso principio di routes/preCheckinPubblico.js.

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/bookingPubblicoController');

const bookingRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppe richieste. Riprova tra qualche minuto.' },
});

router.use(bookingRateLimit);

router.get('/disponibilita', ctrl.disponibilita);

module.exports = router;
```

In `backend/app.js`, aggiungi vicino agli altri require di route:

```js
const bookingPubblicoRoutes = require('./routes/bookingPubblico');
```

E nella sezione route, dopo il blocco `/api/pre-checkin-pubblico` (stesso commento di ordinamento già presente per quel blocco si applica anche qui — nessuna ambiguità di prefisso con questa in particolare, ma per coerenza la teniamo vicino alle altre route pubbliche):

```js
app.use('/api/booking-pubblico', bookingPubblicoRoutes);
```

- [ ] **Step 5: Esegui il test — deve passare**

Run: `npm test -- tests/api/bookingPubblico.test.js`
Expected: PASS su entrambi i test di `disponibilita` (gli altri `describe` di questo file falliranno ancora — verranno aggiunti nei task successivi).

- [ ] **Step 6: Commit**

```bash
git add backend/controllers/bookingPubblicoController.js backend/routes/bookingPubblico.js backend/app.js tests/api/bookingPubblico.test.js
git commit -m "feat: GET /api/booking-pubblico/disponibilita"
```

---

### Task 4: `POST /api/booking-pubblico/prenota`

Blocco camera atomico + creazione ospite + PaymentIntent Stripe per la caparra.

**Files:**
- Modify: `backend/controllers/bookingPubblicoController.js`
- Modify: `backend/routes/bookingPubblico.js`
- Test: `tests/api/bookingPubblico.test.js`

**Interfaces:**
- Consumes: `calcolaTariffa` (Task 1), `stripe.paymentIntents.create` (Stripe SDK, Task 2), `gestisciConflittoCamera(err, res)` (`utils/erroriDb.js`, esistente).
- Produces: `prenota(req, res)`, risposta `{ prenotazione_id, importo_caparra, client_secret, scadenza_hold }`.

- [ ] **Step 1: Scrivi i test che devono fallire**

Aggiungi in `tests/api/bookingPubblico.test.js`:

```js
describe('POST /api/booking-pubblico/prenota', () => {
  test('crea una prenotazione opzione con hold breve e un PaymentIntent', async () => {
    const res = await request(app)
      .post('/api/booking-pubblico/prenota')
      .send({
        tipo_camera_id: tipoCameraTestId,
        data_arrivo: '2099-07-01',
        data_partenza: '2099-07-03',
        num_ospiti: 2,
        nome: 'Mario',
        cognome: 'Rossi',
        email: `mario.rossi${SUFFISSO}@example.com`,
        telefono: '3331234567',
      });

    expect(res.status).toBe(201);
    expect(res.body.client_secret).toBeDefined();
    expect(res.body.importo_caparra).toBe(60); // 30% di 200
    prenotazioniCreate.push(res.body.prenotazione_id);

    const db = getPool();
    const prenotazione = await db.query('SELECT stato, canale_origine, data_scadenza_opzione FROM prenotazioni WHERE id = $1', [res.body.prenotazione_id]);
    expect(prenotazione.rows[0].stato).toBe('opzione');
    expect(prenotazione.rows[0].canale_origine).toBe('sito_diretto');

    const pagamento = await db.query('SELECT tipo, stato, importo FROM pagamenti WHERE prenotazione_id = $1', [res.body.prenotazione_id]);
    expect(pagamento.rows[0].tipo).toBe('caparra');
    expect(pagamento.rows[0].stato).toBe('pending');
    expect(Number(pagamento.rows[0].importo)).toBe(60);
  });

  test('409 se la camera è già occupata in quelle date (nessun tipo camera alternativo libero)', async () => {
    // Prima prenotazione occupa l'unica camera del tipo test.
    const prima = await request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoCameraTestId, data_arrivo: '2099-08-01', data_partenza: '2099-08-03',
      nome: 'Anna', cognome: 'Bianchi', email: `anna${SUFFISSO}@example.com`,
    });
    prenotazioniCreate.push(prima.body.prenotazione_id);

    const seconda = await request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoCameraTestId, data_arrivo: '2099-08-02', data_partenza: '2099-08-04',
      nome: 'Luca', cognome: 'Verdi', email: `luca${SUFFISSO}@example.com`,
    });
    expect(seconda.status).toBe(409);
  });

  test('400 se mancano nome/cognome/email', async () => {
    const res = await request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoCameraTestId, data_arrivo: '2099-09-01', data_partenza: '2099-09-03',
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

Run: `npm test -- tests/api/bookingPubblico.test.js -t "prenota"`
Expected: FAIL (route non esiste, 404).

- [ ] **Step 3: Implementa `prenota` in `bookingPubblicoController.js`**

Aggiungi sotto `disponibilita`, prima di `module.exports`:

```js
// POST /api/booking-pubblico/prenota
// Crea una prenotazione con blocco camera breve (opzione, TTL 15 minuti) e
// genera il PaymentIntent Stripe per il 30% di caparra. SICUREZZA:
// tariffa_totale non è mai accettata dal client — sempre ricalcolata qui
// via calcolaTariffa. Il blocco (verifica disponibilità + riserva) è
// atomico nella stessa transazione: due richieste concorrenti sulla stessa
// camera/date non possono superare entrambe il controllo (backstop finale:
// il vincolo excl_soggiorni_camera_overlap a livello DB, tradotto in 409 da
// gestisciConflittoCamera).
async function prenota(req, res) {
  const { tipo_camera_id, data_arrivo, data_partenza, num_ospiti, nome, cognome, email, telefono } = req.body;

  if (!tipo_camera_id || !data_arrivo || !data_partenza) {
    return res.status(400).json({ error: 'tipo_camera_id, data_arrivo e data_partenza sono obbligatori.' });
  }
  if (data_partenza <= data_arrivo) {
    return res.status(400).json({ error: 'data_partenza deve essere successiva a data_arrivo.' });
  }
  if (!nome || !cognome || !email) {
    return res.status(400).json({ error: 'nome, cognome ed email sono obbligatori.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Sweep di cortesia: libera eventuali hold di QUESTO canale scaduti,
    // prima del controllo disponibilità. Scoped solo a canale_origine
    // 'sito_diretto' — non tocca mai le opzioni prese per telefono (canale
    // 'diretta', TTL 48h, evolutiva separata di cron automatico, vedi
    // docs/EVOLUTIVE.md). Lo stesso sweep gira anche nel cron dedicato
    // (Task 8) — qui è solo una garanzia aggiuntiva per non far fallire
    // inutilmente una richiesta arrivata tra due esecuzioni del cron.
    await client.query(
      `UPDATE soggiorni s SET cancellato = true
       FROM prenotazioni p
       WHERE s.prenotazione_id = p.id
         AND p.canale_origine = $1 AND p.stato = 'opzione'
         AND p.data_scadenza_opzione < NOW() AND s.cancellato = false`,
      [CANALE_ORIGINE_BOOKING_ENGINE]
    );
    await client.query(
      `UPDATE prenotazioni SET stato = 'interrotta'
       WHERE canale_origine = $1 AND stato = 'opzione' AND data_scadenza_opzione < NOW()`,
      [CANALE_ORIGINE_BOOKING_ENGINE]
    );

    const tariffa = await calcolaTariffa(tipo_camera_id, data_arrivo, data_partenza);
    if (tariffa.prezzo_totale === null) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Non è disponibile una tariffa per queste date.' });
    }

    const cameraResult = await client.query(
      `SELECT c.id FROM camere c
       WHERE c.tipo_camera_id = $1 AND c.attivo = true
         AND NOT EXISTS (
           SELECT 1 FROM soggiorni s
           WHERE s.camera_id = c.id AND s.cancellato = false
             AND daterange(s.data_arrivo, s.data_partenza, '[)') && daterange($2::date, $3::date, '[)')
         )
       ORDER BY c.id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [tipo_camera_id, data_arrivo, data_partenza]
    );
    if (!cameraResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Nessuna camera disponibile per queste date.' });
    }
    const cameraId = cameraResult.rows[0].id;

    // Ospite: cerca per email, altrimenti crea. Match minimo (solo email),
    // sufficiente per non duplicare richieste ripetute dello stesso ospite
    // dal sito — non i criteri più ampi usati in reception.
    const ospiteEsistente = await client.query(
      `SELECT id FROM ospiti WHERE email = $1 ORDER BY id LIMIT 1`,
      [email]
    );
    let ospiteId;
    if (ospiteEsistente.rows.length) {
      ospiteId = ospiteEsistente.rows[0].id;
      await client.query(`UPDATE ospiti SET telefono = COALESCE($2, telefono) WHERE id = $1`, [ospiteId, telefono || null]);
    } else {
      const nuovoOspite = await client.query(
        `INSERT INTO ospiti (nome, cognome, email, telefono) VALUES ($1, $2, $3, $4) RETURNING id`,
        [nome, cognome, email, telefono || null]
      );
      ospiteId = nuovoOspite.rows[0].id;
    }

    const prenotazioneResult = await client.query(
      `INSERT INTO prenotazioni (canale_origine, stato, data_scadenza_opzione)
       VALUES ($1, 'opzione', NOW() + make_interval(mins => $2))
       RETURNING *`,
      [CANALE_ORIGINE_BOOKING_ENGINE, MINUTI_VALIDITA_HOLD]
    );
    const prenotazione = prenotazioneResult.rows[0];

    const soggiornoResult = await client.query(
      `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti, tariffa_totale)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [prenotazione.id, cameraId, ospiteId, data_arrivo, data_partenza, num_ospiti || 1, tariffa.prezzo_totale]
    );

    await client.query(
      `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato) VALUES ($1, $2, '17')`,
      [soggiornoResult.rows[0].id, ospiteId]
    );

    const importoCaparra = Math.round(tariffa.prezzo_totale * PERCENTUALE_CAPARRA * 100) / 100;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(importoCaparra * 100),
      currency: 'eur',
      metadata: { prenotazione_id: String(prenotazione.id) },
      description: `Caparra prenotazione #${prenotazione.id} — Hotel del Golfo`,
    });

    await client.query(
      `INSERT INTO pagamenti (prenotazione_id, importo, tipo, stato, external_payment_id)
       VALUES ($1, $2, 'caparra', 'pending', $3)`,
      [prenotazione.id, importoCaparra, paymentIntent.id]
    );

    await client.query('COMMIT');
    res.status(201).json({
      prenotazione_id: prenotazione.id,
      importo_caparra: importoCaparra,
      client_secret: paymentIntent.client_secret,
      scadenza_hold: prenotazione.data_scadenza_opzione,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (gestisciConflittoCamera(err, res)) return;
    console.error('prenota booking pubblico error:', err);
    res.status(500).json({ error: 'Errore interno' });
  } finally {
    client.release();
  }
}
```

Aggiorna `module.exports`:

```js
module.exports = { disponibilita, prenota, CANALE_ORIGINE_BOOKING_ENGINE, MINUTI_VALIDITA_HOLD, PERCENTUALE_CAPARRA };
```

- [ ] **Step 4: Aggiungi la route**

In `backend/routes/bookingPubblico.js`, dopo `router.get('/disponibilita', ...)`:

```js
router.post('/prenota', ctrl.prenota);
```

- [ ] **Step 5: Esegui i test — devono passare**

Run: `npm test -- tests/api/bookingPubblico.test.js`
Expected: PASS su tutti i test finora scritti (`disponibilita` + `prenota`). Nota: il test Stripe richiede `STRIPE_SECRET_KEY` valorizzata anche solo come chiave di test fittizia in `.env.test` (Task 2) — con una chiave completamente inventata, `stripe.paymentIntents.create` fallirà con un errore di autenticazione Stripe reale. **Usa una vera chiave `sk_test_...` di un account Stripe di test per `.env.test`** (le chiavi di test non processano soldi reali), non una stringa a caso — annotalo se non disponibile ancora e blocca qui in attesa della chiave, non proseguire con un mock che nasconderebbe problemi di integrazione reali.

- [ ] **Step 6: Commit**

```bash
git add backend/controllers/bookingPubblicoController.js backend/routes/bookingPubblico.js tests/api/bookingPubblico.test.js
git commit -m "feat: POST /api/booking-pubblico/prenota — blocco camera atomico + PaymentIntent"
```

---

### Task 5: Test di concorrenza sul blocco camera

Verifica esplicita che due richieste simultanee sulla stessa camera/date non possano bloccarla entrambe — il requisito di sicurezza centrale di questo modulo.

**Files:**
- Test: `tests/api/bookingPubblico.test.js`

- [ ] **Step 1: Scrivi il test di concorrenza**

```js
test('due richieste concorrenti sulla stessa camera/date: solo una riesce', async () => {
  // Tipo camera con UNA sola camera attiva (già il caso di tipoCameraTestId
  // in questa suite) — due richieste in parallelo sulle stesse date.
  const [prima, seconda] = await Promise.all([
    request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoCameraTestId, data_arrivo: '2099-10-01', data_partenza: '2099-10-03',
      nome: 'Concorrente', cognome: 'Uno', email: `concorrente1${SUFFISSO}@example.com`,
    }),
    request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoCameraTestId, data_arrivo: '2099-10-01', data_partenza: '2099-10-03',
      nome: 'Concorrente', cognome: 'Due', email: `concorrente2${SUFFISSO}@example.com`,
    }),
  ]);

  const successi = [prima, seconda].filter(r => r.status === 201);
  const conflitti = [prima, seconda].filter(r => r.status === 409);
  expect(successi.length).toBe(1);
  expect(conflitti.length).toBe(1);

  if (successi[0]) prenotazioniCreate.push(successi[0].body.prenotazione_id);
});
```

- [ ] **Step 2: Esegui il test**

Run: `npm test -- tests/api/bookingPubblico.test.js -t "concorrenti"`
Expected: PASS. Se fallisce con entrambe le richieste a 201, il blocco `FOR UPDATE SKIP LOCKED` + vincolo `excl_soggiorni_camera_overlap` non stanno funzionando insieme come previsto — non proseguire oltre finché non è verde, è la garanzia anti-overbooking di tutto il modulo.

- [ ] **Step 3: Commit**

```bash
git add tests/api/bookingPubblico.test.js
git commit -m "test: verifica concorrenza sul blocco camera booking engine"
```

---

### Task 6: Email di notifica per hold scaduto e rimborso

Prerequisito per Task 7 (il webhook la richiama).

**Files:**
- Modify: `backend/lib/emailPrenotazioni.js`

**Interfaces:**
- Produces: `inviaNotificaHoldScaduto(prenotazioneId)` → `Promise<{ ok, motivo?, destinatario? }>`, usata da Task 7.

- [ ] **Step 1: Aggiungi la funzione**

In `backend/lib/emailPrenotazioni.js`, dopo `inviaConfermaPrenotazione`:

```js
// Notifica di rimborso automatico per un hold scaduto (Booking Engine
// Diretto, 19/08/2026) — caso limite deciso esplicitamente da Marco il
// 19/08/2026: se il pagamento Stripe arriva dopo la scadenza del blocco
// (15 minuti), si rimborsa sempre, nessuna eccezione per onorare la
// prenotazione. Testo fisso, NON gestito da Impostazioni ▸ Testi email
// come le altre tre email (conferma/promemoria/recensione) — evento raro,
// non giustifica un quarto template configurabile per l'MVP di questo
// modulo. Stesso principio "best effort" delle altre funzioni di questo
// file: non deve mai far fallire il webhook che la chiama.
async function inviaNotificaHoldScaduto(prenotazioneId) {
  try {
    const destinatario = await recuperaDestinatario(prenotazioneId);
    if (!destinatario) {
      console.error(`[email] notifica hold scaduto ${prenotazioneId}: nessun destinatario disponibile`);
      return { ok: false, motivo: 'Nessun destinatario con email trovato per questa prenotazione.' };
    }
    const oggetto = `${NOME_HOTEL} — richiesta di prenotazione non confermata in tempo`;
    const corpo = `<p>Gentile ${destinatario.nome},</p>
      <p>il pagamento della caparra è arrivato oltre il tempo massimo previsto (15 minuti) per confermare la disponibilità della camera, che nel frattempo potrebbe essere stata prenotata da un altro ospite.</p>
      <p>L'importo addebitato è stato rimborsato automaticamente sulla stessa carta utilizzata — il rimborso comparirà sull'estratto conto entro alcuni giorni lavorativi, secondo i tempi della banca.</p>
      <p>Se desidera riprovare, può ripetere la prenotazione dal sito o contattarci direttamente.</p>`;
    const html = await involucroHtml(oggetto, corpo);
    const esito = await inviaEmail({ destinatario: destinatario.email, oggetto, html });
    if (!esito.ok) {
      console.error(`[email] notifica hold scaduto ${prenotazioneId} non inviata:`, esito.errore);
      return { ok: false, motivo: esito.errore };
    }
    return { ok: true, destinatario: destinatario.email };
  } catch (err) {
    console.error(`[email] notifica hold scaduto ${prenotazioneId} — errore imprevisto:`, err.message);
    return { ok: false, motivo: err.message };
  }
}
```

Aggiorna `module.exports` in fondo al file aggiungendo `inviaNotificaHoldScaduto`.

- [ ] **Step 2: Verifica che il file sia sintatticamente valido**

Run: `cd backend && node -c lib/emailPrenotazioni.js`
Expected: nessun output (nessun errore di sintassi).

- [ ] **Step 3: Commit**

```bash
git add backend/lib/emailPrenotazioni.js
git commit -m "feat: email di notifica rimborso per hold scaduto (booking engine diretto)"
```

---

### Task 7: Webhook Stripe

Endpoint dedicato, verifica firma obbligatoria, conferma pagamento o rimborso su hold scaduto. **Attenzione all'ordine dei middleware in `app.js`** (dettaglio critico, vedi Step 4): il webhook deve ricevere il body grezzo, non JSON già parsato — altrimenti la verifica della firma Stripe fallisce sempre.

**Files:**
- Create: `backend/controllers/stripeWebhookController.js`
- Create: `backend/routes/stripeWebhook.js`
- Modify: `backend/app.js`
- Test: `tests/api/bookingPubblico.test.js`

**Interfaces:**
- Consumes: `stripe.webhooks.constructEvent` (Task 2), `inviaConfermaPrenotazione`/`inviaInvitoPreCheckin` (esistenti, `lib/emailPrenotazioni.js`), `inviaNotificaHoldScaduto` (Task 6).

- [ ] **Step 1: Scrivi i test che devono fallire**

```js
describe('POST /api/stripe/webhook', () => {
  function creaEventoFirmato(payload, secret) {
    const timestamp = Math.floor(Date.now() / 1000);
    const payloadString = JSON.stringify(payload);
    const firmaPayload = `${timestamp}.${payloadString}`;
    const crypto = require('crypto');
    const firma = crypto.createHmac('sha256', secret).update(firmaPayload, 'utf8').digest('hex');
    return { header: `t=${timestamp},v1=${firma}`, body: payloadString };
  }

  test('400 se la firma non è valida', async () => {
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=123,v1=firma_finta')
      .send(JSON.stringify({ type: 'payment_intent.succeeded', data: { object: {} } }));
    expect(res.status).toBe(400);
  });

  test('conferma la prenotazione e crea il pagamento completato quando il webhook arriva entro i 15 minuti', async () => {
    const prenotazione = await request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoCameraTestId, data_arrivo: '2099-11-01', data_partenza: '2099-11-03',
      nome: 'Webhook', cognome: 'Test', email: `webhook${SUFFISSO}@example.com`,
    });
    prenotazioniCreate.push(prenotazione.body.prenotazione_id);

    const db = getPool();
    const pagamento = await db.query('SELECT external_payment_id FROM pagamenti WHERE prenotazione_id = $1', [prenotazione.body.prenotazione_id]);
    const paymentIntentId = pagamento.rows[0].external_payment_id;

    const evento = {
      type: 'payment_intent.succeeded',
      data: { object: { id: paymentIntentId, metadata: { prenotazione_id: String(prenotazione.body.prenotazione_id) } } },
    };
    const { header, body } = creaEventoFirmato(evento, process.env.STRIPE_WEBHOOK_SECRET);

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', header)
      .send(body);

    expect(res.status).toBe(200);

    const prenotazioneAggiornata = await db.query('SELECT stato FROM prenotazioni WHERE id = $1', [prenotazione.body.prenotazione_id]);
    expect(prenotazioneAggiornata.rows[0].stato).toBe('confermata');

    const pagamentoAggiornato = await db.query('SELECT stato FROM pagamenti WHERE prenotazione_id = $1', [prenotazione.body.prenotazione_id]);
    expect(pagamentoAggiornato.rows[0].stato).toBe('completato');
  });

  test('rimborsa e interrompe la prenotazione se il webhook arriva dopo la scadenza del blocco', async () => {
    const prenotazione = await request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoCameraTestId, data_arrivo: '2099-12-01', data_partenza: '2099-12-03',
      nome: 'Scaduto', cognome: 'Test', email: `scaduto${SUFFISSO}@example.com`,
    });
    prenotazioniCreate.push(prenotazione.body.prenotazione_id);

    const db = getPool();
    await db.query(`UPDATE prenotazioni SET data_scadenza_opzione = NOW() - INTERVAL '1 minute' WHERE id = $1`, [prenotazione.body.prenotazione_id]);
    const pagamento = await db.query('SELECT external_payment_id FROM pagamenti WHERE prenotazione_id = $1', [prenotazione.body.prenotazione_id]);
    const paymentIntentId = pagamento.rows[0].external_payment_id;

    const evento = {
      type: 'payment_intent.succeeded',
      data: { object: { id: paymentIntentId, metadata: { prenotazione_id: String(prenotazione.body.prenotazione_id) } } },
    };
    const { header, body } = creaEventoFirmato(evento, process.env.STRIPE_WEBHOOK_SECRET);

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', header)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.rimborsato).toBe(true);

    const prenotazioneAggiornata = await db.query('SELECT stato FROM prenotazioni WHERE id = $1', [prenotazione.body.prenotazione_id]);
    expect(prenotazioneAggiornata.rows[0].stato).toBe('interrotta');

    const pagamentoAggiornato = await db.query('SELECT stato FROM pagamenti WHERE prenotazione_id = $1', [prenotazione.body.prenotazione_id]);
    expect(pagamentoAggiornato.rows[0].stato).toBe('rimborsato');
  });
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

Run: `npm test -- tests/api/bookingPubblico.test.js -t "webhook"`
Expected: FAIL (route `/api/stripe/webhook` non esiste, 404).

- [ ] **Step 3: Implementa il controller**

```js
// backend/controllers/stripeWebhookController.js
// Endpoint dedicato ai webhook Stripe (Booking Engine Diretto, 19/08/2026)
// — MAI chiamato dal frontend, solo da Stripe. La verifica della firma
// (stripe.webhooks.constructEvent) è obbligatoria e non bypassabile: senza,
// chiunque potrebbe confermare prenotazioni finte senza aver pagato. Idempotente:
// un evento duplicato su una prenotazione già non più in stato 'opzione'
// non ripete nessuna azione (Stripe può reinviare lo stesso evento più volte).

const pool = require('../config/db');
const stripe = require('../lib/stripeClient');
const { inviaConfermaPrenotazione, inviaInvitoPreCheckin, inviaNotificaHoldScaduto } = require('../lib/emailPrenotazioni');

async function webhook(req, res) {
  const firma = req.headers['stripe-signature'];
  let evento;
  try {
    evento = stripe.webhooks.constructEvent(req.body, firma, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Firma webhook Stripe non valida:', err.message);
    return res.status(400).json({ error: 'Firma non valida' });
  }

  if (evento.type !== 'payment_intent.succeeded') {
    // Altri eventi (es. payment_intent.payment_failed) riconosciuti ma
    // senza azione: il blocco resta valido fino a scadenza, l'ospite può
    // ritentare il pagamento sullo stesso client_secret.
    return res.status(200).json({ ricevuto: true });
  }

  const paymentIntent = evento.data.object;
  const prenotazioneId = paymentIntent.metadata && paymentIntent.metadata.prenotazione_id;
  if (!prenotazioneId) {
    console.error('Webhook Stripe: payment_intent senza metadata.prenotazione_id', paymentIntent.id);
    return res.status(200).json({ ricevuto: true });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const prenotazione = await client.query(
      `SELECT id, stato, data_scadenza_opzione FROM prenotazioni WHERE id = $1 FOR UPDATE`,
      [prenotazioneId]
    );
    if (!prenotazione.rows.length) {
      await client.query('ROLLBACK');
      return res.status(200).json({ ricevuto: true });
    }
    const { stato, data_scadenza_opzione } = prenotazione.rows[0];

    if (stato !== 'opzione') {
      await client.query('COMMIT');
      return res.status(200).json({ ricevuto: true });
    }

    const scaduta = new Date(data_scadenza_opzione) < new Date();
    if (scaduta) {
      // Caso limite deciso il 19/08/2026: rimborso automatico, nessuna
      // eccezione per onorare la prenotazione fuori dai 15 minuti.
      await client.query(`UPDATE prenotazioni SET stato = 'interrotta', updated_at = NOW() WHERE id = $1`, [prenotazioneId]);
      await client.query(`UPDATE soggiorni SET cancellato = true WHERE prenotazione_id = $1`, [prenotazioneId]);
      await client.query(
        `UPDATE pagamenti SET stato = 'rimborsato' WHERE prenotazione_id = $1 AND external_payment_id = $2`,
        [prenotazioneId, paymentIntent.id]
      );
      await client.query('COMMIT');

      await stripe.refunds.create({ payment_intent: paymentIntent.id });
      inviaNotificaHoldScaduto(prenotazioneId).catch(err => {
        console.error('invio notifica hold scaduto — errore imprevisto:', err.message);
      });

      return res.status(200).json({ ricevuto: true, rimborsato: true });
    }

    await client.query(`UPDATE prenotazioni SET stato = 'confermata', updated_at = NOW() WHERE id = $1`, [prenotazioneId]);
    await client.query(
      `UPDATE pagamenti SET stato = 'completato' WHERE prenotazione_id = $1 AND external_payment_id = $2`,
      [prenotazioneId, paymentIntent.id]
    );

    await client.query('COMMIT');

    // Email dopo la commit, fire-and-forget — stesso pattern già in uso in
    // prenotazioniController.aggiornaStato.
    inviaConfermaPrenotazione(prenotazioneId).catch(err => {
      console.error('invio email conferma (booking pubblico) — errore imprevisto:', err.message);
    });
    inviaInvitoPreCheckin(prenotazioneId).catch(err => {
      console.error('invio invito pre-checkin (booking pubblico) — errore imprevisto:', err.message);
    });

    res.status(200).json({ ricevuto: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('webhook stripe error:', err);
    res.status(500).json({ error: 'Errore interno' });
  } finally {
    client.release();
  }
}

module.exports = { webhook };
```

- [ ] **Step 4: Crea la route con body grezzo**

```js
// backend/routes/stripeWebhook.js
// Route dedicata al webhook Stripe — DEVE ricevere il body grezzo (Buffer),
// non JSON già parsato, altrimenti stripe.webhooks.constructEvent non può
// verificare la firma. Per questo è montata in app.js PRIMA di
// app.use(express.json()) globale — vedi commento in app.js.

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/stripeWebhookController');

router.post('/', express.raw({ type: 'application/json' }), ctrl.webhook);

module.exports = router;
```

- [ ] **Step 5: Monta la route PRIMA di `express.json()` in `app.js`**

Questo è il dettaglio più a rischio di tutto il modulo: se il webhook viene montato dopo `app.use(express.json())`, il body arriva già parsato come oggetto JS e la verifica della firma fallisce sempre (Stripe richiede i byte grezzi esatti). In `backend/app.js`, aggiungi il require vicino agli altri:

```js
const stripeWebhookRoutes = require('./routes/stripeWebhook');
```

E sposta/aggiungi il mount **prima** della riga `app.use(express.json());`:

```js
app.use(cookieParser());

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : true,
  credentials: true,
}));

// Webhook Stripe (Booking Engine Diretto) — DEVE stare prima di
// express.json() globale: la route legge il body grezzo per verificare la
// firma della richiesta, un middleware express.json() a monte lo
// invaliderebbe. Vedi backend/routes/stripeWebhook.js.
app.use('/api/stripe/webhook', stripeWebhookRoutes);

app.use(express.json());
```

- [ ] **Step 6: Esegui i test — devono passare**

Run: `npm test -- tests/api/bookingPubblico.test.js`
Expected: PASS su tutti i test del file, incluso il webhook.

- [ ] **Step 7: Commit**

```bash
git add backend/controllers/stripeWebhookController.js backend/routes/stripeWebhook.js backend/app.js tests/api/bookingPubblico.test.js
git commit -m "feat: webhook Stripe — conferma pagamento o rimborso automatico su hold scaduto"
```

---

### Task 8: Cron di scadenza hold booking engine

Libera in modo pulito le camere di hold abbandonati anche quando nessuno effettua una nuova richiesta sulla stessa camera — evita che restino visibili come "opzione" (ambra) sulla griglia planning per sempre.

**Files:**
- Create: `backend/jobs/scadenzaHoldBookingEngine.js`
- Modify: `backend/server.js`

**Interfaces:**
- Produce: `avviaJobScadenzaHoldBookingEngine()`, chiamata da `server.js` (mai da `app.js` — vedi Global Constraints).

- [ ] **Step 1: Implementa il job**

```js
// backend/jobs/scadenzaHoldBookingEngine.js
// Cron di scadenza per gli hold del Booking Engine Diretto (modulo
// 19/08/2026) — SOLO canale_origine='sito_diretto', TTL 15 minuti. Non
// tocca mai le opzioni prese per telefono (canale 'diretta', TTL 48h,
// restano nella evolutiva separata "Cron scadenza automatica Opzione",
// docs/EVOLUTIVE.md — decisione deliberata di scope, non un oversight).
// Girano ogni minuto: la finestra di hold è breve (15 minuti), un
// intervallo più largo lascerebbe camere bloccate a vuoto troppo a lungo
// nella griglia planning vista da reception.
//
// Stessa ragione di promemoriaEmail.js/invioAlloggiatiWeb.js per essere
// avviato solo da server.js: app.js è importato anche dai test Jest
// (Supertest), un cron avviato lì girerebbe anche durante la suite di test.

const cron = require('node-cron');
const pool = require('../config/db');

const CANALE_ORIGINE_BOOKING_ENGINE = 'sito_diretto';

async function scadenzaHold() {
  try {
    await pool.query(
      `UPDATE soggiorni s SET cancellato = true
       FROM prenotazioni p
       WHERE s.prenotazione_id = p.id
         AND p.canale_origine = $1 AND p.stato = 'opzione'
         AND p.data_scadenza_opzione < NOW() AND s.cancellato = false`,
      [CANALE_ORIGINE_BOOKING_ENGINE]
    );
    const result = await pool.query(
      `UPDATE prenotazioni SET stato = 'interrotta', updated_at = NOW()
       WHERE canale_origine = $1 AND stato = 'opzione' AND data_scadenza_opzione < NOW()
       RETURNING id`,
      [CANALE_ORIGINE_BOOKING_ENGINE]
    );
    if (result.rows.length) {
      console.log(`[cron scadenza hold booking engine] interrotte ${result.rows.length} prenotazioni scadute: ${result.rows.map(r => r.id).join(', ')}`);
    }
  } catch (err) {
    console.error('[cron scadenza hold booking engine] errore:', err.message);
  }
}

function avviaJobScadenzaHoldBookingEngine() {
  cron.schedule('* * * * *', scadenzaHold);
  console.log('[cron scadenza hold booking engine] avviato (ogni minuto)');
}

module.exports = { avviaJobScadenzaHoldBookingEngine, scadenzaHold };
```

- [ ] **Step 2: Avvia il job in `server.js`**

In `backend/server.js`, aggiungi il require vicino agli altri job:

```js
const { avviaJobScadenzaHoldBookingEngine } = require('./jobs/scadenzaHoldBookingEngine');
```

E dentro `app.listen(...)`, dopo `avviaJobInvioAlloggiatiWeb();`:

```js
  // Cron di scadenza hold Booking Engine Diretto (modulo 19/08/2026) —
  // avviato solo qui, mai in app.js, stesso motivo degli altri due job sopra.
  avviaJobScadenzaHoldBookingEngine();
```

- [ ] **Step 3: Verifica manuale della funzione (senza aspettare il cron)**

Run: `cd backend && node -e "require('dotenv').config(); require('./jobs/scadenzaHoldBookingEngine').scadenzaHold().then(() => process.exit(0))"`
Expected: nessun errore, eventuale log di prenotazioni interrotte se ce ne sono di scadute in ambiente di sviluppo.

- [ ] **Step 4: Commit**

```bash
git add backend/jobs/scadenzaHoldBookingEngine.js backend/server.js
git commit -m "feat: cron di scadenza hold per il booking engine diretto"
```

---

## Frontend — sito-hotel

### Task 9: Dipendenze Stripe.js e variabili d'ambiente

**Files:**
- Modify: `package.json`
- Create/modify: file di esempio env locale (verifica se `.env.local.example` esiste già nel repo prima di crearne uno nuovo — se manca, documenta le variabili nel commit message, non inventare un file che non segue una convenzione esistente).

**Interfaces:**
- Produce: variabili `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_GESTIONALE_API_URL`, usate da Task 10/11.

- [ ] **Step 1: Aggiungi le dipendenze**

Motivo per il commit: binding ufficiali React di Stripe per il Payment Element embedded (coerente con `client_secret` già prodotto dal backend in Task 4) — nessuna dipendenza aggiuntiva oltre a queste due.

```bash
cd .. && npm install @stripe/stripe-js @stripe/react-stripe-js
```

- [ ] **Step 2: Verifica compatibilità con React 19**

Run: `npm ls @stripe/react-stripe-js`
Expected: nessun warning `peer dep` bloccante. Se compare un conflitto di peer dependency con `react@19.2.4`, verificare la versione più recente del pacchetto prima di continuare — non forzare con `--legacy-peer-deps` senza aver capito perché il conflitto esiste.

- [ ] **Step 3: Documenta le variabili d'ambiente**

Nota da aggiungere dove il progetto già documenta le env var (chiedere a Marco se esiste un `.env.local.example` non ancora individuato, altrimenti annotarle nel PR/commit):

```
# Booking Engine Diretto (modulo 19/08/2026)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_GESTIONALE_API_URL=https://hdgolfo-gestionale.com
```

`NEXT_PUBLIC_GESTIONALE_API_URL` è diversa dalla regola "URL calcolato a runtime da window.location.hostname" del gestionale (CLAUDE.md gestionale-hotel, Sezione 12) — quella regola vale per il frontend del gestionale stesso in LAN; qui `sito-hotel` è su Vercel e chiama un dominio pubblico fisso via internet, quindi una variabile build-time è corretta e non in contraddizione con quella regola.

In sviluppo locale: `NEXT_PUBLIC_GESTIONALE_API_URL=http://localhost:7001`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: aggiunge Stripe.js per il booking engine diretto"
```

---

### Task 10: Pagina `/prenota` e componente di ricerca disponibilità

**Files:**
- Create: `app/[locale]/(public)/prenota/page.tsx`
- Create: `components/booking/BookingWidget.tsx`
- Modify: `messages/it.json`, `messages/en.json` (namespace `PrenotaPage` — `de.json`/`fr.json` restano con le sole chiavi italiane come fallback fino a una traduzione professionale, annotare esplicitamente nel commit, non inventare traduzioni DE/FR non verificate)

**Interfaces:**
- Consumes: `GET {NEXT_PUBLIC_GESTIONALE_API_URL}/api/booking-pubblico/disponibilita` (Task 3), `POST {NEXT_PUBLIC_GESTIONALE_API_URL}/api/booking-pubblico/prenota` (Task 4).
- Produces: passa `{ clientSecret, prenotazioneId, importoCaparra }` a `PaymentStep` (Task 11).

- [ ] **Step 1: Aggiungi le chiavi di traduzione minime**

In `messages/it.json`, nuovo namespace:

```json
"PrenotaPage": {
  "title": "Prenota il tuo soggiorno",
  "subtitle": "Disponibilità e prezzi in tempo reale, caparra del 30% online, saldo in hotel",
  "dataArrivo": "Data di arrivo",
  "dataPartenza": "Data di partenza",
  "ospiti": "Numero ospiti",
  "cerca": "Cerca disponibilità",
  "nessunaDisponibilita": "Nessuna camera disponibile per queste date.",
  "prezzoTotale": "Totale soggiorno",
  "caparra": "Caparra da pagare ora (30%)",
  "selezionaCamera": "Seleziona questa camera",
  "nome": "Nome",
  "cognome": "Cognome",
  "email": "Email",
  "telefono": "Telefono (opzionale)",
  "continua": "Continua al pagamento"
}
```

Stessa struttura in `messages/en.json` con testo inglese equivalente.

- [ ] **Step 2: Crea la pagina (server component, thin)**

```tsx
// app/[locale]/(public)/prenota/page.tsx
// Booking Engine Diretto (modulo 19/08/2026) — pagina pubblica di
// prenotazione diretta. Server component solo per metadata/i18n, tutta
// l'interattività (date, disponibilità, pagamento) è nel client component
// BookingWidget, stesso pattern di separazione già usato altrove nel repo
// per le pagine che hanno bisogno di stato client (vedi consenso cookie).

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import SectionWrapper from "@/components/layout/SectionWrapper";
import { pageMetadata } from "@/lib/seo";
import BookingWidget from "@/components/booking/BookingWidget";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "PrenotaPage" });
  return pageMetadata({ title: t("title"), description: t("subtitle"), path: "/prenota", locale });
}

export default async function PrenotaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "PrenotaPage" });

  return (
    <SectionWrapper bg="white">
      <h1 className="font-heading text-4xl text-primary">{t("title")}</h1>
      <p className="mt-2 text-textMuted">{t("subtitle")}</p>
      <div className="mt-10">
        <BookingWidget locale={locale} />
      </div>
    </SectionWrapper>
  );
}
```

- [ ] **Step 3: Crea il componente client — ricerca + selezione camera + dati ospite**

```tsx
// components/booking/BookingWidget.tsx
// Booking Engine Diretto (modulo 19/08/2026) — flusso client-side: 1) cerca
// disponibilità, 2) seleziona camera, 3) dati ospite minimi, 4) pagamento
// (delegato a PaymentStep, Task 11). Il prezzo mostrato viene SEMPRE dal
// gestionale (GET disponibilita) — non calcolato qui, per restare coerente
// con la regola "il prezzo non è mai deciso dal client".

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import PaymentStep from "./PaymentStep";

const API_BASE = process.env.NEXT_PUBLIC_GESTIONALE_API_URL;

type TipoCameraDisponibile = {
  id: number;
  nome: string;
  num_notti: number;
  prezzo_totale: number;
};

type DatiOspite = { nome: string; cognome: string; email: string; telefono: string };

type PrenotazioneCreata = {
  prenotazione_id: number;
  importo_caparra: number;
  client_secret: string;
};

export default function BookingWidget({ locale }: { locale: string }) {
  const t = useTranslations("PrenotaPage");
  const [dataArrivo, setDataArrivo] = useState("");
  const [dataPartenza, setDataPartenza] = useState("");
  const [ospiti, setOspiti] = useState(2);
  const [risultati, setRisultati] = useState<TipoCameraDisponibile[] | null>(null);
  const [tipoSelezionato, setTipoSelezionato] = useState<TipoCameraDisponibile | null>(null);
  const [datiOspite, setDatiOspite] = useState<DatiOspite>({ nome: "", cognome: "", email: "", telefono: "" });
  const [prenotazioneCreata, setPrenotazioneCreata] = useState<PrenotazioneCreata | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(false);

  async function cercaDisponibilita(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setCaricamento(true);
    try {
      const url = new URL(`${API_BASE}/api/booking-pubblico/disponibilita`);
      url.searchParams.set("data_arrivo", dataArrivo);
      url.searchParams.set("data_partenza", dataPartenza);
      url.searchParams.set("ospiti", String(ospiti));
      const res = await fetch(url.toString());
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Errore nella ricerca disponibilità");
      setRisultati(body);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore imprevisto");
    } finally {
      setCaricamento(false);
    }
  }

  async function confermaDatiOspite(e: React.FormEvent) {
    e.preventDefault();
    if (!tipoSelezionato) return;
    setErrore(null);
    setCaricamento(true);
    try {
      const res = await fetch(`${API_BASE}/api/booking-pubblico/prenota`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_camera_id: tipoSelezionato.id,
          data_arrivo: dataArrivo,
          data_partenza: dataPartenza,
          num_ospiti: ospiti,
          ...datiOspite,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Errore nella creazione della prenotazione");
      setPrenotazioneCreata(body);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore imprevisto");
    } finally {
      setCaricamento(false);
    }
  }

  if (prenotazioneCreata) {
    return (
      <PaymentStep
        clientSecret={prenotazioneCreata.client_secret}
        importoCaparra={prenotazioneCreata.importo_caparra}
        locale={locale}
      />
    );
  }

  return (
    <div>
      <form onSubmit={cercaDisponibilita} className="grid gap-4 md:grid-cols-4 items-end">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-textMuted">{t("dataArrivo")}</span>
          <input type="date" required value={dataArrivo} onChange={(e) => setDataArrivo(e.target.value)} className="border rounded px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-textMuted">{t("dataPartenza")}</span>
          <input type="date" required value={dataPartenza} onChange={(e) => setDataPartenza(e.target.value)} className="border rounded px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-textMuted">{t("ospiti")}</span>
          <input type="number" min={1} max={10} value={ospiti} onChange={(e) => setOspiti(Number(e.target.value))} className="border rounded px-3 py-2" />
        </label>
        <button type="submit" disabled={caricamento} className="bg-primary text-white rounded px-4 py-2">
          {t("cerca")}
        </button>
      </form>

      {errore && <p className="mt-4 text-red-600">{errore}</p>}

      {risultati && risultati.length === 0 && <p className="mt-6 text-textMuted">{t("nessunaDisponibilita")}</p>}

      {risultati && risultati.length > 0 && !tipoSelezionato && (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {risultati.map((tipo) => (
            <div key={tipo.id} className="border rounded p-4">
              <h3 className="font-heading text-xl">{tipo.nome}</h3>
              <p className="mt-2 text-textMuted">{t("prezzoTotale")}: €{tipo.prezzo_totale}</p>
              <p className="text-sm text-textMuted">{t("caparra")}: €{Math.round(tipo.prezzo_totale * 0.3 * 100) / 100}</p>
              <button onClick={() => setTipoSelezionato(tipo)} className="mt-3 bg-primary text-white rounded px-4 py-2">
                {t("selezionaCamera")}
              </button>
            </div>
          ))}
        </div>
      )}

      {tipoSelezionato && (
        <form onSubmit={confermaDatiOspite} className="mt-6 grid gap-4 md:grid-cols-2 max-w-lg">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-textMuted">{t("nome")}</span>
            <input required value={datiOspite.nome} onChange={(e) => setDatiOspite({ ...datiOspite, nome: e.target.value })} className="border rounded px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-textMuted">{t("cognome")}</span>
            <input required value={datiOspite.cognome} onChange={(e) => setDatiOspite({ ...datiOspite, cognome: e.target.value })} className="border rounded px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-sm text-textMuted">{t("email")}</span>
            <input type="email" required value={datiOspite.email} onChange={(e) => setDatiOspite({ ...datiOspite, email: e.target.value })} className="border rounded px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-sm text-textMuted">{t("telefono")}</span>
            <input value={datiOspite.telefono} onChange={(e) => setDatiOspite({ ...datiOspite, telefono: e.target.value })} className="border rounded px-3 py-2" />
          </label>
          <button type="submit" disabled={caricamento} className="md:col-span-2 bg-primary text-white rounded px-4 py-2">
            {t("continua")}
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verifica con build**

Run: `npm run build`
Expected: build senza errori TypeScript/ESLint. Se `@/components/layout/SectionWrapper` o `@/lib/seo` non esistono con questi export esatti, verificarli con `Read` prima di correggere — questo piano li assume identici a `offerte/page.tsx` (Task esplorativo già verificato), ma un mismatch è possibile se sono cambiati nel frattempo.

- [ ] **Step 5: Commit**

```bash
git add app/[locale]/(public)/prenota components/booking/BookingWidget.tsx messages/it.json messages/en.json
git commit -m "feat: pagina /prenota — ricerca disponibilità e dati ospite"
```

---

### Task 11: Componente di pagamento (Stripe Payment Element)

**Files:**
- Create: `components/booking/PaymentStep.tsx`

**Interfaces:**
- Consumes: `clientSecret`, `importoCaparra` da `BookingWidget` (Task 10).

- [ ] **Step 1: Implementa il componente**

```tsx
// components/booking/PaymentStep.tsx
// Booking Engine Diretto (modulo 19/08/2026) — Payment Element Stripe
// embedded: il numero di carta non tocca mai il nostro server, passa solo
// da Stripe.js (PCI scope minimo). La conferma reale della prenotazione
// avviene lato server via webhook (backend/controllers/stripeWebhookController.js),
// MAI da questo componente — la pagina di ritorno mostra solo lo stato,
// non decide nulla.

"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function FormPagamento({ importoCaparra }: { importoCaparra: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [errore, setErrore] = useState<string | null>(null);
  const [elaborazione, setElaborazione] = useState(false);
  const [completato, setCompletato] = useState(false);

  async function gestisciSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setElaborazione(true);
    setErrore(null);

    const { error } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (error) {
      setErrore(error.message || "Pagamento non riuscito. Riprova.");
      setElaborazione(false);
      return;
    }

    // Nessun redirect necessario: il pagamento è confermato lato Stripe,
    // la conferma DEFINITIVA della prenotazione arriva dal webhook lato
    // server (può richiedere qualche secondo) — qui mostriamo solo un
    // messaggio di attesa, mai uno stato "confermata" deciso dal client.
    setCompletato(true);
    setElaborazione(false);
  }

  if (completato) {
    return (
      <p className="mt-6 text-primary">
        Pagamento ricevuto. La conferma definitiva della prenotazione arriverà a breve via email.
      </p>
    );
  }

  return (
    <form onSubmit={gestisciSubmit} className="mt-6 max-w-lg">
      <p className="mb-4 text-textMuted">Caparra da pagare ora: €{importoCaparra}</p>
      <PaymentElement />
      {errore && <p className="mt-4 text-red-600">{errore}</p>}
      <button type="submit" disabled={!stripe || elaborazione} className="mt-4 bg-primary text-white rounded px-4 py-2">
        {elaborazione ? "Elaborazione..." : `Paga €${importoCaparra}`}
      </button>
    </form>
  );
}

export default function PaymentStep({
  clientSecret,
  importoCaparra,
}: {
  clientSecret: string;
  importoCaparra: number;
  locale: string;
}) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <FormPagamento importoCaparra={importoCaparra} />
    </Elements>
  );
}
```

- [ ] **Step 2: Verifica con build**

Run: `npm run build`
Expected: build senza errori.

- [ ] **Step 3: QA manuale end-to-end (non automatizzabile senza test runner, vedi Global Constraints)**

Con `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` di test configurate sul gestionale e `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` di test sul sito: aprire `/it/prenota` in locale, cercare disponibilità, selezionare una camera, inserire dati ospite, pagare con la carta di test Stripe `4242 4242 4242 4242` (qualsiasi data futura/CVC), verificare che dopo pochi secondi (arrivo del webhook) `GET /api/prenotazioni/:id` mostri `stato: 'confermata'` e sia arrivata l'email di conferma + invito pre check-in.

- [ ] **Step 4: Commit**

```bash
git add components/booking/PaymentStep.tsx
git commit -m "feat: componente pagamento caparra (Stripe Payment Element)"
```

---

## Self-review

**Copertura spec:** scope (solo booking diretto, Beds24 escluso) → task 1-11 non toccano OTA; pagamento 30% Stripe/saldo in hotel → Task 4/7/11; blocco atomico → Task 4 Step 3 + Task 5; conferma solo da webhook mai da redirect browser → Task 11 (`redirect: "if_required"`, nessuno stato deciso client-side) + Task 7; riuso motore tariffe → Task 1; riuso pipeline pre-checkin → Task 7 (`inviaInvitoPreCheckin`); policy hold scaduto → rimborso automatico → Task 6 + Task 7; sicurezza (rate limit, verifica firma, PCI scope minimo, mini-audit) → Task 3/7, mini-audit di sicurezza dedicato NON incluso come task di questo piano — va programmato a parte prima del go-live pubblico, come da CLAUDE.md Sezione 7 (annotare esplicitamente a Marco, non un'omissione silenziosa); dominio/URL parametrizzati → Task 9 Step 3 (riuso `FRONTEND_URL`/`NEXT_PUBLIC_GESTIONALE_API_URL`, mai hardcoded); rollout diretto (TS widget già fuori servizio) → nessun task di "feature flag"/percorso nascosto, coerente con la decisione presa.

**Placeholder:** nessun TODO lasciato nel codice; l'unica semplificazione dichiarata (email di rimborso a testo fisso, non nel sistema di template configurabili) è documentata esplicitamente in Task 6, non nascosta.

**Coerenza tipi/nomi:** `calcolaTariffa(tipoCameraId, dataArrivo, dataPartenza)` stesso nome e stessa forma di ritorno `{ num_notti, prezzo_totale, notti_scoperte }` in Task 1, 3, 4. `CANALE_ORIGINE_BOOKING_ENGINE = 'sito_diretto'` identico in Task 3/4/8. `client_secret`/`prenotazione_id`/`importo_caparra` stessi nomi tra risposta backend (Task 4) e consumo frontend (Task 10/11).

**Non incluso in questo piano (deliberatamente fuori scope):**
- Mini-audit di sicurezza mirato pre-go-live (CLAUDE.md Sezione 7) — da programmare separatamente prima di collegare il bottone al posto del widget TS.
- Sincronizzazione Beds24/OTA — spec e piano separati, come deciso il 19/08/2026.
- Traduzioni DE/FR della pagina `/prenota` — solo IT/EN in questo piano, marcato esplicitamente in Task 10.
- Email di rimborso configurabile da Impostazioni ▸ Testi email — testo fisso per l'MVP (Task 6).
