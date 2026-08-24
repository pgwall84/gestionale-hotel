# Min/max cartellino — Piano 1 di 3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alert bloccante-superabile (con log di override) quando un prezzo scritto a mano per una tipologia camera esce dal min/max dichiarato per il cartellino, nei due punti dove un umano digita un prezzo: form `/tariffe` per il tipo madre, e `tariffa_totale` sulla prenotazione (creazione, aggiunta camera, modifica). Nessuna pagina nuova — si estendono `frontend/app/tariffe/page.jsx` e i controller esistenti.

**Architecture:** Il min/max vive su due tabelle — nuovi campi `prezzo_minimo`/`prezzo_massimo` su `tariffe` (tipi madre, oggi assenti) e i campi omonimi già presenti su `regole_derivazione_tariffe` (tipi derivati, migration 051). Per la regola di derivazione NON si aggiunge nessun alert al salvataggio: `tariffeDerivateController.js` documenta già esplicitamente, in testa al file, che il vincolo va applicato "in fase di CALCOLO... non qui in scrittura" — un titolare deve poter salvare una percentuale anche se temporaneamente fuori range mentre configura i periodi, il clamp automatico di `calcolaPrezzoCameraPerNotte` garantisce comunque che nessun prezzo fuori range venga mai venduto. Decisione confermata dal titolare in sessione (23/08/2026): stessa logica, niente alert lì.
I due punti che restano — `tariffeController` (tipo madre) e `prenotazioniController`/`soggiorniController` (tariffa_totale) — accettano un flag `confermato: true` nel body: se il prezzo è fuori range e `confermato` non è passato, rispondono `409` con `{ errore, minimo, massimo, valore }`; se `confermato: true`, salvano comunque e registrano un evento in `audit_log` (tabella già esistente, migration 012) tramite `logAudit`, riusata così com'è — nessuna tabella nuova.

**Tech Stack:** Node.js/Express, PostgreSQL (query dirette con `pg`, niente ORM), Jest + Supertest per i test API (`tests/api/**/*.test.js`), React/Next.js per il frontend.

## Global Constraints

- Mai fidarsi di un prezzo calcolato lato client — ogni validazione va rieseguita lato server, coerente con il commento già presente in `tariffeController.js` ("il prezzo non deve mai essere accettato dal client sulle route pubbliche, va sempre ricalcolato").
- Nessuna modifica al comportamento di `calcolaPrezzoCameraPerNotte`/`calcolaTariffa`/`calcolaTariffaPerTrattamenti` (motore di calcolo automatico, booking pubblico incluso) — resta il clamp automatico esistente con `avviso` testuale, invariato. Nessuna modifica a `tariffeDerivateController.creaDerivazione`/`aggiornaDerivazione` — restano come sono, per lo stesso motivo documentato nel file stesso.
- Ambiente Cowork: nessun accesso reale a PostgreSQL, nessuna esecuzione reale di Jest, nessun controllo visivo. Ogni task che tocca DB o UI va marcato esplicitamente come "da eseguire/verificare da tab Code" — mai dichiarato verificato senza averlo davvero eseguito.
- Stile commenti/date di test: italiano, intervalli di date 2090+ per non collidere con dati reali (stessa convenzione di `tests/api/tariffe.test.js`).
- `req.utente.id` è l'id dell'utente autenticato (payload JWT, vedi `backend/controllers/authController.js:59`) — usarlo per `logAudit`, mai un valore inventato.

---

### Task 1: Migration 052 — min/max su `tariffe`

**Files:**
- Create: `database/migrations/052_min_max_cartellino.sql`

**Interfaces:**
- Produces: colonne `tariffe.prezzo_minimo NUMERIC(10,2)`, `tariffe.prezzo_massimo NUMERIC(10,2)`, entrambe nullable, con lo stesso vincolo già usato su `regole_derivazione_tariffe` (`chk_regole_derivazione_range`).

- [ ] **Step 1: Scrivere la migration**

```sql
-- Migration 052 — Min/max cartellino sui tipi camera "madre" (23/08/2026).
--
-- Contesto (deciso con il titolare in sessione Cowork, vedi docs/EVOLUTIVE.md
-- voce "Modulo min/max cartellino + planning-tariffe giorno-per-giorno"):
-- regole_derivazione_tariffe ha già prezzo_minimo/prezzo_massimo (migration
-- 051), oggi usati solo per il clamp automatico di calcolaPrezzoCameraPerNotte.
-- I tipi camera "madre" (Matrimoniale, Matrimoniale Piccola — righe dirette
-- in `tariffe`, nessuna riga in regole_derivazione_tariffe) non hanno invece
-- alcun min/max: li aggiungiamo qui, stesso significato, stesso vincolo di
-- range. Nessun valore popolato — il titolare li inserirà dalla UI di
-- /tariffe quando pronta, come già avvenuto per la 051.
--
-- Comportamento (Piano 1, docs/superpowers/plans/2026-08-23-min-max-
-- cartellino.md): a differenza del clamp automatico dei tipi derivati,
-- questi min/max alimentano un alert bloccante-superabile nei due punti dove
-- un umano scrive il prezzo (tariffeController, prenotazioniController/
-- soggiorniController) — nessuna colonna nuova per il log dell'override: si
-- riusa audit_log (migration 012) via logAudit.

BEGIN;

ALTER TABLE tariffe ADD COLUMN IF NOT EXISTS prezzo_minimo NUMERIC(10,2);
ALTER TABLE tariffe ADD COLUMN IF NOT EXISTS prezzo_massimo NUMERIC(10,2);

ALTER TABLE tariffe DROP CONSTRAINT IF EXISTS chk_tariffe_range;
ALTER TABLE tariffe ADD CONSTRAINT chk_tariffe_range CHECK (
  prezzo_minimo IS NULL OR prezzo_massimo IS NULL OR prezzo_massimo >= prezzo_minimo
);

COMMIT;
```

