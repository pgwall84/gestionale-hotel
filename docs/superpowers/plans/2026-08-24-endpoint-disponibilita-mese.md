# Endpoint disponibilità mensile aggregata — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere `GET /api/booking-pubblico/disponibilita-mese`, un endpoint pubblico che restituisce, per ogni notte di un mese richiesto, se almeno una tipologia camera ha posto e capienza sufficiente — dato aggregato (booleano), non prezzo, per alimentare il nuovo calendario del date-range picker in `sito-hotel`.

**Architecture:** Una sola query SQL con `generate_series` sulle notti del mese richiesto, ognuna correlata a un `EXISTS` che riusa esattamente il pattern inventario/capienza già presente in `disponibilita()` (`bookingPubblicoController.js`) — stesso schema `tipi_camera`/`tipi_camera_camere`/`camere`/`soggiorni`, stesso operatore `daterange`. Nessuna chiamata a `calcolaTariffaPerTrattamentiConPlanning`: questo endpoint non calcola prezzi.

**Tech Stack:** Node/Express, `pg` (query parametrizzate), Jest + Supertest (test contro un DB Postgres reale, non eseguibile da Cowork).

## Global Constraints

- Riuso letterale del pattern SQL EXISTS di `disponibilita()` (righe già verificate in `bookingPubblicoController.js`) — non reinventare la logica di inventario/capienza.
- Nessun calcolo di prezzo o derivazione tariffe in questo endpoint (fuori scope per design, vedi `sito-hotel/docs/superpowers/specs/2026-08-24-date-range-picker-design.md`).
- Endpoint pubblico, stesso trattamento di `disponibilita()`: nessuna autenticazione, stesso middleware CORS + rate limit già montato in `backend/routes/bookingPubblico.js` (nessuna modifica a quel middleware).
- **Mai `git` da Cowork.** Se questo piano viene eseguito da una sessione Cowork, i passi "commit" sotto vanno saltati: la consegna avviene via `SendUserFile` + `device_commit_files`, il titolare esegue i commit reali dal "tab Code". Se invece il piano viene eseguito dal tab Code (locale), i comandi git indicati vanno eseguiti normalmente.
- Nessun accesso DB, nessuna esecuzione Jest reale possibile da una sessione Cowork — solo `node -c` come controllo sintattico. Chi esegue da Cowork deve dichiararlo esplicitamente nel task di documentazione (Task 2) invece di affermare che i test sono stati eseguiti.
- Un solo task di implementazione (Task 1): il titolare ha chiesto esplicitamente "un passo alla volta con controllo visivo su ogni passaggio" — per un endpoint backend coeso il checkpoint naturale è "la risposta HTTP dell'endpoint, verificata con curl/Postman/i nuovi test", non una frammentazione in micro-task che nessuno rivede singolarmente.

---

## File Structure

- **Modifica:** `backend/controllers/bookingPubblicoController.js` — nuova funzione `disponibilitaMese(req, res)`, esportata in `module.exports`.
- **Modifica:** `backend/routes/bookingPubblico.js` — nuova route `GET /disponibilita-mese`, registrata dopo `/disponibilita`, dentro lo stesso middleware CORS/rate-limit già montato con `router.use(...)` (nessuna modifica a quelle righe).
- **Modifica (test):** `tests/api/bookingPubblico.test.js` — nuovo blocco `describe('GET /api/booking-pubblico/disponibilita-mese', ...)`, stesso file dei test esistenti per questo controller (segue la convenzione già in uso: un solo file di test per `bookingPubblicoController.js`).
- **Modifica:** `docs/DIARIO_SESSIONI.md` + `STATO_PROGETTO.md` — voce di chiusura (Task 2).

---

## Task 1: Implementare `disponibilitaMese` + route + test

**Files:**
- Modify: `backend/controllers/bookingPubblicoController.js`
- Modify: `backend/routes/bookingPubblico.js`
- Test: `tests/api/bookingPubblico.test.js`

