# Planning tariffe giorno-per-giorno Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire una nuova pagina `/planning-tariffe` — griglia tipo camera × trattamento × giorno, prezzo e restrizioni (min stay, CTA, CTD, stop-sell) editabili giorno per giorno o in blocco — alimentata inizialmente dal calcolo esistente di `/tariffe` come "prezzo consigliato", poi liberamente sovrascrivibile cella per cella.

**Architecture:** Una tabella nuova (`planning_tariffe_giorni`, chiave `tipo_camera_id`+`trattamento`+`data`) memorizza SOLO le celle che l'utente ha esplicitamente sovrascritto — un giorno senza riga usa il prezzo calcolato al volo da `calcolaPrezzoCameraPerNotte`/`calcolaSupplementoTrattamento` (già esistenti, invariati). Un controller nuovo (`planningTariffeController`) espone una GET che fa il merge override+calcolato e una PATCH bulk che scrive un intervallo di giorni in una sola chiamata, riusando `verificaLimitiListino` (Piano 1) per l'alert bloccante-superabile sul prezzo. Il frontend è una pagina nuova che traduce in React l'interazione già prototipata e validata da Marco nel mockup `mockup_matrice_tariffe_v4.html` (drag-select, doppio click, drawer bulk-edit) — vedi Nota di scope.

**Nota di scope — letta e riportata qui perché cambia il piano rispetto a quanto scritto in `docs/EVOLUTIVE.md`:**