- [ ] **Step 2: Segnalare a tab Code per l'esecuzione reale**

Da questo ambiente Cowork non è possibile eseguire la migration contro
PostgreSQL reale (nessun accesso al DB). Annotare nel task/commit che
`database/migrations/052_min_max_cartellino.sql` va eseguita da tab Code
prima di qualunque test che dipenda dalle nuove colonne.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/052_min_max_cartellino.sql
git commit -m "feat(db): aggiunge prezzo_minimo/prezzo_massimo a tariffe (migration 052)"
```

---

### Task 2: `verificaLimitiListino` — funzione di calcolo range per un soggiorno

**Files:**
- Create: `backend/utils/verificaLimitiListino.js`
- Test: `tests/api/verificaLimitiListino.test.js`

**Interfaces:**
- Consumes: `pool` da `backend/config/db.js`; `calcolaSupplementoTrattamento` esportata da `backend/controllers/tariffeController.js` (va aggiunta a `module.exports` in questo task, oggi non esportata).
- Produces: `async function verificaLimitiListino({ tipoCameraId, trattamento, dataArrivo, dataPartenza, valore, db })` → `Promise<{ conforme: boolean, minimo: number|null, massimo: number|null }>`. `db` opzionale (default `pool`), per poter essere chiamata dentro una transazione (`client.query`) da `prenotazioniController`. `trattamento` uno tra `'bb' | 'mezza_pensione' | 'pensione_completa'`. Usata dai punti di scrittura sulla prenotazione (Task 4) — il form `/tariffe` (Task 5) fa un controllo più semplice, auto-contenuto sulla riga che sta salvando, senza bisogno di questa funzione.

- [ ] **Step 1: Aggiungere `calcolaSupplementoTrattamento` a `module.exports`**

In `backend/controllers/tariffeController.js`, riga finale:

```js
module.exports = { lista, calcola, calcolaTariffa, calcolaTariffaPerTrattamenti, calcolaSupplementoTrattamento, crea, aggiorna, elimina };
```

- [ ] **Step 2: Scrivere il test che fallisce**

```js
// tests/api/verificaLimitiListino.test.js
// Copre: verificaLimitiListino su un tipo camera "madre" (min/max diretti su
// tariffe) e su un tipo "derivato" (min/max su regole_derivazione_tariffe).
// Stessa convenzione di tests/api/tariffe.test.js: date 2090+, suffisso
// univoco per non collidere tra run.

const { getPool, chiudiPool } = require('../helpers/db');
const { verificaLimitiListino } = require('../../backend/utils/verificaLimitiListino');

const SUFFISSO = `_${Date.now().toString().slice(-6)}`;
let tipoMadreId;
let tipoDerivatoId;
let periodoId;

beforeAll(async () => {
  const db = getPool();
  const madre = await db.query(`INSERT INTO tipi_camera (nome) VALUES ($1) RETURNING id`, [`MadreVerificaLimiti${SUFFISSO}`]);
  tipoMadreId = madre.rows[0].id;
  const derivato = await db.query(`INSERT INTO tipi_camera (nome) VALUES ($1) RETURNING id`, [`DerivatoVerificaLimiti${SUFFISSO}`]);
  tipoDerivatoId = derivato.rows[0].id;

  const periodo = await db.query(
    `INSERT INTO periodi_stagionali (nome, data_inizio, data_fine) VALUES ($1, '2091-06-01', '2091-06-30') RETURNING id`,
    [`PeriodoVerificaLimiti${SUFFISSO}`]
  );
  periodoId = periodo.rows[0].id;

  await db.query(
    `INSERT INTO tariffe (tipo_camera_id, data_inizio, data_fine, prezzo_notte, periodo_id, prezzo_minimo, prezzo_massimo)
     VALUES ($1, '2091-06-01', '2091-06-30', 150, $2, 120, 200)`,
    [tipoMadreId, periodoId]
  );

  await db.query(
    `INSERT INTO regole_derivazione_tariffe (tipo_camera_id, tipo_camera_base_id, periodo_id, percentuale, prezzo_minimo, prezzo_massimo)
     VALUES ($1, $2, $3, -20, 90, 150)`,
    [tipoDerivatoId, tipoMadreId, periodoId]
  );
});

afterAll(async () => {
  const db = getPool();
  await db.query('DELETE FROM regole_derivazione_tariffe WHERE tipo_camera_id = $1', [tipoDerivatoId]);
  await db.query('DELETE FROM tariffe WHERE tipo_camera_id = $1', [tipoMadreId]);
  await db.query('DELETE FROM periodi_stagionali WHERE id = $1', [periodoId]);
  await db.query('DELETE FROM tipi_camera WHERE id = ANY($1)', [[tipoMadreId, tipoDerivatoId]]);
  await chiudiPool();
});

describe('verificaLimitiListino — tipo madre', () => {
  test('valore dentro il range → conforme true', async () => {
    const r = await verificaLimitiListino({
      tipoCameraId: tipoMadreId, trattamento: 'bb',
      dataArrivo: '2091-06-10', dataPartenza: '2091-06-12', valore: 300, // 150x2 notti
    });
    expect(r.conforme).toBe(true);
    expect(r.minimo).toBe(240); // 120x2
    expect(r.massimo).toBe(400); // 200x2
  });

  test('valore sopra il massimo → conforme false', async () => {
    const r = await verificaLimitiListino({
      tipoCameraId: tipoMadreId, trattamento: 'bb',
      dataArrivo: '2091-06-10', dataPartenza: '2091-06-12', valore: 450,
    });
    expect(r.conforme).toBe(false);
  });
});

