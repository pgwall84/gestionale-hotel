# Invio tariffe/disponibilità/restrizioni a Beds24 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push tariffe, disponibilità e restrizioni dal gestionale verso Beds24 (`POST /inventory/rooms/calendar`), con il gestionale come unica fonte di verità, mantenendo il canale diretto invariato.

**Architecture:** Due percorsi di scrittura separati, mai condivisi: (1) un push disponibilità immediato, agganciato a ogni creazione/modifica/cancellazione di soggiorno su qualunque canale; (2) un job periodico (cron, stesso pattern di `beds24Riconciliazione.js`) che invia tariffe e restrizioni per l'intero orizzonte configurato. Entrambi passano da un nuovo modulo di calcolo puro (`beds24PrezziDisponibilita.js`) e da un nuovo metodo di scrittura in `beds24Client.js`. Le query esistenti del canale diretto (`planningTariffeController.js`, `tariffeController.js`) restano invariate nel comportamento — dove leggono `planning_tariffe_giorni` vengono ristrette esplicitamente a `canale IS NULL`, per non lasciare che un'eccezione Beds24 sporchi il prezzo mostrato/venduto in diretta.

**Tech Stack:** Node.js/Express, PostgreSQL (`pg`), Jest+Supertest, node-cron, Next.js/React (frontend).

## Global Constraints

- Ogni nuova tabella/colonna segue lo stile delle migration esistenti (commento di intestazione con motivazione, `IF NOT EXISTS`, `CHECK` dove applicabile). Prossimo numero libero: `058` (`057` è l'ultima esistente, `054` è già saltata in precedenza — non riusarla).
- Ogni funzione che chiama `pool`/`client.query` richiede `require('../config/db')` con lo stesso import non distrutto usato da `beds24Client`/`beds24SyncController` quando la funzione deve restare "spiabile" da `jest.spyOn` nei test (vedi commento in `beds24Riconciliazione.js`).
- Nessuna chiamata a Beds24 deve mai bloccare una scrittura sul nostro DB: il pattern è sempre "scrivi prima sul nostro DB, poi tenta il push, logga sempre l'esito" (stesso principio già in uso per il webhook).
- Tutti i job periodici si avviano SOLO da `backend/server.js`, mai da `app.js` (import anche nei test Jest — un cron avviato lì gira anche durante `npm test`).
- Test: `npm test` (Jest, `--runInBand`) deve restare verde ad ogni commit. Pattern esistente: `tests/lib/*.test.js` per logica pura/unit, `tests/api/*.test.js` per integrazione con DB reale via Supertest.
- Ogni riga di `planning_tariffe_giorni` con `canale IS NULL` continua a significare "vale per tutti i canali" — le query del motore di prenotazione diretto (`calcolaTariffaPerTrattamentiConPlanning`, `prezzoBasePerNotteConPlanning`) devono SEMPRE filtrare esplicitamente `canale IS NULL`, mai leggere righe `canale = 'beds24'`.
- Riferimento spec: `docs/superpowers/specs/2026-09-03-invio-tariffe-beds24-design.md` (letta per intero il 04/09/2026, tutte le incognite tecniche chiuse). Ogni requisito lì dentro deve avere un task qui sotto.

---

### Task 1: Migration 058 — colonne di configurazione canale Beds24

**Files:**
- Create: `database/migrations/058_beds24_config_invio.sql`

**Interfaccia (colonne/tabelle prodotte, usate dai task successivi):**
- `tipi_camera_canali.unita_esposte SMALLINT` (nullable)
- `tipi_camera_canali.maggiorazione_percentuale NUMERIC(5,2) NOT NULL DEFAULT 0`
- `beds24_config.orizzonte_invio_tariffe_fino_a DATE` (nullable)
- Tabella `beds24_invio_log(id, tipo, tipo_camera_id, esito, dettaglio JSONB, created_at)`

- [ ] **Step 1: Scrivere la migration**

```sql
-- database/migrations/058_beds24_config_invio.sql
-- Migration 058 — Configurazione invio tariffe/disponibilità a Beds24
-- (Modulo 2.3, Fase 2/3, 04/09/2026). Vedi
-- docs/superpowers/specs/2026-09-03-invio-tariffe-beds24-design.md.
--
-- unita_esposte: tetto di unità vendibili su Beds24 per quella tipologia,
-- indipendente dalla disponibilità fisica reale (Beds24 fattura per unità
-- esposta — vedi sezione Contesto della spec). NULL = nessun tetto oltre
-- la disponibilità fisica.
-- maggiorazione_percentuale: applicata al prezzo base diretto per ottenere
-- il prezzo inviato a Beds24 (assorbe la commissione OTA/Beds24).
--
-- beds24_invio_log: stesso principio di webhook_log ma per la direzione
-- opposta (noi -> Beds24). tipo distingue disponibilita/tariffe perché
-- hanno cadenza e granularità diverse (evento singolo vs batch periodico).
-- dettaglio JSONB conserva errors/warnings/info così come li restituisce
-- Beds24 (POST /inventory/rooms/calendar), non appiattiti in una stringa
-- — vedi sezione "Gestione errori" della spec.

BEGIN;

ALTER TABLE tipi_camera_canali
  ADD COLUMN IF NOT EXISTS unita_esposte SMALLINT,
  ADD COLUMN IF NOT EXISTS maggiorazione_percentuale NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE tipi_camera_canali
  ADD CONSTRAINT chk_tipi_camera_canali_unita_esposte CHECK (unita_esposte IS NULL OR unita_esposte >= 0);
ALTER TABLE tipi_camera_canali
  ADD CONSTRAINT chk_tipi_camera_canali_maggiorazione CHECK (maggiorazione_percentuale >= 0);

ALTER TABLE beds24_config
  ADD COLUMN IF NOT EXISTS orizzonte_invio_tariffe_fino_a DATE;

CREATE TABLE IF NOT EXISTS beds24_invio_log (
  id              SERIAL PRIMARY KEY,
  tipo            VARCHAR(20) NOT NULL,
  tipo_camera_id  INTEGER REFERENCES tipi_camera(id),
  esito           VARCHAR(20) NOT NULL,
  dettaglio       JSONB,
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_beds24_invio_log_tipo CHECK (tipo IN ('disponibilita', 'tariffe')),
  CONSTRAINT chk_beds24_invio_log_esito CHECK (esito IN ('successo', 'errore', 'saltato_rate_limit'))
);
CREATE INDEX IF NOT EXISTS idx_beds24_invio_log_tipo_data ON beds24_invio_log (tipo, created_at);

COMMIT;
```

- [ ] **Step 2: Applicare la migration sul DB di test/sviluppo**

Run: `node database/migrate.js` (o lo script di migration già in uso nel progetto — verificare il nome esatto in `package.json`/`database/` prima di eseguire; se lo script non esiste con questo nome, applicare la migration con `psql $DATABASE_URL -f database/migrations/058_beds24_config_invio.sql`).

Expected: nessun errore, `\d tipi_camera_canali` mostra le due nuove colonne, `\d beds24_invio_log` mostra la tabella.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/058_beds24_config_invio.sql
git commit -m "feat(beds24): migration 058 — colonne configurazione invio tariffe/disponibilità"
```

---

### Task 2: Migration 059 — colonna `canale` su `planning_tariffe_giorni`

**Files:**
- Create: `database/migrations/059_planning_tariffe_canale.sql`

**Interfaccia:**
- `planning_tariffe_giorni.canale VARCHAR(20)` — `NULL` = tutti i canali, `'beds24'` = eccezione.
- Nuovo indice univoco che tratta `NULL` come un valore normalizzato distinto (al massimo una riga `NULL` per tipo_camera+trattamento+data, al massimo una riga `'beds24'` per la stessa chiave — non collassabili tra loro, ma ciascuno univoco al proprio interno). Postgres tratta `NULL` come "diverso da se stesso" in un indice univoco standard multi-colonna: un `UNIQUE(a,b,c,canale)` normale permetterebbe righe `NULL` duplicate. Si usa quindi `COALESCE(canale, '')` nell'espressione dell'indice.

- [ ] **Step 1: Scrivere la migration**

```sql
-- database/migrations/059_planning_tariffe_canale.sql
-- Migration 059 — Eccezioni per canale su planning_tariffe_giorni
-- (Modulo 2.3, Fase 2/3, 04/09/2026).
--
-- canale NULL (default) = vale per tutti i canali, comportamento
-- identico a prima di questa migration — nessuna riga esistente cambia
-- significato. canale = 'beds24' = eccezione con precedenza sulla riga
-- NULL per la stessa (tipo_camera_id, trattamento, data).
--
-- L'indice univoco precedente (uq_planning_tariffe_giorni, migration 053)
-- viene sostituito: un UNIQUE(tipo_camera_id, trattamento, data, canale)
-- "nudo" non basterebbe, perché Postgres tratta NULL come "non uguale a
-- se stesso" nell'unicità di default — permetterebbe righe NULL duplicate
-- per la stessa chiave, rompendo l'invariante "al più una riga di default
-- per giorno". Si usa COALESCE(canale, '') nell'espressione dell'indice:
-- normalizza NULL a '' ai soli fini dell'unicità (mai un valore di canale
-- reale, enforced dal CHECK sotto), così NULL e '' collidono tra loro
-- come previsto mentre 'beds24' resta un valore separato.

BEGIN;

ALTER TABLE planning_tariffe_giorni
  ADD COLUMN IF NOT EXISTS canale VARCHAR(20);

ALTER TABLE planning_tariffe_giorni
  ADD CONSTRAINT chk_planning_tariffe_canale CHECK (canale IS NULL OR (canale <> '' AND canale IN ('beds24')));

DROP INDEX IF EXISTS uq_planning_tariffe_giorni;

CREATE UNIQUE INDEX IF NOT EXISTS uq_planning_tariffe_giorni
  ON planning_tariffe_giorni (tipo_camera_id, trattamento, data, COALESCE(canale, ''));

COMMIT;
```

- [ ] **Step 2: Verificare l'invariante con un test manuale rapido**

Run (via `psql` sul DB di test, poi ripulire le righe di prova):
```sql
INSERT INTO planning_tariffe_giorni (tipo_camera_id, trattamento, data) VALUES (<id_reale>, 'bb', '2099-01-01');
INSERT INTO planning_tariffe_giorni (tipo_camera_id, trattamento, data) VALUES (<id_reale>, 'bb', '2099-01-01'); -- deve fallire (duplicate key)
INSERT INTO planning_tariffe_giorni (tipo_camera_id, trattamento, data, canale) VALUES (<id_reale>, 'bb', '2099-01-01', 'beds24'); -- deve riuscire (canale diverso)
```
Expected: la seconda INSERT fallisce con violazione dell'indice univoco, la terza riesce. Pulire le righe di prova dopo la verifica.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/059_planning_tariffe_canale.sql
git commit -m "feat(beds24): migration 059 — colonna canale su planning_tariffe_giorni, indice univoco con NULL normalizzato"
```

---

### Task 3: `beds24Client.js` — metodo di scrittura `pushCalendario`

**Files:**
- Modify: `backend/lib/beds24Client.js`
- Test: `tests/lib/beds24Client.test.js`

**Interfaces:**
- Consuma: `getToken()` (già esistente nello stesso file).
- Produce: `pushCalendario(voci)` — `voci: Array<{roomId: number, calendar: Array<{from, to, numAvail?, minStay?, maxStay?, override?, price1?, price2?}>}>`. Ritorna `{ok: boolean, risposta: object, creditiRimanenti: number|null}`. Lancia solo per errori di trasporto (network/HTTP non-2xx); un `success:false` nel corpo con `errors[]` NON lancia — è responsabilità del chiamante leggere `risposta.errors`/`warnings` e decidere (il chiamante è il modulo di log, Task 5).

- [ ] **Step 1: Scrivere il test che fallisce**