1. **Il mockup di riferimento esiste davvero ed è stato letto** (`mockup_matrice_tariffe_v4.html`, presente localmente nella working copy del titolare, non committato — coerente con la convenzione "i mockup sono materiale di decisione, non codice"). Il mockup mostra prezzo E restrizioni **per trattamento** (Solo pernottamento / Mezza pensione / Pensione completa), non solo per camera — più granulare di quanto EVOLUTIVE.md lasciasse intuire. Questo piano segue il mockup, non la sintesi testuale: la chiave della tabella è tipo_camera+trattamento+giorno.
2. **Fuori scope, deliberatamente, per questo primo piano:**
   - **Integrazione con il motore prezzi reale** (`calcolaTariffaPerTrattamenti`, usato dal booking engine e dal form prenotazione) — il planning resta, per ora, un pannello di pianificazione autonomo: non è ancora la fonte di verità per il prezzo mostrato a un ospite reale. Toccare quel percorso significa cambiare il prezzo che un cliente vede online; lo scorporo in un piano separato (Piano 3-bis), con più tempo per un giro di verifica reale, è una scelta deliberata — non un rinvio per pigrizia.
   - **Wiring delle restrizioni (min-stay/CTA/CTD/stop-sell) nella disponibilità reale delle prenotazioni** — stesso motivo: tocca la disponibilità mostrata online, va fatto e verificato a parte.
   - **Riga "Disponibilità"** del mockup (camere libere per tipo/giorno) — richiede una query di conteggio nuova sulle prenotazioni esistenti, concettualmente indipendente da prezzo/restrizioni; rimandata.
   - **Pulsante "⚡ Applica a riga/colonna"** (propaga l'ultima modifica) del mockup — scorciatoia comoda ma non essenziale al primo giro.
   - **Vista multi-tipologia impilata** — il mockup mostra più tipologie contemporaneamente; questo piano mostra UNA tipologia alla volta (selettore in alto), perché la griglia GET è per singolo `tipo_camera_id` e la larghezza per-giorno (fino a 31 colonne) rende una vista impilata multi-tipologia pesante da un punto di vista di query/DOM — coerente con l'MVP "un tipo alla volta" già usato in `/tariffe` prima del redesign a griglia.
3. Se questa lettura dello scope non corrisponde a quello che il titolare aveva in mente, va corretta PRIMA di eseguire i task 5-8 (frontend) — i task 1-4 (backend) sono additivi e a basso rischio indipendentemente da come evolve il frontend.

**Tech Stack:** Stesso stack del resto del progetto — Express/pg (backend), Next.js/React (frontend), nessuna libreria nuova.

## Global Constraints

- Riuso letterale di `verificaLimitiListino` (Piano 1, `backend/utils/verificaLimitiListino.js`) per la validazione min/max cartellino — nessuna nuova funzione di validazione, nessuna duplicazione della logica madre/derivata.
- Riuso letterale di `calcolaPrezzoCameraPerNotte` e `calcolaSupplementoTrattamento` (`backend/controllers/tariffeController.js`) per il "prezzo consigliato" — nessuna riscrittura del motore di calcolo esistente.
- Convenzione date: `data_da`/`data_a` di questo modulo sono **entrambe inclusive** (confine di calendario, come `periodi_stagionali`/`tariffe`) — MAI la convenzione "notte di soggiorno" (`data_partenza` esclusiva) usata in `soggiorni`. Va dichiarato in un commento ovunque compaia, per lo stesso motivo per cui il codice esistente lo dichiara (le due convenzioni convivono nel progetto ed è già stata fonte di bug in passato).
- Permessi: stessa sezione `'tariffe'` di `/api/tariffe` e `/api/periodi-stagionali` (lettura: admin/titolare/receptionist; scrittura: admin/titolare) — nessun nuovo permesso in `shared/ruoli.js`.
- Alert bloccante-superabile identico al pattern già in uso (409 con `confermato:false` di default, retry con `confermato:true` dopo conferma esplicita dell'utente) — mai un blocco rigido, mai una sostituzione silenziosa.
- Log override: riuso di `logAudit` (generico, già esistente) con `risorsa_tipo: 'planning_tariffe_giorni'`, `risorsa_id: null` (operazione bulk, non una singola riga) — nessuna tabella di log dedicata.
- Nessuna infrastruttura di test frontend in questo repo: nessun test per i file `.jsx`. Per i file backend, `node -c` su ogni file modificato/creato; per i file frontend, `npx esbuild --bundle --jsx=automatic`. Nessuna delle due è una build/esecuzione reale — dichiararlo esplicitamente ad ogni consegna, come già fatto per i Piani 1 e 2.
- Mai `git` da questa sandbox. Esecuzione inline, senza subagent, task per task, consegna a fine blocco con `SendUserFile` + `device_commit_files`.
- Task 1-4 (backend) sono puramente additivi: nuova tabella, nuove route, nessuna riga di codice esistente modificata — possono essere eseguiti ed eventualmente applicati alla migration reale (dal tab Code) indipendentemente dal fatto che il frontend (task 5-8) sia già stato validato.

---

### Task 1: Migration — tabella `planning_tariffe_giorni`

**Files:**
- Create: `gestionale-hotel/database/migrations/053_planning_tariffe_giorni.sql`

**Interfaces:**
- Consumes: `tipi_camera(id)` (esistente).
- Produces: tabella `planning_tariffe_giorni(id, tipo_camera_id, trattamento, data, prezzo_notte, min_stay, chiuso_arrivo, chiuso_partenza, stop_sell, created_at, updated_at)`, indice unico su `(tipo_camera_id, trattamento, data)` — usato dai task 2-3 per il merge override/calcolato e per l'`ON CONFLICT` della PATCH bulk.

- [ ] **Step 1: Scrivere la migration**

```sql
-- Migration 053 — Planning tariffe giorno per giorno (Piano 3, 24/08/2026).
--
-- Una riga per (tipo_camera_id, trattamento, data) esiste SOLO quando
-- quella cella è stata esplicitamente impostata da un umano — un giorno
-- senza riga usa il prezzo calcolato al volo da calcolaPrezzoCameraPerNotte/
-- calcolaSupplementoTrattamento (backend/controllers/tariffeController.js,
-- invariati). prezzo_notte NULLABLE: una riga può esistere solo per una
-- restrizione (es. stop-sell) senza toccare il prezzo.
--
-- data è un confine di calendario (giorno), non una notte di soggiorno —
-- stessa convenzione '[]' inclusiva di periodi_stagionali/tariffe, diversa
-- da soggiorni dove data_partenza è esclusiva (vedi commento in
-- docs/PRENOTAZIONI_FASE2.md, tabella tariffe).
--
-- trattamento: stesso vocabolario di soggiorni.trattamento (migration 051)
-- — 'bb'/'mezza_pensione'/'pensione_completa' — non i nomi placeholder del
-- mockup HTML di riferimento.

BEGIN;

CREATE TABLE IF NOT EXISTS planning_tariffe_giorni (
  id               SERIAL PRIMARY KEY,
  tipo_camera_id   INTEGER NOT NULL REFERENCES tipi_camera(id),
  trattamento      VARCHAR(20) NOT NULL CHECK (trattamento IN ('bb', 'mezza_pensione', 'pensione_completa')),
  data             DATE NOT NULL,
  prezzo_notte     NUMERIC(10,2),
  min_stay         SMALLINT,
  chiuso_arrivo    BOOLEAN NOT NULL DEFAULT false,
  chiuso_partenza  BOOLEAN NOT NULL DEFAULT false,
  stop_sell        BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMP NOT NULL DEFAULT now(),
  updated_at       TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_planning_tariffe_prezzo CHECK (prezzo_notte IS NULL OR prezzo_notte > 0),
  CONSTRAINT chk_planning_tariffe_min_stay CHECK (min_stay IS NULL OR min_stay > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_planning_tariffe_giorni
  ON planning_tariffe_giorni (tipo_camera_id, trattamento, data);

COMMIT;
```

- [ ] **Step 2: Verifica sintattica**

Non esiste un motore SQL raggiungibile da questa sandbox (nessun accesso a Postgres). Verifica limitata a lettura attenta del file (bilanciamento parentesi, virgole, `BEGIN`/`COMMIT`) — l'applicazione reale della migration resta un'azione del titolare dal tab Code, come per le migration 052 e precedenti.

---

### Task 2: `planningTariffeController.griglia` (GET) — merge override + calcolato

**Files:**
- Create: `gestionale-hotel/backend/controllers/planningTariffeController.js`

**Interfaces:**
- Consumes: `calcolaPrezzoCameraPerNotte(tipoCameraId, dataArrivo, dataPartenza)` e `calcolaSupplementoTrattamento(tipoCameraId, dataArrivo, dataPartenza, trattamento, adulti, bambiniEta)`, entrambe già esportate da `tariffeController.js`. Tabella `planning_tariffe_giorni` del Task 1.
- Produces: `griglia(req, res)` — handler Express per `GET /api/planning-tariffe/griglia`, montato nel Task 4. Risposta: `{ giorni: ["YYYY-MM-DD", ...], righe: { bb: {"YYYY-MM-DD": {prezzo, sovrascritto, min_stay, chiuso_arrivo, chiuso_partenza, stop_sell}}, mezza_pensione: {...}, pensione_completa: {...} } }`. Consumata dal frontend nel Task 5.

- [ ] **Step 1: Scrivere il controller**

```javascript
// backend/controllers/planningTariffeController.js
// Griglia giorno-per-giorno di prezzo e restrizioni, per tipo camera e
// trattamento (Piano 3, 24/08/2026). Un giorno senza riga in
// planning_tariffe_giorni usa il prezzo "consigliato" calcolato al volo da
// calcolaPrezzoCameraPerNotte/calcolaSupplementoTrattamento — stesso motore
// di /tariffe, invariato. Adulti fisso a 2 / nessun bambino per il calcolo
// del supplemento consigliato: stessa convenzione già usata da
// verificaLimitiListino per il cartellino, non un numero nuovo inventato
// qui.
// FUORI SCOPE qui (vedi piano): questa griglia NON è ancora letta dal
// motore di calcolo reale delle prenotazioni (calcolaTariffaPerTrattamenti)
// — è un pannello di pianificazione autonomo, non ancora la fonte di
// verità del prezzo mostrato a un ospite.

const pool = require('../config/db');
const { logAudit } = require('./auditController');
const { calcolaPrezzoCameraPerNotte, calcolaSupplementoTrattamento } = require('./tariffeController');
const { verificaLimitiListino } = require('../utils/verificaLimitiListino');

const TRATTAMENTI = ['bb', 'mezza_pensione', 'pensione_completa'];

function isoData(valore) {
  return valore instanceof Date ? valore.toISOString().slice(0, 10) : String(valore);
}

// data_da/data_a di questo modulo sono INCLUSIVE (confine di calendario) —
// questa funzione converte in "esclusiva" solo per i punti che chiamano
// calcolaPrezzoCameraPerNotte/calcolaSupplementoTrattamento, che lavorano
// per NOTTE con data_fine esclusiva (convenzione di soggiorni).
function aggiungiGiorno(dataIso) {
  const d = new Date(dataIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// GET /api/planning-tariffe/griglia?tipo_camera_id=&data_da=&data_a=
async function griglia(req, res) {
  const { tipo_camera_id, data_da, data_a } = req.query;
  if (!tipo_camera_id || !data_da || !data_a) {
    return res.status(400).json({ errore: 'tipo_camera_id, data_da e data_a sono obbligatori.' });
  }
  if (data_a < data_da) {
    return res.status(400).json({ errore: 'data_a deve essere successiva o uguale a data_da.' });
  }
  try {
    const dataFineEsclusiva = aggiungiGiorno(data_a);

    const [prezziCamera, overrideResult] = await Promise.all([
      calcolaPrezzoCameraPerNotte(tipo_camera_id, data_da, dataFineEsclusiva),
      pool.query(
        `SELECT trattamento, data, prezzo_notte, min_stay, chiuso_arrivo, chiuso_partenza, stop_sell
         FROM planning_tariffe_giorni
         WHERE tipo_camera_id = $1 AND data BETWEEN $2 AND $3`,
        [tipo_camera_id, data_da, data_a]
      ),
    ]);

    const overridePerChiave = new Map(overrideResult.rows.map(r => [`${r.trattamento}|${isoData(r.data)}`, r]));
    const prezzoCameraPerNotte = new Map(prezziCamera.map(n => [isoData(n.notte), n.prezzo_notte]));
    const giorni = [...prezzoCameraPerNotte.keys()].sort();
    const righe = {};

    for (const trattamento of TRATTAMENTI) {
      righe[trattamento] = {};
      for (const di of giorni) {
        const override = overridePerChiave.get(`${trattamento}|${di}`);
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
        };
      }
    }

    res.json({ giorni, righe });
  } catch (err) {
    console.error('griglia planning-tariffe error:', err);
    res.status(500).json({ errore: 'Errore interno' });
  }
}

module.exports = { griglia, TRATTAMENTI, aggiungiGiorno, isoData };
```

- [ ] **Step 2: Verifica sintattica**

```bash
cd gestionale-hotel/backend && node -c controllers/planningTariffeController.js
```

Expected: nessun output (exit 0). Nessuna esecuzione reale — dichiarare esplicitamente che senza accesso a Postgres da questa sandbox non è possibile chiamare l'endpoint.

---

### Task 3: `planningTariffeController.aggiorna` (PATCH bulk) — validazione cartellino + upsert

**Files:**
- Modify: `gestionale-hotel/backend/controllers/planningTariffeController.js` (aggiunge `aggiorna` e la esporta)

**Interfaces:**
- Consumes: `verificaLimitiListino({ tipoCameraId, trattamento, dataArrivo, dataPartenza, valore, db })` (Piano 1, invariata) per la validazione min/max; `logAudit(userId, azione, risorsaTipo, risorsaId, req, dettagli)` (esistente, invariata); `TRATTAMENTI`/`aggiungiGiorno` dal Task 2, stesso file.
- Produces: `aggiorna(req, res)` — handler per `PATCH /api/planning-tariffe`, montato nel Task 4. Body: `{ tipo_camera_id, trattamento, data_da, data_a, prezzo_notte?, min_stay?, chiuso_arrivo?, chiuso_partenza?, stop_sell?, confermato }` — ogni campo opzionale assente (`undefined`) NON viene toccato sulle righe esistenti (stesso principio CASE/COALESCE di `tariffeController.aggiorna`). Risposta 409: `{ errore, violazioni: [{ data, minimo, massimo, valore }] }` — un elemento per ogni giorno del range fuori dal range dichiarato, non solo il primo. Consumata dal frontend nei Task 6-8.

- [ ] **Step 1: Aggiungere `aggiorna` al controller**

In `planningTariffeController.js`, dopo la funzione `griglia`:

```javascript
// PATCH /api/planning-tariffe — upsert su un intervallo di giorni [data_da,
// data_a] INCLUSIVI, per una coppia tipo_camera_id+trattamento. Ogni campo
// (prezzo_notte/min_stay/chiuso_arrivo/chiuso_partenza/stop_sell) è
// indipendente: se assente dal body la riga esistente non viene toccata su
// quel campo (undefined = "non modificare", null = "azzera" per
// prezzo_notte/min_stay). confermato: stesso pattern alert
// bloccante-superabile di tariffeController.crea/aggiorna — 409 con
// l'elenco di TUTTI i giorni fuori range se non confermato, log override
// (bulk, una sola riga in audit_log) se confermato.
async function aggiorna(req, res) {
  const { tipo_camera_id, trattamento, data_da, data_a, prezzo_notte, min_stay, chiuso_arrivo, chiuso_partenza, stop_sell, confermato } = req.body;

  if (!tipo_camera_id || !trattamento || !data_da || !data_a) {
    return res.status(400).json({ errore: 'tipo_camera_id, trattamento, data_da e data_a sono obbligatori.' });
  }
  if (!TRATTAMENTI.includes(trattamento)) {
    return res.status(400).json({ errore: 'Trattamento non valido.' });
  }
  if (data_a < data_da) {
    return res.status(400).json({ errore: 'data_a deve essere successiva o uguale a data_da.' });
  }
  if (prezzo_notte !== undefined && prezzo_notte !== null && Number(prezzo_notte) <= 0) {
    return res.status(400).json({ errore: 'Il prezzo per notte deve essere maggiore di zero.' });
  }

  const giorni = [];
  for (let d = data_da; d <= data_a; d = aggiungiGiorno(d)) giorni.push(d);

  try {
    if (prezzo_notte !== undefined && prezzo_notte !== null) {
      const violazioni = [];
      for (const di of giorni) {
        const esito = await verificaLimitiListino({
          tipoCameraId: tipo_camera_id,
          trattamento: trattamento === 'bb' ? null : trattamento,
          dataArrivo: di,
          dataPartenza: aggiungiGiorno(di),
          valore: Number(prezzo_notte),
        });
        if (!esito.conforme) violazioni.push({ data: di, minimo: esito.minimo, massimo: esito.massimo, valore: Number(prezzo_notte) });
      }
      if (violazioni.length > 0 && !confermato) {
        return res.status(409).json({ errore: 'Il prezzo esce dal min/max dichiarato per il cartellino in uno o più giorni.', violazioni });
      }
      if (violazioni.length > 0) {
        await logAudit(req.utente.id, 'override_limite_listino', 'planning_tariffe_giorni', null, req, {
          tipo_camera_id, trattamento, data_da, data_a, prezzo_notte: Number(prezzo_notte), giorni_fuori_range: violazioni,
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const di of giorni) {
        await client.query(
          `INSERT INTO planning_tariffe_giorni (tipo_camera_id, trattamento, data, prezzo_notte, min_stay, chiuso_arrivo, chiuso_partenza, stop_sell)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6, false), COALESCE($7, false), COALESCE($8, false))
           ON CONFLICT (tipo_camera_id, trattamento, data) DO UPDATE SET
             prezzo_notte    = CASE WHEN $9  THEN planning_tariffe_giorni.prezzo_notte    ELSE $4 END,
             min_stay        = CASE WHEN $10 THEN planning_tariffe_giorni.min_stay        ELSE $5 END,
             chiuso_arrivo   = CASE WHEN $11 THEN planning_tariffe_giorni.chiuso_arrivo   ELSE $6 END,
             chiuso_partenza = CASE WHEN $12 THEN planning_tariffe_giorni.chiuso_partenza ELSE $7 END,
             stop_sell       = CASE WHEN $13 THEN planning_tariffe_giorni.stop_sell       ELSE $8 END,
             updated_at      = now()`,
          [
            tipo_camera_id, trattamento, di,
            prezzo_notte === undefined ? null : (prezzo_notte === null ? null : Number(prezzo_notte)),
            min_stay === undefined ? null : (min_stay === null ? null : Number(min_stay)),
            chiuso_arrivo === undefined ? null : !!chiuso_arrivo,
            chiuso_partenza === undefined ? null : !!chiuso_partenza,
            stop_sell === undefined ? null : !!stop_sell,
            prezzo_notte === undefined,
            min_stay === undefined,
            chiuso_arrivo === undefined,
            chiuso_partenza === undefined,
            stop_sell === undefined,
          ]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ ok: true, giorni_aggiornati: giorni.length });
  } catch (err) {
    console.error('aggiorna planning-tariffe error:', err);
    res.status(500).json({ errore: 'Errore interno' });
  }
}

module.exports = { griglia, aggiorna, TRATTAMENTI, aggiungiGiorno, isoData };
```