describe('verificaLimitiListino — tipo derivato', () => {
  test('legge min/max dalla regola di derivazione, non dal tipo base', async () => {
    const r = await verificaLimitiListino({
      tipoCameraId: tipoDerivatoId, trattamento: 'bb',
      dataArrivo: '2091-06-10', dataPartenza: '2091-06-11', valore: 100,
    });
    expect(r.conforme).toBe(true);
    expect(r.minimo).toBe(90);
    expect(r.massimo).toBe(150);
  });
});

describe('verificaLimitiListino — nessun limite configurato', () => {
  test('tipo camera senza righe né in tariffe né in regole_derivazione → sempre conforme', async () => {
    const db = getPool();
    const tipo = await db.query(`INSERT INTO tipi_camera (nome) VALUES ($1) RETURNING id`, [`SenzaLimiti${SUFFISSO}`]);
    const r = await verificaLimitiListino({
      tipoCameraId: tipo.rows[0].id, trattamento: 'bb',
      dataArrivo: '2091-06-10', dataPartenza: '2091-06-11', valore: 999999,
    });
    expect(r.conforme).toBe(true);
    expect(r.minimo).toBeNull();
    expect(r.massimo).toBeNull();
    await db.query('DELETE FROM tipi_camera WHERE id = $1', [tipo.rows[0].id]);
  });
});
```

- [ ] **Step 3: Eseguire il test e verificare che fallisca**

Run: `npx jest tests/api/verificaLimitiListino.test.js`
Expected: FAIL — `Cannot find module '../../backend/utils/verificaLimitiListino'`

- [ ] **Step 4: Implementare `verificaLimitiListino`**

```js
// backend/utils/verificaLimitiListino.js
// Calcola il range [minimo, massimo] dichiarato per il cartellino di un
// tipo camera, su un intervallo di notti, sommando eventuale supplemento
// trattamento — e confronta un valore (tariffa_totale) contro quel range.
// Usata dai punti di scrittura umana sulla prenotazione
// (prenotazioniController.crea/aggiungiSoggiorno, soggiorniController.aggiorna)
// — il form /tariffe fa un controllo più semplice, auto-contenuto sulla riga
// che sta salvando (vedi tariffeController.js).
//
// Un tipo camera è "madre" se non ha righe in regole_derivazione_tariffe
// (min/max diretti da `tariffe`), "derivato" altrimenti (min/max diretti
// dalla regola di derivazione — NON dal tipo base: il min/max è la
// dichiarazione del cartellino DI QUELLA tipologia, indipendente da come si
// arriva al prezzo calcolato). Stesso principio "dedotto dai dati, mai da
// un elenco fisso di nomi" già usato in frontend/app/tariffe/page.jsx.
//
// Se una notte non ha alcun min/max configurato, quella notte non contribuisce
// al range (somma solo sulle notti che HANNO un limite) — se NESSUNA notte ha
// un limite, il range è [null, null] (nessun controllo, coerente con il resto
// del codebase dove null = "nessun vincolo", mai un blocco per dati mancanti).

const pool = require('../config/db');
const { calcolaSupplementoTrattamento } = require('../controllers/tariffeController');

async function verificaLimitiListino({ tipoCameraId, trattamento, dataArrivo, dataPartenza, valore, db = pool }) {
  const regoleResult = await db.query(
    `SELECT periodo_id, prezzo_minimo, prezzo_massimo FROM regole_derivazione_tariffe WHERE tipo_camera_id = $1`,
    [tipoCameraId]
  );
  const isDerivata = regoleResult.rows.length > 0;

  const nottiResult = await db.query(
    `SELECT n.notte::date AS notte, per.id AS periodo_id
     FROM generate_series($1::date, $2::date - INTERVAL '1 day', INTERVAL '1 day') AS n(notte)
     LEFT JOIN periodi_stagionali per ON n.notte::date BETWEEN per.data_inizio AND per.data_fine
     ORDER BY n.notte`,
    [dataArrivo, dataPartenza]
  );

  let minimoTotale = null;
  let massimoTotale = null;

  if (isDerivata) {
    const perPeriodo = new Map();
    let fallback = null;
    for (const r of regoleResult.rows) {
      if (r.periodo_id === null) fallback = r;
      else perPeriodo.set(r.periodo_id, r);
    }
    for (const { periodo_id } of nottiResult.rows) {
      const regola = (periodo_id !== null && perPeriodo.get(periodo_id)) || fallback;
      if (!regola) continue;
      if (regola.prezzo_minimo !== null) minimoTotale = (minimoTotale ?? 0) + Number(regola.prezzo_minimo);
      if (regola.prezzo_massimo !== null) massimoTotale = (massimoTotale ?? 0) + Number(regola.prezzo_massimo);
    }
  } else {
    const tariffeResult = await db.query(
      `SELECT n.notte::date AS notte, t.prezzo_minimo, t.prezzo_massimo
       FROM generate_series($2::date, $3::date - INTERVAL '1 day', INTERVAL '1 day') AS n(notte)
       LEFT JOIN tariffe t
         ON t.tipo_camera_id = $1
        AND n.notte::date BETWEEN t.data_inizio AND t.data_fine
       ORDER BY n.notte`,
      [tipoCameraId, dataArrivo, dataPartenza]
    );
    for (const r of tariffeResult.rows) {
      if (r.prezzo_minimo !== null) minimoTotale = (minimoTotale ?? 0) + Number(r.prezzo_minimo);
      if (r.prezzo_massimo !== null) massimoTotale = (massimoTotale ?? 0) + Number(r.prezzo_massimo);
    }
  }

  if (trattamento && trattamento !== 'bb' && (minimoTotale !== null || massimoTotale !== null)) {
    const supplemento = await calcolaSupplementoTrattamento(tipoCameraId, dataArrivo, dataPartenza, trattamento, 2, []);
    if (minimoTotale !== null) minimoTotale = Math.round((minimoTotale + supplemento.totale) * 100) / 100;
    if (massimoTotale !== null) massimoTotale = Math.round((massimoTotale + supplemento.totale) * 100) / 100;
  }

  const conforme =
    (minimoTotale === null || Number(valore) >= minimoTotale) &&
    (massimoTotale === null || Number(valore) <= massimoTotale);

  return { conforme, minimo: minimoTotale, massimo: massimoTotale };
}