```js
// tests/lib/beds24Client.test.js — aggiungere in fondo al file
describe('beds24Client — pushCalendario', () => {
  afterEach(async () => {
    await pool.query('DELETE FROM beds24_config');
    jest.restoreAllMocks();
  });

  test('invia POST /inventory/rooms/calendar col token e restituisce risposta + crediti rimanenti', async () => {
    await pool.query(
      `INSERT INTO beds24_config (id, refresh_token, token, token_scade_at)
       VALUES (1, 'rt_fittizio', 'token_valido', NOW() + INTERVAL '1 hour')`
    );
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ([{ success: true, new: {}, modified: { field: 'numAvail' }, errors: [], warnings: [], info: [] }]),
      headers: new Map([
        ['x-fiveminlimit-remaining', '450'],
      ]),
    });

    const voci = [{ roomId: 999888, calendar: [{ from: '2026-10-01', to: '2026-10-02', numAvail: 2 }] }];
    const risultato = await beds24Client.pushCalendario(voci);

    expect(risultato.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opzioni] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('/inventory/rooms/calendar');
    expect(opzioni.method).toBe('POST');
    expect(opzioni.headers.token).toBe('token_valido');
    expect(JSON.parse(opzioni.body)).toEqual(voci);
  });

  test('lancia un errore chiaro se la risposta HTTP non è ok (errore di trasporto)', async () => {
    await pool.query(
      `INSERT INTO beds24_config (id, refresh_token, token, token_scade_at)
       VALUES (1, 'rt_fittizio', 'token_valido', NOW() + INTERVAL '1 hour')`
    );
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 });

    await expect(beds24Client.pushCalendario([{ roomId: 1, calendar: [] }]))
      .rejects.toThrow('POST /inventory/rooms/calendar fallita: HTTP 503');
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `npx jest tests/lib/beds24Client.test.js -t pushCalendario --runInBand`
Expected: FAIL — `beds24Client.pushCalendario is not a function`.

- [ ] **Step 3: Implementare `pushCalendario`**

```js
// backend/lib/beds24Client.js — aggiungere sotto getBookings, prima di module.exports

// Scrive disponibilità/prezzi/restrizioni su Beds24. `voci` è già nella
// forma sparsa richiesta dall'API (solo i campi da cambiare per ogni
// intervallo di date) — la costruzione dei valori (mappatura override,
// prezzi price1/price2) è responsabilità del chiamante
// (beds24PrezziDisponibilita.js), non di questo client.
// Non lancia per un success:false nel corpo — solo per errori di
// trasporto (rete, HTTP non-2xx). Un elemento con errors[] non vuoto è
// normale amministrazione (es. camera chiusa che rifiuta un prezzo) e va
// gestito dal chiamante via beds24_invio_log, non da un throw qui.
async function pushCalendario(voci) {
  const token = await getToken();
  const risposta = await fetch(`${BASE_URL}/inventory/rooms/calendar`, {
    method: 'POST',
    headers: { token, 'Content-Type': 'application/json' },
    body: JSON.stringify(voci),
  });
  if (!risposta.ok) {
    throw new Error(`POST /inventory/rooms/calendar fallita: HTTP ${risposta.status}`);
  }
  const corpo = await risposta.json();
  const creditiHeader = risposta.headers?.get
    ? risposta.headers.get('x-fiveminlimit-remaining')
    : null;
  return {
    ok: true,
    risposta: corpo,
    creditiRimanenti: creditiHeader !== null && creditiHeader !== undefined ? Number(creditiHeader) : null,
  };
}

module.exports = { scambiaInviteCode, getToken, getBookings, pushCalendario };
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `npx jest tests/lib/beds24Client.test.js -t pushCalendario --runInBand`
Expected: PASS (entrambi i test).

- [ ] **Step 5: Commit**

```bash
git add backend/lib/beds24Client.js tests/lib/beds24Client.test.js
git commit -m "feat(beds24): aggiungere pushCalendario a beds24Client per l'invio tariffe/disponibilità"
```

---

### Task 4: Modulo di calcolo puro — `beds24PrezziDisponibilita.js`

**Files:**
- Create: `backend/lib/beds24PrezziDisponibilita.js`
- Test: `tests/lib/beds24PrezziDisponibilita.test.js`

**Interfaces:**
- Consuma: `calcolaPrezzoCameraPerNotteConPlanning`, `prezzoBasePerNotteConPlanning` (NON usate qui — vedi nota sotto), `calcolaSupplementoTrattamento` da `tariffeController.js`; `pool` da `config/db`.
- Produce:
  - `calcolaOverrideBeds24({chiuso_arrivo, chiuso_partenza, stop_sell}) -> string` — mappatura enum, precedenza confermata da Marco.
  - `async calcolaDisponibilitaBeds24Range(tipoCameraId, dataDa, dataFineEsclusiva) -> Array<{giorno: string, numAvail: number}>` — `min(camere fisiche libere, unita_esposte)`.
  - `async calcolaPrezziRestrizioniBeds24Range(tipoCameraId, dataDa, dataFineEsclusiva) -> Array<{giorno, minStay, override, price1, price2}>` — prezzo B&B/Mezza Pensione con maggiorazione e override per giorno, rispettando le eccezioni `canale='beds24'` in `planning_tariffe_giorni` con precedenza sulle righe `canale IS NULL`.

Nota di design: **non riusiamo `calcolaPrezzoCameraPerNotteConPlanning`/`prezzoBasePerNotteConPlanning` così come sono**, perché quelle funzioni leggono `planning_tariffe_giorni` senza filtro di canale (dopo il Task 9 verranno vincolate a `canale IS NULL`, cioè SOLO diretto). Qui serve la logica di derivazione prezzo (percentuale su tipo base, clamp min/max) ma con l'override letto secondo la precedenza `beds24` > `NULL` > calcolato. Duplichiamo la sola parte di lettura override (poche righe), non la logica di derivazione stagionale/percentuale, che resta in `calcolaPrezzoDirettoPerNotte` (riusata as-is, quella non tocca mai `planning_tariffe_giorni`).

- [ ] **Step 1: Scrivere il test che fallisce, per `calcolaOverrideBeds24`**

```js
// tests/lib/beds24PrezziDisponibilita.test.js
const { calcolaOverrideBeds24 } = require('../../backend/lib/beds24PrezziDisponibilita');

describe('calcolaOverrideBeds24', () => {
  test('stop_sell vince su tutto', () => {
    expect(calcolaOverrideBeds24({ chiuso_arrivo: true, chiuso_partenza: true, stop_sell: true })).toBe('blackout');
    expect(calcolaOverrideBeds24({ chiuso_arrivo: false, chiuso_partenza: false, stop_sell: true })).toBe('blackout');
  });
  test('chiuso_arrivo e chiuso_partenza insieme (senza stop_sell)', () => {
    expect(calcolaOverrideBeds24({ chiuso_arrivo: true, chiuso_partenza: true, stop_sell: false })).toBe('noCheckInOrCheckOut');
  });
  test('solo chiuso_arrivo', () => {
    expect(calcolaOverrideBeds24({ chiuso_arrivo: true, chiuso_partenza: false, stop_sell: false })).toBe('noCheckIn');
  });
  test('solo chiuso_partenza', () => {
    expect(calcolaOverrideBeds24({ chiuso_arrivo: false, chiuso_partenza: true, stop_sell: false })).toBe('noCheckOut');
  });
  test('nessuna restrizione', () => {
    expect(calcolaOverrideBeds24({ chiuso_arrivo: false, chiuso_partenza: false, stop_sell: false })).toBe('none');
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `npx jest tests/lib/beds24PrezziDisponibilita.test.js --runInBand`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementare `calcolaOverrideBeds24` e creare il file**

```js
// backend/lib/beds24PrezziDisponibilita.js
// Calcolo puro di disponibilità/prezzo/restrizioni per il push verso
// Beds24 — Modulo 2.3, Fase 2/3. Vedi
// docs/superpowers/specs/2026-09-03-invio-tariffe-beds24-design.md,
// sezioni "Calcolo disponibilità", "Calcolo prezzo", "Calcolo restrizioni".

const pool = require('../config/db');
const { calcolaPrezzoDirettoPerNotte, calcolaSupplementoTrattamento } = require('../controllers/tariffeController');

function isoData(valore) {
  return valore instanceof Date ? valore.toISOString().slice(0, 10) : String(valore);
}

// Precedenza confermata da Marco il 04/09/2026: stop_sell (blackout) vince
// su tutto; poi entrambi chiuso_arrivo+chiuso_partenza; poi il singolo;
// altrimenti none. Beds24 non ha campi booleani indipendenti come i nostri
// — un solo enum per camera/giorno, vedi sezione "Calcolo restrizioni"
// della spec per la perdita di espressività accettata.
function calcolaOverrideBeds24({ chiuso_arrivo, chiuso_partenza, stop_sell }) {
  if (stop_sell) return 'blackout';
  if (chiuso_arrivo && chiuso_partenza) return 'noCheckInOrCheckOut';
  if (chiuso_arrivo) return 'noCheckIn';
  if (chiuso_partenza) return 'noCheckOut';
  return 'none';
}

module.exports = { calcolaOverrideBeds24 };
```

- [ ] **Step 4: Eseguire e verificare che passi**

Run: `npx jest tests/lib/beds24PrezziDisponibilita.test.js --runInBand`
Expected: PASS (5 test).

- [ ] **Step 5: Commit intermedio**

```bash
git add backend/lib/beds24PrezziDisponibilita.js tests/lib/beds24PrezziDisponibilita.test.js
git commit -m "feat(beds24): calcolaOverrideBeds24 — mappatura restrizioni su enum Beds24"
```

- [ ] **Step 6: Scrivere il test che fallisce, per `calcolaDisponibilitaBeds24Range`**

```js
// tests/lib/beds24PrezziDisponibilita.test.js — aggiungere in fondo
const pool = require('../../backend/config/db');
const { calcolaDisponibilitaBeds24Range } = require('../../backend/lib/beds24PrezziDisponibilita');