- [ ] **Step 2: Verifica sintattica**

```bash
cd gestionale-hotel/backend && node -c controllers/planningTariffeController.js
```

Expected: nessun output (exit 0).

---

### Task 4: Route + registrazione in `app.js`

**Files:**
- Create: `gestionale-hotel/backend/routes/planningTariffe.js`
- Modify: `gestionale-hotel/backend/app.js` (aggiunge require + `app.use`)

**Interfaces:**
- Consumes: `griglia`/`aggiorna` dal Task 2-3; `verificaToken`/`richiedeAzione` da `backend/middleware/auth.js` (esistenti, stesso pattern di `routes/tariffe.js`/`routes/periodiStagionali.js`).
- Produces: `GET /api/planning-tariffe/griglia`, `PATCH /api/planning-tariffe` — consumate dal frontend nei Task 5-8.

- [ ] **Step 1: Scrivere la route**

```javascript
// backend/routes/planningTariffe.js
// Routes Planning tariffe giorno-per-giorno (Piano 3, 24/08/2026) —
// /api/planning-tariffe. Stessa sezione permesso 'tariffe' di
// routes/tariffe.js — lettura admin/titolare/receptionist, scrittura
// admin/titolare.

const express = require('express');
const router = express.Router();
const { verificaToken, richiedeAzione } = require('../middleware/auth');
const ctrl = require('../controllers/planningTariffeController');

router.use(verificaToken);

router.get('/griglia', richiedeAzione('tariffe', 'lettura'),   ctrl.griglia);
router.patch('/',      richiedeAzione('tariffe', 'scrittura'), ctrl.aggiorna);

module.exports = router;
```