module.exports = { verificaLimitiListino };
```

Nota sul supplemento in anteprima: `calcolaSupplementoTrattamento` richiede
`adulti`/`bambiniEta` per calcolare l'importo esatto — qui si usa `adulti: 2`
come stima prudente per il solo confronto di range (il numero ospiti reale
non è sempre noto al momento del controllo). Se il titolare la trova
imprecisa in uso reale, va rivista passando il numero ospiti reale dal
chiamante (Task 4) invece di un valore fisso — annotare come possibile
follow-up, non un difetto silenzioso.

- [ ] **Step 5: Eseguire il test e verificare che passi**

Run: `npx jest tests/api/verificaLimitiListino.test.js`
Expected: PASS (richiede la migration 052 già eseguita da tab Code, Task 1 Step 2)

- [ ] **Step 6: Commit**

```bash
git add backend/utils/verificaLimitiListino.js tests/api/verificaLimitiListino.test.js backend/controllers/tariffeController.js
git commit -m "feat: aggiunge verificaLimitiListino per il confronto tariffa_totale/cartellino"
```

---

### Task 3: Alert + log su `tariffeController` (tipo madre)

**Files:**
- Modify: `backend/controllers/tariffeController.js` (`crea`, `aggiorna`, `lista`)
- Test: `tests/api/tariffe.test.js`

**Interfaces:**
- Consumes: `logAudit` da `backend/controllers/auditController.js` (firma: `logAudit(userId, azione, risorsaTipo, risorsaId, req, dettagli)`).
- Produces: `POST /api/tariffe` e `PATCH /api/tariffe/:id` accettano `prezzo_minimo`, `prezzo_massimo`, `confermato` nel body; rispondono `409 { errore, minimo, massimo, valore }` quando `prezzo_notte` è fuori dal range risultante e `confermato` non è `true`. `GET /api/tariffe` restituisce anche `prezzo_minimo`/`prezzo_massimo` per riga.

- [ ] **Step 1: Scrivere il test che fallisce**

Aggiungere a `tests/api/tariffe.test.js`, dopo il blocco `describe('GET /api/tariffe'...)`:

```js
describe('POST /api/tariffe — min/max cartellino', () => {
  test('prezzo dentro il range dichiarato → 201', async () => {
    const res = await creaTariffa(authHeader.titolare(), {
      data_inizio: '2092-01-01', data_fine: '2092-01-31',
      prezzo_notte: 150, prezzo_minimo: 100, prezzo_massimo: 200,
    });
    expect(res.status).toBe(201);
  });

  test('prezzo sopra il massimo, senza conferma → 409 con dettaglio range', async () => {
    const res = await creaTariffa(authHeader.titolare(), {
      data_inizio: '2092-02-01', data_fine: '2092-02-28',
      prezzo_notte: 250, prezzo_minimo: 100, prezzo_massimo: 200,
    });
    expect(res.status).toBe(409);
    expect(res.body.minimo).toBe(100);
    expect(res.body.massimo).toBe(200);
  });

  test('prezzo sopra il massimo, con confermato:true → 201, salvato comunque', async () => {
    const res = await creaTariffa(authHeader.titolare(), {
      data_inizio: '2092-03-01', data_fine: '2092-03-31',
      prezzo_notte: 250, prezzo_minimo: 100, prezzo_massimo: 200, confermato: true,
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.prezzo_notte)).toBe(250);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `npx jest tests/api/tariffe.test.js -t "min/max cartellino"`
Expected: FAIL — il secondo test riceve `201` invece di `409` (nessun controllo ancora implementato)

- [ ] **Step 3: Implementare il controllo in `crea`**

In `backend/controllers/tariffeController.js`, sostituire la funzione `crea`:

```js
async function crea(req, res) {
  const { tipo_camera_id, nome_stagione, data_inizio, data_fine, prezzo_notte, periodo_id, prezzo_minimo, prezzo_massimo, confermato } = req.body;
  if (!tipo_camera_id || !data_inizio || !data_fine || !prezzo_notte) {
    return res.status(400).json({ error: 'tipo_camera_id, data_inizio, data_fine e prezzo_notte sono obbligatori.' });
  }
  if (data_fine < data_inizio) {
    return res.status(400).json({ error: 'data_fine deve essere successiva o uguale a data_inizio.' });
  }
  if (Number(prezzo_notte) <= 0) {
    return res.status(400).json({ error: 'Il prezzo per notte deve essere maggiore di zero.' });
  }

  const min = prezzo_minimo === undefined || prezzo_minimo === null || prezzo_minimo === '' ? null : Number(prezzo_minimo);
  const max = prezzo_massimo === undefined || prezzo_massimo === null || prezzo_massimo === '' ? null : Number(prezzo_massimo);
  const fuoriRange = (min !== null && Number(prezzo_notte) < min) || (max !== null && Number(prezzo_notte) > max);
  if (fuoriRange && !confermato) {
    return res.status(409).json({
      errore: 'Il prezzo esce dal min/max dichiarato per il cartellino.',
      minimo: min, massimo: max, valore: Number(prezzo_notte),
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tariffe (tipo_camera_id, nome_stagione, data_inizio, data_fine, prezzo_notte, periodo_id, prezzo_minimo, prezzo_massimo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [tipo_camera_id, nome_stagione || null, data_inizio, data_fine, prezzo_notte, periodo_id || null, min, max]
    );
    if (fuoriRange) {
      await logAudit(req.utente.id, 'override_limite_listino', 'tariffe', result.rows[0].id, req, {
        valore_inserito: Number(prezzo_notte), minimo: min, massimo: max,
      });
    }
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23P01') {
      return res.status(409).json({ error: 'Le date si sovrappongono a una fascia tariffaria già esistente per questo tipo camera.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Tipo camera non valido.' });
    }
    console.error('crea tariffa error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}
```

Aggiungere l'import in cima al file (dopo `const pool = require('../config/db');`):

```js
const { logAudit } = require('./auditController');
```

Aggiornare anche `aggiorna` con lo stesso controllo (i valori correnti di
`prezzo_notte`/`prezzo_minimo`/`prezzo_massimo` vanno letti dalla riga
esistente quando non passati nel body, poi confrontati prima dell'`UPDATE`):

```js
async function aggiorna(req, res) {
  const { nome_stagione, data_inizio, data_fine, prezzo_notte, periodo_id, prezzo_minimo, prezzo_massimo, confermato } = req.body;
  try {
    const attuale = await pool.query('SELECT prezzo_notte, prezzo_minimo, prezzo_massimo FROM tariffe WHERE id = $1', [req.params.id]);
    if (!attuale.rows.length) {
      return res.status(404).json({ error: 'Fascia tariffaria non trovata.' });
    }
    const prezzoFinale = prezzo_notte !== undefined && prezzo_notte !== null ? Number(prezzo_notte) : Number(attuale.rows[0].prezzo_notte);
    const min = prezzo_minimo !== undefined ? (prezzo_minimo === null || prezzo_minimo === '' ? null : Number(prezzo_minimo)) : (attuale.rows[0].prezzo_minimo !== null ? Number(attuale.rows[0].prezzo_minimo) : null);
    const max = prezzo_massimo !== undefined ? (prezzo_massimo === null || prezzo_massimo === '' ? null : Number(prezzo_massimo)) : (attuale.rows[0].prezzo_massimo !== null ? Number(attuale.rows[0].prezzo_massimo) : null);
    const fuoriRange = (min !== null && prezzoFinale < min) || (max !== null && prezzoFinale > max);
    if (fuoriRange && !confermato) {
      return res.status(409).json({
        errore: 'Il prezzo esce dal min/max dichiarato per il cartellino.',
        minimo: min, massimo: max, valore: prezzoFinale,
      });
    }

    const result = await pool.query(
      `UPDATE tariffe
       SET nome_stagione  = COALESCE($2, nome_stagione),
           data_inizio    = COALESCE($3, data_inizio),
           data_fine      = COALESCE($4, data_fine),
           prezzo_notte   = COALESCE($5, prezzo_notte),
           periodo_id     = CASE WHEN $6 THEN periodo_id ELSE $7 END,
           prezzo_minimo  = CASE WHEN $8 THEN prezzo_minimo ELSE $9 END,
           prezzo_massimo = CASE WHEN $10 THEN prezzo_massimo ELSE $11 END,
           updated_at     = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, nome_stagione || null, data_inizio || null, data_fine || null, prezzo_notte || null,
       periodo_id === undefined, periodo_id === undefined ? null : periodo_id,
       prezzo_minimo === undefined, prezzo_minimo === undefined ? null : (prezzo_minimo === '' ? null : prezzo_minimo),
       prezzo_massimo === undefined, prezzo_massimo === undefined ? null : (prezzo_massimo === '' ? null : prezzo_massimo)]
    );
    if (fuoriRange) {
      await logAudit(req.utente.id, 'override_limite_listino', 'tariffe', req.params.id, req, {
        valore_inserito: prezzoFinale, minimo: min, massimo: max,
      });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23P01') {
      return res.status(409).json({ error: 'Le date si sovrappongono a una fascia tariffaria già esistente per questo tipo camera.' });
    }
    console.error('aggiorna tariffa error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}
```

Aggiornare anche `lista`: la query `SELECT` va estesa con
`t.prezzo_minimo, t.prezzo_massimo` nell'elenco colonne — necessario al
frontend (Task 5) per mostrare i valori esistenti.

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `npx jest tests/api/tariffe.test.js`
Expected: PASS (tutti i test del file, non solo quelli nuovi — verificare di non aver rotto niente)

- [ ] **Step 5: Commit**

```bash
git add backend/controllers/tariffeController.js tests/api/tariffe.test.js
git commit -m "feat: alert bloccante-superabile su min/max cartellino in POST/PATCH /api/tariffe"
```

---

### Task 4: Alert + log su `tariffa_totale` (prenotazione)

**Files:**
- Modify: `backend/controllers/prenotazioniController.js` (`crea`, `aggiungiSoggiorno`)
- Modify: `backend/controllers/soggiorniController.js` (`aggiorna`)
- Test: `tests/api/prenotazioni.test.js`, `tests/api/soggiorni.test.js` (verificare i nomi esatti dei file esistenti — se non esistono con questo nome, crearli seguendo lo stile di `tests/api/tariffe.test.js`)

**Interfaces:**
- Consumes: `verificaLimitiListino` da `../utils/verificaLimitiListino` (Task 2); `logAudit` da `./auditController`.
- Produces: `POST /api/prenotazioni`, `POST /api/prenotazioni/:id/soggiorni` accettano `soggiorno.confermato`; `PATCH /api/soggiorni/:id` accetta `confermato` a livello body. Tutti e tre rispondono `409 { errore, minimo, massimo, valore }` quando `tariffa_totale` è fuori range per quella camera/date/trattamento e non è confermato.

- [ ] **Step 1: Scrivere il test che fallisce (per `POST /api/prenotazioni`)**

Il setup esatto (creazione di camera/tipo_camera/ospite di test) va scritto
seguendo il pattern già in uso nel file di test esistente per
`POST /api/prenotazioni` — leggerlo per riusare gli stessi helper, non
duplicare setup già presente. Aggiungere:

```js
test('tariffa_totale sopra il massimo dichiarato, senza conferma → 409', async () => {
  const res = await request(app)
    .post('/api/prenotazioni')
    .set(authHeader.receptionist())
    .send({
      canale_origine: 'diretta',
      soggiorno: {
        camera_id: cameraTestId, ospite_id: ospiteTestId,
        data_arrivo: '2093-01-10', data_partenza: '2093-01-12',
        tariffa_totale: 999999,
      },
    });
  expect(res.status).toBe(409);
  expect(res.body).toHaveProperty('minimo');
  expect(res.body).toHaveProperty('massimo');
});

test('tariffa_totale sopra il massimo, con confermato:true → 201', async () => {
  const res = await request(app)
    .post('/api/prenotazioni')
    .set(authHeader.receptionist())
    .send({
      canale_origine: 'diretta',
      soggiorno: {
        camera_id: cameraTestId, ospite_id: ospiteTestId,
        data_arrivo: '2093-02-10', data_partenza: '2093-02-12',
        tariffa_totale: 999999, confermato: true,
      },
    });
  expect(res.status).toBe(201);
});

test('tariffa_totale non passata → nessun controllo, 201', async () => {
  const res = await request(app)
    .post('/api/prenotazioni')
    .set(authHeader.receptionist())
    .send({
      canale_origine: 'diretta',
      soggiorno: {
        camera_id: cameraTestId, ospite_id: ospiteTestId,
        data_arrivo: '2093-03-10', data_partenza: '2093-03-12',
      },
    });
  expect(res.status).toBe(201);
});
```

`cameraTestId` deve riferirsi a una camera il cui `tipo_camera_id` ha una
riga in `tariffe` con `prezzo_minimo`/`prezzo_massimo` bassi per il
periodo/date del test (stesso pattern di setup del Task 2 Step 2, ma tramite
la tabella `camere` — vedi schema in `database/migrations` per la colonna
`tipo_camera_id` di `camere`, non assunta qui).

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `npx jest tests/api/prenotazioni.test.js -t "tariffa_totale"`
Expected: FAIL — il primo test riceve `201` invece di `409`

- [ ] **Step 3: Implementare il controllo in `prenotazioniController.crea`**

In `backend/controllers/prenotazioniController.js`, dentro `crea`, subito
dopo `await client.query('BEGIN');` e PRIMA dell'`INSERT INTO prenotazioni`:

```js
    if (soggiorno.tariffa_totale) {
      const cameraInfo = await client.query('SELECT tipo_camera_id FROM camere WHERE id = $1', [soggiorno.camera_id]);
      if (cameraInfo.rows.length && cameraInfo.rows[0].tipo_camera_id) {
        const limiti = await verificaLimitiListino({
          tipoCameraId: cameraInfo.rows[0].tipo_camera_id,
          trattamento: soggiorno.trattamento || 'bb',
          dataArrivo: soggiorno.data_arrivo, dataPartenza: soggiorno.data_partenza,
          valore: soggiorno.tariffa_totale, db: client,
        });
        if (!limiti.conforme && !soggiorno.confermato) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            errore: 'La tariffa esce dal min/max dichiarato per il cartellino.',
            minimo: limiti.minimo, massimo: limiti.massimo, valore: Number(soggiorno.tariffa_totale),
          });
        }
      }
    }
```

Dopo l'`INSERT INTO soggiorni` (che assegna `soggiornoResult`), prima del
`COMMIT`, loggare l'eventuale override riusando lo stesso controllo (per
avere `risorsa_id` reale invece di ripetere la query, salvare il risultato
di `limiti`/`cameraInfo` in una variabile dichiarata prima del blocco sopra
con `let limiti = null;` e leggerla qui):

```js
    if (limiti && !limiti.conforme) {
      await logAudit(req.utente.id, 'override_limite_listino', 'soggiorni', soggiornoResult.rows[0].id, req, {
        valore_inserito: Number(soggiorno.tariffa_totale), minimo: limiti.minimo, massimo: limiti.massimo,
      });
    }
```

Applicare lo stesso blocco (adattato: `req.params.id` al posto della
`prenotazione` appena creata) in `aggiungiSoggiorno`.

Importare in cima al file: `const { verificaLimitiListino } = require('../utils/verificaLimitiListino');`
e `const { logAudit } = require('./auditController');` (verificare se già
presente prima di duplicare l'import).

- [ ] **Step 4: Implementare il controllo in `soggiorniController.aggiorna`**

Il controllo scatta solo se `tariffa_totale` è tra i campi passati nel body
(non su ogni PATCH che sposta solo `camera_id`/date dal drag-and-drop del
planning). Serve il `tipo_camera_id` della camera EFFETTIVA del soggiorno
dopo l'eventuale cambio — se `camera_id` non è passato, va letto quello
attuale dal soggiorno esistente:

```js
async function aggiorna(req, res) {
  const { camera_id, data_arrivo, data_partenza, tariffa_totale, confermato } = req.body;
  if (data_arrivo && data_partenza && data_partenza <= data_arrivo) {
    return res.status(400).json({ error: 'data_partenza deve essere successiva a data_arrivo.' });
  }

  try {
    let limiti = null;
    if (tariffa_totale) {
      const attuale = await pool.query('SELECT camera_id, data_arrivo, data_partenza, trattamento FROM soggiorni WHERE id = $1', [req.params.id]);
      if (!attuale.rows.length) {
        return res.status(404).json({ error: 'Soggiorno non trovato' });
      }
      const cameraIdEffettiva = camera_id || attuale.rows[0].camera_id;
      const cameraInfo = await pool.query('SELECT tipo_camera_id FROM camere WHERE id = $1', [cameraIdEffettiva]);
      if (cameraInfo.rows.length && cameraInfo.rows[0].tipo_camera_id) {
        limiti = await verificaLimitiListino({
          tipoCameraId: cameraInfo.rows[0].tipo_camera_id,
          trattamento: attuale.rows[0].trattamento || 'bb',
          dataArrivo: data_arrivo || attuale.rows[0].data_arrivo,
          dataPartenza: data_partenza || attuale.rows[0].data_partenza,
          valore: tariffa_totale,
        });
        if (!limiti.conforme && !confermato) {
          return res.status(409).json({
            errore: 'La tariffa esce dal min/max dichiarato per il cartellino.',
            minimo: limiti.minimo, massimo: limiti.massimo, valore: Number(tariffa_totale),
          });
        }
      }
    }

    const result = await pool.query(
      `UPDATE soggiorni SET
         camera_id      = COALESCE($1, camera_id),
         data_arrivo    = COALESCE($2, data_arrivo),
         data_partenza  = COALESCE($3, data_partenza),
         tariffa_totale = COALESCE($4, tariffa_totale),
         updated_at     = NOW()
       WHERE id = $5
       RETURNING *`,
      [camera_id || null, data_arrivo || null, data_partenza || null, tariffa_totale ?? null, req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Soggiorno non trovato' });
    }
    if (limiti && !limiti.conforme) {
      await logAudit(req.utente.id, 'override_limite_listino', 'soggiorni', req.params.id, req, {
        valore_inserito: Number(tariffa_totale), minimo: limiti.minimo, massimo: limiti.massimo,
      });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (gestisciConflittoCamera(err, res)) return;
    console.error('aggiorna soggiorno error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}
```

Importare in cima a `soggiorniController.js`:
`const { verificaLimitiListino } = require('../utils/verificaLimitiListino');`
e `const { logAudit } = require('./auditController');`.

- [ ] **Step 5: Scrivere il test per `PATCH /api/soggiorni/:id`**

Stesso schema del Task 3 Step 1: un soggiorno esistente, `PATCH` con
`tariffa_totale` fuori range → `409`; con `confermato: true` → `200`; `PATCH`
che tocca solo `camera_id` (drag-and-drop) senza `tariffa_totale` → nessun
controllo, comportamento invariato.

- [ ] **Step 6: Eseguire tutti i test e verificare che passino**

Run: `npx jest tests/api/prenotazioni.test.js tests/api/soggiorni.test.js`
Expected: PASS (intere suite, non solo i test nuovi)

- [ ] **Step 7: Commit**

```bash
git add backend/controllers/prenotazioniController.js backend/controllers/soggiorniController.js tests/api/prenotazioni.test.js tests/api/soggiorni.test.js
git commit -m "feat: alert bloccante-superabile su min/max cartellino in creazione/modifica prenotazione"
```

---

### Task 5: Frontend — campi min/max e gestione 409 in `/tariffe`

**Files:**
- Modify: `frontend/components/tariffe/SchedaPrezzoTipologia.jsx`

**Interfaces:**
- Consumes: risposta `409 { errore, minimo, massimo, valore }` da `POST/PATCH /api/tariffe` (Task 3).
- Produces: due nuovi campi numerici "Min cartellino"/"Max cartellino" nel form del tipo madre (oggi assenti, il tipo derivato li ha già ma non vanno toccati — restano fuori scope, Task 4 dell'architettura non tocca `regole_derivazione_tariffe`); gestione del `409` con conferma esplicita dell'utente prima di re-inviare con `confermato: true`.

- [ ] **Step 1: Aggiungere i campi min/max al form del tipo madre**

Nel blocco `{!isDerivata ? ( ... )}` (il ramo "madre", oggi solo
`nomeStagione` + `prezzoNotte`, righe ~245-250), aggiungere due input
numerici per due nuovi stati `prezzoMinimo`/`prezzoMassimo`. Aggiungere i
due `useState` (accanto a `prezzoNotte`, riga 60) e la lettura da
`valoreEsistente` nello `useEffect` esistente (righe 71-80), ramo `else`
(oggi solo `prezzoNotte`/`nomeStagione`):

```js
    } else {
      setPrezzoNotte(valoreEsistente ? String(valoreEsistente.prezzo_notte) : '');
      setPrezzoMinimoMadre(valoreEsistente?.prezzo_minimo != null ? String(valoreEsistente.prezzo_minimo) : '');
      setPrezzoMassimoMadre(valoreEsistente?.prezzo_massimo != null ? String(valoreEsistente.prezzo_massimo) : '');
      setNomeStagione(valoreEsistente?.nome_stagione ?? (periodoAttivo ? periodoAttivo.nome : ''));
    }
```

(nomi `prezzoMinimoMadre`/`prezzoMassimoMadre` per non collidere con gli
stati già esistenti `prezzoMinimo`/`prezzoMassimo` del ramo derivato più
sopra nello stesso componente).

- [ ] **Step 2: Gestire la risposta 409 in `salvaMadre`**

```js
  async function salvaMadre(confermato = false) {
    if (!periodoAttivo) return onErrore('Seleziona o crea un periodo per impostare il prezzo.');
    if (prezzoNotte === '' || Number(prezzoNotte) <= 0) return onErrore('Il prezzo per notte deve essere maggiore di zero.');
    setSalvataggio(true);
    try {
      const body = {
        tipo_camera_id: tipo.id,
        nome_stagione: nomeStagione || periodoAttivo.nome,
        data_inizio: periodoAttivo.data_inizio,
        data_fine: periodoAttivo.data_fine,
        prezzo_notte: Number(prezzoNotte),
        periodo_id: periodoAttivo.id,
        prezzo_minimo: prezzoMinimoMadre === '' ? null : Number(prezzoMinimoMadre),
        prezzo_massimo: prezzoMassimoMadre === '' ? null : Number(prezzoMassimoMadre),
        confermato,
      };
      if (valoreEsistente) await api.patch(`/tariffe/${valoreEsistente.id}`, body);
      else await api.post('/tariffe', body);
      onCambiato();
    } catch (err) {
      if (err.response?.status === 409) {
        const { minimo, massimo, valore } = err.response.data;
        if (confirm(`Il prezzo ${valore}€ esce dal range dichiarato (${minimo ?? '—'}–${massimo ?? '—'}€). Confermi comunque?`)) {
          return salvaMadre(true);
        }
        return;
      }
      onErrore(err.message || 'Errore nel salvataggio del prezzo.');
    } finally {
      setSalvataggio(false);
    }
  }
```

Aggiornare il bottone "Salva" del ramo madre (oggi chiama `salvaMadre` senza
argomenti — resta compatibile, `confermato` ha default `false`).

- [ ] **Step 3: Verifica sintassi**

Run: `cd frontend && npx esbuild components/tariffe/SchedaPrezzoTipologia.jsx --bundle --jsx=automatic --outfile=/tmp/check.js --external:react --external:react-dom --external:next/* --external:@/*`
Expected: nessun errore, solo warning eventuali su moduli esterni non risolti (attesi, sono externalizzati)

- [ ] **Step 4: Segnalare la verifica visiva mancante**

Nessun controllo a video possibile da questo ambiente Cowork: il flusso
409 → `confirm()` → nuovo salvataggio va provato da tab Code su dati reali
prima di considerare il task chiuso, in particolare il caso "utente annulla
il confirm" (nessuna richiesta ripetuta, nessun dato perso dal form).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/tariffe/SchedaPrezzoTipologia.jsx
git commit -m "feat: campi min/max cartellino e conferma override per il tipo madre in /tariffe"
```

---

### Task 6: Frontend — alert su `tariffaTotale` in "Nuova prenotazione"

**Files:**
- Modify: `frontend/app/planning-camere/page.jsx` (le tre funzioni di submit che usano `tariffaTotale`/`aggiuntaTariffa` — righe 1842, 2291, 3010, individuate leggendo il file: `WizardGruppo`-simile per famiglia già esistente, `FormNuovaPrenotazione`, e il flusso "aggiungi camera" a prenotazione esistente)

**Interfaces:**
- Consumes: risposta `409 { errore, minimo, massimo, valore }` da `POST /api/prenotazioni` (Task 4).

- [ ] **Step 1: Leggere per intero le tre funzioni di submit**

Le righe 1842, 2291, 3010 (viste in sessione di design via grep su
`tariffaTotale`/`api.post('/prenotazioni'`) sono punti di partenza, non la
funzione completa — leggere ciascuna funzione per intero prima di
modificarla, dato che le tre non sono garantite identiche (una è dentro il
flusso "famiglia multi-camera", una nel form standard, una nel wizard
gruppo).

- [ ] **Step 2: Aggiungere la gestione del 409, stesso pattern del Task 5**

Per ciascuna delle tre funzioni di submit, avvolgere la chiamata
`api.post('/prenotazioni', ...)` con lo stesso pattern try/catch +
`confirm()` + retry con `confermato: true` dentro l'oggetto `soggiorno`
usato nel Task 5 — la funzione di submit stessa prende un parametro
`confermato = false` per permettere il retry ricorsivo, esattamente come
`salvaMadre(confermato = false)`.

- [ ] **Step 3: Verifica sintassi**

Run: `cd frontend && npx esbuild app/planning-camere/page.jsx --bundle --jsx=automatic --outfile=/tmp/check2.js --external:react --external:react-dom --external:next/* --external:@/*`
Expected: nessun errore

- [ ] **Step 4: Segnalare la verifica visiva mancante**

Stesso disclaimer del Task 5 Step 4 — tre punti diversi da provare a video
da tab Code, non solo uno.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/planning-camere/page.jsx
git commit -m "feat: alert bloccante-superabile su tariffa_totale fuori listino in Nuova prenotazione"
```

---

## Verifica finale (da tab Code, non eseguibile da questo ambiente Cowork)

- Eseguire la migration 052 su un DB reale (o di test) prima di qualunque test Jest che tocchi `tariffe.prezzo_minimo`/`prezzo_massimo`.
- Eseguire `npx jest` sull'intera suite (non solo i file toccati) per escludere regressioni sui test esistenti di `tariffe`, `prenotazioni`, `soggiorni`.
- Provare a video, con dati reali: (a) salvataggio di un prezzo fuori range in `/tariffe` per un tipo madre, verificando sia il blocco iniziale sia il salvataggio dopo conferma; (b) lo stesso flusso sulla form "Nuova prenotazione", "aggiungi camera" e sul drag-and-drop del planning quando modifica anche `tariffa_totale`; (c) una riga in `audit_log` con `azione = 'override_limite_listino'` dopo ciascun override confermato.
- Confermare che il salvataggio di una regola di derivazione (`/tariffe` ramo tipo derivato) resti invariato, senza alcun alert — comportamento voluto, non una regressione.
- Aggiornare `docs/DIARIO_SESSIONI.md` e `STATO_PROGETTO.md` con l'esito reale di questa verifica, non solo con l'esito di `node -c`/`esbuild` — coerente con la convenzione già in uso nel resto del progetto.