**Interfaces:**
- Consumes: `normalizzaComposizioneOspiti(adultiInput, bambiniEtaInput)` — già definita in questo stesso file, righe iniziali (`{ adulti, bambiniEta, totaleOspiti, ospitiChePesanoSuCapienza }`).
- Produces: `disponibilitaMese(req, res)`, esportata da `bookingPubblicoController.js`. Contratto HTTP: `GET /api/booking-pubblico/disponibilita-mese?anno=2099&mese=7&adulti=2&bambini_eta=5,8` → `200 { "disponibilita": { "2099-07-01": true, "2099-07-02": false, ... } }` (una chiave per ogni notte del mese, formato `YYYY-MM-DD`) oppure `400 { "error": "..." }` se `anno`/`mese` mancano o non validi.

### Step 1: Scrivere il test che guida l'implementazione (fallirà: la funzione/route non esistono ancora)

Aggiungere in `tests/api/bookingPubblico.test.js`, subito dopo il blocco `describe('GET /api/booking-pubblico/configurazione', ...)` (righe 93-99 attuali) e prima di `describe('POST /api/booking-pubblico/prenota', ...)`:

```js
// Endpoint disponibilità mensile aggregata (24/08/2026) — alimenta il nuovo
// calendario OTA-style del date-range picker in sito-hotel. Aggregato su
// TUTTE le tipologie attive (non filtrabile per tipo_camera_id nella
// risposta, per design — vedi
// sito-hotel/docs/superpowers/specs/2026-08-24-date-range-picker-design.md):
// le asserzioni "false" sotto usano adulti:20 per restare valide anche se
// nel DB di test esistono altre tipologie attive con capienza inferiore a
// 20 (assunzione ragionevole per un hotel come questo, non verificabile da
// questa sessione Cowork senza accesso al DB).
describe('GET /api/booking-pubblico/disponibilita-mese', () => {
  let tipoMeseId, cameraMeseId;
  const prenotazioniMese = [];

  beforeAll(async () => {
    const db = getPool();
    const tipo = await db.query(
      `INSERT INTO tipi_camera (nome, capienza_max) VALUES ($1, 2) RETURNING id`,
      [`TestDispMese${SUFFISSO}`]
    );
    tipoMeseId = tipo.rows[0].id;
    const camera = await db.query(
      `INSERT INTO camere (numero, nome, piano, attivo) VALUES ($1, 'Camera Test Disponibilita Mese', 9, true) RETURNING id`,
      [`TEST-DM${SUFFISSO}`]
    );
    cameraMeseId = camera.rows[0].id;
    await db.query(
      `INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id) VALUES ($1, $2)`,
      [tipoMeseId, cameraMeseId]
    );
    await db.query(
      `INSERT INTO tariffe (tipo_camera_id, nome_stagione, data_inizio, data_fine, prezzo_notte) VALUES ($1, 'Test', '2099-01-01', '2099-12-31', 90)`,
      [tipoMeseId]
    );
  });

  afterAll(async () => {
    const db = getPool();
    if (prenotazioniMese.length) {
      await db.query('DELETE FROM pagamenti WHERE prenotazione_id = ANY($1)', [prenotazioniMese]);
      await db.query('DELETE FROM soggiorno_ospiti WHERE soggiorno_id IN (SELECT id FROM soggiorni WHERE prenotazione_id = ANY($1))', [prenotazioniMese]);
      await db.query('DELETE FROM soggiorni WHERE prenotazione_id = ANY($1)', [prenotazioniMese]);
      await db.query('DELETE FROM prenotazioni WHERE id = ANY($1)', [prenotazioniMese]);
    }
    await db.query('DELETE FROM tipi_camera_camere WHERE tipo_camera_id = $1', [tipoMeseId]);
    await db.query('DELETE FROM tariffe WHERE tipo_camera_id = $1', [tipoMeseId]);
    await db.query('DELETE FROM camere WHERE id = $1', [cameraMeseId]);
    await db.query('DELETE FROM tipi_camera WHERE id = $1', [tipoMeseId]);
  });

  test('400 se anno o mese mancano o non validi', async () => {
    const senzaParam = await request(app).get('/api/booking-pubblico/disponibilita-mese').query({ mese: 6 });
    expect(senzaParam.status).toBe(400);

    const meseFuoriRange = await request(app).get('/api/booking-pubblico/disponibilita-mese').query({ anno: 2099, mese: 13 });
    expect(meseFuoriRange.status).toBe(400);
  });

  test('un mese senza prenotazioni: le notti risultano disponibili grazie alla tipologia di test', async () => {
    const res = await request(app)
      .get('/api/booking-pubblico/disponibilita-mese')
      .query({ anno: 2099, mese: 6, adulti: 2 });

    expect(res.status).toBe(200);
    expect(res.body.disponibilita['2099-06-01']).toBe(true);
    expect(res.body.disponibilita['2099-06-30']).toBe(true);
    expect(Object.keys(res.body.disponibilita).length).toBe(30); // giugno ha 30 giorni
  });

  test('una notte prenotata sulla camera di test risulta non disponibile, il checkout resta libero', async () => {
    const prenotazione = await request(app).post('/api/booking-pubblico/prenota').send({
      tipo_camera_id: tipoMeseId, data_arrivo: '2099-07-10', data_partenza: '2099-07-12',
      nome: 'DispMese', cognome: 'Test', email: `dispmese${SUFFISSO}@example.com`,
    });
    expect(prenotazione.status).toBe(201);
    prenotazioniMese.push(prenotazione.body.prenotazione_id);

    const res = await request(app)
      .get('/api/booking-pubblico/disponibilita-mese')
      .query({ anno: 2099, mese: 7, adulti: 2 });

    expect(res.status).toBe(200);
    // Notti occupate: 10 e 11 luglio. Il 12 è il giorno di checkout — la
    // notte del 12 (arrivo di un altro ospite) resta libera, stessa
    // semantica '[)' già usata in disponibilita().
    expect(res.body.disponibilita['2099-07-10']).toBe(false);
    expect(res.body.disponibilita['2099-07-11']).toBe(false);
    expect(res.body.disponibilita['2099-07-12']).toBe(true);
    expect(res.body.disponibilita['2099-07-01']).toBe(true);
  });

  test('capienza richiesta irrealisticamente alta: nessuna tipologia soddisfa, notte non disponibile', async () => {
    const res = await request(app)
      .get('/api/booking-pubblico/disponibilita-mese')
      .query({ anno: 2099, mese: 8, adulti: 20 });

    expect(res.status).toBe(200);
    expect(res.body.disponibilita['2099-08-15']).toBe(false);
  });
});
```