- [ ] **Step 2: Registrare la route in `app.js`**

Accanto alla riga `const tariffeRoutes = require('./routes/tariffe');` (circa riga 28), aggiungere:

```javascript
const planningTariffeRoutes = require('./routes/planningTariffe');
```

Accanto alla riga `app.use('/api/tariffe', tariffeRoutes);` (circa riga 118), aggiungere:

```javascript
app.use('/api/planning-tariffe', planningTariffeRoutes);
```

- [ ] **Step 3: Verifica sintattica**

```bash
cd gestionale-hotel/backend && node -c routes/planningTariffe.js && node -c app.js
```

Expected: nessun output (exit 0) su entrambi i comandi.

---

### Task 5: Pagina `/planning-tariffe` — skeleton, lettura griglia, navigazione periodo

**Files:**
- Create: `gestionale-hotel/frontend/app/planning-tariffe/page.jsx`
- Modify: il componente di navigazione che elenca `/planning-camere` (individuare col comando nello Step 3 — non presente nell'estratto di codice disponibile in questa sessione)

**Interfaces:**
- Consumes: `GET /api/planning-tariffe/griglia?tipo_camera_id=&data_da=&data_a=` (Task 2); `GET /api/tipi-camera` (esistente, stesso endpoint usato da `/tariffe`).
- Produces: componente `PaginaPlanningTariffe` (default export) con stato `tipoSelezionato`, `modo` (`'14gg'|'mese'`), `ancora` (Date), `dati` (risposta della griglia) — consumato/esteso dai Task 6-8 nello stesso file.

- [ ] **Step 1: Scrivere lo skeleton della pagina**

```jsx
'use client';

// Pagina Planning tariffe giorno-per-giorno (Piano 3, 24/08/2026).
// Un tipo camera alla volta (selettore in alto) — a differenza della
// griglia statica di /tariffe (Piano 2, righe = tutte le tipologie insieme,
// colonne = periodi stagionali), qui la colonna è il GIORNO: fino a 31
// colonne visibili, mostrare più tipologie impilate insieme è rimandato
// (vedi Nota di scope nel piano). Interazione (drag-select, doppio click,
// drawer bulk-edit) ricalcata da mockup_matrice_tariffe_v4.html, l'ultimo
// dei 4 mockup consegnati al titolare il 23/08/2026 — MAI committato nel
// repo, presente solo nella working copy locale.
// FUORI SCOPE (vedi piano): riga "Disponibilità", pulsante "applica a
// riga/colonna", integrazione con il motore di prezzo reale delle
// prenotazioni.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const RUOLI_LETTURA = ['admin', 'titolare', 'receptionist'];
const TRATTAMENTI = [
  { id: 'bb', nome: 'Solo pernottamento' },
  { id: 'mezza_pensione', nome: 'Mezza pensione' },
  { id: 'pensione_completa', nome: 'Pensione completa' },
];

function pad(n) { return String(n).padStart(2, '0'); }
function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function aggiungiGiorni(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

function colonneVisibili(modo, ancora) {
  if (modo === '14gg') {
    const arr = [];
    for (let i = 0; i < 14; i++) arr.push(aggiungiGiorni(ancora, i));
    return arr;
  }
  const anno = ancora.getFullYear(), mese = ancora.getMonth();
  const n = new Date(anno, mese + 1, 0).getDate();
  const arr = [];
  for (let g = 1; g <= n; g++) arr.push(new Date(anno, mese, g));
  return arr;
}

export default function PaginaPlanningTariffe() {
  const { utente, loading } = useAuth();
  const router = useRouter();
  const puoScrivere = utente && ['admin', 'titolare'].includes(utente.ruolo);

  const [tipiCamera, setTipiCamera] = useState([]);
  const [tipoSelezionato, setTipoSelezionato] = useState(null);
  const [modo, setModo] = useState('14gg');
  const [ancora, setAncora] = useState(() => new Date());
  const [dati, setDati] = useState(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');

  useEffect(() => {
    if (!loading && (!utente || !RUOLI_LETTURA.includes(utente.ruolo))) router.replace('/home');
  }, [utente, loading, router]);

  useEffect(() => {
    if (!utente || !RUOLI_LETTURA.includes(utente.ruolo)) return;
    api.get('/tipi-camera').then(res => {
      setTipiCamera(res.data);
      if (res.data.length > 0) setTipoSelezionato(String(res.data[0].id));
    }).catch(err => setErrore(err.message || 'Errore nel caricamento delle tipologie.'));
  }, [utente]);

  const cols = colonneVisibili(modo, ancora);
  const dataDa = iso(cols[0]);
  const dataA = iso(cols[cols.length - 1]);

  const caricaGriglia = useCallback(async () => {
    if (!tipoSelezionato) return;
    setCaricamento(true);
    try {
      const res = await api.get('/planning-tariffe/griglia', {
        params: { tipo_camera_id: tipoSelezionato, data_da: dataDa, data_a: dataA },
      });
      setDati(res.data);
    } catch (err) {
      setErrore(err.message || 'Errore nel caricamento della griglia.');
    } finally {
      setCaricamento(false);
    }
  }, [tipoSelezionato, dataDa, dataA]);

  useEffect(() => { caricaGriglia(); }, [caricaGriglia]);

  if (loading || !utente) return null;

  return (
    <AppShell titolo="Planning tariffe">
      {errore && (
        <div className="px-3 py-2.5 rounded-lg text-[13px] mb-4"
             style={{ background: 'var(--status-red-bg)', color: 'var(--status-red-text)' }}>
          {errore}
        </div>
      )}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {tipiCamera.map(t => (
            <button key={t.id} onClick={() => setTipoSelezionato(String(t.id))}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg"
                    style={String(tipoSelezionato) === String(t.id)
                      ? { background: 'var(--hotel-navy)', color: 'white' }
                      : { border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
              {t.nome}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg p-0.5" style={{ background: '#EDEFF2' }}>
            <button onClick={() => setModo('14gg')}
                    className="text-xs font-medium px-3 py-1.5 rounded-md"
                    style={modo === '14gg' ? { background: 'white', color: 'var(--hotel-navy)' } : { color: 'var(--muted-foreground)' }}>
              14 giorni
            </button>
            <button onClick={() => setModo('mese')}
                    className="text-xs font-medium px-3 py-1.5 rounded-md"
                    style={modo === 'mese' ? { background: 'white', color: 'var(--hotel-navy)' } : { color: 'var(--muted-foreground)' }}>
              Mese
            </button>
          </div>
          <button onClick={() => setAncora(a => aggiungiGiorni(a, modo === '14gg' ? -14 : -30))}
                  className="w-7 h-7 rounded-lg text-sm" style={{ border: '1px solid var(--border)' }}>‹</button>
          <span className="text-xs font-semibold min-w-[140px] text-center">{dataDa} – {dataA}</span>
          <button onClick={() => setAncora(a => aggiungiGiorni(a, modo === '14gg' ? 14 : 30))}
                  className="w-7 h-7 rounded-lg text-sm" style={{ border: '1px solid var(--border)' }}>›</button>
        </div>
      </div>

      {caricamento || !dati ? (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>Caricamento...</p>
      ) : (
        <div className="rounded-xl overflow-x-auto" style={{ background: 'var(--card)', border: '0.5px solid var(--border)' }}>
          <table className="text-xs" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th className="text-left px-2 py-1.5" style={{ borderBottom: '1px solid var(--border)', minWidth: '160px' }} />
                {dati.giorni.map(di => (
                  <th key={di} className="text-center px-1 py-1.5 font-medium" style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted-foreground)', minWidth: '44px' }}>
                    {di.slice(8, 10)}/{di.slice(5, 7)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TRATTAMENTI.map(tr => (
                <tr key={tr.id}>
                  <td className="px-2 py-1.5 font-medium" style={{ borderBottom: '0.5px solid var(--border)' }}>{tr.nome}</td>
                  {dati.giorni.map(di => {
                    const cella = dati.righe[tr.id][di];
                    return (
                      <td key={di} className="text-center px-1 py-1.5" style={{ borderBottom: '0.5px solid var(--border)' }}>
                        {cella.prezzo != null ? `${cella.prezzo} €` : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 2: Verifica sintattica**

```bash
cd gestionale-hotel/frontend && npx esbuild app/planning-tariffe/page.jsx --bundle --jsx=automatic --loader:.jsx=jsx \
  --external:react --external:react-dom --external:next/navigation --external:lucide-react "--external:@/*" \
  --outfile=/tmp/verifica-planning-tariffe-skeleton.js
```

Expected: exit 0.

- [ ] **Step 3: Aggiungere la voce di navigazione**

Cercare nel repo dove compare `/planning-camere` come link di navigazione:

```bash
grep -rn "planning-camere" gestionale-hotel/frontend/components gestionale-hotel/frontend/app --include="*.tsx" --include="*.jsx" -l
```

Nel file trovato (fuori da `app/planning-camere/page.jsx` stesso), aggiungere una voce `/planning-tariffe` che rispecchi ESATTAMENTE la forma della voce esistente per `/planning-camere` (stessa struttura dell'oggetto/elemento, stessa icona se prevista una per voce — altrimenti nessuna icona nuova inventata), con etichetta "Planning tariffe" e gli stessi ruoli di lettura (`RUOLI_LETTURA` sopra). Se il file non usa una struttura dati facilmente estendibile (es. è JSX scritto a mano voce per voce), copiare l'elemento di `/planning-camere` e adattarne solo `href`/testo.

---

### Task 6: Doppio click su cella prezzo — edit inline + PATCH singolo giorno

**Files:**
- Modify: `gestionale-hotel/frontend/app/planning-tariffe/page.jsx`

**Interfaces:**
- Consumes: `PATCH /api/planning-tariffe` (Task 3) con `data_da === data_a` (un solo giorno).
- Produces: gestione locale di `cellaInModifica` (stato `{trattamento, data}` o `null`) — riusata dai Task 7-8 per evitare conflitti tra doppio click e drag sulla stessa cella.

- [ ] **Step 1: Aggiungere lo stato e la funzione di salvataggio singolo-giorno**

Nel componente `PaginaPlanningTariffe`, dopo gli stati esistenti:

```jsx
  const [cellaInModifica, setCellaInModifica] = useState(null); // {trattamento, data} | null
  const [valoreInModifica, setValoreInModifica] = useState('');

  async function salvaPrezzoGiorno(trattamento, data, prezzo, confermato = false) {
    try {
      await api.patch('/planning-tariffe', {
        tipo_camera_id: tipoSelezionato, trattamento, data_da: data, data_a: data,
        prezzo_notte: prezzo, confermato,
      });
      setCellaInModifica(null);
      caricaGriglia();
    } catch (err) {
      if (err.response?.status === 409) {
        const { violazioni } = err.response.data;
        const v = violazioni[0];
        if (confirm(`Il prezzo ${v.valore}€ esce dal range dichiarato (${v.minimo ?? '—'}–${v.massimo ?? '—'}€). Confermi comunque?`)) {
          return salvaPrezzoGiorno(trattamento, data, prezzo, true);
        }
        return;
      }
      setErrore(err.message || 'Errore nel salvataggio del prezzo.');
    }
  }
```

- [ ] **Step 2: Sostituire la cella prezzo statica con una cella doppio-click-editabile**

Sostituire, nel `<tbody>` dello Step 1 del Task 5:

```jsx
                    return (
                      <td key={di} className="text-center px-1 py-1.5" style={{ borderBottom: '0.5px solid var(--border)' }}>
                        {cella.prezzo != null ? `${cella.prezzo} €` : '—'}
                      </td>
                    );
```

con:

```jsx
                    const inModifica = cellaInModifica && cellaInModifica.trattamento === tr.id && cellaInModifica.data === di;
                    return (
                      <td key={di} className="text-center px-1 py-1.5" style={{ borderBottom: '0.5px solid var(--border)' }}
                          onDoubleClick={() => {
                            if (!puoScrivere) return;
                            setCellaInModifica({ trattamento: tr.id, data: di });
                            setValoreInModifica(cella.prezzo != null ? String(cella.prezzo) : '');
                          }}>
                        {inModifica ? (
                          <input type="number" min={0} step="0.01" autoFocus value={valoreInModifica}
                                 onChange={e => setValoreInModifica(e.target.value)}
                                 onBlur={() => {
                                   const v = valoreInModifica.trim();
                                   if (v === '' || Number(v) === cella.prezzo) { setCellaInModifica(null); return; }
                                   salvaPrezzoGiorno(tr.id, di, Number(v));
                                 }}
                                 onKeyDown={e => {
                                   if (e.key === 'Enter') e.target.blur();
                                   if (e.key === 'Escape') setCellaInModifica(null);
                                 }}
                                 style={{ width: '44px', textAlign: 'center', border: '1.5px solid var(--status-blue-text)', borderRadius: '4px', fontSize: '12.5px' }} />
                        ) : (
                          <span style={{ color: cella.sovrascritto ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                            {cella.prezzo != null ? `${cella.prezzo} €` : '—'}
                          </span>
                        )}
                      </td>
                    );
```

- [ ] **Step 3: Verifica sintattica**

```bash
cd gestionale-hotel/frontend && npx esbuild app/planning-tariffe/page.jsx --bundle --jsx=automatic --loader:.jsx=jsx \
  --external:react --external:react-dom --external:next/navigation --external:lucide-react "--external:@/*" \
  --outfile=/tmp/verifica-planning-tariffe-t6.js
```

Expected: exit 0.

---

### Task 7: Riga restrizioni per trattamento + popover giorno singolo

**Files:**
- Modify: `gestionale-hotel/frontend/app/planning-tariffe/page.jsx`

**Interfaces:**
- Consumes: `PATCH /api/planning-tariffe` (Task 3) senza `prezzo_notte` (solo `min_stay`/`chiuso_arrivo`/`chiuso_partenza`/`stop_sell`).
- Produces: `popoverAperto` (stato `{trattamento, data} | null`), riusato dal Task 8 per evitare che un drag apra anche il popover.

- [ ] **Step 1: Aggiungere stato e funzione di salvataggio restrizioni**

```jsx
  const [popoverAperto, setPopoverAperto] = useState(null); // {trattamento, data} | null
  const [formRestrizioni, setFormRestrizioni] = useState({ min_stay: '', chiuso_arrivo: false, chiuso_partenza: false, stop_sell: false });

  async function salvaRestrizioniGiorno(trattamento, data) {
    try {
      await api.patch('/planning-tariffe', {
        tipo_camera_id: tipoSelezionato, trattamento, data_da: data, data_a: data,
        min_stay: formRestrizioni.min_stay === '' ? null : Number(formRestrizioni.min_stay),
        chiuso_arrivo: formRestrizioni.chiuso_arrivo,
        chiuso_partenza: formRestrizioni.chiuso_partenza,
        stop_sell: formRestrizioni.stop_sell,
      });
      setPopoverAperto(null);
      caricaGriglia();
    } catch (err) {
      setErrore(err.message || 'Errore nel salvataggio delle restrizioni.');
    }
  }
```

- [ ] **Step 2: Aggiungere una riga "Restrizioni" per trattamento nel `<tbody>`**

Dopo la `<tr>` del prezzo (Task 6, dentro il `.map(tr => ...)`), aggiungere una seconda riga nello stesso `.map`:

```jsx
                  <tr key={`${tr.id}-restrizioni`}>
                    <td className="px-2 py-1.5 text-[11px]" style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted-foreground)', paddingLeft: '18px' }}>
                      Restrizioni
                    </td>
                    {dati.giorni.map(di => {
                      const cella = dati.righe[tr.id][di];
                      const aperto = popoverAperto && popoverAperto.trattamento === tr.id && popoverAperto.data === di;
                      return (
                        <td key={di} className="text-center px-1 py-1.5" style={{ borderBottom: '1px solid var(--border)', position: 'relative', background: cella.stop_sell ? 'var(--status-red-bg)' : undefined, cursor: puoScrivere ? 'pointer' : 'default' }}
                            onClick={() => {
                              if (!puoScrivere) return;
                              setFormRestrizioni({
                                min_stay: cella.min_stay != null ? String(cella.min_stay) : '',
                                chiuso_arrivo: cella.chiuso_arrivo, chiuso_partenza: cella.chiuso_partenza, stop_sell: cella.stop_sell,
                              });
                              setPopoverAperto({ trattamento: tr.id, data: di });
                            }}>
                          {cella.stop_sell ? (
                            <span className="text-[9.5px] font-bold" style={{ color: 'var(--status-red-text)' }}>chiusa</span>
                          ) : (
                            <span className="text-[9.5px] font-bold" style={{ color: 'var(--muted-foreground)' }}>
                              {cella.min_stay > 1 ? `${cella.min_stay}n ` : ''}
                              {cella.chiuso_arrivo ? 'CTA ' : ''}
                              {cella.chiuso_partenza ? 'CTD' : ''}
                            </span>
                          )}
                          {aperto && (
                            <div className="absolute z-20 p-2.5 rounded-lg text-left"
                                 style={{ top: '100%', left: '0', width: '210px', background: 'white', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                                 onClick={e => e.stopPropagation()}>
                              <label className="flex items-center justify-between text-[11px] mb-1.5">
                                Min. stay (notti)
                                <input type="number" min={1} value={formRestrizioni.min_stay}
                                       onChange={e => setFormRestrizioni(f => ({ ...f, min_stay: e.target.value }))}
                                       style={{ width: '50px', border: '1px solid var(--border)', borderRadius: '5px', fontSize: '12px' }} />
                              </label>
                              <label className="flex items-center gap-1.5 text-[11px] mb-1.5">
                                <input type="checkbox" checked={formRestrizioni.chiuso_arrivo}
                                       onChange={e => setFormRestrizioni(f => ({ ...f, chiuso_arrivo: e.target.checked }))} />
                                Chiusa all&apos;arrivo (CTA)
                              </label>
                              <label className="flex items-center gap-1.5 text-[11px] mb-1.5">
                                <input type="checkbox" checked={formRestrizioni.chiuso_partenza}
                                       onChange={e => setFormRestrizioni(f => ({ ...f, chiuso_partenza: e.target.checked }))} />
                                Chiusa alla partenza (CTD)
                              </label>
                              <label className="flex items-center gap-1.5 text-[11px] mb-2">
                                <input type="checkbox" checked={formRestrizioni.stop_sell}
                                       onChange={e => setFormRestrizioni(f => ({ ...f, stop_sell: e.target.checked }))} />
                                Stop-sell
                              </label>
                              <div className="flex justify-end gap-1.5">
                                <button onClick={() => setPopoverAperto(null)} className="text-[11px] px-2 py-1 rounded border">Annulla</button>
                                <button onClick={() => salvaRestrizioniGiorno(tr.id, di)}
                                        className="text-[11px] px-2 py-1 rounded text-white" style={{ background: 'var(--hotel-navy)' }}>Salva</button>
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
```

- [ ] **Step 3: Verifica sintattica**

```bash
cd gestionale-hotel/frontend && npx esbuild app/planning-tariffe/page.jsx --bundle --jsx=automatic --loader:.jsx=jsx \
  --external:react --external:react-dom --external:next/navigation --external:lucide-react "--external:@/*" \
  --outfile=/tmp/verifica-planning-tariffe-t7.js
```

Expected: exit 0.

---

### Task 8: Drag-select + drawer bulk-edit

**Files:**
- Modify: `gestionale-hotel/frontend/app/planning-tariffe/page.jsx`

**Interfaces:**
- Consumes: `PATCH /api/planning-tariffe` (Task 3) con `data_da !== data_a` (intervallo). Riusa `TRATTAMENTI` (Task 5), `cellaInModifica`/`popoverAperto` (Task 6-7, per bloccare l'apertura di un editor singolo mentre si sta trascinando).
- Produces: nessuna — ultimo task del piano.

- [ ] **Step 1: Aggiungere stato di selezione e drawer**

```jsx
  const [selezione, setSelezione] = useState(null); // {trattamento, campo:'prezzo'|'restrizioni', colInizio, colCorrente} | null
  const [trascinando, setTrascinando] = useState(false);
  const [dragMosso, setDragMosso] = useState(false);
  const [drawerAperto, setDrawerAperto] = useState(false);
  const [drawerForm, setDrawerForm] = useState(null);

  function iniziaTrascinamento(trattamento, campo, colIdx) {
    if (!puoScrivere) return;
    setTrascinando(true); setDragMosso(false);
    setSelezione({ trattamento, campo, colInizio: colIdx, colCorrente: colIdx });
  }
  function continuaTrascinamento(trattamento, campo, colIdx) {
    if (!trascinando || !selezione || selezione.trattamento !== trattamento || selezione.campo !== campo) return;
    if (colIdx !== selezione.colCorrente) setDragMosso(true);
    setSelezione(s => ({ ...s, colCorrente: colIdx }));
  }
  useEffect(() => {
    function fine() {
      if (!trascinando) return;
      setTrascinando(false);
      if (!dragMosso) { setSelezione(null); return; }
      const min = Math.min(selezione.colInizio, selezione.colCorrente);
      const max = Math.max(selezione.colInizio, selezione.colCorrente);
      setDrawerForm({
        trattamenti: new Set([selezione.trattamento]),
        campi: new Set([selezione.campo === 'restrizioni' ? 'min_stay' : 'prezzo']),
        dataInizio: dati.giorni[min], dataFine: dati.giorni[max],
        valori: {},
      });
      setDrawerAperto(true);
    }
    window.addEventListener('pointerup', fine);
    return () => window.removeEventListener('pointerup', fine);
  }, [trascinando, dragMosso, selezione, dati]);

  function cellaSelezionata(trattamento, campo, colIdx) {
    if (!selezione || selezione.trattamento !== trattamento || selezione.campo !== campo) return false;
    const min = Math.min(selezione.colInizio, selezione.colCorrente);
    const max = Math.max(selezione.colInizio, selezione.colCorrente);
    return colIdx >= min && colIdx <= max;
  }

  async function applicaDrawer() {
    if (!drawerForm) return;
    const campi = [...drawerForm.campi];
    for (const campoId of campi) {
      if (campoId !== 'prezzo' && drawerForm.valori[campoId] === undefined) continue;
      if (campoId === 'prezzo' && !drawerForm.valori.prezzo) { setErrore('Inserisci un prezzo.'); return; }
    }
    try {
      for (const trattamento of drawerForm.trattamenti) {
        const body = {
          tipo_camera_id: tipoSelezionato, trattamento,
          data_da: drawerForm.dataInizio, data_a: drawerForm.dataFine,
          confermato: false,
        };
        if (campi.includes('prezzo')) body.prezzo_notte = Number(drawerForm.valori.prezzo);
        if (campi.includes('min_stay')) body.min_stay = drawerForm.valori.min_stay === '' ? null : Number(drawerForm.valori.min_stay);
        if (campi.includes('chiuso_arrivo')) body.chiuso_arrivo = !!drawerForm.valori.chiuso_arrivo;
        if (campi.includes('chiuso_partenza')) body.chiuso_partenza = !!drawerForm.valori.chiuso_partenza;
        if (campi.includes('stop_sell')) body.stop_sell = !!drawerForm.valori.stop_sell;
        await api.patch('/planning-tariffe', body);
      }
      setDrawerAperto(false); setSelezione(null);
      caricaGriglia();
    } catch (err) {
      if (err.response?.status === 409) {
        const n = err.response.data.violazioni.length;
        if (confirm(`${n} giorno/i esce/escono dal range dichiarato per il cartellino. Confermi comunque?`)) {
          for (const trattamento of drawerForm.trattamenti) {
            await api.patch('/planning-tariffe', {
              tipo_camera_id: tipoSelezionato, trattamento,
              data_da: drawerForm.dataInizio, data_a: drawerForm.dataFine,
              prezzo_notte: campi.includes('prezzo') ? Number(drawerForm.valori.prezzo) : undefined,
              confermato: true,
            });
          }
          setDrawerAperto(false); setSelezione(null);
          caricaGriglia();
        }
        return;
      }
      setErrore(err.message || 'Errore nel salvataggio.');
    }
  }
```

- [ ] **Step 2: Agganciare `onPointerDown`/`onPointerEnter` alle celle prezzo e restrizioni**

Nella cella prezzo (Task 6), aggiungere sull'elemento `<td>` (accanto a `onDoubleClick`):

```jsx
                          onPointerDown={() => iniziaTrascinamento(tr.id, 'prezzo', dati.giorni.indexOf(di))}
                          onPointerEnter={() => continuaTrascinamento(tr.id, 'prezzo', dati.giorni.indexOf(di))}
```

e nello `style` della stessa cella, aggiungere l'evidenziazione di selezione:

```jsx
                      style={{ borderBottom: '0.5px solid var(--border)', background: cellaSelezionata(tr.id, 'prezzo', dati.giorni.indexOf(di)) ? 'rgba(24,95,165,0.13)' : undefined }}
```

Nella cella restrizioni (Task 7), aggiungere sull'elemento `<td>` (accanto a `onClick`, che deve continuare a funzionare solo per il click SINGOLO — riusare `dragMosso` per distinguerli, stesso principio del mockup):

```jsx
                            onPointerDown={() => iniziaTrascinamento(tr.id, 'restrizioni', dati.giorni.indexOf(di))}
                            onPointerEnter={() => continuaTrascinamento(tr.id, 'restrizioni', dati.giorni.indexOf(di))}
                            onClick={() => {
                              if (dragMosso) return; // il rilascio del drag non deve aprire anche il popover
                              if (!puoScrivere) return;
                              setFormRestrizioni({
                                min_stay: cella.min_stay != null ? String(cella.min_stay) : '',
                                chiuso_arrivo: cella.chiuso_arrivo, chiuso_partenza: cella.chiuso_partenza, stop_sell: cella.stop_sell,
                              });
                              setPopoverAperto({ trattamento: tr.id, data: di });
                            }}
```

(sostituisce l'`onClick` scritto nel Task 7, stesso corpo più il controllo `dragMosso` in testa).

- [ ] **Step 3: Drawer di bulk-edit**

Dopo la tabella, prima della chiusura di `<AppShell>`:

```jsx
      {drawerAperto && drawerForm && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setDrawerAperto(false)}>
          <div className="h-full w-full max-w-md flex flex-col" style={{ background: 'white' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="font-semibold text-[13.5px]">Modifica intervallo</p>
              <button onClick={() => setDrawerAperto(false)} className="text-lg" style={{ color: 'var(--muted-foreground)' }}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-sm">
              <div className="mb-4">
                <label className="block text-xs font-medium mb-1.5">Trattamento</label>
                <div className="flex gap-1.5 flex-wrap">
                  {TRATTAMENTI.map(tr => (
                    <button key={tr.id}
                            onClick={() => setDrawerForm(f => {
                              const s = new Set(f.trattamenti);
                              if (s.has(tr.id)) { if (s.size > 1) s.delete(tr.id); } else s.add(tr.id);
                              return { ...f, trattamenti: s };
                            })}
                            className="text-xs px-3 py-1.5 rounded-full"
                            style={drawerForm.trattamenti.has(tr.id) ? { background: 'var(--hotel-navy)', color: 'white' } : { border: '1px solid var(--border)' }}>
                      {tr.nome}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium mb-1.5">Cosa modificare</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[{ id: 'prezzo', nome: 'Prezzo (€)' }, { id: 'min_stay', nome: 'Min. stay' }, { id: 'chiuso_arrivo', nome: 'CTA' }, { id: 'chiuso_partenza', nome: 'CTD' }, { id: 'stop_sell', nome: 'Stop-sell' }].map(c => (
                    <button key={c.id}
                            onClick={() => setDrawerForm(f => {
                              const s = new Set(f.campi);
                              if (s.has(c.id)) { if (s.size > 1) s.delete(c.id); } else s.add(c.id);
                              return { ...f, campi: s };
                            })}
                            className="text-xs px-3 py-1.5 rounded-full"
                            style={drawerForm.campi.has(c.id) ? { background: 'var(--hotel-navy)', color: 'white' } : { border: '1px solid var(--border)' }}>
                      {c.nome}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5 mb-4">
                <label className="text-xs font-medium">Dal
                  <input type="date" value={drawerForm.dataInizio} onChange={e => setDrawerForm(f => ({ ...f, dataInizio: e.target.value }))}
                         className="block w-full mt-1 px-2.5 py-1.5 rounded-lg text-sm" style={{ border: '1px solid var(--border)' }} />
                </label>
                <label className="text-xs font-medium">Al
                  <input type="date" value={drawerForm.dataFine} onChange={e => setDrawerForm(f => ({ ...f, dataFine: e.target.value }))}
                         className="block w-full mt-1 px-2.5 py-1.5 rounded-lg text-sm" style={{ border: '1px solid var(--border)' }} />
                </label>
              </div>
              {[...drawerForm.campi].map(campoId => (
                <div key={campoId} className="mb-3">
                  {campoId === 'prezzo' || campoId === 'min_stay' ? (
                    <label className="text-xs font-medium">{campoId === 'prezzo' ? 'Nuovo prezzo (€)' : 'Nuovo minimo notti'}
                      <input type="number" value={drawerForm.valori[campoId] ?? ''}
                             onChange={e => setDrawerForm(f => ({ ...f, valori: { ...f.valori, [campoId]: e.target.value } }))}
                             className="block w-full mt-1 px-2.5 py-1.5 rounded-lg text-sm" style={{ border: '1px solid var(--border)' }} />
                    </label>
                  ) : (
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <input type="checkbox" checked={!!drawerForm.valori[campoId]}
                             onChange={e => setDrawerForm(f => ({ ...f, valori: { ...f.valori, [campoId]: e.target.checked } }))} />
                      Attiva {campoId === 'chiuso_arrivo' ? 'CTA' : campoId === 'chiuso_partenza' ? 'CTD' : 'stop-sell'}
                    </label>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setDrawerAperto(false)} className="text-sm px-4 py-2 rounded-lg" style={{ border: '1px solid var(--border)' }}>Annulla</button>
              <button onClick={applicaDrawer} className="text-sm px-4 py-2 rounded-lg text-white" style={{ background: 'var(--hotel-navy)' }}>Applica</button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Verifica sintattica finale**

```bash
cd gestionale-hotel/frontend && npx esbuild app/planning-tariffe/page.jsx --bundle --jsx=automatic --loader:.jsx=jsx \
  --external:react --external:react-dom --external:next/navigation --external:lucide-react "--external:@/*" \
  --outfile=/tmp/verifica-planning-tariffe-finale.js
```

Expected: exit 0. Dichiarare esplicitamente: nessuna build Next reale, nessun test, **zero verifica visiva/interattiva** del drag-select — quello richiede un vero browser, non disponibile da questa sandbox.

## Self-review

1. **Copertura**: schema (T1) ✓, lettura griglia con seed dal motore esistente (T2) ✓, scrittura bulk con alert cartellino riusando Piano 1 (T3) ✓, route+permessi (T4) ✓, pagina+navigazione+selettore periodo (T5) ✓, doppio click prezzo (T6) ✓, popover restrizioni giorno singolo (T7) ✓, drag-select+drawer multi-campo (T8) ✓. Fuori scope dichiarato esplicitamente: disponibilità, applica-a-riga/colonna, integrazione motore prezzo reale, wiring restrizioni→disponibilità booking.
2. **Placeholder scan**: nessun TBD; l'unico punto genuinely aperto è lo Step 3 del Task 5 (trovare il file di navigazione) — non è un placeholder di codice ma un passo di ricerca con un comando `grep` esatto e un criterio di successo esplicito ("stessa struttura della voce esistente"), l'unica soluzione onesta dato che quel file non è mai stato letto in questa sessione.
3. **Coerenza nomi/tipi**: `trattamento` usa sempre `'bb'|'mezza_pensione'|'pensione_completa'` (T1-T8, mai i nomi placeholder del mockup); `data_da`/`data_a` sempre inclusivi in questo modulo (T1-T8); shape della risposta GET (`{giorni, righe}`) definita in T2, consumata identica in T5-T8; shape del body PATCH definita in T3, usata identica in T6-T8; `violazioni[]` (T3) consumato in T6 (primo elemento) e T8 (conteggio) — coerente.
