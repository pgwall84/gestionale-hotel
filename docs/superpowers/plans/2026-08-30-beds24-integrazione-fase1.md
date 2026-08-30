# Integrazione Beds24 — Fase 1 (lettura prenotazioni OTA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importare in automatico nel gestionale le prenotazioni che arrivano dagli OTA collegati a Beds24 (`prenotazioni`/`soggiorni`), in quasi tempo reale via webhook con un job notturno di riconciliazione come rete di sicurezza. Nessuna scrittura verso Beds24 in questa fase (disponibilità/prezzi restano fuori scope — vedi spec).

**Architecture:** Webhook Beds24 (`POST`) come percorso primario; job `node-cron` notturno via polling (`GET /bookings?modifiedSince=`) come rete di sicurezza contro webhook persi. Entrambi i percorsi condividono un'unica funzione di upsert idempotente (`beds24SyncController.processaBooking`). Le prenotazioni non assegnabili automaticamente (camera non mappata o nessuna camera fisica libera per quelle date) non toccano mai `prenotazioni`/`soggiorni` — finiscono in una coda dedicata (`beds24_prenotazioni_da_revisionare`) risolta manualmente in reception.

**Tech Stack:** Node.js/Express (backend esistente), PostgreSQL 17, `node-cron` (già in `package.json`, mai usato finora — nessuna installazione necessaria), `fetch` nativo di Node per le chiamate HTTP a Beds24 (nessuna libreria HTTP nuova), Jest + Supertest per i test.

## Global Constraints

- Tutte le chiamate verso Beds24 partono dal backend Express, mai dal frontend (CLAUDE.md Sezione 7).
- Query SQL sempre con parametri preparati, mai concatenazione stringhe (CLAUDE.md Sezione 5).
- Commenti nel codice e ogni testo visibile all'utente in italiano (CLAUDE.md Sezione 5).
- Il refresh token Beds24 non va mai in Git né in `.env` — solo nella tabella `beds24_config` (ruota nel tempo, un file statico non regge).
- Nessuna scrittura di disponibilità/prezzi verso Beds24 in questa fase.
- Endpoint webhook pubblico (`POST /api/beds24/webhook/bookings`): nessun `verificaToken` — è Beds24 che chiama noi — ma rate limit dedicato (stesso pattern di `preCheckinPubblico`) e log completo di ogni chiamata su `webhook_log` prima di qualunque elaborazione.
- Vincolo di schema invalicabile: `soggiorni.camera_id` è `NOT NULL` con un vincolo `EXCLUDE` anti-overbooking a livello di database (migration 017) — non si scrive mai un `soggiorno` senza una camera fisica libera verificata nella stessa transazione.
- Nomi di campo del payload Beds24 (`id`, `roomId`, `arrival`, `departure`, ecc.) e il parametro `modifiedSince` su `GET /bookings` sono la migliore ricostruzione possibile dalla documentazione pubblica (lo Swagger ufficiale è bloccato al fetch automatico) — il Task 12 verifica questi nomi contro un payload reale e corregge se necessario. Non è un'incognita che blocca lo sviluppo: la struttura del codice regge un rinominare i campi.

---

### Task 1: Migration — tabelle `beds24_config` e `beds24_prenotazioni_da_revisionare`

**Files:**
- Create: `database/migrations/055_beds24.sql`

**Interfaces:**
- Produces: tabella `beds24_config` (colonne: `id`, `refresh_token`, `token`, `token_scade_at`, `ultima_sincronizzazione_at`, `updated_at`) e tabella `beds24_prenotazioni_da_revisionare` (colonne: `id`, `external_booking_id`, `payload_raw`, `motivo`, `risolto`, `created_at`, `updated_at`) — usate da tutti i task successivi.

- [ ] **Step 1: Scrivere la migration**

```sql
-- Migration 055 — Integrazione Beds24, Fase 1 (lettura prenotazioni OTA).
-- Due tabelle:
-- 1. beds24_config — riga singola (stesso pattern di configurazione_ztl,
--    migration 038): credenziali API Beds24 e stato di sincronizzazione.
--    Il refresh token NON va mai in .env (ruota nel tempo).
-- 2. beds24_prenotazioni_da_revisionare — coda per le prenotazioni che
--    non si possono scrivere automaticamente su prenotazioni/soggiorni
--    (roomId non mappato in tipi_camera_canali, oppure nessuna camera
--    fisica libera per quelle date — soggiorni.camera_id è NOT NULL con
--    vincolo EXCLUDE, migration 017, non si può scrivere una riga "a
--    metà"). La reception la registra a mano con lo strumento già in uso
--    oggi per una prenotazione telefonica, poi la segna risolta.

CREATE TABLE IF NOT EXISTS beds24_config (
  id                          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- riga singola
  refresh_token               VARCHAR(255),
  token                        VARCHAR(255),
  token_scade_at               TIMESTAMP,
  ultima_sincronizzazione_at   TIMESTAMP,
  updated_at                   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS beds24_prenotazioni_da_revisionare (
  id                    SERIAL PRIMARY KEY,
  external_booking_id  VARCHAR(255) NOT NULL,
  payload_raw           JSONB NOT NULL,
  motivo                 VARCHAR(30) NOT NULL,
  risolto                BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMP NOT NULL DEFAULT now(),
  updated_at             TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_beds24_da_revisionare_motivo CHECK (
    motivo IN ('camera_non_mappata', 'nessuna_camera_disponibile')
  )
);
CREATE INDEX IF NOT EXISTS idx_beds24_da_revisionare_risolto
  ON beds24_prenotazioni_da_revisionare (risolto, created_at);
```

- [ ] **Step 2: Applicare la migration in locale**

Run: `psql -U <utente> -d gestionale_hotel -f database/migrations/055_beds24.sql`
Expected: `CREATE TABLE` x2, `CREATE INDEX` x1, nessun errore.

- [ ] **Step 3: Verificare lo schema creato**

Run: `psql -U <utente> -d gestionale_hotel -c "\d beds24_config" -c "\d beds24_prenotazioni_da_revisionare"`
Expected: le colonne elencate sopra, il CHECK su `id` e quello su `motivo` visibili in output.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/055_beds24.sql
git commit -m "feat(beds24): migration tabelle config e coda prenotazioni da revisionare"
```

---

### Task 2: `beds24Client.js` — autenticazione e rinnovo token

**Files:**
- Create: `backend/lib/beds24Client.js`
- Test: `tests/lib/beds24Client.test.js`

**Interfaces:**
- Consumes: tabella `beds24_config` (Task 1).
- Produces: `scambiaInviteCode(inviteCode)` → `Promise<{ token, refreshToken, expiresIn }>`, salva su `beds24_config`. `getToken()` → `Promise<string>` (token valido, rinnovato automaticamente se scaduto). Usati da Task 4 (`beds24Setup.js`) e Task 5/6/7 (`beds24SyncController.js`, job di riconciliazione).

- [ ] **Step 1: Scrivere il test per `getToken()` con token ancora valido**

```javascript
// tests/lib/beds24Client.test.js
const pool = require('../../backend/config/db');
const beds24Client = require('../../backend/lib/beds24Client');