### Step 2: Eseguire il test e verificare che fallisca

Da locale (non da Cowork):
```bash
npx jest tests/api/bookingPubblico.test.js -t "disponibilita-mese" --verbose
```
Atteso: FAIL — la route `/disponibilita-mese` non esiste ancora, tutte le chiamate ritornano 404 invece dei codici attesi.

### Step 3: Implementare `disponibilitaMese` nel controller

In `backend/controllers/bookingPubblicoController.js`, aggiungere questa funzione subito dopo `disponibilita` (dopo la chiusura della funzione esistente, prima di `prenota`):

```js
// Disponibilità mensile aggregata (24/08/2026) — alimenta il calendario
// OTA-style del date-range picker in sito-hotel. Riusa lo stesso pattern
// EXISTS inventario/capienza di disponibilita() sopra, ma UNA query sola
// su generate_series invece di N chiamate, e NESSUN calcolo prezzo/
// derivazione: per design, non tiene conto delle restrizioni di
// planning-tariffe (min_stay/chiuso_arrivo/chiuso_partenza/stop_sell), che
// sono per tipo_camera+trattamento e qui il trattamento non è ancora
// scelto — vedi
// sito-hotel/docs/superpowers/specs/2026-08-24-date-range-picker-design.md.
async function disponibilitaMese(req, res) {
  const { anno, mese, adulti, bambini_eta } = req.query;
  const annoNum = parseInt(anno, 10);
  const meseNum = parseInt(mese, 10);

  if (!Number.isInteger(annoNum) || annoNum < 2020 || annoNum > 2100) {
    return res.status(400).json({ error: 'anno non valido.' });
  }
  if (!Number.isInteger(meseNum) || meseNum < 1 || meseNum > 12) {
    return res.status(400).json({ error: 'mese non valido (1-12).' });
  }

  const { ospitiChePesanoSuCapienza } = normalizzaComposizioneOspiti(adulti, bambini_eta);

  const primoGiorno = `${annoNum}-${String(meseNum).padStart(2, '0')}-01`;
  const meseSuccessivo = meseNum === 12 ? 1 : meseNum + 1;
  const annoMeseSuccessivo = meseNum === 12 ? annoNum + 1 : annoNum;
  const primoGiornoMeseSuccessivo = `${annoMeseSuccessivo}-${String(meseSuccessivo).padStart(2, '0')}-01`;

  try {
    const result = await pool.query(
      `SELECT
         notte::date::text AS notte,
         EXISTS (
           SELECT 1
           FROM tipi_camera tc
           WHERE tc.attivo = true
             AND (tc.capienza_max IS NULL OR tc.capienza_max >= $3)
             AND EXISTS (
               SELECT 1 FROM tipi_camera_camere tcc
               JOIN camere c ON c.id = tcc.camera_id
               WHERE tcc.tipo_camera_id = tc.id AND c.attivo = true
                 AND NOT EXISTS (
                   SELECT 1 FROM soggiorni s
                   WHERE s.camera_id = c.id AND s.cancellato = false
                     AND daterange(s.data_arrivo, s.data_partenza, '[)') @> notte::date
                 )
             )
         ) AS disponibile
       FROM generate_series($1::date, ($2::date - INTERVAL '1 day'), INTERVAL '1 day') AS notte
       ORDER BY notte`,
      [primoGiorno, primoGiornoMeseSuccessivo, ospitiChePesanoSuCapienza]
    );

    const disponibilita = {};
    result.rows.forEach((r) => { disponibilita[r.notte] = r.disponibile; });
    res.json({ disponibilita });
  } catch (err) {
    console.error('Errore disponibilitaMese:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
}
```