describe('calcolaDisponibilitaBeds24Range', () => {
  let tipoCameraId, camera1Id, camera2Id;

  beforeAll(async () => {
    const tc = await pool.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Doppia Test Disp Beds24', 2) RETURNING id`);
    tipoCameraId = tc.rows[0].id;
    const c1 = await pool.query(`INSERT INTO camere (numero, nome, attivo) VALUES ('D1', 'Cam Disp 1', true) RETURNING id`);
    const c2 = await pool.query(`INSERT INTO camere (numero, nome, attivo) VALUES ('D2', 'Cam Disp 2', true) RETURNING id`);
    camera1Id = c1.rows[0].id; camera2Id = c2.rows[0].id;
    await pool.query(`INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1,$2),($1,$3)`, [tipoCameraId, camera1Id, camera2Id]);
    await pool.query(
      `INSERT INTO tipi_camera_canali (tipo_camera_id, canale, codice_esterno, unita_esposte) VALUES ($1, 'beds24', '777001', 1)`,
      [tipoCameraId]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM tipi_camera_canali WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera_camere WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM camere WHERE id IN ($1,$2)`, [camera1Id, camera2Id]);
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tipoCameraId]);
  });

  test('numAvail non supera unita_esposte anche se ci sono più camere fisiche libere', async () => {
    const righe = await calcolaDisponibilitaBeds24Range(tipoCameraId, '2099-03-01', '2099-03-03');
    expect(righe).toEqual([
      { giorno: '2099-03-01', numAvail: 1 },
      { giorno: '2099-03-02', numAvail: 1 },
    ]);
  });
});
```

- [ ] **Step 7: Eseguire e verificare che fallisca**

Run: `npx jest tests/lib/beds24PrezziDisponibilita.test.js -t calcolaDisponibilitaBeds24Range --runInBand`
Expected: FAIL — funzione inesistente.

- [ ] **Step 8: Implementare `calcolaDisponibilitaBeds24Range`**

```js
// backend/lib/beds24PrezziDisponibilita.js — aggiungere dopo calcolaOverrideBeds24

// Disponibilità per Beds24, giorno per giorno: conta le camere fisiche
// attive del tipo non occupate da un soggiorno non cancellato (stessa
// condizione di trovaCameraLibera in beds24SyncController.js, ma COUNT
// invece di selezionare una riga con FOR UPDATE SKIP LOCKED — qui non
// stiamo assegnando una camera, solo contando), poi cappata a
// unita_esposte se configurata. Mai il numero esposto supera la
// disponibilità fisica reale, anche con un tetto più alto configurato.
async function calcolaDisponibilitaBeds24Range(tipoCameraId, dataDa, dataFineEsclusiva) {
  const [liberoResult, canaleResult] = await Promise.all([
    pool.query(
      `SELECT n.notte::date AS notte,
              COUNT(c.id) FILTER (
                WHERE NOT EXISTS (
                  SELECT 1 FROM soggiorni s
                  WHERE s.camera_id = c.id AND s.cancellato = false
                    AND daterange(s.data_arrivo, s.data_partenza, '[)') @> n.notte::date
                )
              ) AS libere
       FROM generate_series($2::date, $3::date - INTERVAL '1 day', INTERVAL '1 day') AS n(notte)
       CROSS JOIN camere c
       JOIN tipi_camera_camere tcc ON tcc.camera_id = c.id AND tcc.tipo_camera_id = $1
       WHERE c.attivo = true
       GROUP BY n.notte
       ORDER BY n.notte`,
      [tipoCameraId, dataDa, dataFineEsclusiva]
    ),
    pool.query(
      `SELECT unita_esposte FROM tipi_camera_canali WHERE tipo_camera_id = $1 AND canale = 'beds24'`,
      [tipoCameraId]
    ),
  ]);

  const unitaEsposte = canaleResult.rows[0]?.unita_esposte;
  return liberoResult.rows.map(r => ({
    giorno: isoData(r.notte),
    numAvail: unitaEsposte != null ? Math.min(Number(r.libere), unitaEsposte) : Number(r.libere),
  }));
}

module.exports = { calcolaOverrideBeds24, calcolaDisponibilitaBeds24Range };
```

- [ ] **Step 9: Eseguire e verificare che passi**

Run: `npx jest tests/lib/beds24PrezziDisponibilita.test.js -t calcolaDisponibilitaBeds24Range --runInBand`
Expected: PASS.

- [ ] **Step 10: Commit intermedio**

```bash
git add backend/lib/beds24PrezziDisponibilita.js tests/lib/beds24PrezziDisponibilita.test.js
git commit -m "feat(beds24): calcolaDisponibilitaBeds24Range — disponibilità cappata a unita_esposte"
```

- [ ] **Step 11: Scrivere il test che fallisce, per `calcolaPrezziRestrizioniBeds24Range`**

```js
// tests/lib/beds24PrezziDisponibilita.test.js — aggiungere in fondo
const { calcolaPrezziRestrizioniBeds24Range } = require('../../backend/lib/beds24PrezziDisponibilita');

describe('calcolaPrezziRestrizioniBeds24Range', () => {
  let tipoCameraId;

  beforeAll(async () => {
    const tc = await pool.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Doppia Test Prezzo Beds24', 2) RETURNING id`);
    tipoCameraId = tc.rows[0].id;
    await pool.query(
      `INSERT INTO tipi_camera_canali (tipo_camera_id, canale, codice_esterno, maggiorazione_percentuale) VALUES ($1, 'beds24', '777002', 10)`,
      [tipoCameraId]
    );
    await pool.query(
      `INSERT INTO tariffe (tipo_camera_id, data_inizio, data_fine, prezzo_notte) VALUES ($1, '2099-04-01', '2099-04-30', 100)`,
      [tipoCameraId]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM planning_tariffe_giorni WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tariffe WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera_canali WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tipoCameraId]);
  });

  test('price1 (bb) è il prezzo diretto maggiorato, senza override', async () => {
    const righe = await calcolaPrezziRestrizioniBeds24Range(tipoCameraId, '2099-04-05', '2099-04-06');
    expect(righe).toHaveLength(1);
    expect(righe[0].giorno).toBe('2099-04-05');
    expect(righe[0].price1).toBe(110); // 100 * 1.10
    expect(righe[0].override).toBe('none');
  });

  test('un override canale=beds24 su prezzo/restrizioni ha precedenza sul prezzo calcolato e sulla riga canale NULL', async () => {
    await pool.query(
      `INSERT INTO planning_tariffe_giorni (tipo_camera_id, trattamento, data, prezzo_notte, chiuso_arrivo)
       VALUES ($1, 'bb', '2099-04-05', 200, true)` // riga NULL (tutti i canali): 200, chiuso_arrivo
      , [tipoCameraId]
    );
    await pool.query(
      `INSERT INTO planning_tariffe_giorni (tipo_camera_id, trattamento, data, canale, prezzo_notte, stop_sell)
       VALUES ($1, 'bb', '2099-04-05', 'beds24', 150, true)` // eccezione beds24: 150, stop_sell — deve vincere su entrambi
      , [tipoCameraId]
    );
    const righe = await calcolaPrezziRestrizioniBeds24Range(tipoCameraId, '2099-04-05', '2099-04-06');
    // Prezzo di planning è già "finale" (impostato a mano nel planning
    // canale beds24): NON viene ri-maggiorato — la maggiorazione si
    // applica solo al prezzo calcolato/derivato dal diretto, mai a un
    // prezzo già esplicitamente impostato per quel canale.
    expect(righe[0].price1).toBe(150);
    expect(righe[0].override).toBe('blackout'); // stop_sell vince, non noCheckIn
  });
});
```

- [ ] **Step 12: Eseguire e verificare che fallisca**

Run: `npx jest tests/lib/beds24PrezziDisponibilita.test.js -t calcolaPrezziRestrizioniBeds24Range --runInBand`
Expected: FAIL — funzione inesistente.

- [ ] **Step 13: Implementare `calcolaPrezziRestrizioniBeds24Range`**

```js
// backend/lib/beds24PrezziDisponibilita.js — aggiungere dopo calcolaDisponibilitaBeds24Range