describe('beds24Client — getToken', () => {
  afterEach(async () => {
    await pool.query('DELETE FROM beds24_config');
    jest.restoreAllMocks();
  });

  test('restituisce il token salvato se non è scaduto, senza chiamare Beds24', async () => {
    await pool.query(
      `INSERT INTO beds24_config (id, refresh_token, token, token_scade_at)
       VALUES (1, 'rt_fittizio', 'token_valido', NOW() + INTERVAL '1 hour')`
    );
    const fetchSpy = jest.spyOn(global, 'fetch');

    const token = await beds24Client.getToken();

    expect(token).toBe('token_valido');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `npx jest tests/lib/beds24Client.test.js -v`
Expected: FAIL — `Cannot find module '../../backend/lib/beds24Client'`.

- [ ] **Step 3: Scrivere l'implementazione minima (`getToken` + `scambiaInviteCode`)**

```javascript
// backend/lib/beds24Client.js
// Client HTTP verso Beds24 API v2 — Modulo 2.3, Fase 1 (solo lettura
// prenotazioni). Gestisce autenticazione e rinnovo token; le chiamate
// dati vere (getBookings) sono nel Task 3.
// Base URL: le fonti pubbliche sono discordanti (api.beds24.com/v2 vs
// beds24.com/api/v2) — configurabile via env, verificata nel Task 12
// contro l'account reale.

const pool = require('../config/db');

const BASE_URL = process.env.BEDS24_BASE_URL || 'https://api.beds24.com/v2';

// Scambia un invite code (generato a mano nel pannello Beds24, valido 24h,
// one-shot) con un refresh token duraturo. Chiamata solo da
// backend/scripts/beds24Setup.js, mai da un endpoint HTTP esposto.
async function scambiaInviteCode(inviteCode) {
  const risposta = await fetch(`${BASE_URL}/authentication/setup`, {
    method: 'GET',
    headers: { code: inviteCode },
  });
  if (!risposta.ok) {
    throw new Error(`Scambio invite code fallito: HTTP ${risposta.status}`);
  }
  const dati = await risposta.json();
  const scadeAt = new Date(Date.now() + dati.expiresIn * 1000);

  await pool.query(
    `INSERT INTO beds24_config (id, refresh_token, token, token_scade_at, updated_at)
     VALUES (1, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET
       refresh_token = EXCLUDED.refresh_token,
       token         = EXCLUDED.token,
       token_scade_at = EXCLUDED.token_scade_at,
       updated_at    = now()`,
    [dati.refreshToken, dati.token, scadeAt]
  );

  return { token: dati.token, refreshToken: dati.refreshToken, expiresIn: dati.expiresIn };
}

// Restituisce un token valido, rinnovandolo automaticamente se scaduto o
// vicino alla scadenza (margine di 5 minuti). Lancia un errore chiaro se
// non è mai stato fatto il setup iniziale (beds24_config vuota).
async function getToken() {
  const risultato = await pool.query('SELECT * FROM beds24_config WHERE id = 1');
  const config = risultato.rows[0];
  if (!config || !config.refresh_token) {
    throw new Error(
      'Nessuna credenziale Beds24 configurata — eseguire backend/scripts/beds24Setup.js con un invite code valido.'
    );
  }

  const scadeTraCinqueMinuti = !config.token_scade_at
    || new Date(config.token_scade_at).getTime() < Date.now() + 5 * 60 * 1000;
  if (!scadeTraCinqueMinuti) {
    return config.token;
  }

  const risposta = await fetch(`${BASE_URL}/authentication/token`, {
    method: 'GET',
    headers: { refreshToken: config.refresh_token },
  });
  if (!risposta.ok) {
    throw new Error(`Rinnovo token Beds24 fallito: HTTP ${risposta.status}`);
  }
  const dati = await risposta.json();
  const scadeAt = new Date(Date.now() + dati.expiresIn * 1000);

  await pool.query(
    `UPDATE beds24_config SET token = $1, token_scade_at = $2, updated_at = now() WHERE id = 1`,
    [dati.token, scadeAt]
  );

  return dati.token;
}

module.exports = { scambiaInviteCode, getToken };
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `npx jest tests/lib/beds24Client.test.js -v`
Expected: PASS.

- [ ] **Step 5: Scrivere il test per il rinnovo automatico**

```javascript
test('rinnova il token se scaduto e salva il nuovo su beds24_config', async () => {
  await pool.query(
    `INSERT INTO beds24_config (id, refresh_token, token, token_scade_at)
     VALUES (1, 'rt_fittizio', 'token_vecchio', NOW() - INTERVAL '1 hour')`
  );
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ token: 'token_nuovo', expiresIn: 86400 }),
  });

  const token = await beds24Client.getToken();

  expect(token).toBe('token_nuovo');
  const riga = await pool.query('SELECT token FROM beds24_config WHERE id = 1');
  expect(riga.rows[0].token).toBe('token_nuovo');
});
```

- [ ] **Step 6: Eseguire tutti i test del file e verificare che passino**

Run: `npx jest tests/lib/beds24Client.test.js -v`
Expected: PASS (2/2).

- [ ] **Step 7: Commit**

```bash
git add backend/lib/beds24Client.js tests/lib/beds24Client.test.js
git commit -m "feat(beds24): client autenticazione con rinnovo automatico token"
```

---

### Task 3: `beds24Client.js` — `getBookings`

**Files:**
- Modify: `backend/lib/beds24Client.js`
- Test: `tests/lib/beds24Client.test.js`

**Interfaces:**
- Consumes: `getToken()` (Task 2).
- Produces: `getBookings({ modifiedSince })` → `Promise<Array<object>>` (array di prenotazioni grezze Beds24). Usata dal job di riconciliazione (Task 10).

- [ ] **Step 1: Scrivere il test**

```javascript
test('getBookings passa il token e modifiedSince, restituisce un array', async () => {
  await pool.query(
    `INSERT INTO beds24_config (id, refresh_token, token, token_scade_at)
     VALUES (1, 'rt_fittizio', 'token_valido', NOW() + INTERVAL '1 hour')`
  );
  const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ([{ id: 111, roomId: 222 }]),
  });

  const prenotazioni = await beds24Client.getBookings({ modifiedSince: '2026-08-29T00:00:00Z' });

  expect(prenotazioni).toEqual([{ id: 111, roomId: 222 }]);
  const urlChiamato = fetchSpy.mock.calls[0][0];
  expect(urlChiamato).toContain('modifiedSince=2026-08-29T00%3A00%3A00Z');
  expect(fetchSpy.mock.calls[0][1].headers.token).toBe('token_valido');
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `npx jest tests/lib/beds24Client.test.js -v`
Expected: FAIL — `beds24Client.getBookings is not a function`.

- [ ] **Step 3: Implementare `getBookings`**

```javascript
// Aggiungere a backend/lib/beds24Client.js, sopra module.exports.

// Legge le prenotazioni da Beds24. modifiedSince è opzionale (formato ISO
// 8601) — usato dal job di riconciliazione notturna per recuperare solo
// le modifiche successive all'ultima sincronizzazione. Nome del parametro
// non confermato dallo Swagger ufficiale (bloccato al fetch automatico) —
// verificare nel Task 12 contro l'account reale.
async function getBookings({ modifiedSince } = {}) {
  const token = await getToken();
  const url = new URL(`${BASE_URL}/bookings`);
  if (modifiedSince) {
    url.searchParams.set('modifiedSince', modifiedSince);
  }

  const risposta = await fetch(url, { headers: { token } });
  if (!risposta.ok) {
    throw new Error(`GET /bookings fallita: HTTP ${risposta.status}`);
  }
  const dati = await risposta.json();
  return Array.isArray(dati) ? dati : (dati.data || []);
}
```

- [ ] **Step 4: Aggiornare `module.exports`**

```javascript
module.exports = { scambiaInviteCode, getToken, getBookings };
```

- [ ] **Step 5: Eseguire tutti i test e verificare che passino**

Run: `npx jest tests/lib/beds24Client.test.js -v`
Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
git add backend/lib/beds24Client.js tests/lib/beds24Client.test.js
git commit -m "feat(beds24): getBookings con supporto modifiedSince"
```

---

### Task 4: `backend/scripts/beds24Setup.js` — script CLI di setup credenziali

**Files:**
- Create: `backend/scripts/beds24Setup.js`

**Interfaces:**
- Consumes: `scambiaInviteCode(inviteCode)` (Task 2).
- Produces: script CLI eseguito a mano da Marco, nessuna interfaccia consumata da altri task.

- [ ] **Step 1: Scrivere lo script**

```javascript
// backend/scripts/beds24Setup.js
// Uso: node scripts/beds24Setup.js <invite-code>
// Scambia un invite code (generato a mano in Beds24 ▸ MARKETPLACE ▸ API,
// valido 24h, one-shot) con un refresh token duraturo, salvato in
// beds24_config. Da eseguire una sola volta per collegare l'account —
// stesso pattern operativo di scripts/generaC59.js.

require('dotenv').config();
const { scambiaInviteCode } = require('../lib/beds24Client');

async function main() {
  const inviteCode = process.argv[2];
  if (!inviteCode) {
    console.error('Uso: node scripts/beds24Setup.js <invite-code>');
    process.exit(1);
  }

  try {
    const risultato = await scambiaInviteCode(inviteCode);
    console.log('Collegamento Beds24 riuscito.');
    console.log(`Token valido per ${risultato.expiresIn} secondi, refresh token salvato su beds24_config.`);
    process.exit(0);
  } catch (err) {
    console.error('Collegamento Beds24 fallito:', err.message);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Verificare che lo script parta senza errori di sintassi**

Run: `node -c backend/scripts/beds24Setup.js`
Expected: nessun output (nessun errore di sintassi).

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/beds24Setup.js
git commit -m "feat(beds24): script CLI setup credenziali one-shot"
```

---

### Task 5: `beds24SyncController.js` — creazione prenotazione (happy path + idempotenza)

**Files:**
- Create: `backend/controllers/beds24SyncController.js`
- Test: `tests/api/beds24Sync.test.js`

**Interfaces:**
- Consumes: `tipi_camera_canali` (mappatura `roomId`→`tipo_camera_id`), pattern di assegnazione camera già in uso in `bookingPubblicoController.js` (query `camere`/`tipi_camera_camere` con `FOR UPDATE SKIP LOCKED`).
- Produces: `processaBooking(bookingBeds24)` → `Promise<{ esito: string, dettaglio?: object }>`. `esito` può essere `'creata'`, `'aggiornata'`, `'cancellata'`, `'cancellazione_ignorata_post_checkin'`, `'in_coda'`. Usata da Task 8 (route webhook) e Task 10 (job riconciliazione).

- [ ] **Step 1: Scrivere il test per la creazione di una nuova prenotazione**

```javascript
// tests/api/beds24Sync.test.js
const pool = require('../../backend/config/db');
const { processaBooking } = require('../../backend/controllers/beds24SyncController');

describe('beds24SyncController — processaBooking, creazione', () => {
  let tipoCameraId, cameraId;

  beforeAll(async () => {
    const tc = await pool.query(
      `INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Doppia Test Beds24', 2) RETURNING id`
    );
    tipoCameraId = tc.rows[0].id;
    const c = await pool.query(
      `INSERT INTO camere (numero, nome, attivo) VALUES ('T24', 'Camera Test Beds24', true) RETURNING id`
    );
    cameraId = c.rows[0].id;
    await pool.query(
      `INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1, $2)`,
      [tipoCameraId, cameraId]
    );
    await pool.query(
      `INSERT INTO tipi_camera_canali (tipo_camera_id, canale, codice_esterno) VALUES ($1, 'beds24', '999888')`,
      [tipoCameraId]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM soggiorno_ospiti WHERE soggiorno_id IN (SELECT id FROM soggiorni WHERE camera_id = $1)`, [cameraId]);
    await pool.query(`DELETE FROM soggiorni WHERE camera_id = $1`, [cameraId]);
    await pool.query(`DELETE FROM prenotazioni WHERE canale_origine = 'beds24'`);
    await pool.query(`DELETE FROM ospiti WHERE email = 'ospite.beds24test@example.com'`);
    await pool.query(`DELETE FROM tipi_camera_canali WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera_camere WHERE camera_id = $1`, [cameraId]);
    await pool.query(`DELETE FROM camere WHERE id = $1`, [cameraId]);
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tipoCameraId]);
  });

  const bookingFittizio = {
    id: 555111,
    roomId: 999888,
    arrival: '2026-11-10',
    departure: '2026-11-12',
    numAdult: 2,
    numChild: 0,
    firstName: 'Mario',
    lastName: 'Rossi Beds24Test',
    email: 'ospite.beds24test@example.com',
    status: 'confirmed',
  };

  test('crea prenotazione + soggiorno + ospite alla prima ricezione', async () => {
    const risultato = await processaBooking(bookingFittizio);

    expect(risultato.esito).toBe('creata');
    const prenotazione = await pool.query(
      `SELECT * FROM prenotazioni WHERE canale_origine = 'beds24' AND external_booking_id = '555111'`
    );
    expect(prenotazione.rows).toHaveLength(1);
    const soggiorno = await pool.query(
      `SELECT * FROM soggiorni WHERE prenotazione_id = $1`, [prenotazione.rows[0].id]
    );
    expect(soggiorno.rows).toHaveLength(1);
    expect(soggiorno.rows[0].camera_id).toBe(cameraId);
    expect(soggiorno.rows[0].num_ospiti).toBe(2);
  });

  test('la stessa external_booking_id non crea un doppione, aggiorna la riga esistente', async () => {
    const bookingModificato = { ...bookingFittizio, numAdult: 1 };
    const risultato = await processaBooking(bookingModificato);

    expect(risultato.esito).toBe('aggiornata');
    const prenotazioni = await pool.query(
      `SELECT * FROM prenotazioni WHERE canale_origine = 'beds24' AND external_booking_id = '555111'`
    );
    expect(prenotazioni.rows).toHaveLength(1);
    const soggiorno = await pool.query(
      `SELECT num_ospiti FROM soggiorni WHERE prenotazione_id = $1`, [prenotazioni.rows[0].id]
    );
    expect(soggiorno.rows[0].num_ospiti).toBe(1);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `npx jest tests/api/beds24Sync.test.js -v`
Expected: FAIL — `Cannot find module '../../backend/controllers/beds24SyncController'`.

- [ ] **Step 3: Implementare la creazione/aggiornamento (senza ancora cancellazioni/coda — arrivano nei Task 6 e 7)**

```javascript
// backend/controllers/beds24SyncController.js
// Upsert idempotente delle prenotazioni ricevute da Beds24 — Modulo 2.3,
// Fase 1. Usata sia dal webhook (backend/routes/beds24.js) sia dal job di
// riconciliazione notturna (backend/jobs/beds24Riconciliazione.js): stessa
// funzione, stessa logica, per non avere due percorsi di scrittura da
// tenere allineati.
// Accessibile solo internamente (nessuna route la espone direttamente).

const pool = require('../config/db');

const CANALE_ORIGINE = 'beds24';

// Crea l'ospite se non esiste (match su email quando presente, altrimenti
// crea sempre) — solo nome+cognome, coerente con la creazione rapida già
// in uso in planning-camere. I dati regolatori (residenza, documento)
// restano raccolti al pre-checkin/check-in come per ogni altra
// prenotazione.
async function trovaOCreaOspite(client, booking) {
  if (booking.email) {
    const esistente = await client.query(
      `SELECT id FROM ospiti WHERE email = $1 ORDER BY id LIMIT 1`, [booking.email]
    );
    if (esistente.rows.length) {
      await client.query(
        `UPDATE ospiti SET nome = $2, cognome = $3 WHERE id = $1`,
        [esistente.rows[0].id, booking.firstName, booking.lastName]
      );
      return esistente.rows[0].id;
    }
  }
  const nuovo = await client.query(
    `INSERT INTO ospiti (nome, cognome, email, telefono) VALUES ($1, $2, $3, $4) RETURNING id`,
    [booking.firstName, booking.lastName, booking.email || null, booking.phone || null]
  );
  return nuovo.rows[0].id;
}

// Trova una camera fisica libera per il tipo_camera_id e l'intervallo di
// date richiesti — stessa query (FOR UPDATE SKIP LOCKED) già in uso in
// bookingPubblicoController.js per il booking engine diretto. Restituisce
// null se nessuna camera è libera (overbooking — atteso finché non
// esiste anche l'invio disponibilità verso Beds24, punto 2 del modulo).
async function trovaCameraLibera(client, tipoCameraId, dataArrivo, dataPartenza) {
  const risultato = await client.query(
    `SELECT c.id FROM camere c
     JOIN tipi_camera_camere tcc ON tcc.camera_id = c.id
     WHERE tcc.tipo_camera_id = $1 AND c.attivo = true
       AND NOT EXISTS (
         SELECT 1 FROM soggiorni s
         WHERE s.camera_id = c.id AND s.cancellato = false
           AND daterange(s.data_arrivo, s.data_partenza, '[)') && daterange($2::date, $3::date, '[)')
       )
     ORDER BY c.id LIMIT 1 FOR UPDATE SKIP LOCKED`,
    [tipoCameraId, dataArrivo, dataPartenza]
  );
  return risultato.rows[0]?.id || null;
}

// Elabora una prenotazione grezza ricevuta da Beds24 (webhook o job di
// riconciliazione). Idempotente: la stessa external_booking_id aggiorna
// la riga esistente invece di duplicarla.
async function processaBooking(booking) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const externalBookingId = String(booking.id);

    const esistente = await client.query(
      `SELECT p.id AS prenotazione_id, s.id AS soggiorno_id, s.camera_id
       FROM prenotazioni p JOIN soggiorni s ON s.prenotazione_id = p.id
       WHERE p.canale_origine = $1 AND p.external_booking_id = $2`,
      [CANALE_ORIGINE, externalBookingId]
    );

    const mappatura = await client.query(
      `SELECT tipo_camera_id FROM tipi_camera_canali WHERE canale = 'beds24' AND codice_esterno = $1`,
      [String(booking.roomId)]
    );
    if (!mappatura.rows.length) {
      await client.query('ROLLBACK');
      return { esito: 'in_coda', dettaglio: { motivo: 'camera_non_mappata' } };
    }
    const tipoCameraId = mappatura.rows[0].tipo_camera_id;

    const ospiteId = await trovaOCreaOspite(client, booking);

    if (esistente.rows.length) {
      const riga = esistente.rows[0];
      await client.query(
        `UPDATE soggiorni SET data_arrivo = $2, data_partenza = $3, num_ospiti = $4, ospite_id = $5, updated_at = now()
         WHERE id = $1`,
        [riga.soggiorno_id, booking.arrival, booking.departure, (booking.numAdult || 1) + (booking.numChild || 0), ospiteId]
      );
      await client.query('COMMIT');
      return { esito: 'aggiornata' };
    }

    const cameraId = await trovaCameraLibera(client, tipoCameraId, booking.arrival, booking.departure);
    if (!cameraId) {
      await client.query('ROLLBACK');
      return { esito: 'in_coda', dettaglio: { motivo: 'nessuna_camera_disponibile' } };
    }

    const prenotazioneResult = await client.query(
      `INSERT INTO prenotazioni (canale_origine, external_booking_id, stato)
       VALUES ($1, $2, 'confermata') RETURNING id`,
      [CANALE_ORIGINE, externalBookingId]
    );
    const prenotazioneId = prenotazioneResult.rows[0].id;

    const soggiornoResult = await client.query(
      `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [prenotazioneId, cameraId, ospiteId, booking.arrival, booking.departure, (booking.numAdult || 1) + (booking.numChild || 0)]
    );

    await client.query(
      `INSERT INTO soggiorno_ospiti (soggiorno_id, ospite_id, tipo_alloggiato) VALUES ($1, $2, '16')`,
      [soggiornoResult.rows[0].id, ospiteId]
    );

    await client.query('COMMIT');
    return { esito: 'creata' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { processaBooking };
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npx jest tests/api/beds24Sync.test.js -v`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add backend/controllers/beds24SyncController.js tests/api/beds24Sync.test.js
git commit -m "feat(beds24): upsert idempotente prenotazioni (creazione/aggiornamento)"
```

---

### Task 6: `beds24SyncController.js` — cancellazioni (pre/post check-in)

**Files:**
- Modify: `backend/controllers/beds24SyncController.js`
- Test: `tests/api/beds24Sync.test.js`

**Interfaces:**
- Consumes: `processaBooking` esistente (Task 5), colonna `soggiorni.check_in_effettuato_at`, colonna `soggiorni.cancellato`.
- Produces: `processaBooking` ora gestisce anche `booking.status === 'cancelled'`.

- [ ] **Step 1: Scrivere i due test di cancellazione**

```javascript
describe('beds24SyncController — processaBooking, cancellazioni', () => {
  let tipoCameraId, cameraId;

  beforeAll(async () => {
    const tc = await pool.query(
      `INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Doppia Test Beds24 Cancellazioni', 2) RETURNING id`
    );
    tipoCameraId = tc.rows[0].id;
    const c = await pool.query(
      `INSERT INTO camere (numero, nome, attivo) VALUES ('T25', 'Camera Test Beds24 Cancellazioni', true) RETURNING id`
    );
    cameraId = c.rows[0].id;
    await pool.query(`INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1, $2)`, [tipoCameraId, cameraId]);
    await pool.query(`INSERT INTO tipi_camera_canali (tipo_camera_id, canale, codice_esterno) VALUES ($1, 'beds24', '999889')`, [tipoCameraId]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM soggiorno_ospiti WHERE soggiorno_id IN (SELECT id FROM soggiorni WHERE camera_id = $1)`, [cameraId]);
    await pool.query(`DELETE FROM soggiorni WHERE camera_id = $1`, [cameraId]);
    await pool.query(`DELETE FROM prenotazioni WHERE canale_origine = 'beds24' AND external_booking_id IN ('555222', '555333')`);
    await pool.query(`DELETE FROM tipi_camera_canali WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera_camere WHERE camera_id = $1`, [cameraId]);
    await pool.query(`DELETE FROM camere WHERE id = $1`, [cameraId]);
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tipoCameraId]);
  });

  test('cancellazione pre check-in porta la prenotazione a interrotta', async () => {
    await processaBooking({
      id: 555222, roomId: 999889, arrival: '2026-11-15', departure: '2026-11-17',
      numAdult: 1, numChild: 0, firstName: 'Anna', lastName: 'Verdi', email: 'anna.beds24test@example.com', status: 'confirmed',
    });
    const risultato = await processaBooking({
      id: 555222, roomId: 999889, arrival: '2026-11-15', departure: '2026-11-17',
      numAdult: 1, numChild: 0, firstName: 'Anna', lastName: 'Verdi', email: 'anna.beds24test@example.com', status: 'cancelled',
    });

    expect(risultato.esito).toBe('cancellata');
    const prenotazione = await pool.query(
      `SELECT stato FROM prenotazioni WHERE canale_origine = 'beds24' AND external_booking_id = '555222'`
    );
    expect(prenotazione.rows[0].stato).toBe('interrotta');
  });

  test('cancellazione con check-in già effettuato NON tocca lo stato', async () => {
    await processaBooking({
      id: 555333, roomId: 999889, arrival: '2026-11-18', departure: '2026-11-20',
      numAdult: 1, numChild: 0, firstName: 'Luca', lastName: 'Bianchi', email: 'luca.beds24test@example.com', status: 'confirmed',
    });
    const soggiorno = await pool.query(
      `SELECT s.id FROM soggiorni s JOIN prenotazioni p ON p.id = s.prenotazione_id
       WHERE p.external_booking_id = '555333'`
    );
    await pool.query(`UPDATE soggiorni SET check_in_effettuato_at = NOW() WHERE id = $1`, [soggiorno.rows[0].id]);

    const risultato = await processaBooking({
      id: 555333, roomId: 999889, arrival: '2026-11-18', departure: '2026-11-20',
      numAdult: 1, numChild: 0, firstName: 'Luca', lastName: 'Bianchi', email: 'luca.beds24test@example.com', status: 'cancelled',
    });

    expect(risultato.esito).toBe('cancellazione_ignorata_post_checkin');
    const prenotazione = await pool.query(
      `SELECT stato FROM prenotazioni WHERE canale_origine = 'beds24' AND external_booking_id = '555333'`
    );
    expect(prenotazione.rows[0].stato).not.toBe('interrotta');
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx jest tests/api/beds24Sync.test.js -v`
Expected: FAIL — entrambi i nuovi test falliscono (`esito` resta `'aggiornata'`, mai `'cancellata'` o `'cancellazione_ignorata_post_checkin'`).

- [ ] **Step 3: Implementare la gestione delle cancellazioni**

```javascript
// Sostituire, dentro processaBooking, il blocco:
//   if (esistente.rows.length) {
//     const riga = esistente.rows[0];
//     await client.query(`UPDATE soggiorni SET ...`);
//     await client.query('COMMIT');
//     return { esito: 'aggiornata' };
//   }
// con:

    if (esistente.rows.length) {
      const riga = esistente.rows[0];

      if (booking.status === 'cancelled') {
        const soggiornoAttuale = await client.query(
          `SELECT check_in_effettuato_at FROM soggiorni WHERE id = $1`, [riga.soggiorno_id]
        );
        if (soggiornoAttuale.rows[0].check_in_effettuato_at) {
          await client.query('ROLLBACK');
          return { esito: 'cancellazione_ignorata_post_checkin' };
        }
        await client.query(`UPDATE soggiorni SET cancellato = true, updated_at = now() WHERE id = $1`, [riga.soggiorno_id]);
        await client.query(`UPDATE prenotazioni SET stato = 'interrotta', updated_at = now() WHERE id = $1`, [riga.prenotazione_id]);
        await client.query('COMMIT');
        return { esito: 'cancellata' };
      }

      await client.query(
        `UPDATE soggiorni SET data_arrivo = $2, data_partenza = $3, num_ospiti = $4, ospite_id = $5, updated_at = now()
         WHERE id = $1`,
        [riga.soggiorno_id, booking.arrival, booking.departure, (booking.numAdult || 1) + (booking.numChild || 0), ospiteId]
      );
      await client.query('COMMIT');
      return { esito: 'aggiornata' };
    }
```

- [ ] **Step 4: Eseguire tutti i test e verificare che passino**

Run: `npx jest tests/api/beds24Sync.test.js -v`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add backend/controllers/beds24SyncController.js tests/api/beds24Sync.test.js
git commit -m "feat(beds24): gestione cancellazioni, mai automatiche dopo il check-in"
```

---

### Task 7: `beds24SyncController.js` — coda per prenotazioni non assegnabili

**Files:**
- Modify: `backend/controllers/beds24SyncController.js`
- Test: `tests/api/beds24Sync.test.js`

**Interfaces:**
- Consumes: tabella `beds24_prenotazioni_da_revisionare` (Task 1).
- Produces: `processaBooking` ora scrive in coda invece di limitarsi a restituire `esito: 'in_coda'` senza traccia persistita.

- [ ] **Step 1: Scrivere i due test (camera non mappata, nessuna camera disponibile)**

```javascript
describe('beds24SyncController — processaBooking, coda da revisionare', () => {
  afterEach(async () => {
    await pool.query(`DELETE FROM beds24_prenotazioni_da_revisionare WHERE external_booking_id IN ('555444', '555555')`);
  });

  test('roomId non mappato finisce in coda con il motivo corretto, nessuna scrittura su prenotazioni', async () => {
    const risultato = await processaBooking({
      id: 555444, roomId: 12345999, arrival: '2026-11-22', departure: '2026-11-23',
      numAdult: 1, numChild: 0, firstName: 'Test', lastName: 'NonMappato', email: 'nonmappato.beds24test@example.com', status: 'confirmed',
    });

    expect(risultato.esito).toBe('in_coda');
    expect(risultato.dettaglio.motivo).toBe('camera_non_mappata');
    const coda = await pool.query(
      `SELECT * FROM beds24_prenotazioni_da_revisionare WHERE external_booking_id = '555444'`
    );
    expect(coda.rows).toHaveLength(1);
    expect(coda.rows[0].motivo).toBe('camera_non_mappata');
    expect(coda.rows[0].risolto).toBe(false);
    const prenotazione = await pool.query(
      `SELECT * FROM prenotazioni WHERE external_booking_id = '555444'`
    );
    expect(prenotazione.rows).toHaveLength(0);
  });

  test('camera mappata ma tutte occupate finisce in coda con motivo nessuna_camera_disponibile', async () => {
    const tc = await pool.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Singola Piena Test', 1) RETURNING id`);
    const c = await pool.query(`INSERT INTO camere (numero, nome, attivo) VALUES ('T26', 'Camera Piena Test', true) RETURNING id`);
    await pool.query(`INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1, $2)`, [tc.rows[0].id, c.rows[0].id]);
    await pool.query(`INSERT INTO tipi_camera_canali (tipo_camera_id, canale, codice_esterno) VALUES ($1, 'beds24', '777000')`, [tc.rows[0].id]);
    const ospite = await pool.query(`INSERT INTO ospiti (nome, cognome) VALUES ('Occupante', 'Test') RETURNING id`);
    const prenotazioneEsistente = await pool.query(
      `INSERT INTO prenotazioni (canale_origine, stato) VALUES ('test_interno', 'confermata') RETURNING id`
    );
    await pool.query(
      `INSERT INTO soggiorni (prenotazione_id, camera_id, ospite_id, data_arrivo, data_partenza, num_ospiti)
       VALUES ($1, $2, $3, '2026-11-25', '2026-11-27', 1)`,
      [prenotazioneEsistente.rows[0].id, c.rows[0].id, ospite.rows[0].id]
    );

    const risultato = await processaBooking({
      id: 555555, roomId: 777000, arrival: '2026-11-25', departure: '2026-11-27',
      numAdult: 1, numChild: 0, firstName: 'Test', lastName: 'SenzaCamera', email: 'senzacamera.beds24test@example.com', status: 'confirmed',
    });

    expect(risultato.esito).toBe('in_coda');
    expect(risultato.dettaglio.motivo).toBe('nessuna_camera_disponibile');

    await pool.query(`DELETE FROM soggiorni WHERE prenotazione_id = $1`, [prenotazioneEsistente.rows[0].id]);
    await pool.query(`DELETE FROM prenotazioni WHERE id = $1`, [prenotazioneEsistente.rows[0].id]);
    await pool.query(`DELETE FROM ospiti WHERE id = $1`, [ospite.rows[0].id]);
    await pool.query(`DELETE FROM tipi_camera_canali WHERE tipo_camera_id = $1`, [tc.rows[0].id]);
    await pool.query(`DELETE FROM tipi_camera_camere WHERE camera_id = $1`, [c.rows[0].id]);
    await pool.query(`DELETE FROM camere WHERE id = $1`, [c.rows[0].id]);
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tc.rows[0].id]);
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx jest tests/api/beds24Sync.test.js -v`
Expected: FAIL — `beds24_prenotazioni_da_revisionare` resta vuota in entrambi i casi (la funzione oggi fa solo `ROLLBACK` e ritorna, non scrive la coda).

- [ ] **Step 3: Scrivere la coda nei due punti di uscita "in_coda"**

```javascript
// In processaBooking, sostituire i due `return { esito: 'in_coda', ... }`
// con una chiamata alla nuova funzione scriviInCoda PRIMA del return —
// va scritta DOPO il ROLLBACK, in una query indipendente (non nella
// stessa transazione annullata).

async function scriviInCoda(externalBookingId, payload, motivo) {
  await pool.query(
    `INSERT INTO beds24_prenotazioni_da_revisionare (external_booking_id, payload_raw, motivo)
     VALUES ($1, $2, $3)`,
    [externalBookingId, JSON.stringify(payload), motivo]
  );
}

// Primo punto (camera non mappata):
    if (!mappatura.rows.length) {
      await client.query('ROLLBACK');
      await scriviInCoda(externalBookingId, booking, 'camera_non_mappata');
      return { esito: 'in_coda', dettaglio: { motivo: 'camera_non_mappata' } };
    }

// Secondo punto (nessuna camera disponibile):
    if (!cameraId) {
      await client.query('ROLLBACK');
      await scriviInCoda(externalBookingId, booking, 'nessuna_camera_disponibile');
      return { esito: 'in_coda', dettaglio: { motivo: 'nessuna_camera_disponibile' } };
    }
```

- [ ] **Step 4: Eseguire tutti i test del file e verificare che passino**

Run: `npx jest tests/api/beds24Sync.test.js -v`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add backend/controllers/beds24SyncController.js tests/api/beds24Sync.test.js
git commit -m "feat(beds24): coda persistita per prenotazioni non assegnabili automaticamente"
```

---

### Task 8: `routes/beds24.js` — webhook prenotazioni

**Files:**
- Create: `backend/routes/beds24.js`
- Modify: `backend/app.js` (require + `app.use`)
- Test: `tests/api/beds24Webhook.test.js`

**Interfaces:**
- Consumes: `processaBooking` (Task 5/6/7).
- Produces: `POST /api/beds24/webhook/bookings`, pubblica, montata in `app.js`.

- [ ] **Step 1: Scrivere il test del webhook**

```javascript
// tests/api/beds24Webhook.test.js
const request = require('supertest');
const app = require('../../backend/app');
const pool = require('../../backend/config/db');

describe('POST /api/beds24/webhook/bookings', () => {
  afterEach(async () => {
    await pool.query(`DELETE FROM webhook_log WHERE fonte = 'beds24'`);
    await pool.query(`DELETE FROM beds24_prenotazioni_da_revisionare WHERE external_booking_id = '999777'`);
  });

  test('logga sempre il payload grezzo su webhook_log, anche se il roomId non è mappato', async () => {
    const risposta = await request(app)
      .post('/api/beds24/webhook/bookings')
      .send({ id: 999777, roomId: 88888, arrival: '2026-12-01', departure: '2026-12-02', firstName: 'Test', lastName: 'Webhook', status: 'confirmed' });

    expect(risposta.status).toBe(200);
    const log = await pool.query(`SELECT * FROM webhook_log WHERE fonte = 'beds24' ORDER BY id DESC LIMIT 1`);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0].payload_raw.id).toBe(999777);
    const coda = await pool.query(`SELECT * FROM beds24_prenotazioni_da_revisionare WHERE external_booking_id = '999777'`);
    expect(coda.rows).toHaveLength(1);
  });

  test('risponde 200 anche se il payload è vuoto/malformato, senza andare in crash', async () => {
    const risposta = await request(app).post('/api/beds24/webhook/bookings').send({});
    expect(risposta.status).toBe(200);
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx jest tests/api/beds24Webhook.test.js -v`
Expected: FAIL — `404` (`Route non trovata`), la rotta non esiste ancora.

- [ ] **Step 3: Implementare la rotta**

```javascript
// backend/routes/beds24.js
// Rotte Beds24 — Modulo 2.3, Fase 1 (lettura prenotazioni). Il webhook è
// pubblico (nessun verificaToken: è Beds24 che chiama noi), protetto solo
// da un rate limit dedicato — stesso principio di preCheckinPubblico.js.
// Le rotte sulla coda "da revisionare" sono invece autenticate.

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const pool = require('../config/db');
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const { processaBooking } = require('../controllers/beds24SyncController');

const webhookRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppe richieste.' },
});

// Logga sempre il payload grezzo, anche se l'elaborazione fallisce dopo —
// stesso pattern di xpayNotificaController.js scriviLog(). hmac_valido
// resta null: Beds24 non documenta pubblicamente una firma sulle chiamate
// webhook in uscita (da verificare quando si abilita il webhook nel loro
// pannello — vedi Task 12), non è un'omissione, è un'incognita nota.
async function scriviWebhookLog(payload, errore) {
  try {
    await pool.query(
      `INSERT INTO webhook_log (fonte, payload_raw, hmac_valido, processato, errore)
       VALUES ('beds24', $1, NULL, $2, $3)`,
      [JSON.stringify(payload), !errore, errore || null]
    );
  } catch (logErr) {
    console.error('scrittura webhook_log (beds24) — errore imprevisto:', logErr.message);
  }
}

router.post('/webhook/bookings', webhookRateLimit, async (req, res) => {
  const payload = req.body || {};
  try {
    if (!payload.id || !payload.roomId) {
      await scriviWebhookLog(payload, 'payload senza id o roomId');
      return res.status(200).json({ ricevuto: true });
    }
    await processaBooking(payload);
    await scriviWebhookLog(payload, null);
    res.status(200).json({ ricevuto: true });
  } catch (err) {
    console.error('beds24 webhook — errore elaborazione:', err.message);
    await scriviWebhookLog(payload, err.message);
    // 200 comunque: non vogliamo che Beds24 ripeta la stessa chiamata in
    // loop per un errore nostro — l'errore resta tracciato in webhook_log.
    res.status(200).json({ ricevuto: true });
  }
});

router.get('/da-revisionare', verificaToken, richiedeAzione('beds24', 'lettura'), async (req, res) => {
  try {
    const risultato = await pool.query(
      `SELECT * FROM beds24_prenotazioni_da_revisionare WHERE risolto = false ORDER BY created_at`
    );
    res.json(risultato.rows);
  } catch (err) {
    console.error('lista beds24_prenotazioni_da_revisionare error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

router.patch('/da-revisionare/:id/risolvi', verificaToken, richiedeAzione('beds24', 'scrittura'), async (req, res) => {
  try {
    const risultato = await pool.query(
      `UPDATE beds24_prenotazioni_da_revisionare SET risolto = true, updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!risultato.rows.length) {
      return res.status(404).json({ error: 'Riga non trovata.' });
    }
    res.json(risultato.rows[0]);
  } catch (err) {
    console.error('risolvi beds24_prenotazioni_da_revisionare error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

module.exports = router;
```

- [ ] **Step 4: Montare la rotta in `app.js`**

```javascript
// Aggiungere vicino alle altre const require('./routes/...') — accanto a canaliOtaRoutes:
const beds24Routes = require('./routes/beds24');

// Aggiungere vicino a app.use('/api/canali-ota', ...):
app.use('/api/beds24', beds24Routes);
```

- [ ] **Step 5: Aggiungere il permesso `beds24` a `shared/ruoli.js`**

```javascript
// In PERMESSI_SEZIONI, vicino a canali_ota — lettura e risoluzione anche
// a receptionist: è chi crea a mano la prenotazione mancante e chiude la
// riga in coda, stesso ruolo operativo di chi gestisce il check-in.
beds24: {
  lettura:   [A, T, R],
  scrittura: [A, T, R],
},
```

- [ ] **Step 6: Eseguire i test e verificare che passino**

Run: `npx jest tests/api/beds24Webhook.test.js -v`
Expected: PASS (2/2).

- [ ] **Step 7: Commit**

```bash
git add backend/routes/beds24.js backend/app.js shared/ruoli.js tests/api/beds24Webhook.test.js
git commit -m "feat(beds24): rotta webhook prenotazioni + coda da-revisionare"
```

---

### Task 9: Test permessi sulla coda "da revisionare"

**Files:**
- Modify: `tests/api/beds24Webhook.test.js`

**Interfaces:**
- Consumes: `GET /api/beds24/da-revisionare`, `PATCH /api/beds24/da-revisionare/:id/risolvi` (Task 8), helper `tests/helpers/auth.js` per token di test per ruolo.

- [ ] **Step 1: Scrivere i test di permesso (senza token, ruolo non abilitato, ruolo abilitato)**

```javascript
const { ottieniTokenPerRuolo } = require('../helpers/auth'); // helper già esistente nel progetto

describe('GET /api/beds24/da-revisionare — permessi', () => {
  test('senza token → 401', async () => {
    const risposta = await request(app).get('/api/beds24/da-revisionare');
    expect(risposta.status).toBe(401);
  });

  test('con ruolo cameriere → 403', async () => {
    const token = await ottieniTokenPerRuolo('cameriere');
    const risposta = await request(app).get('/api/beds24/da-revisionare').set('Cookie', `token=${token}`);
    expect(risposta.status).toBe(403);
  });

  test('con ruolo receptionist → 200', async () => {
    const token = await ottieniTokenPerRuolo('receptionist');
    const risposta = await request(app).get('/api/beds24/da-revisionare').set('Cookie', `token=${token}`);
    expect(risposta.status).toBe(200);
    expect(Array.isArray(risposta.body)).toBe(true);
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che passino subito**

Run: `npx jest tests/api/beds24Webhook.test.js -v`
Expected: PASS (5/5) — la logica dei permessi è già quella generica di `richiedeAzione`/`verificaToken`, questo task verifica che il collegamento in Task 8 sia corretto, non introduce codice nuovo.

- [ ] **Step 3: Commit**

```bash
git add tests/api/beds24Webhook.test.js
git commit -m "test(beds24): copertura permessi per ruolo sulla coda da-revisionare"
```

---

### Task 10: Job di riconciliazione notturna

**Files:**
- Create: `backend/jobs/beds24Riconciliazione.js`
- Modify: `backend/server.js` (require + avvio, mai in `app.js` — stesso motivo già documentato per gli altri job)

**Interfaces:**
- Consumes: `getBookings` (Task 3), `processaBooking` (Task 5/6/7), tabella `beds24_config.ultima_sincronizzazione_at`.
- Produces: `avviaJobRiconciliazioneBeds24()`, chiamata solo da `server.js`.

- [ ] **Step 1: Scrivere il job**

```javascript
// backend/jobs/beds24Riconciliazione.js
// Rete di sicurezza contro webhook Beds24 persi — Modulo 2.3, Fase 1.
// Ogni notte alle 03:00 (basso traffico) recupera le prenotazioni
// modificate dall'ultima sincronizzazione e le passa alla stessa
// funzione di upsert del webhook, per non avere due logiche di
// scrittura da mantenere allineate.
// Avviato solo da server.js, mai da app.js (stesso motivo di
// avviaJobPromemoriaEmail: app.js è importato anche dai test Jest).

const cron = require('node-cron');
const pool = require('../config/db');
const beds24Client = require('../lib/beds24Client');
const { processaBooking } = require('../controllers/beds24SyncController');

async function eseguiRiconciliazione() {
  const config = await pool.query('SELECT ultima_sincronizzazione_at FROM beds24_config WHERE id = 1');
  if (!config.rows.length || !config.rows[0].ultima_sincronizzazione_at) {
    console.log('Riconciliazione Beds24: nessuna sincronizzazione precedente, salto questo giro (richiede prima il setup, vedi beds24Setup.js).');
    return;
  }

  const modifiedSince = new Date(config.rows[0].ultima_sincronizzazione_at).toISOString();
  const inizioGiro = new Date();

  try {
    const prenotazioni = await beds24Client.getBookings({ modifiedSince });
    let elaborate = 0;
    for (const booking of prenotazioni) {
      try {
        await processaBooking(booking);
        elaborate += 1;
      } catch (err) {
        console.error(`Riconciliazione Beds24 — errore su prenotazione ${booking.id}:`, err.message);
      }
    }
    await pool.query('UPDATE beds24_config SET ultima_sincronizzazione_at = $1 WHERE id = 1', [inizioGiro]);
    console.log(`Riconciliazione Beds24 completata: ${elaborate}/${prenotazioni.length} prenotazioni elaborate.`);
  } catch (err) {
    console.error('Riconciliazione Beds24 — chiamata a Beds24 fallita:', err.message);
  }
}

function avviaJobRiconciliazioneBeds24() {
  cron.schedule('0 3 * * *', eseguiRiconciliazione);
}

module.exports = { avviaJobRiconciliazioneBeds24, eseguiRiconciliazione };
```

- [ ] **Step 2: Verificare che il file non abbia errori di sintassi**

Run: `node -c backend/jobs/beds24Riconciliazione.js`
Expected: nessun output.

- [ ] **Step 3: Scrivere un test manuale per `eseguiRiconciliazione` (non lo schedule, la funzione)**

```javascript
// tests/lib/beds24Riconciliazione.test.js
const pool = require('../../backend/config/db');
const beds24Client = require('../../backend/lib/beds24Client');
const beds24SyncController = require('../../backend/controllers/beds24SyncController');
const { eseguiRiconciliazione } = require('../../backend/jobs/beds24Riconciliazione');

describe('eseguiRiconciliazione', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    await pool.query('DELETE FROM beds24_config');
  });

  test('non chiama Beds24 se non è mai stato fatto un giro precedente', async () => {
    const spy = jest.spyOn(beds24Client, 'getBookings');
    await eseguiRiconciliazione();
    expect(spy).not.toHaveBeenCalled();
  });

  test('chiama processaBooking per ogni prenotazione restituita e aggiorna ultima_sincronizzazione_at', async () => {
    await pool.query(
      `INSERT INTO beds24_config (id, ultima_sincronizzazione_at) VALUES (1, NOW() - INTERVAL '1 day')`
    );
    jest.spyOn(beds24Client, 'getBookings').mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const processaSpy = jest.spyOn(beds24SyncController, 'processaBooking').mockResolvedValue({ esito: 'aggiornata' });

    await eseguiRiconciliazione();

    expect(processaSpy).toHaveBeenCalledTimes(2);
    const config = await pool.query('SELECT ultima_sincronizzazione_at FROM beds24_config WHERE id = 1');
    expect(new Date(config.rows[0].ultima_sincronizzazione_at).getTime()).toBeGreaterThan(Date.now() - 5000);
  });
});
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `npx jest tests/lib/beds24Riconciliazione.test.js -v`
Expected: PASS (2/2).

- [ ] **Step 5: Collegare il job a `server.js`**

```javascript
// Aggiungere vicino alle altre const require('./jobs/...'):
const { avviaJobRiconciliazioneBeds24 } = require('./jobs/beds24Riconciliazione');

// Aggiungere dentro app.listen(..., () => { ... }), vicino agli altri avviaJob...():

  // Job riconciliazione notturna Beds24 (modulo 2.3, Fase 1) — mai in
  // app.js, stesso motivo degli altri job: girerebbe anche durante i test.
  avviaJobRiconciliazioneBeds24();
```

- [ ] **Step 6: Commit**

```bash
git add backend/jobs/beds24Riconciliazione.js backend/server.js tests/lib/beds24Riconciliazione.test.js
git commit -m "feat(beds24): job notturno di riconciliazione come rete di sicurezza"
```

---

### Task 11: Frontend — correggere il canale hardcoded `'wubook'` in `/tariffe`

**Files:**
- Modify: `frontend/app/tariffe/page.jsx`

**Interfaces:**
- Consumes: `PUT /api/canali-ota/:tipoCameraId` (già esistente, nessuna modifica backend necessaria — il campo `canale` era già libero).

- [ ] **Step 1: Aggiornare il commento e il badge di `SezioneCanaliOta`**

Nel file, sostituire (righe indicative, verificare l'esatto punto nel file al momento dell'implementazione):

```jsx
// PRIMA:
// ── Codici canale OTA (Modulo 2.3, Fase 1) ───────────────────────────────────
// Una riga per categoria camera, un solo canale oggi (WuBook — badge fisso
// in intestazione, non un selettore: non ha senso mostrare una scelta con
// una sola opzione). Salvataggio per riga, non un form unico, come
// l'assegnazione categoria→camera in /impostazioni/camere.

// DOPO:
// ── Codici canale OTA (Modulo 2.3, Fase 1) ───────────────────────────────────
// Una riga per categoria camera, un solo canale oggi (Beds24 — badge
// fisso in intestazione, non un selettore: non ha senso mostrare una
// scelta con una sola opzione). Canale cambiato da WuBook a Beds24 il
// 19/08/2026 (WuBook/WooDoo scartati) — vedi docs/EVOLUTIVE.md.
// Salvataggio per riga, non un form unico, come l'assegnazione
// categoria→camera in /impostazioni/camere.
```

```jsx
// PRIMA:
        <span className="text-xs px-2.5 py-1 rounded-full"
              style={{ background: 'var(--hotel-amber-light)', color: 'var(--hotel-amber-dark)' }}>
          Canale: WuBook / WooDoo
        </span>
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>
        Codice della camera così come appare nell'estranet WuBook, per ogni categoria. Serve alla mappatura del modulo 2.3, non ancora attiva (in attesa dell'account WuBook).
      </p>

// DOPO:
        <span className="text-xs px-2.5 py-1 rounded-full"
              style={{ background: 'var(--hotel-amber-light)', color: 'var(--hotel-amber-dark)' }}>
          Canale: Beds24
        </span>
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>
        Codice della camera (roomId) così come appare nel pannello Beds24, per ogni categoria — serve alla mappatura usata dall'integrazione Beds24 (lettura prenotazioni).
      </p>
```

```jsx
// PRIMA:
      await api.put(`/canali-ota/${riga.tipo_camera_id}`, { canale: 'wubook', codice_esterno: codice || null });

// DOPO:
      await api.put(`/canali-ota/${riga.tipo_camera_id}`, { canale: 'beds24', codice_esterno: codice || null });
```

- [ ] **Step 2: Verificare che non ci siano errori di sintassi**

Run: `npx tsc --noEmit -p .verify.tsconfig.json` (tsconfig di scratch scoped al solo file, pattern già in uso in questo repo — vedi la nota di memoria `sito_hotel_verifica_tsc_reale` se serve replicarlo qui) oppure, più semplice per un file `.jsx`: verifica con un babel transform locale o direttamente in `npm run dev`.
Expected: nessun errore di parsing.

- [ ] **Step 3: Verifica manuale (da fare da Marco in locale, non da questa sessione — nessun accesso a `npm run dev` reale)**

Aprire `/tariffe`, controllare che il badge mostri "Canale: Beds24" e che salvare un codice per una categoria camera chiami `PUT /api/canali-ota/:id` con `canale: 'beds24'` (verificabile dal tab Network del browser).

- [ ] **Step 4: Commit**

```bash
git add frontend/app/tariffe/page.jsx
git commit -m "fix(tariffe): canale mappatura OTA da wubook a beds24"
```

---

### Task 12: Verifica manuale contro l'account Beds24 reale

**Files:** nessuno — checklist operativa, non codice.

**Interfaces:** nessuna — chiude il ciclo aperto dalle incognite elencate nei Global Constraints e nella spec.

- [ ] **Step 1:** Marco genera un invite code in Beds24 ▸ MARKETPLACE ▸ API e lo passa.
- [ ] **Step 2:** Eseguire `node backend/scripts/beds24Setup.js <invite-code>` sul server/ambiente dove gira il backend. Se fallisce con HTTP 404, cambiare `BEDS24_BASE_URL` in `.env` da `https://api.beds24.com/v2` a `https://beds24.com/api/v2` e riprovare.
- [ ] **Step 3:** In Beds24 ▸ Settings ▸ Properties ▸ Access, abilitare i Booking Webhooks v2 puntando a `https://hdgolfo-gestionale.com/api/beds24/webhook/bookings` (dominio di produzione, modulo 1.10) — annotare se il pannello mostra un secret/firma da configurare: se sì, aprire un piccolo task di follow-up per verificarla in `scriviWebhookLog`/nella rotta (oggi `hmac_valido` resta sempre `NULL`).
- [ ] **Step 4:** Una volta collegato Booking.com (Marco, fuori da questa sessione) e arrivata una prenotazione di test reale, controllare `SELECT payload_raw FROM webhook_log WHERE fonte = 'beds24' ORDER BY id DESC LIMIT 1` e confrontare i nomi di campo con quelli assunti in `beds24SyncController.js` (`id`, `roomId`, `arrival`, `departure`, `numAdult`, `numChild`, `firstName`, `lastName`, `email`, `phone`, `status`). Correggere i nomi nel controller se diversi — nessuna altra parte della logica cambia.
- [ ] **Step 5:** Popolare `tipi_camera_canali` per `canale='beds24'` con i `roomId` reali dal pannello Beds24, usando la sezione "Codici canale OTA" in `/tariffe` (Task 11).
- [ ] **Step 6:** Verificare in `GET /bookings` (via `beds24Client.getBookings({})` senza `modifiedSince`, da uno script/console Node al bisogno) che il parametro `modifiedSince` sia effettivamente quello giusto — se Beds24 lo ignora o risponde errore, controllare la risposta di errore per il nome corretto e aggiornare `beds24Client.js`.

---

## Note per chi esegue il piano

- I Task 1-10 sono nell'ordine giusto per TDD e commit frequenti; il Task 11 (frontend) è indipendente e può essere fatto in qualunque momento dopo il Task 1. Il Task 12 richiede credenziali reali e va fatto per ultimo, con Marco.
- Nessun task di questo piano scrive disponibilità o prezzi verso Beds24 — è deliberatamente fuori scope (vedi spec, punti 2 e 3 del modulo 2.3).
- La coda `beds24_prenotazioni_da_revisionare` non ha un pannello frontend dedicato in questa fase (fuori scope, spec approvata da Marco) — durante la prova gratuita è consultabile solo via `GET /api/beds24/da-revisionare` (es. da Postman/curl con un cookie di sessione valido) finché non nasce l'esigenza di una pagina vera.