Aggiungere `disponibilitaMese` all'oggetto `module.exports` in fondo al file (accanto a `disponibilita, prenota, terminiCancellazione, configurazione, ...`).

### Step 4: Registrare la route

In `backend/routes/bookingPubblico.js`, aggiungere subito dopo `router.get('/disponibilita', ctrl.disponibilita);`:

```js
router.get('/disponibilita-mese', ctrl.disponibilitaMese);
```

Nessun'altra modifica al file: resta dentro lo stesso `router.use(cors(...))` e `router.use(bookingRateLimit)` già montati sopra.

**Nota da segnalare al titolare, non silenziare:** il rate limit condiviso è 30 richieste/15 minuti in produzione (`max: process.env.NODE_ENV === 'test' ? 1000 : 30`) — un calendario che ricarica ad ogni cambio di mese/occupazione può avvicinarsi a questo limite più in fretta di quanto facesse `/disponibilita` da solo, se un utente sfoglia molti mesi. Non è stato modificato in questo piano (fuori scope, decisione del titolare se alzarlo) — da tenere presente durante il controllo visivo del Piano 2 (sito-hotel), quando il calendario sarà davvero interrogato dal browser.

### Step 5: Controllo sintattico (unico controllo automatico possibile da Cowork)

```bash
node -c backend/controllers/bookingPubblicoController.js
node -c backend/routes/bookingPubblico.js
```
Atteso: nessun output (sintassi valida). Questo NON sostituisce l'esecuzione reale dei test — è un controllo minimo compatibile con l'assenza di accesso al DB da questa sessione.

### Step 6: Eseguire i test e verificare che passino (da locale, non da Cowork)

```bash
npx jest tests/api/bookingPubblico.test.js -t "disponibilita-mese" --verbose
```
Atteso: PASS su tutti e 4 i test del nuovo blocco.

### Step 7 (checkpoint del titolare): verifica manuale con curl/Postman

Con il backend in esecuzione in locale:
```bash
curl "http://localhost:PORTA/api/booking-pubblico/disponibilita-mese?anno=2026&mese=9&adulti=2"
```
Atteso: `{"disponibilita":{"2026-09-01":true,"2026-09-02":true,...}}` con i valori reali del DB di produzione/sviluppo del titolare — **questo è il checkpoint visivo richiesto prima di passare al Piano 2**, non i test automatici (che restano una verifica di correttezza, non una prova che i dati reali abbiano senso).

### Step 8: Commit (solo se questo piano è eseguito dal tab Code — MAI da Cowork)

```bash
git add backend/controllers/bookingPubblicoController.js backend/routes/bookingPubblico.js tests/api/bookingPubblico.test.js
git commit -m "feat: endpoint GET /disponibilita-mese per calendario aggregato OTA-style"
```

---

## Task 2: Documentazione