function aggiungiGiornoIso(dataIso) {
  const d = new Date(dataIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Prezzo + restrizioni per Beds24, giorno per giorno. Precedenza (vedi
// spec, sezioni "Calcolo prezzo"/"Calcolo restrizioni"): riga
// canale='beds24' > riga canale IS NULL > calcolato al volo. Un prezzo
// letto da planning_tariffe_giorni (qualunque canale) è già un valore
// FINALE impostato a mano — non viene mai ri-maggiorato: la
// maggiorazione_percentuale si applica solo al prezzo calcolato/derivato
// dal motore diretto (calcolaPrezzoDirettoPerNotte), per lo stesso motivo
// per cui griglia() (planningTariffeController.js) non ricalcola un
// prezzo già sovrascritto a mano.
// Mappatura price1/price2 decisa in spec: price1 = bb, price2 =
// mezza_pensione. Supplemento mezza pensione con la stessa convenzione
// "occupazione standard" già in uso per il prezzo consigliato del
// planning (2 adulti, 0 bambini — vedi commento in cima a
// planningTariffeController.js).
async function calcolaPrezziRestrizioniBeds24Range(tipoCameraId, dataDa, dataFineEsclusiva) {
  const [diretti, maggiorazioneResult, overrideResult] = await Promise.all([
    calcolaPrezzoDirettoPerNotte(tipoCameraId, dataDa, dataFineEsclusiva),
    pool.query(`SELECT maggiorazione_percentuale FROM tipi_camera_canali WHERE tipo_camera_id = $1 AND canale = 'beds24'`, [tipoCameraId]),
    pool.query(
      `SELECT trattamento, data, canale, prezzo_notte, min_stay, chiuso_arrivo, chiuso_partenza, stop_sell
       FROM planning_tariffe_giorni
       WHERE tipo_camera_id = $1 AND data >= $2 AND data < $3
         AND trattamento IN ('bb', 'mezza_pensione') AND (canale IS NULL OR canale = 'beds24')`,
      [tipoCameraId, dataDa, dataFineEsclusiva]
    ),
  ]);

  const maggiorazione = Number(maggiorazioneResult.rows[0]?.maggiorazione_percentuale || 0);

  // Merge con precedenza: prima le righe NULL, poi sovrascritte dalle
  // righe 'beds24' per la stessa chiave trattamento|giorno.
  const overridePerChiave = new Map();
  for (const r of overrideResult.rows.filter(r => r.canale === null)) {
    overridePerChiave.set(`${r.trattamento}|${isoData(r.data)}`, r);
  }
  for (const r of overrideResult.rows.filter(r => r.canale === 'beds24')) {
    overridePerChiave.set(`${r.trattamento}|${isoData(r.data)}`, r);
  }

  const prezzoDirettoPerGiorno = new Map(diretti.map(n => [isoData(n.notte), n.prezzo_notte]));

  const righe = [];
  for (const giorno of prezzoDirettoPerGiorno.keys()) {
    const overrideBb = overridePerChiave.get(`bb|${giorno}`);
    const overrideMp = overridePerChiave.get(`mezza_pensione|${giorno}`);

    let price1 = overrideBb?.prezzo_notte != null
      ? Number(overrideBb.prezzo_notte)
      : prezzoDirettoPerGiorno.get(giorno);
    if (price1 != null && overrideBb?.prezzo_notte == null) {
      price1 = Math.round(price1 * (1 + maggiorazione / 100) * 100) / 100;
    }

    let price2 = null;
    if (overrideMp?.prezzo_notte != null) {
      price2 = Number(overrideMp.prezzo_notte);
    } else if (price1 != null) {
      const supplemento = await calcolaSupplementoTrattamento(tipoCameraId, giorno, aggiungiGiornoIso(giorno), 'mezza_pensione', 2, []);
      if (supplemento.notti_scoperte.length === 0) {
        const base = overrideBb?.prezzo_notte != null ? Number(overrideBb.prezzo_notte) : prezzoDirettoPerGiorno.get(giorno);
        const mpNonMaggiorato = base + supplemento.totale;
        price2 = Math.round(mpNonMaggiorato * (1 + maggiorazione / 100) * 100) / 100;
      }
    }

    // Le restrizioni (min_stay/override) si leggono dalla riga bb — stessa
    // convenzione già in uso in valutaRestrizioniTrattamento
    // (planningTariffeController.js): non esiste un concetto di
    // restrizione unica per camera indipendente dal trattamento nello
    // schema, bb è il trattamento sempre presente.
    righe.push({
      giorno,
      minStay: overrideBb?.min_stay ?? null,
      override: calcolaOverrideBeds24({
        chiuso_arrivo: !!overrideBb?.chiuso_arrivo,
        chiuso_partenza: !!overrideBb?.chiuso_partenza,
        stop_sell: !!overrideBb?.stop_sell,
      }),
      price1,
      price2,
    });
  }
  return righe;
}

module.exports = { calcolaOverrideBeds24, calcolaDisponibilitaBeds24Range, calcolaPrezziRestrizioniBeds24Range };
```

- [ ] **Step 14: Eseguire e verificare che passi**

Run: `npx jest tests/lib/beds24PrezziDisponibilita.test.js --runInBand`
Expected: PASS (tutti i test del file).

- [ ] **Step 15: Commit**

```bash
git add backend/lib/beds24PrezziDisponibilita.js tests/lib/beds24PrezziDisponibilita.test.js
git commit -m "feat(beds24): calcolaPrezziRestrizioniBeds24Range — prezzo+restrizioni con precedenza canale beds24 su NULL"
```

---

### Task 5: Log invii — `beds24InvioLog.js`

**Files:**
- Create: `backend/lib/beds24InvioLog.js`
- Test: `tests/lib/beds24InvioLog.test.js`

**Interfaces:**
- Consuma: `pool` da `config/db`.
- Produce: `async scriviInvioLog({tipo, tipoCameraId, esito, dettaglio}) -> void` — non lancia mai (stesso principio prudente di `scriviWebhookLog`).

- [ ] **Step 1: Scrivere il test che fallisce**

```js
// tests/lib/beds24InvioLog.test.js
const pool = require('../../backend/config/db');
const { scriviInvioLog } = require('../../backend/lib/beds24InvioLog');

describe('scriviInvioLog', () => {
  afterEach(async () => {
    await pool.query(`DELETE FROM beds24_invio_log WHERE tipo_camera_id = -1`);
  });

  test('scrive una riga con tipo, esito e dettaglio strutturato', async () => {
    await scriviInvioLog({
      tipo: 'tariffe',
      tipoCameraId: -1,
      esito: 'errore',
      dettaglio: { errors: [{ action: 'update', field: 'price1', message: 'Invalid value' }] },
    });
    const righe = await pool.query(`SELECT * FROM beds24_invio_log WHERE tipo_camera_id = -1`);
    expect(righe.rows).toHaveLength(1);
    expect(righe.rows[0].esito).toBe('errore');
    expect(righe.rows[0].dettaglio.errors[0].field).toBe('price1');
  });

  test('non lancia se la scrittura sul DB fallisce (es. tipo non valido)', async () => {
    await expect(scriviInvioLog({ tipo: 'non_valido', tipoCameraId: -1, esito: 'errore', dettaglio: {} }))
      .resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `npx jest tests/lib/beds24InvioLog.test.js --runInBand`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementare**

```js
// backend/lib/beds24InvioLog.js
// Log degli invii verso Beds24 (disponibilità/tariffe) — Modulo 2.3, Fase
// 2/3. Stesso principio prudente di scriviWebhookLog (routes/beds24.js):
// non deve mai interrompere il flusso che lo chiama, un log fallito non è
// un motivo per far fallire un push o un intero batch.
const pool = require('../config/db');

async function scriviInvioLog({ tipo, tipoCameraId, esito, dettaglio }) {
  try {
    await pool.query(
      `INSERT INTO beds24_invio_log (tipo, tipo_camera_id, esito, dettaglio) VALUES ($1, $2, $3, $4)`,
      [tipo, tipoCameraId, esito, dettaglio ? JSON.stringify(dettaglio) : null]
    );
  } catch (err) {
    console.error('scrittura beds24_invio_log — errore imprevisto:', err.message);
  }
}

module.exports = { scriviInvioLog };
```

- [ ] **Step 4: Eseguire e verificare che passi**

Run: `npx jest tests/lib/beds24InvioLog.test.js --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/lib/beds24InvioLog.js tests/lib/beds24InvioLog.test.js
git commit -m "feat(beds24): scriviInvioLog — log strutturato per gli invii verso Beds24"
```

---

### Task 6: Estendere `canaliOtaController.js` con `unita_esposte`/`maggiorazione_percentuale`

**Files:**
- Modify: `backend/controllers/canaliOtaController.js`
- Test: `tests/api/canaliOta.test.js` (creare se non esiste — verificare prima con `find tests -iname "*canaliOta*"`; se esiste già un file di test per questo controller, aggiungere lì invece di crearne uno nuovo)

**Interfaces:**
- Produce: `PUT /api/canali-ota/:tipoCameraId` accetta ora anche `unita_esposte` (intero o null) e `maggiorazione_percentuale` (numero, default lato DB 0). `GET /api/canali-ota` li restituisce per riga.

- [ ] **Step 1: Scrivere il test che fallisce**

```js
// tests/api/canaliOta.test.js (nuovo file, o aggiungere alla describe esistente se il file c'è già)
const request = require('supertest');
const app = require('../../backend/app');
const pool = require('../../backend/config/db');
const { generaTokenTest } = require('./helpers/auth'); // stesso helper già in uso negli altri test API — verificare il path esatto con `grep -rl generaTokenTest tests/api` prima di scrivere l'import

describe('PUT /api/canali-ota/:tipoCameraId — unita_esposte e maggiorazione_percentuale', () => {
  let tipoCameraId, token;

  beforeAll(async () => {
    const tc = await pool.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Test CanaliOta Beds24', 2) RETURNING id`);
    tipoCameraId = tc.rows[0].id;
    token = await generaTokenTest({ ruolo: 'admin' });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM tipi_camera_canali WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tipoCameraId]);
  });

  test('salva unita_esposte e maggiorazione_percentuale insieme al codice esterno', async () => {
    const risposta = await request(app)
      .put(`/api/canali-ota/${tipoCameraId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ canale: 'beds24', codice_esterno: '777003', unita_esposte: 3, maggiorazione_percentuale: 12.5 });

    expect(risposta.status).toBe(200);
    expect(risposta.body.unita_esposte).toBe(3);
    expect(Number(risposta.body.maggiorazione_percentuale)).toBe(12.5);
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `npx jest tests/api/canaliOta.test.js --runInBand`
Expected: FAIL — `unita_esposte`/`maggiorazione_percentuale` assenti dalla risposta (undefined).

- [ ] **Step 3: Estendere `upsert` e `lista`**

```js
// backend/controllers/canaliOtaController.js — sostituire la funzione upsert esistente

async function upsert(req, res) {
  const canale = (req.body.canale || CANALE_DEFAULT).trim();
  const codiceEsterno = req.body.codice_esterno && String(req.body.codice_esterno).trim()
    ? String(req.body.codice_esterno).trim()
    : null;
  const unitaEsposte = req.body.unita_esposte === undefined || req.body.unita_esposte === null || req.body.unita_esposte === ''
    ? null
    : Number(req.body.unita_esposte);
  const maggiorazionePercentuale = req.body.maggiorazione_percentuale === undefined || req.body.maggiorazione_percentuale === null
    ? 0
    : Number(req.body.maggiorazione_percentuale);

  if (unitaEsposte !== null && (Number.isNaN(unitaEsposte) || unitaEsposte < 0)) {
    return res.status(400).json({ error: 'unita_esposte deve essere un intero non negativo o vuoto.' });
  }
  if (Number.isNaN(maggiorazionePercentuale) || maggiorazionePercentuale < 0) {
    return res.status(400).json({ error: 'maggiorazione_percentuale deve essere un numero non negativo.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tipi_camera_canali (tipo_camera_id, canale, codice_esterno, unita_esposte, maggiorazione_percentuale, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (tipo_camera_id, canale) DO UPDATE SET
         codice_esterno = EXCLUDED.codice_esterno,
         unita_esposte = EXCLUDED.unita_esposte,
         maggiorazione_percentuale = EXCLUDED.maggiorazione_percentuale,
         updated_at     = now()
       RETURNING *`,
      [req.params.tipoCameraId, canale, codiceEsterno, unitaEsposte, maggiorazionePercentuale]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Categoria camera non trovata.' });
    }
    console.error('upsert canali_ota error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}
```

E in `lista`, aggiungere le due colonne alla `SELECT`:
```js
      `SELECT tc.id AS tipo_camera_id, tc.nome AS tipo_camera_nome,
              $1::VARCHAR AS canale, tcc.codice_esterno, tcc.unita_esposte, tcc.maggiorazione_percentuale, tcc.updated_at
       FROM tipi_camera tc
       LEFT JOIN tipi_camera_canali tcc ON tcc.tipo_camera_id = tc.id AND tcc.canale = $1
       ORDER BY tc.nome`,
```

- [ ] **Step 4: Eseguire e verificare che passi**

Run: `npx jest tests/api/canaliOta.test.js --runInBand`
Expected: PASS.

- [ ] **Step 5: Eseguire l'intera suite per verificare che non si sia rotto nulla**

Run: `npm test`
Expected: tutti i test verdi (incluso `tests/api/canaliOta.test.js` preesistente, se c'era già, con lo stesso comportamento di prima per i campi non toccati).

- [ ] **Step 6: Commit**

```bash
git add backend/controllers/canaliOtaController.js tests/api/canaliOta.test.js
git commit -m "feat(beds24): unita_esposte e maggiorazione_percentuale su canali-ota"
```

---

### Task 7: Endpoint configurazione orizzonte invio tariffe

**Files:**
- Modify: `backend/routes/beds24.js`
- Test: `tests/api/beds24Webhook.test.js` (aggiungere una nuova `describe` — il file copre già le rotte di `routes/beds24.js`, coerente tenerle insieme piuttosto che in un file a parte)

**Interfaces:**
- Produce: `GET /api/beds24/config` (restituisce `orizzonte_invio_tariffe_fino_a` e `ultima_sincronizzazione_at`), `PUT /api/beds24/config` (body `{orizzonte_invio_tariffe_fino_a: 'YYYY-MM-DD'}`). Stessa autorizzazione di `beds24` in `shared/ruoli.js` (`richiedeAzione('beds24', 'scrittura')` per la PUT, `'lettura'` per la GET).

- [ ] **Step 1: Scrivere il test che fallisce**

```js
// tests/api/beds24Webhook.test.js — aggiungere in fondo al file
describe('GET/PUT /api/beds24/config', () => {
  let token;
  beforeAll(async () => {
    token = await generaTokenTest({ ruolo: 'admin' }); // stesso helper già usato nel resto del file — verificare il nome esatto dell'import in cima al file esistente prima di scrivere questo blocco
    await pool.query(`INSERT INTO beds24_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  });
  afterAll(async () => {
    await pool.query(`UPDATE beds24_config SET orizzonte_invio_tariffe_fino_a = NULL WHERE id = 1`);
  });

  test('PUT salva la data, GET la restituisce', async () => {
    const risPut = await request(app)
      .put('/api/beds24/config')
      .set('Authorization', `Bearer ${token}`)
      .send({ orizzonte_invio_tariffe_fino_a: '2027-01-06' });
    expect(risPut.status).toBe(200);

    const risGet = await request(app).get('/api/beds24/config').set('Authorization', `Bearer ${token}`);
    expect(risGet.status).toBe(200);
    expect(risGet.body.orizzonte_invio_tariffe_fino_a).toBe('2027-01-06');
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `npx jest tests/api/beds24Webhook.test.js -t "GET/PUT /api/beds24/config" --runInBand`
Expected: FAIL — 404, rotta inesistente.

- [ ] **Step 3: Implementare le rotte**

```js
// backend/routes/beds24.js — aggiungere prima di module.exports = router;

// GET /api/beds24/config — stato configurazione invio (orizzonte tariffe,
// ultima sincronizzazione). Accessibile a: admin, titolare, receptionist
// (consultazione, stesso criterio di beds24/lettura già in uso per la
// coda di revisione).
router.get('/config', verificaToken, richiedeAzione('beds24', 'lettura'), async (req, res) => {
  try {
    const risultato = await pool.query(
      `SELECT orizzonte_invio_tariffe_fino_a, ultima_sincronizzazione_at FROM beds24_config WHERE id = 1`
    );
    const riga = risultato.rows[0] || {};
    res.json({
      orizzonte_invio_tariffe_fino_a: riga.orizzonte_invio_tariffe_fino_a
        ? new Date(riga.orizzonte_invio_tariffe_fino_a).toISOString().slice(0, 10)
        : null,
      ultima_sincronizzazione_at: riga.ultima_sincronizzazione_at || null,
    });
  } catch (err) {
    console.error('GET /api/beds24/config error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// PUT /api/beds24/config — imposta l'orizzonte di invio tariffe (data di
// fine stagione, aggiornata a mano da Marco — nessun avanzamento
// automatico in questa fase, vedi spec). Accessibile a: admin, titolare.
router.put('/config', verificaToken, richiedeAzione('beds24', 'scrittura'), async (req, res) => {
  const { orizzonte_invio_tariffe_fino_a } = req.body;
  if (!orizzonte_invio_tariffe_fino_a) {
    return res.status(400).json({ error: 'orizzonte_invio_tariffe_fino_a obbligatorio.' });
  }
  try {
    await pool.query(
      `INSERT INTO beds24_config (id, orizzonte_invio_tariffe_fino_a, updated_at)
       VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET orizzonte_invio_tariffe_fino_a = EXCLUDED.orizzonte_invio_tariffe_fino_a, updated_at = now()`,
      [orizzonte_invio_tariffe_fino_a]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/beds24/config error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});
```

Nota: `richiedeAzione('beds24', 'scrittura')` in `shared/ruoli.js` include oggi anche `R` (receptionist) — verificare con Marco se va bene che la receptionist possa cambiare l'orizzonte stagionale, o se questa specifica azione va ristretta a `[A, T]` con una nuova azione dedicata (es. `configurazione`, stesso pattern già usato per `tassa_soggiorno`). Se la risposta è "va ristretta", aggiungere in `shared/ruoli.js` una chiave `configurazione: [A, T]` sotto `beds24` e usarla qui al posto di `'scrittura'` — non è nello scope decidere da soli, è una domanda di autorizzazione da porre a Marco prima del merge di questo task.

- [ ] **Step 4: Eseguire e verificare che passi**

Run: `npx jest tests/api/beds24Webhook.test.js -t "GET/PUT /api/beds24/config" --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/beds24.js tests/api/beds24Webhook.test.js
git commit -m "feat(beds24): endpoint GET/PUT config per orizzonte invio tariffe"
```

---

### Task 8: Push disponibilità immediato

**Files:**
- Modify: `backend/controllers/beds24SyncController.js`
- Modify: `backend/controllers/bookingPubblicoController.js` (punto/i esatto/i di creazione/cancellazione/modifica soggiorno diretto — localizzare con `grep -n "INSERT INTO soggiorni\|cancellato = true" backend/controllers/bookingPubblicoController.js` prima di scrivere questo task in dettaglio, il grep fatto in fase di piano ha trovato la creazione ma non ha enumerato ogni punto di cancellazione/modifica: verificarli tutti)
- Create: `backend/lib/beds24PushDisponibilita.js` (funzione condivisa, per non duplicare la logica di "prendi tipo_camera_id + range date, calcola, invia, logga" nei due controller chiamanti)
- Test: `tests/lib/beds24PushDisponibilita.test.js`

**Interfaces:**
- Consuma: `calcolaDisponibilitaBeds24Range` (Task 4), `pushCalendario` (Task 3), `scriviInvioLog` (Task 5).
- Produce: `async pushDisponibilitaImmediata(tipoCameraId, dataArrivo, dataPartenza) -> void` — non lancia mai (best-effort, stesso principio del webhook: la scrittura sul nostro DB ha sempre priorità).

- [ ] **Step 1: Scrivere il test che fallisce**

```js
// tests/lib/beds24PushDisponibilita.test.js
const pool = require('../../backend/config/db');
const beds24Client = require('../../backend/lib/beds24Client');
const { pushDisponibilitaImmediata } = require('../../backend/lib/beds24PushDisponibilita');

describe('pushDisponibilitaImmediata', () => {
  let tipoCameraId;

  beforeAll(async () => {
    const tc = await pool.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Test Push Disp', 2) RETURNING id`);
    tipoCameraId = tc.rows[0].id;
    await pool.query(
      `INSERT INTO tipi_camera_canali (tipo_camera_id, canale, codice_esterno) VALUES ($1, 'beds24', '777004')`,
      [tipoCameraId]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM tipi_camera_canali WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tipoCameraId]);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await pool.query(`DELETE FROM beds24_invio_log WHERE tipo_camera_id = $1`, [tipoCameraId]);
  });

  test('chiama pushCalendario col roomId mappato e logga successo', async () => {
    const pushSpy = jest.spyOn(beds24Client, 'pushCalendario').mockResolvedValue({ ok: true, risposta: [{ success: true }], creditiRimanenti: 400 });

    await pushDisponibilitaImmediata(tipoCameraId, '2099-05-01', '2099-05-03');

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy.mock.calls[0][0][0].roomId).toBe(777004);
    const log = await pool.query(`SELECT * FROM beds24_invio_log WHERE tipo_camera_id = $1`, [tipoCameraId]);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0].esito).toBe('successo');
  });

  test('non lancia e logga errore se pushCalendario fallisce', async () => {
    jest.spyOn(beds24Client, 'pushCalendario').mockRejectedValue(new Error('rete down'));

    await expect(pushDisponibilitaImmediata(tipoCameraId, '2099-05-01', '2099-05-03')).resolves.not.toThrow();

    const log = await pool.query(`SELECT * FROM beds24_invio_log WHERE tipo_camera_id = $1`, [tipoCameraId]);
    expect(log.rows[0].esito).toBe('errore');
  });

  test('non chiama Beds24 se il tipo camera non ha una mappatura beds24 (nessun codice_esterno)', async () => {
    const tc2 = await pool.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Test Push Disp Non Mappata', 2) RETURNING id`);
    const pushSpy = jest.spyOn(beds24Client, 'pushCalendario');

    await pushDisponibilitaImmediata(tc2.rows[0].id, '2099-05-01', '2099-05-03');

    expect(pushSpy).not.toHaveBeenCalled();
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tc2.rows[0].id]);
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `npx jest tests/lib/beds24PushDisponibilita.test.js --runInBand`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementare `beds24PushDisponibilita.js`**

```js
// backend/lib/beds24PushDisponibilita.js
// Push disponibilità immediato — Modulo 2.3, Fase 2/3. Chiamato dopo
// COMMIT da beds24SyncController.processaBooking e da
// bookingPubblicoController.js (creazione/modifica/cancellazione diretta),
// qualunque canale abbia generato la modifica: la disponibilità fisica
// del tipo_camera_id è cambiata, e va rispecchiata su Beds24 a
// prescindere da dove sia partita la modifica.
// Best-effort: non deve mai interrompere il flusso che lo chiama, stesso
// principio del webhook (la scrittura sul nostro DB ha sempre priorità).
const pool = require('../config/db');
const beds24Client = require('./beds24Client');
const { calcolaDisponibilitaBeds24Range } = require('./beds24PrezziDisponibilita');
const { scriviInvioLog } = require('./beds24InvioLog');

async function pushDisponibilitaImmediata(tipoCameraId, dataArrivo, dataPartenza) {
  try {
    const mappatura = await pool.query(
      `SELECT codice_esterno FROM tipi_camera_canali WHERE tipo_camera_id = $1 AND canale = 'beds24' AND codice_esterno IS NOT NULL`,
      [tipoCameraId]
    );
    if (!mappatura.rows.length) {
      return; // nessuna mappatura Beds24 per questa tipologia — nulla da inviare
    }
    const roomId = Number(mappatura.rows[0].codice_esterno);

    const righe = await calcolaDisponibilitaBeds24Range(tipoCameraId, dataArrivo, dataPartenza);
    if (!righe.length) return;

    const calendar = righe.map((r, idx) => ({
      from: r.giorno,
      to: idx < righe.length - 1 ? righe[idx + 1].giorno : r.giorno,
      numAvail: r.numAvail,
    }));

    const risultato = await beds24Client.pushCalendario([{ roomId, calendar }]);
    await scriviInvioLog({ tipo: 'disponibilita', tipoCameraId, esito: 'successo', dettaglio: risultato.risposta });
  } catch (err) {
    await scriviInvioLog({ tipo: 'disponibilita', tipoCameraId, esito: 'errore', dettaglio: { messaggio: err.message } });
  }
}

module.exports = { pushDisponibilitaImmediata };
```

- [ ] **Step 4: Eseguire e verificare che passi**

Run: `npx jest tests/lib/beds24PushDisponibilita.test.js --runInBand`
Expected: PASS (3 test).

- [ ] **Step 5: Agganciare la chiamata in `beds24SyncController.processaBooking`**

Modificare `processaBooking` in modo che, dopo ogni `COMMIT` che cambia lo stato di un soggiorno (creazione, aggiornamento date, cancellazione), chiami `pushDisponibilitaImmediata(tipoCameraId, ...)` — SEMPRE dopo il commit, mai dentro la transazione (coerente col principio "scrivi prima, invia poi"). Per una cancellazione o un aggiornamento, il range da ripubblicare deve coprire SIA le vecchie date SIA le nuove (se cambiate) — leggere `data_arrivo`/`data_partenza` prima dell'update per calcolare l'unione dei due intervalli. Aggiungere l'import in cima al file:
```js
const { pushDisponibilitaImmediata } = require('../lib/beds24PushDisponibilita');
```
e richiamarla subito dopo ciascuno dei tre `return` che seguono un `COMMIT` riuscito (creazione, aggiornamento, cancellazione) — non nel ramo `in_coda`/`ignorata_*` (nessuna camera è stata effettivamente occupata o liberata in quei casi).

- [ ] **Step 6: Aggiornare i test esistenti di `beds24Sync.test.js` per non rompersi con la nuova chiamata**

I test esistenti non mockano `pushDisponibilitaImmediata` — verificare eseguendo la suite se falliscono per una vera chiamata di rete tentata durante i test. Se falliscono, aggiungere in cima a `tests/api/beds24Sync.test.js`:
```js
jest.mock('../../backend/lib/beds24PushDisponibilita', () => ({ pushDisponibilitaImmediata: jest.fn() }));
```
(coerente con come gli altri test isolano le dipendenze esterne — verificare che non esista già un pattern di mock diverso in uso nel resto del file prima di aggiungerlo).

Run: `npx jest tests/api/beds24Sync.test.js --runInBand`
Expected: PASS, nessuna chiamata di rete reale durante il test.

- [ ] **Step 7: Localizzare e agganciare i punti di creazione/modifica/cancellazione in `bookingPubblicoController.js`**

Run: `grep -n "INSERT INTO soggiorni\|cancellato = true\|data_arrivo = \$\|data_partenza = \$" backend/controllers/bookingPubblicoController.js`

Per ciascun punto trovato, aggiungere la stessa chiamata `pushDisponibilitaImmediata(tipoCameraId, dataArrivo, dataPartenza)` dopo il relativo commit, con lo stesso principio del Task 5 (unione vecchio+nuovo range per una modifica). Scrivere qui l'elenco esatto dei punti trovati prima di modificarli — se sono più di 2-3 punti distinti, valutare se factorizzarli dietro un'unica funzione interna del controller invece di ripetere la chiamata in ognuno.

- [ ] **Step 8: Test di integrazione per l'aggancio nel booking diretto**

Aggiungere in `tests/api/bookingPubblico.test.js` (file esistente — verificare la describe più vicina alla creazione di una prenotazione diretta) un test che mocka `pushDisponibilitaImmediata` e verifica che venga chiamato con il `tipo_camera_id`/range corretti dopo una prenotazione diretta andata a buon fine. Scrivere il test seguendo lo stile Supertest già in uso nel resto del file (setup tipo_camera/tariffa di test, POST alla rotta di prenotazione, assert sulla spy).

Run: `npx jest tests/api/bookingPubblico.test.js --runInBand`
Expected: PASS.

- [ ] **Step 9: Eseguire l'intera suite**

Run: `npm test`
Expected: tutti i test verdi.

- [ ] **Step 10: Commit**

```bash
git add backend/lib/beds24PushDisponibilita.js tests/lib/beds24PushDisponibilita.test.js backend/controllers/beds24SyncController.js backend/controllers/bookingPubblicoController.js tests/api/beds24Sync.test.js tests/api/bookingPubblico.test.js
git commit -m "feat(beds24): push disponibilità immediato agganciato a creazione/modifica/cancellazione soggiorno (diretto e beds24)"
```

---

### Task 9: `planningTariffeController.js` — supporto canale, e blindatura del diretto a `canale IS NULL`

**Files:**
- Modify: `backend/controllers/planningTariffeController.js`
- Test: `tests/api/planningTariffe.test.js` (file esistente — verificare con `find tests -iname "*planningTariffe*"` prima di aggiungere)

**Interfaces:**
- `GET /api/planning-tariffe/griglia` accetta ora un query param opzionale `canale` (`'beds24'` o assente/`'diretto'`). Quando `canale=beds24`, la risposta esclude `pensione_completa` da `righe` e ogni cella include anche `eccezione_canale: boolean` (true se esiste una riga specifica per quel canale, diversa dal default).
- `PATCH /api/planning-tariffe` accetta ora un campo opzionale `canale` nel body (`'beds24'` o assente = `NULL`, comportamento invariato).
- `calcolaTariffaPerTrattamentiConPlanning`/`prezzoBasePerNotteConPlanning` (usate dal motore di prenotazione diretto) restano **senza parametro canale**, ma le loro query interne su `planning_tariffe_giorni` sono ora vincolate esplicitamente a `canale IS NULL` — nessun cambiamento di comportamento visibile, solo blindatura esplicita contro una futura eccezione beds24 che altrimenti leaked nel diretto.

- [ ] **Step 1: Scrivere il test che fallisce, per la blindatura del diretto**

```js
// tests/api/planningTariffe.test.js — aggiungere in una describe esistente o nuova
test('un override canale=beds24 NON influenza il prezzo calcolato per il motore diretto', async () => {
  await pool.query(
    `INSERT INTO planning_tariffe_giorni (tipo_camera_id, trattamento, data, canale, prezzo_notte)
     VALUES ($1, 'bb', '2099-06-10', 'beds24', 999)`,
    [tipoCameraIdDiTest] // usare lo stesso tipo_camera_id già configurato nel beforeAll esistente del file, con una tariffa base nota
  );
  const risultato = await calcolaTariffaPerTrattamentiConPlanning(tipoCameraIdDiTest, '2099-06-10', '2099-06-11', ['bb']);
  expect(risultato.bb.prezzo_totale).not.toBe(999); // deve restare il prezzo diretto calcolato, non l'eccezione beds24
  await pool.query(`DELETE FROM planning_tariffe_giorni WHERE tipo_camera_id = $1 AND canale = 'beds24'`, [tipoCameraIdDiTest]);
});
```

Adattare `tipoCameraIdDiTest` al nome reale della variabile di setup già presente nel file (leggere il `beforeAll` esistente prima di scrivere questo test, non inventare un nuovo tipo camera se ce n'è già uno pronto per questi test).

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `npx jest tests/api/planningTariffe.test.js -t "NON influenza il prezzo calcolato per il motore diretto" --runInBand`
Expected: FAIL — la riga `canale='beds24'` viene letta anche dal diretto (bug che questo task corregge), quindi il prezzo torna 999.

- [ ] **Step 3: Blindare le query del diretto a `canale IS NULL`**

In `prezzoBasePerNotteConPlanning`, la query dell'override diventa:
```js
    pool.query(
      `SELECT data, prezzo_notte FROM planning_tariffe_giorni
       WHERE tipo_camera_id = $1 AND trattamento = 'bb' AND prezzo_notte IS NOT NULL
         AND canale IS NULL AND data >= $2 AND data < $3`,
      [baseTipoCameraId, dataArrivo, dataPartenza]
    ),
```

In `calcolaTariffaPerTrattamentiConPlanning`, la query dell'override diventa:
```js
  const overrideResult = await pool.query(
    `SELECT trattamento, data, prezzo_notte, min_stay, chiuso_arrivo, chiuso_partenza, stop_sell
     FROM planning_tariffe_giorni
     WHERE tipo_camera_id = $1 AND canale IS NULL AND data >= $2 AND data < $3`,
    [tipoCameraId, dataArrivo, dataPartenza]
  );
```

- [ ] **Step 4: Eseguire e verificare che passi**

Run: `npx jest tests/api/planningTariffe.test.js -t "NON influenza il prezzo calcolato per il motore diretto" --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit intermedio**

```bash
git add backend/controllers/planningTariffeController.js tests/api/planningTariffe.test.js
git commit -m "fix(beds24): blindare il motore di prenotazione diretto a canale IS NULL su planning_tariffe_giorni"
```

- [ ] **Step 6: Scrivere il test che fallisce, per `griglia()` con `canale=beds24`**

```js
// tests/api/planningTariffe.test.js — aggiungere
test('GET griglia con canale=beds24 esclude pensione_completa e segnala le eccezioni', async () => {
  await pool.query(
    `INSERT INTO planning_tariffe_giorni (tipo_camera_id, trattamento, data, canale, prezzo_notte)
     VALUES ($1, 'bb', '2099-06-12', 'beds24', 250)`,
    [tipoCameraIdDiTest]
  );
  const risposta = await request(app)
    .get(`/api/planning-tariffe/griglia?tipo_camera_id=${tipoCameraIdDiTest}&data_da=2099-06-12&data_a=2099-06-12&canale=beds24`)
    .set('Authorization', `Bearer ${tokenDiTest}`); // stesso helper/variabile già usati nel resto del file
  expect(risposta.status).toBe(200);
  expect(risposta.body.righe.pensione_completa).toBeUndefined();
  expect(risposta.body.righe.bb['2099-06-12'].prezzo).toBe(250);
  expect(risposta.body.righe.bb['2099-06-12'].eccezione_canale).toBe(true);
  await pool.query(`DELETE FROM planning_tariffe_giorni WHERE tipo_camera_id = $1 AND canale = 'beds24'`, [tipoCameraIdDiTest]);
});
```

- [ ] **Step 7: Eseguire e verificare che fallisca**

Run: `npx jest tests/api/planningTariffe.test.js -t "canale=beds24 esclude pensione_completa" --runInBand`
Expected: FAIL — `canale` ignorato dalla rotta oggi.

- [ ] **Step 8: Implementare il supporto canale in `griglia()`**

```js
// backend/controllers/planningTariffeController.js — sostituire il corpo di griglia()

async function griglia(req, res) {
  const { tipo_camera_id, data_da, data_a, canale } = req.query;
  if (!tipo_camera_id || !data_da || !data_a) {
    return res.status(400).json({ errore: 'tipo_camera_id, data_da e data_a sono obbligatori.' });
  }
  if (data_a < data_da) {
    return res.status(400).json({ errore: 'data_a deve essere successiva o uguale a data_da.' });
  }
  const canaleRichiesto = canale === 'beds24' ? 'beds24' : null;
  const trattamentiDaMostrare = canaleRichiesto === 'beds24'
    ? TRATTAMENTI.filter(t => t !== 'pensione_completa')
    : TRATTAMENTI;

  try {
    const dataFineEsclusiva = aggiungiGiorno(data_a);

    const [prezziCamera, overrideResult] = await Promise.all([
      calcolaPrezzoCameraPerNotteConPlanning(tipo_camera_id, data_da, dataFineEsclusiva),
      pool.query(
        `SELECT trattamento, data, canale, prezzo_notte, min_stay, chiuso_arrivo, chiuso_partenza, stop_sell
         FROM planning_tariffe_giorni
         WHERE tipo_camera_id = $1 AND data BETWEEN $2 AND $3
           AND (canale IS NULL OR canale = $4)`,
        [tipo_camera_id, data_da, data_a, canaleRichiesto]
      ),
    ]);

    // Precedenza: righe NULL prima, poi sovrascritte dalla riga specifica
    // del canale richiesto per la stessa chiave — stessa logica di merge
    // di calcolaPrezziRestrizioniBeds24Range (beds24PrezziDisponibilita.js).
    const overridePerChiave = new Map();
    for (const r of overrideResult.rows.filter(r => r.canale === null)) {
      overridePerChiave.set(`${r.trattamento}|${isoData(r.data)}`, r);
    }
    const eccezioniPerChiave = new Set();
    if (canaleRichiesto) {
      for (const r of overrideResult.rows.filter(r => r.canale === canaleRichiesto)) {
        const chiave = `${r.trattamento}|${isoData(r.data)}`;
        overridePerChiave.set(chiave, r);
        eccezioniPerChiave.add(chiave);
      }
    }

    const prezzoCameraPerNotte = new Map(prezziCamera.map(n => [isoData(n.notte), n.prezzo_notte]));
    const giorni = [...prezzoCameraPerNotte.keys()].sort();
    const righe = {};

    for (const trattamento of trattamentiDaMostrare) {
      righe[trattamento] = {};
      for (const di of giorni) {
        const chiave = `${trattamento}|${di}`;
        const override = overridePerChiave.get(chiave);
        let prezzoCalcolato = prezzoCameraPerNotte.get(di);
        if (trattamento !== 'bb' && prezzoCalcolato != null) {
          const supplemento = await calcolaSupplementoTrattamento(tipo_camera_id, di, aggiungiGiorno(di), trattamento, 2, []);
          prezzoCalcolato = supplemento.notti_scoperte.length > 0
            ? null
            : Math.round((prezzoCalcolato + supplemento.totale) * 100) / 100;
        }
        righe[trattamento][di] = {
          prezzo: override?.prezzo_notte != null ? Number(override.prezzo_notte) : prezzoCalcolato,
          sovrascritto: override?.prezzo_notte != null,
          min_stay: override?.min_stay ?? null,
          chiuso_arrivo: override?.chiuso_arrivo ?? false,
          chiuso_partenza: override?.chiuso_partenza ?? false,
          stop_sell: override?.stop_sell ?? false,
          eccezione_canale: eccezioniPerChiave.has(chiave),
        };
      }
    }

    res.json({ giorni, righe });
  } catch (err) {
    console.error('griglia planning-tariffe error:', err);
    res.status(500).json({ errore: 'Errore interno' });
  }
}
```

- [ ] **Step 9: Eseguire e verificare che passi**

Run: `npx jest tests/api/planningTariffe.test.js -t "canale=beds24 esclude pensione_completa" --runInBand`
Expected: PASS.

- [ ] **Step 10: Scrivere il test che fallisce, per `aggiorna()` con `canale`**

```js
// tests/api/planningTariffe.test.js — aggiungere
test('PATCH con canale=beds24 crea/aggiorna solo la riga eccezione, senza toccare quella NULL', async () => {
  await request(app)
    .patch('/api/planning-tariffe')
    .set('Authorization', `Bearer ${tokenDiTest}`)
    .send({ tipo_camera_id: tipoCameraIdDiTest, trattamento: 'bb', data_da: '2099-06-15', data_a: '2099-06-15', prezzo_notte: 180, canale: 'beds24' })
    .expect(200);

  const righe = await pool.query(
    `SELECT canale, prezzo_notte FROM planning_tariffe_giorni WHERE tipo_camera_id = $1 AND trattamento = 'bb' AND data = '2099-06-15'`,
    [tipoCameraIdDiTest]
  );
  expect(righe.rows).toHaveLength(1);
  expect(righe.rows[0].canale).toBe('beds24');
  await pool.query(`DELETE FROM planning_tariffe_giorni WHERE tipo_camera_id = $1 AND data = '2099-06-15'`, [tipoCameraIdDiTest]);
});
```

- [ ] **Step 11: Eseguire e verificare che fallisca**

Run: `npx jest tests/api/planningTariffe.test.js -t "PATCH con canale=beds24" --runInBand`
Expected: FAIL — `canale` ignorato, riga creata con `canale = NULL`.

- [ ] **Step 12: Implementare il supporto canale in `aggiorna()`**

Aggiungere `canale` alla destrutturazione del body (`const { ..., canale } = req.body;`), normalizzare `const canaleNormalizzato = canale === 'beds24' ? 'beds24' : null;`, e aggiornare la query di upsert per includerlo sia nell'`INSERT` sia nell'`ON CONFLICT` — la clausola conflitto ora è su `(tipo_camera_id, trattamento, data, COALESCE(canale, ''))` (Task 2), quindi va usato lo stesso indice come target esplicito:

```js
        await client.query(
          `INSERT INTO planning_tariffe_giorni (tipo_camera_id, trattamento, data, canale, prezzo_notte, min_stay, chiuso_arrivo, chiuso_partenza, stop_sell)
           VALUES ($1, $2, $3, $9, $4, $5, COALESCE($6, false), COALESCE($7, false), COALESCE($8, false))
           ON CONFLICT (tipo_camera_id, trattamento, data, (COALESCE(canale, ''))) DO UPDATE SET
             prezzo_notte    = CASE WHEN $10 THEN planning_tariffe_giorni.prezzo_notte    ELSE $4 END,
             min_stay        = CASE WHEN $11 THEN planning_tariffe_giorni.min_stay        ELSE $5 END,
             chiuso_arrivo   = CASE WHEN $12 THEN planning_tariffe_giorni.chiuso_arrivo   ELSE $6 END,
             chiuso_partenza = CASE WHEN $13 THEN planning_tariffe_giorni.chiuso_partenza ELSE $7 END,
             stop_sell       = CASE WHEN $14 THEN planning_tariffe_giorni.stop_sell       ELSE $8 END,
             updated_at      = now()`,
          [
            tipo_camera_id, trattamento, di, prezzo_notte === undefined ? null : (prezzo_notte === null ? null : Number(prezzo_notte)),
            min_stay === undefined ? null : (min_stay === null ? null : Number(min_stay)),
            chiuso_arrivo === undefined ? null : !!chiuso_arrivo,
            chiuso_partenza === undefined ? null : !!chiuso_partenza,
            stop_sell === undefined ? null : !!stop_sell,
            canaleNormalizzato,
            prezzo_notte === undefined, min_stay === undefined, chiuso_arrivo === undefined, chiuso_partenza === undefined, stop_sell === undefined,
          ]
        );
```

Verificare la sintassi esatta dell'`ON CONFLICT` su un'espressione (`COALESCE(canale, '')`) contro Postgres reale prima di considerare questo step concluso — la sintassi `ON CONFLICT (col, (expr))` è quella corretta per un indice su espressione, ma va confermata eseguendo lo Step 13 prima di procedere, non assunta.

- [ ] **Step 13: Eseguire e verificare che passi**

Run: `npx jest tests/api/planningTariffe.test.js -t "PATCH con canale=beds24" --runInBand`
Expected: PASS. Se fallisce con un errore di sintassi SQL sull'`ON CONFLICT`, è il segnale che la sintassi dell'espressione va corretta (es. potrebbe servire ripetere l'espressione identica a quella dell'indice, non solo il nome colonna) — trattarlo come un bug da correggere subito, non un'incognita da rimandare oltre.

- [ ] **Step 14: Validare che `trattamento` per canale beds24 sia solo bb/mezza_pensione**

Aggiungere in `aggiorna()`, subito dopo la validazione esistente di `TRATTAMENTI.includes(trattamento)`:
```js
  if (canaleNormalizzato === 'beds24' && trattamento === 'pensione_completa') {
    return res.status(400).json({ errore: 'Pensione Completa non è disponibile per il canale Beds24 (le OTA non la supportano).' });
  }
```
(spostare la definizione di `canaleNormalizzato` prima di questo controllo se non lo è già).

Aggiungere il test corrispondente:
```js
test('PATCH rifiuta pensione_completa per canale=beds24', async () => {
  await request(app)
    .patch('/api/planning-tariffe')
    .set('Authorization', `Bearer ${tokenDiTest}`)
    .send({ tipo_camera_id: tipoCameraIdDiTest, trattamento: 'pensione_completa', data_da: '2099-06-16', data_a: '2099-06-16', prezzo_notte: 300, canale: 'beds24' })
    .expect(400);
});
```

- [ ] **Step 15: Eseguire l'intera suite**

Run: `npm test`
Expected: tutti i test verdi.

- [ ] **Step 16: Commit**

```bash
git add backend/controllers/planningTariffeController.js tests/api/planningTariffe.test.js
git commit -m "feat(beds24): supporto canale in griglia/aggiorna del planning tariffe, pensione_completa esclusa su beds24"
```

---

### Task 10: Job periodico tariffe — `beds24InvioTariffe.js`

**Files:**
- Create: `backend/jobs/beds24InvioTariffe.js`
- Modify: `backend/server.js`
- Test: `tests/lib/beds24InvioTariffe.test.js`

**Interfaces:**
- Consuma: `calcolaPrezziRestrizioniBeds24Range` (Task 4), `pushCalendario` (Task 3), `scriviInvioLog` (Task 5), `beds24_config.orizzonte_invio_tariffe_fino_a`.
- Produce: `async eseguiInvioTariffe() -> void`, `avviaJobInvioTariffeBeds24()` (cron).

- [ ] **Step 1: Scrivere il test che fallisce**

```js
// tests/lib/beds24InvioTariffe.test.js
const pool = require('../../backend/config/db');
const beds24Client = require('../../backend/lib/beds24Client');
const { eseguiInvioTariffe } = require('../../backend/jobs/beds24InvioTariffe');

describe('eseguiInvioTariffe', () => {
  let tipoCameraId;

  beforeAll(async () => {
    const tc = await pool.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Test Job Tariffe', 2) RETURNING id`);
    tipoCameraId = tc.rows[0].id;
    await pool.query(`INSERT INTO tipi_camera_canali (tipo_camera_id, canale, codice_esterno) VALUES ($1, 'beds24', '777005')`, [tipoCameraId]);
    await pool.query(`INSERT INTO tariffe (tipo_camera_id, data_inizio, data_fine, prezzo_notte) VALUES ($1, '2099-07-01', '2099-07-31', 120)`, [tipoCameraId]);
    await pool.query(`INSERT INTO beds24_config (id, orizzonte_invio_tariffe_fino_a) VALUES (1, '2099-07-05') ON CONFLICT (id) DO UPDATE SET orizzonte_invio_tariffe_fino_a = EXCLUDED.orizzonte_invio_tariffe_fino_a`);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM tariffe WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera_canali WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tipoCameraId]);
    await pool.query(`UPDATE beds24_config SET orizzonte_invio_tariffe_fino_a = NULL WHERE id = 1`);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await pool.query(`DELETE FROM beds24_invio_log WHERE tipo_camera_id = $1`, [tipoCameraId]);
  });

  test('invia il calendario per ogni tipologia mappata fino all\'orizzonte configurato', async () => {
    const pushSpy = jest.spyOn(beds24Client, 'pushCalendario').mockResolvedValue({ ok: true, risposta: [{ success: true }], creditiRimanenti: 400 });

    await eseguiInvioTariffe();

    expect(pushSpy).toHaveBeenCalled();
    const chiamata = pushSpy.mock.calls.find(c => c[0][0].roomId === 777005);
    expect(chiamata).toBeDefined();
    const log = await pool.query(`SELECT * FROM beds24_invio_log WHERE tipo_camera_id = $1 AND tipo = 'tariffe'`, [tipoCameraId]);
    expect(log.rows.length).toBeGreaterThan(0);
  });

  test('non si ferma se una tipologia fallisce — continua con le altre e logga l\'errore isolato', async () => {
    jest.spyOn(beds24Client, 'pushCalendario').mockRejectedValue(new Error('errore simulato'));

    await expect(eseguiInvioTariffe()).resolves.not.toThrow();

    const log = await pool.query(`SELECT * FROM beds24_invio_log WHERE tipo_camera_id = $1 AND esito = 'errore'`, [tipoCameraId]);
    expect(log.rows.length).toBeGreaterThan(0);
  });

  test('non invia nulla se orizzonte_invio_tariffe_fino_a non è configurato', async () => {
    await pool.query(`UPDATE beds24_config SET orizzonte_invio_tariffe_fino_a = NULL WHERE id = 1`);
    const pushSpy = jest.spyOn(beds24Client, 'pushCalendario');

    await eseguiInvioTariffe();

    expect(pushSpy).not.toHaveBeenCalled();
    await pool.query(`UPDATE beds24_config SET orizzonte_invio_tariffe_fino_a = '2099-07-05' WHERE id = 1`);
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `npx jest tests/lib/beds24InvioTariffe.test.js --runInBand`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementare il job**

```js
// backend/jobs/beds24InvioTariffe.js
// Job periodico invio tariffe/restrizioni a Beds24 — Modulo 2.3, Fase 2/3.
// Stesso pattern di beds24Riconciliazione.js (cron, avviato solo da
// server.js). A differenza della disponibilità (push immediato, evento
// per evento), le tariffe si inviano in batch su tutto l'orizzonte
// configurato: un errore isolato su una tipologia non deve fermare le
// altre (rete di sicurezza contro un push immediato perso), vedi sezione
// "Gestione errori" della spec.
const cron = require('node-cron');
const pool = require('../config/db');
const beds24Client = require('../lib/beds24Client');
const { calcolaPrezziRestrizioniBeds24Range } = require('../lib/beds24PrezziDisponibilita');
const { scriviInvioLog } = require('../lib/beds24InvioLog');

function domaniIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function eseguiInvioTariffe() {
  const config = await pool.query(`SELECT orizzonte_invio_tariffe_fino_a FROM beds24_config WHERE id = 1`);
  const orizzonte = config.rows[0]?.orizzonte_invio_tariffe_fino_a;
  if (!orizzonte) {
    console.log('Invio tariffe Beds24: nessun orizzonte configurato (beds24_config.orizzonte_invio_tariffe_fino_a), salto questo giro.');
    return;
  }
  const orizzonteIso = new Date(orizzonte).toISOString().slice(0, 10);
  const dataDa = domaniIso();
  if (orizzonteIso < dataDa) {
    console.log('Invio tariffe Beds24: orizzonte configurato è nel passato, salto questo giro.');
    return;
  }
  // dataFineEsclusiva = il giorno DOPO l'orizzonte (orizzonte è inclusivo,
  // stessa convenzione di calendario di planning_tariffe_giorni/tariffe).
  const fine = new Date(orizzonteIso + 'T00:00:00Z');
  fine.setUTCDate(fine.getUTCDate() + 1);
  const dataFineEsclusiva = fine.toISOString().slice(0, 10);

  const mappature = await pool.query(
    `SELECT tipo_camera_id, codice_esterno FROM tipi_camera_canali WHERE canale = 'beds24' AND codice_esterno IS NOT NULL`
  );

  for (const { tipo_camera_id: tipoCameraId, codice_esterno: codiceEsterno } of mappature.rows) {
    try {
      const righe = await calcolaPrezziRestrizioniBeds24Range(tipoCameraId, dataDa, dataFineEsclusiva);
      if (!righe.length) continue;

      const calendar = righe.map((r, idx) => ({
        from: r.giorno,
        to: idx < righe.length - 1 ? righe[idx + 1].giorno : r.giorno,
        minStay: r.minStay ?? undefined,
        override: r.override,
        price1: r.price1 ?? undefined,
        price2: r.price2 ?? undefined,
      }));

      const risultato = await beds24Client.pushCalendario([{ roomId: Number(codiceEsterno), calendar }]);
      await scriviInvioLog({ tipo: 'tariffe', tipoCameraId, esito: 'successo', dettaglio: risultato.risposta });

      // Rate limiting a crediti (vedi spec, sezione "Gestione errori"): se
      // siamo scesi sotto una soglia di sicurezza, ci fermiamo qui invece
      // di continuare a bruciare crediti per le tipologie restanti — al
      // giro successivo (stesso job, prossima esecuzione cron) riprende
      // dalle tipologie non ancora coperte questo giro.
      if (risultato.creditiRimanenti != null && risultato.creditiRimanenti < 50) {
        console.warn(`Invio tariffe Beds24: crediti rimanenti sotto soglia (${risultato.creditiRimanenti}), interrompo questo giro.`);
        break;
      }
    } catch (err) {
      await scriviInvioLog({ tipo: 'tariffe', tipoCameraId, esito: 'errore', dettaglio: { messaggio: err.message } });
      console.error(`Invio tariffe Beds24 — errore su tipo_camera_id ${tipoCameraId}:`, err.message);
      // continua con la tipologia successiva — un errore isolato non deve
      // lasciare l'intero orizzonte non sincronizzato, vedi spec.
    }
  }
}

function avviaJobInvioTariffeBeds24() {
  // Ogni 3 ore — candidato indicato in spec (2-4 ore), a metà range:
  // abbastanza frequente da recuperare in giornata un push immediato
  // perso, non così frequente da rischiare il rate limit a crediti su un
  // orizzonte stagionale intero ad ogni giro.
  cron.schedule('0 */3 * * *', eseguiInvioTariffe);
}

module.exports = { avviaJobInvioTariffeBeds24, eseguiInvioTariffe };
```

- [ ] **Step 4: Eseguire e verificare che passi**

Run: `npx jest tests/lib/beds24InvioTariffe.test.js --runInBand`
Expected: PASS (3 test).

- [ ] **Step 5: Avviare il job da `server.js`**

```js
// backend/server.js — aggiungere accanto agli altri require di job
const { avviaJobInvioTariffeBeds24 } = require('./jobs/beds24InvioTariffe');
```
e nella stessa sezione dove sono chiamati gli altri `avviaJob...()`:
```js
  avviaJobInvioTariffeBeds24();
```

- [ ] **Step 6: Eseguire l'intera suite**

Run: `npm test`
Expected: tutti i test verdi.

- [ ] **Step 7: Commit**

```bash
git add backend/jobs/beds24InvioTariffe.js backend/server.js tests/lib/beds24InvioTariffe.test.js
git commit -m "feat(beds24): job periodico invio tariffe/restrizioni, con soglia di rate limiting a crediti"
```

---

### Task 11: Frontend — selettore canale in `planning-tariffe`

**Files:**
- Modify: `frontend/app/planning-tariffe/page.jsx`

**Interfaces:**
- Nuovo stato `canale` (`'diretto' | 'beds24'`, default `'diretto'`), incluso nella query di `griglia` e nel body di ogni PATCH.
- Quando `canale === 'beds24'`, la lista `TRATTAMENTI` mostrata è filtrata (`pensione_completa` esclusa).
- Ogni cella con `eccezione_canale: true` (restituito dal backend, Task 9) mostra un piccolo indicatore visivo (badge/pallino) accanto al prezzo.

Questo task tocca un componente esistente di 790 righe con drag-select, drawer di bulk-edit e menu di propagazione — leggerlo per intero prima di modificarlo (non solo i frammenti già visti in fase di piano) e individuare TUTTI i punti che compongono la query string di `griglia` o il body di `aggiorna`/PATCH, non solo quelli più visibili, altrimenti un punto dimenticato invia silenziosamente `canale` mancante e scrive sulla riga sbagliata.

- [ ] **Step 1: Leggere il file per intero**

Run: aprire `frontend/app/planning-tariffe/page.jsx` e leggerlo dall'inizio alla fine, annotando ogni `fetch(` verso `/api/planning-tariffe/griglia` e ogni chiamata verso `PATCH /api/planning-tariffe` (dirette o tramite una funzione condivisa tipo `salvaPrezzoGiorno`/`propagaRiga`/`propagaColonna`/il drawer bulk-edit).

- [ ] **Step 2: Aggiungere lo stato canale e il controllo UI**

Aggiungere accanto agli stati esistenti (`modo`, `ancora`, ecc.):
```jsx
const [canale, setCanale] = useState('diretto'); // 'diretto' | 'beds24'
```
Aggiungere un toggle a due opzioni (stesso stile dei controlli toolbar già presenti per `modo`) con etichette "Diretto" e "Beds24" vicino agli altri controlli di vista in alto nella pagina.

- [ ] **Step 3: Includere `canale` in ogni fetch di `griglia`**

In ogni punto che compone l'URL di `GET /api/planning-tariffe/griglia`, aggiungere `&canale=${canale === 'beds24' ? 'beds24' : ''}` (o l'equivalente con `URLSearchParams`, secondo lo stile già in uso nel file) e aggiungere `canale` alle dipendenze di qualunque `useEffect`/`useCallback` che ricarica la griglia, così cambiare canale ricarica automaticamente i dati.

- [ ] **Step 4: Includere `canale` in ogni PATCH**

In `salvaPrezzoGiorno`, `propagaRiga`, `propagaColonna`, e nel submit del drawer bulk-edit, aggiungere `canale: canale === 'beds24' ? 'beds24' : undefined` al body inviato.

- [ ] **Step 5: Filtrare `TRATTAMENTI` quando `canale === 'beds24'`**

Dove il componente itera `TRATTAMENTI` per renderizzare le righe (es. `TRATTAMENTI.map(tr => ...)`), sostituire con una variabile derivata:
```jsx
const trattamentiVisibili = canale === 'beds24' ? TRATTAMENTI.filter(tr => tr.id !== 'pensione_completa') : TRATTAMENTI;
```
e usare `trattamentiVisibili` al posto di `TRATTAMENTI` in ogni punto di rendering delle righe (non nei posti che validano input, quelli restano su `TRATTAMENTI` per non rompere il comportamento del canale diretto).

- [ ] **Step 6: Indicatore visivo per `eccezione_canale`**

Nel punto che renderizza il valore/prezzo di ogni cella (`cellaDati(tipoId, trattamento, di)`), leggere anche `.eccezione_canale` dal risultato e, se `true`, aggiungere un piccolo indicatore (es. un pallino colorato in un angolo della cella, `title="Eccezione specifica per questo canale"` per l'accessibilità) — riusare lo stesso pattern visivo già in uso nel file per altri indicatori di stato cella (es. `sovrascritto`), non introdurne uno nuovo scollegato dallo stile esistente.

- [ ] **Step 7: Verifica manuale**

Non esiste in questo progetto una suite di test frontend automatizzata per questa pagina (verificare con `find tests -iname "*planning-tariffe*"` prima di escludere del tutto questo step — se esiste un test Playwright, aggiungere un caso lì invece di questo step manuale). In assenza di test automatizzati: avviare il frontend in locale, aprire `/planning-tariffe`, passare dal canale Diretto a Beds24 e verificare che (a) Pensione Completa sparisca, (b) i prezzi mostrati riflettano eventuali eccezioni beds24 impostate via PATCH diretto all'API nello Step precedente, (c) una modifica fatta nel canale Beds24 non cambi il prezzo visibile nel canale Diretto per la stessa cella.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/planning-tariffe/page.jsx
git commit -m "feat(beds24): selettore canale nel planning tariffe, pensione_completa nascosta su beds24, indicatore eccezioni"
```

---

### Task 12: Frontend — pagina impostazioni Beds24 (unità esposte, maggiorazione, orizzonte)

**Files:**
- Create: `frontend/app/impostazioni/beds24/page.jsx`

**Interfaces:**
- Consuma: `GET /api/canali-ota?canale=beds24` (esteso al Task 6), `PUT /api/canali-ota/:tipoCameraId`, `GET`/`PUT /api/beds24/config` (Task 7).
- Nessuna nuova rotta backend — solo UI su endpoint già esistenti dopo i Task 6-7.

Non esiste oggi nessuna pagina Beds24 in `frontend/app/impostazioni/` (verificato in fase di piano) — questa è una pagina nuova, non un'estensione. Il pattern di riferimento più vicino nello stesso progetto è `frontend/app/impostazioni/tassa-soggiorno/page.jsx` (una tabella di configurazione semplice con salvataggio per riga) — leggerlo prima di scrivere questa pagina e riusarne lo stile di data-fetching/salvataggio/gestione errori, non inventarne uno nuovo.

- [ ] **Step 1: Leggere `frontend/app/impostazioni/tassa-soggiorno/page.jsx` come riferimento di stile**

- [ ] **Step 2: Creare la pagina**

Struttura minima richiesta (nessun placeholder — ogni parte deve essere funzionante):
- Una tabella con una riga per tipo camera (da `GET /api/canali-ota?canale=beds24`): nome tipologia, campo numerico `unita_esposte` (vuoto = nessun tetto), campo numerico `maggiorazione_percentuale` (%), pulsante salva per riga che chiama `PUT /api/canali-ota/:tipoCameraId` con `canale: 'beds24'` e i due campi (più `codice_esterno` invariato, letto dalla stessa riga — non deve essere sovrascritto con `null` per errore: leggere il valore esistente dalla riga caricata e includerlo sempre nel PUT).
- Un campo data separato per `orizzonte_invio_tariffe_fino_a` (da `GET`/`PUT /api/beds24/config`), con la data corrente mostrata e un pulsante salva.
- Gestione di caricamento/errore/successo con lo stesso pattern (stessi nomi di stato, stesso stile di messaggi) del file di riferimento dello Step 1.

- [ ] **Step 3: Aggiungere la voce di menu/navigazione**

Localizzare dove sono elencate le altre pagine di `impostazioni` nella navigazione (cercare `tassa-soggiorno` o `alloggiati` nei componenti di layout/menu del frontend) e aggiungere una voce equivalente per `/impostazioni/beds24`, con lo stesso controllo di visibilità per ruolo già in uso per le altre voci (visibile a chi ha `beds24`/`lettura` almeno, coerente con `shared/ruoli.js`).

- [ ] **Step 4: Verifica manuale**

Avviare il frontend in locale, aprire `/impostazioni/beds24`, impostare `unita_esposte`/`maggiorazione_percentuale` per una tipologia di test e l'orizzonte, salvare, ricaricare la pagina e verificare che i valori persistano (chiamata reale a `GET`, non solo stato locale).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/impostazioni/beds24/page.jsx
git commit -m "feat(beds24): pagina impostazioni — unità esposte, maggiorazione percentuale, orizzonte invio tariffe"
```

---

### Task 13: Verifica end-to-end del calcolo su uno scenario reale

**Files:**
- Test: `tests/lib/beds24InvioTariffe.test.js` (estendere con uno scenario composito, nella stessa describe o in una nuova alla fine del file)

**Interfaces:** nessuna nuova — questo task verifica l'integrazione tra `calcolaDisponibilitaBeds24Range`, `calcolaPrezziRestrizioniBeds24Range` e `eseguiInvioTariffe` su uno scenario con più giorni, un'eccezione canale, e una camera occupata, per catturare un'interazione che i test per-funzione dei Task 4/10 non coprono (ciascuno testava una funzione isolata con dati minimi).

- [ ] **Step 1: Scrivere lo scenario end-to-end**

```js
// tests/lib/beds24InvioTariffe.test.js — nuova describe in fondo al file
describe('eseguiInvioTariffe — scenario composito', () => {
  let tipoCameraId, cameraId;

  beforeAll(async () => {
    const tc = await pool.query(`INSERT INTO tipi_camera (nome, capienza_max) VALUES ('Test Scenario E2E', 2) RETURNING id`);
    tipoCameraId = tc.rows[0].id;
    const c = await pool.query(`INSERT INTO camere (numero, nome, attivo) VALUES ('E2E1', 'Camera E2E', true) RETURNING id`);
    cameraId = c.rows[0].id;
    await pool.query(`INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1, $2)`, [tipoCameraId, cameraId]);
    await pool.query(
      `INSERT INTO tipi_camera_canali (tipo_camera_id, canale, codice_esterno, unita_esposte, maggiorazione_percentuale)
       VALUES ($1, 'beds24', '777099', 1, 10)`,
      [tipoCameraId]
    );
    await pool.query(`INSERT INTO tariffe (tipo_camera_id, data_inizio, data_fine, prezzo_notte) VALUES ($1, '2099-08-01', '2099-08-31', 100)`, [tipoCameraId]);
    // Eccezione beds24: stop_sell il 2099-08-10
    await pool.query(
      `INSERT INTO planning_tariffe_giorni (tipo_camera_id, trattamento, data, canale, stop_sell)
       VALUES ($1, 'bb', '2099-08-10', 'beds24', true)`,
      [tipoCameraId]
    );
    await pool.query(`INSERT INTO beds24_config (id, orizzonte_invio_tariffe_fino_a) VALUES (1, '2099-08-12') ON CONFLICT (id) DO UPDATE SET orizzonte_invio_tariffe_fino_a = EXCLUDED.orizzonte_invio_tariffe_fino_a`);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM planning_tariffe_giorni WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tariffe WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera_canali WHERE tipo_camera_id = $1`, [tipoCameraId]);
    await pool.query(`DELETE FROM tipi_camera_camere WHERE camera_id = $1`, [cameraId]);
    await pool.query(`DELETE FROM camere WHERE id = $1`, [cameraId]);
    await pool.query(`DELETE FROM tipi_camera WHERE id = $1`, [tipoCameraId]);
    await pool.query(`UPDATE beds24_config SET orizzonte_invio_tariffe_fino_a = NULL WHERE id = 1`);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await pool.query(`DELETE FROM beds24_invio_log WHERE tipo_camera_id = $1`, [tipoCameraId]);
  });

  test('il calendario inviato riflette prezzo maggiorato, price2 derivato e blackout sul giorno con stop_sell', async () => {
    const pushSpy = jest.spyOn(beds24Client, 'pushCalendario').mockResolvedValue({ ok: true, risposta: [{ success: true }], creditiRimanenti: 400 });

    await eseguiInvioTariffe();

    const chiamata = pushSpy.mock.calls.find(c => c[0][0].roomId === 777099);
    expect(chiamata).toBeDefined();
    const calendar = chiamata[0][0].calendar;
    const giorno10 = calendar.find(c => c.from === '2099-08-10');
    expect(giorno10.override).toBe('blackout');
    const giornoAltro = calendar.find(c => c.from !== '2099-08-10');
    expect(giornoAltro.price1).toBe(110); // 100 * 1.10
    expect(giornoAltro.price2).toBeGreaterThan(110); // bb + supplemento mezza pensione, maggiorato
  });
});
```

- [ ] **Step 2: Eseguire e verificare l'esito**

Run: `npx jest tests/lib/beds24InvioTariffe.test.js -t "scenario composito" --runInBand`
Expected: PASS. Se fallisce, il fallimento è un'interazione reale tra i moduli dei Task 4/10 non catturata dai test isolati — non un test da aggiustare per farlo passare, un bug reale da correggere nel modulo coinvolto.

- [ ] **Step 3: Eseguire l'intera suite un'ultima volta**

Run: `npm test`
Expected: tutti i test verdi.

- [ ] **Step 4: Commit**

```bash
git add tests/lib/beds24InvioTariffe.test.js
git commit -m "test(beds24): scenario end-to-end — prezzo maggiorato, price2 derivato, blackout su eccezione canale"
```

---

## Note per chi esegue questo piano

- **Task 7**, Step 3: contiene una domanda di autorizzazione aperta per Marco (chi può cambiare l'orizzonte stagionale) — non deciderla da soli, chiederla prima di eseguire quello step.
- **Task 8**, Step 7: richiede di enumerare a mano i punti di scrittura in `bookingPubblicoController.js` — non è stato fatto in fase di piano oltre a un grep parziale, va fatto per intero prima di scrivere il codice di quello step.
- **Task 9**, Step 12-13: la sintassi esatta di `ON CONFLICT` su un indice a espressione con `COALESCE` va verificata contro Postgres reale, non assunta — se non funziona come scritto, è un problema di sintassi da risolvere subito, non un segnale che l'approccio dell'indice (Task 2) sia sbagliato.
- **Task 11**: il file `page.jsx` toccato è grande (790 righe) — leggere per intero prima di modificare, il piano elenca le funzioni note ma non garantisce di averle trovate tutte.