**Files:**
- Modify: `docs/DIARIO_SESSIONI.md`
- Modify: `STATO_PROGETTO.md`

**Interfaces:**
- Consumes: nessuna (task di sola documentazione).
- Produces: nessuna (nessun altro task dipende da questo).

### Step 1: Aggiungere una voce in `docs/DIARIO_SESSIONI.md`

Aggiungere in fondo al file, seguendo lo stesso formato delle voci esistenti (titolo, data, narrativa, riferimenti):

```markdown
## Endpoint disponibilità mensile aggregata (24/08/2026)

Nuovo `GET /api/booking-pubblico/disponibilita-mese` in
`bookingPubblicoController.js` — riusa il pattern EXISTS
inventario/capienza già scritto per `disponibilita()`, adattato con
`generate_series` per calcolare un booleano per ogni notte di un mese
intero in una sola query, senza calcolo prezzo. Alimenta il nuovo
calendario OTA-style del date-range picker in `sito-hotel` (Piano 2,
`sito-hotel/docs/superpowers/plans/2026-08-24-date-range-picker-componente.md`).
Per design, non tiene conto delle restrizioni planning-tariffe (il
trattamento non è ancora scelto a questo punto del flusso) — decisione
approvata dal titolare in fase di brainstorming, vedi
`sito-hotel/docs/superpowers/specs/2026-08-24-date-range-picker-design.md`.

[COMPILARE CON I DETTAGLI REALI DELL'ESECUZIONE: esito dei test Jest
(`npx jest tests/api/bookingPubblico.test.js -t "disponibilita-mese"`),
eventuali scostamenti rispetto al piano, verifica manuale curl/Postman
fatta dal titolare, commit reali (hash/messaggio) se già eseguiti dal tab
Code. Nessun accesso DB né esecuzione Jest reale è stata possibile dalla
sessione Cowork che ha scritto questo piano — dichiararlo esplicitamente
se questa voce viene scritta ancora da Cowork invece che dopo
l'esecuzione reale.]
```

### Step 2: Aggiornare `STATO_PROGETTO.md`, sezione "4.1 Booking engine"

Aggiungere una riga nella tabella/sezione esistente del modulo 4.1, referenziando questo piano e il suo stato di esecuzione:

```markdown
- **Endpoint `disponibilita-mese` (24/08/2026)**: implementato per il nuovo
  calendario del sito (Piano
  `docs/superpowers/plans/2026-08-24-endpoint-disponibilita-mese.md`).
  [COMPILARE: stato reale — implementato e testato / implementato, test da
  eseguire dal titolare / in corso.]
```

### Step 3 (checkpoint del titolare): diff dei due file documentali

Verifica: le due voci sono coerenti tra loro e con lo stato reale dell'esecuzione (non copiano acriticamente il testo di questo piano se qualcosa è andato diversamente).

### Step 4: Commit (solo se eseguito dal tab Code — MAI da Cowork)

```bash
git add docs/DIARIO_SESSIONI.md STATO_PROGETTO.md
git commit -m "docs: documentare endpoint disponibilita-mese"
```

---

## Self-Review

**1. Copertura spec:** il contratto endpoint del design doc (`anno`/`mese`/`adulti`/`bambini_eta` in query, risposta `{ "disponibilita": {...} }`, riuso inventario senza prezzo, nessuna restrizione planning-tariffe, stesso trattamento pubblico/rate-limit di `disponibilita()`) è coperto integralmente da Task 1. La nota sul rate limit (non nel design doc originale) è stata aggiunta come segnalazione esplicita, non silenziata.

**2. Scansione placeholder:** nessun placeholder nel codice (query SQL, funzione, route, test sono completi e reali). I due `[COMPILARE...]` in Task 2 sono placeholder legittimi — non sono codice, sono istruzioni per una voce di diario che per natura documenta un'esecuzione futura non ancora avvenuta; sono esplicitamente marcati come tali, non lasciati impliciti.

**3. Coerenza dei tipi:** `disponibilitaMese(req, res)` esportata con lo stesso nome usato nella route (`ctrl.disponibilitaMese`) e nel test (nessun riferimento diretto alla funzione dal test, solo HTTP — coerente con lo stile del resto del file). Risposta `{ disponibilita: { "YYYY-MM-DD": boolean } }` coerente tra funzione, test e contratto del design doc.
