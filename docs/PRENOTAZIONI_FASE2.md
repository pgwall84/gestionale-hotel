# Modulo Prenotazioni — Fase 2A

Documento di riferimento unico per il modulo Prenotazioni (camere). Sostituisce
i 5 documenti di contratto scritti sessione per sessione tra il 15/07 e il
17/07/2026 (MOCKUP_VISTE_FASE2, SCHEMA_PRENOTAZIONI_FASE2, API_PRENOTAZIONI_FASE2,
FRONTEND_GRIGLIA_FASE2, FRONTEND_NUOVA_PRENOTAZIONE_FASE2 — rimossi il
26/07/2026, contenuto qui consolidato, cronologia recuperabile da git).

Cronologia sessione-per-sessione di come si è arrivati a questo stato:
`docs/DIARIO_SESSIONI.md`. Decisioni architetturali di fondo (PCI scope zero,
sicurezza webhook, GDPR a due basi giuridiche) restano quelle discusse in
quella sede — qui si documenta solo lo stato attuale del contratto API, dello
schema e della UI.

---

## Stato — vedi STATO_PROGETTO.md, questa sezione era stale

⚠️ **Corretto il 23/08/2026**: questa sezione era rimasta ferma al
31/07/2026 e diceva ancora "non costruito" per 2.4 e 2.5, completati
rispettivamente il 01/08 e il 13/08/2026. Lo stato modulo-per-modulo,
sempre aggiornato, vive ora in `STATO_PROGETTO.md` (root del repo) — non
duplicarlo più qui. Questa sezione resta solo come descrizione tecnica di
cosa il contratto API sotto (Parte A) copre e cosa no, non come fonte di
stato.

**Implementato e in uso (contratto API sotto, Parte A):**
- Ospiti — anagrafica CRUD, documento sempre mascherato, svela-documento loggato
- Prenotazioni — CRUD + state machine completa (opzione→confermata→check_in→check_out→chiusa, più interrotta)
- Soggiorni + Soggiorno_ospiti — multi-camera, multi-ospite, vincolo capofamiglia
- Gruppi di prenotazione + Pagamenti (singoli e di gruppo)
- Vincolo anti-overbooking a livello DB (`EXCLUDE` su `soggiorni`)
- Vista griglia/planning (drag-and-drop, `/planning-camere`)
- Form "Nuova prenotazione" (pulsante + click su cella vuota)
- Pulsanti di transizione stato nel pannello dettaglio: check-in, conferma, check-out, annulla
- Tariffe, stagionalità, pacchetti (modulo 2.2): categorie camera
  (`tipi_camera`), listino per categoria con stagionalità (`tariffe`),
  pacchetti a prezzo fisso (`pacchetti`), auto-calcolo tariffa nel form
  "Nuova prenotazione" con override manuale sempre disponibile.

**Non copre** (contratto API di questo documento — per lo stato reale di
questi moduli vedi `STATO_PROGETTO.md`, non questa lista):
- 2.3 — Integrazione OTA/channel manager. **Il fornitore non è più WuBook/
  WooDoo**: scartato il 19/08/2026 insieme a RoomCloud, entrambi accettano
  solo fornitori certificati con portafoglio multi-cliente, non un singolo
  hotel col proprio gestionale — scelto **Beds24** al suo posto (spec
  separata, non ancora scritta). `canale_origine` diverso da `diretta` è
  già nello schema ma inerte; la mappatura `tipi_camera.id ↔ canale ↔
  codice_esterno` (`tipi_camera_canali`, fatta il 31/07) resta valida a
  prescindere dal fornitore scelto.
- Viste Ospiti/Pulizie/Conto ospite/Report (mockup originali punti 3-6, mai costruite — vedi Parte D)
- Cron scadenza automatica "Opzione" (24-48h) — evolutiva separata, vedi `docs/EVOLUTIVE.md`

---

## Parte A — Contratto API

Path sotto `/api/*`, autenticazione JWT via `verificaToken`. Risposte liste:
array diretto. Risposte singolo record: `RETURNING *` o colonne esplicite.
Errori: `{ error: '...' }`. Nessun `DELETE` fisico su prenotazioni/soggiorni,
solo transizione a `interrotta`. Date in formato ISO `YYYY-MM-DD`.
`documento_numero` di `ospiti` non è mai incluso in chiaro fuori dall'endpoint
dedicato "svela documento".

Legenda ruoli: **A**=admin, **T**=titolare, **R**=receptionist, **P**=portiere_notte.

### A.1 — Ospiti

| Metodo | Path | Permessi | Descrizione |
|---|---|---|---|
| GET | `/api/ospiti?search=` | A,T,R,P (lettura) | Ricerca nome/cognome, max 20 risultati, documento mascherato |
| GET | `/api/ospiti/:id` | A,T,R,P (lettura) | Dettaglio + storico soggiorni, documento mascherato |
| POST | `/api/ospiti` | A,T,R | Crea ospite |
| PATCH | `/api/ospiti/:id` | A,T,R | Aggiorna ospite |
| POST | `/api/ospiti/:id/svela-documento` | A,T,R (non P) | Restituisce documento in chiaro, scrive sempre in `audit_log` |

### A.2 — Prenotazioni

| Metodo | Path | Permessi | Descrizione |
|---|---|---|---|
| GET | `/api/prenotazioni/griglia?data_inizio=&data_fine=` | A,T,R,P | Vista planning: tutte le camere (anche libere) + soggiorni che intersecano l'intervallo, con `camere.piano` |
| GET | `/api/prenotazioni/:id` | A,T,R,P | Dettaglio + soggiorni + ospiti + pagamenti |
| POST | `/api/prenotazioni` | A,T,R | Crea prenotazione + primo soggiorno in transazione. `data_scadenza_opzione` calcolata lato backend (+48h). Può restituire `409` se la camera è già occupata nelle date richieste |
| PATCH | `/api/prenotazioni/:id` | A,T,R | Modifica `note`/`canale_origine` |
| PATCH | `/api/prenotazioni/:id/stato` | A,T,R (+ P solo per `check_in`) | Transizione di stato, validata contro la state machine sotto |

State machine (`TRANSIZIONI_VALIDE` come mappa nel controller, non if/else):

```
opzione      → confermata | interrotta
confermata   → check_in   | interrotta
check_in     → check_out
check_out    → chiusa
```

Qualsiasi altra transizione → `400`. Passaggio a `interrotta` imposta
`cancellato = true` su tutti i soggiorni collegati, stessa transazione.

### A.3 — Soggiorni (sub-risorsa)

| Metodo | Path | Permessi | Descrizione |
|---|---|---|---|
| POST | `/api/prenotazioni/:id/soggiorni` | A,T,R | Aggiunge un altro soggiorno (camera) alla stessa prenotazione |
| PATCH | `/api/soggiorni/:id` | A,T,R | Modifica camera/date/tariffa — endpoint usato dal drag-and-drop della griglia. Può restituire `409` |

### A.4 — Soggiorno_ospiti

| Metodo | Path | Permessi | Descrizione |
|---|---|---|---|
| GET | `/api/soggiorni/:id/ospiti` | A,T,R,P | Lista ospiti del soggiorno |
| POST | `/api/soggiorni/:id/ospiti` | A,T,R | Aggiunge un ospite (`ospite_id`, `tipo_alloggiato`) |
| DELETE | `/api/soggiorni/:id/ospiti/:ospiteId` | A,T,R | Rimuove un ospite |

Vincolo applicativo (validato nel controller, non CHECK a DB): ogni soggiorno
deve avere esattamente un ospite con `tipo_alloggiato IN ('16','17','18')`.

### A.5 — Pagamenti

| Metodo | Path | Permessi | Descrizione |
|---|---|---|---|
| GET / POST | `/api/prenotazioni/:id/pagamenti` | A,T,R | Pagamenti della prenotazione |
| GET / POST | `/api/gruppi/:id/pagamenti` | A,T,R | Pagamenti del gruppo (`gruppo_id` invece di `prenotazione_id`, CHECK XOR) |

Stato sempre `completato` per pagamenti registrati manualmente (i pagamenti
online via WuBook arriveranno da webhook in modulo 2.3, gestiti diversamente).

### A.6 — Gruppi di prenotazione

| Metodo | Path | Permessi | Descrizione |
|---|---|---|---|
| GET | `/api/gruppi` | A,T,R,P | Ricerca (`search=` su nome/referente, `ILIKE`, `LIMIT 30`) — 15/08/2026 |
| GET | `/api/gruppi/:id` | A,T,R,P | Dettaglio + prenotazioni collegate + totali aggregati (addebiti e pagamenti, nessun saldo netto precalcolato) |
| POST | `/api/gruppi` | A,T,R | Crea gruppo |
| PATCH | `/api/gruppi/:id` | A,T,R | Aggiorna referente/nome |

`PATCH /api/prenotazioni/:id` accetta anche `gruppo_id` (undefined-safe:
assente nel body → invariato, `null` esplicito → sgancia dal gruppo) —
usato da UI/gruppi (Sezione "UI Prenotazioni di gruppo" sotto), non
duplicato in un endpoint a parte.

`PATCH /api/soggiorni/:id/annulla` (A,T,R) — annulla un solo soggiorno di
una prenotazione multi-camera, bloccato con `400` se è l'ultimo attivo
(in quel caso va annullata l'intera prenotazione). Aggiunto 15/08/2026,
serve al form "famiglia su più camere" (sotto).

### A.7 — Tipi camera (modulo 2.2)

| Metodo | Path | Permessi | Descrizione |
|---|---|---|---|
| GET | `/api/tipi-camera` | A,T,R (lettura) | Elenco categorie, con conteggio camere assegnate |
| POST | `/api/tipi-camera` | A,T (scrittura) | Crea categoria (`nome` univoco, `capienza_max`, `note`) |
| PATCH | `/api/tipi-camera/:id` | A,T (scrittura) | Modifica categoria |
| DELETE | `/api/tipi-camera/:id` | A,T (scrittura) | Elimina categoria, `409` se referenziata da camere o tariffe |

`note` è un campo libero per annotare a mano il riferimento alla categoria
sui canali OTA (es. "Booking.com: Camera Doppia Standard") — non una vera
mappatura, che arriverà con il modulo 2.3.

### A.8 — Tariffe (modulo 2.2)

| Metodo | Path | Permessi | Descrizione |
|---|---|---|---|
| GET | `/api/tariffe?tipo_camera_id=` | A,T,R (lettura) | Elenco fasce tariffarie, filtro opzionale per categoria |
| GET | `/api/tariffe/calcola?tipo_camera_id=&data_arrivo=&data_partenza=` | A,T,R (lettura) | Somma `prezzo_notte` per ogni notte del soggiorno (`data_partenza` esclusa). Se una o più notti non hanno tariffa configurata, ritorna `prezzo_totale: null` e l'elenco in `notti_scoperte` invece di un totale silenziosamente incompleto |
| POST | `/api/tariffe` | A,T (scrittura) | Crea fascia (`tipo_camera_id`, `nome_stagione`, `data_inizio`, `data_fine`, `prezzo_notte`). `409` se le date si sovrappongono a una fascia esistente per la stessa categoria |
| PATCH | `/api/tariffe/:id` | A,T (scrittura) | Modifica fascia, stesso `409` di sovrapposizione |
| DELETE | `/api/tariffe/:id` | A,T (scrittura) | Elimina fascia |

Vincolo anti-sovrapposizione a livello DB (`EXCLUDE USING gist`, come
l'anti-overbooking di `soggiorni`): due fasce della stessa categoria non
possono avere periodi che si intersecano.

### A.9 — Pacchetti (modulo 2.2)

| Metodo | Path | Permessi | Descrizione |
|---|---|---|---|
| GET | `/api/pacchetti?attivo=true` | A,T,R (lettura) | Elenco pacchetti, filtro opzionale su `attivo` |
| POST | `/api/pacchetti` | A,T (scrittura) | Crea pacchetto (`nome`, `descrizione`, `num_notti`, `prezzo_totale`) |
| PATCH | `/api/pacchetti/:id` | A,T (scrittura) | Modifica pacchetto, incluso il toggle `attivo` |

Nessun `DELETE`: un soggiorno passato può referenziare ancora un pacchetto
non più in vendita — la "eliminazione" da UI disattiva soltanto.

### A.10 — Camere (estensione modulo 2.2)

| Metodo | Path | Permessi | Descrizione |
|---|---|---|---|
| PATCH | `/api/camere/:id/tipo` | soloTitolare (A,T) | Assegna `tipo_camera_id` a una camera |

`GET /api/camere` ora include anche `piano`, `tipo_camera_id`, `tipo_camera_nome`.

### Tabella permessi per ruolo

| Ruolo | Ospiti | Prenotazioni | Soggiorni/ospiti | Gruppi | Pagamenti | Tipi camera / Tariffe / Pacchetti |
|---|---|---|---|---|---|---|
| admin, titolare | lettura+scrittura+svela | lettura+scrittura+stato | lettura+scrittura | lettura+scrittura | lettura+scrittura | lettura+scrittura |
| receptionist | lettura+scrittura+svela | lettura+scrittura+stato | lettura+scrittura | lettura+scrittura | lettura+scrittura | sola lettura |
| portiere_notte | sola lettura, no svela | lettura + solo transizione `check_in` | sola lettura | sola lettura | nessun accesso | nessun accesso |
| cameriere, cuoco, dipendente | nessun accesso | nessun accesso | nessun accesso | nessun accesso | nessun accesso | nessun accesso |

Tradotto in `shared/ruoli.js` come oggetto per azione (non array flat) nelle
chiavi `ospiti`, `prenotazioni`, `soggiorni`, `gruppi`, `pagamenti`,
`tipi_camera`, `tariffe`, `pacchetti`.

### Non incluso in questo contratto (rimandato)

- Endpoint webhook WuBook/A-Cube — modulo 2.3
- Generazione/invio schedine Alloggiati Web — modulo 2.5
- Cron scadenza automatica Opzioni — vedi `docs/EVOLUTIVE.md`
- Export ROSS1000/ISTAT — modulo 2.6

---

## Parte B — Schema database

Tabelle create in migration `016_prenotazioni_fase2.sql` e `017_overbooking_gruppi_piano.sql`.

### B.1 — `ospiti`

```sql
CREATE TABLE ospiti (
  id                      SERIAL PRIMARY KEY,
  nome                    VARCHAR(255) NOT NULL,
  cognome                 VARCHAR(255) NOT NULL,
  sesso                   CHAR(1),        -- 'M'/'F' — convertito in 1/2 solo in fase di generazione tracciato
  data_nascita            DATE,
  stato_nascita_codice    VARCHAR(9),     -- Tabella Stati — sempre obbligatorio per Alloggiati Web
  comune_nascita_codice   VARCHAR(9),     -- Tabella Comuni — obbligatorio solo se nato in Italia
  provincia_nascita       VARCHAR(2),
  cittadinanza_codice     VARCHAR(9),     -- Tabella Stati
  documento_tipo_codice   VARCHAR(5),     -- Tabella Tipi_Documento — solo capofamiglia/singolo/capogruppo
  documento_numero        VARCHAR(20),    -- testuale, MAI foto/scansione — solo capofamiglia/singolo/capogruppo
  luogo_rilascio_codice   VARCHAR(9),
  email                   VARCHAR(255),
  telefono                VARCHAR(50),
  note                    TEXT,
  consenso_marketing        BOOLEAN NOT NULL DEFAULT false,
  consenso_marketing_data   TIMESTAMP,
  created_at              TIMESTAMP NOT NULL DEFAULT now(),
  updated_at              TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_ospiti_sesso CHECK (sesso IS NULL OR sesso IN ('M','F'))
);
CREATE INDEX idx_ospiti_cognome_nome ON ospiti (cognome, nome);
```

I campi `*_codice` sono codici delle tabelle ufficiali Alloggiati Web (Stati,
Comuni, Tipi_Documento, scaricabili via SOAP `Tabella`) — non testo libero.
`sesso`, `data_nascita`, `stato_nascita_codice`, `cittadinanza_codice`
obbligatori per tutti gli ospiti; `comune_nascita_codice`/`provincia_nascita`
solo se nati in Italia; `documento_*` solo per tipo 16/17/18.

### B.2 — `soggiorno_ospiti` (ponte)

```sql
CREATE TABLE soggiorno_ospiti (
  id                SERIAL PRIMARY KEY,
  soggiorno_id      INTEGER NOT NULL REFERENCES soggiorni(id),
  ospite_id         INTEGER NOT NULL REFERENCES ospiti(id),
  tipo_alloggiato   VARCHAR(2) NOT NULL,   -- '16' singolo,'17' capofamiglia,'18' capogruppo,'19' familiare,'20' membro gruppo
  created_at        TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_soggiorno_ospiti_tipo CHECK (tipo_alloggiato IN ('16','17','18','19','20')),
  CONSTRAINT uq_soggiorno_ospite UNIQUE (soggiorno_id, ospite_id)
);
CREATE INDEX idx_soggiorno_ospiti_soggiorno ON soggiorno_ospiti (soggiorno_id);
```

`soggiorni.ospite_id` resta come riferimento rapido all'intestatario per la
UI, ma la lista autorevole e completa (per le schedine Alloggiati Web) è
sempre `soggiorno_ospiti`. Vive sotto la base giuridica "finalità fiscale"
(conservabile fino a 10 anni), distinta dall'obbligo Alloggiati Web (5 anni,
tracciato in `alloggiati_invii`).

### B.3 — `gruppi_prenotazione`

```sql
CREATE TABLE gruppi_prenotazione (
  id                  SERIAL PRIMARY KEY,
  nome                VARCHAR(255) NOT NULL,
  referente_nome      VARCHAR(255),
  referente_email     VARCHAR(255),
  referente_telefono  VARCHAR(50),
  note                TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT now()
);
```

### B.4 — `prenotazioni`

```sql
CREATE TABLE prenotazioni (
  id                    SERIAL PRIMARY KEY,
  canale_origine        VARCHAR(30) NOT NULL,   -- 'diretta','wubook','booking_com','airbnb'...
  external_booking_id   VARCHAR(255) UNIQUE,    -- idempotenza da WuBook, NULL se diretta
  stato                 VARCHAR(20) NOT NULL DEFAULT 'opzione',
  data_scadenza_opzione TIMESTAMP,
  gruppo_id             INTEGER REFERENCES gruppi_prenotazione(id),
  note                  TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT now(),
  updated_at            TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_prenotazioni_stato CHECK (stato IN ('opzione','confermata','check_in','check_out','chiusa','interrotta'))
);
CREATE INDEX idx_prenotazioni_stato ON prenotazioni (stato);
CREATE INDEX idx_prenotazioni_gruppo ON prenotazioni (gruppo_id);
```

### B.5 — `soggiorni`

```sql
CREATE TABLE soggiorni (
  id                SERIAL PRIMARY KEY,
  prenotazione_id   INTEGER NOT NULL REFERENCES prenotazioni(id),
  camera_id         INTEGER NOT NULL REFERENCES camere(id),
  ospite_id         INTEGER NOT NULL REFERENCES ospiti(id),
  data_arrivo       DATE NOT NULL,
  data_partenza     DATE NOT NULL,
  num_ospiti        INTEGER NOT NULL DEFAULT 1,
  tariffa_totale    NUMERIC(10,2),
  cancellato        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMP NOT NULL DEFAULT now(),
  updated_at        TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_soggiorni_date CHECK (data_partenza > data_arrivo)
);
CREATE INDEX idx_soggiorni_date ON soggiorni (data_arrivo, data_partenza);
CREATE INDEX idx_soggiorni_camera ON soggiorni (camera_id);

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE soggiorni ADD CONSTRAINT excl_soggiorni_camera_overlap
  EXCLUDE USING gist (
    camera_id WITH =,
    daterange(data_arrivo, data_partenza, '[)') WITH &&
  ) WHERE (cancellato = false);
```

Vincolo anti-overbooking a livello DB: due soggiorni non cancellati sulla
stessa camera con date sovrapposte falliscono con errore Postgres
(`excl_soggiorni_camera_overlap`), tradotto dal controller in `409`. Regola di
sincronizzazione **obbligatoria**: quando una prenotazione passa a
`interrotta`, il controller deve impostare `cancellato = true` su tutti i suoi
soggiorni nella stessa transazione — qualunque nuovo percorso di
cancellazione futuro (es. webhook WuBook) deve passare da lì.

### B.6 — `pagamenti`

```sql
CREATE TABLE pagamenti (
  id                    SERIAL PRIMARY KEY,
  prenotazione_id       INTEGER REFERENCES prenotazioni(id),
  gruppo_id             INTEGER REFERENCES gruppi_prenotazione(id),
  importo               NUMERIC(10,2) NOT NULL,
  metodo                VARCHAR(30),
  tipo                  VARCHAR(20) NOT NULL,    -- caparra, saldo, corrispettivo
  stato                 VARCHAR(20) NOT NULL DEFAULT 'pending',
  external_payment_id   VARCHAR(255),
  acube_id              VARCHAR(255),
  created_at            TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_pagamenti_stato CHECK (stato IN ('pending','completato','fallito','rimborsato')),
  CONSTRAINT chk_pagamenti_prenotazione_o_gruppo CHECK (
    (prenotazione_id IS NOT NULL AND gruppo_id IS NULL) OR
    (prenotazione_id IS NULL AND gruppo_id IS NOT NULL)
  )
);
CREATE INDEX idx_pagamenti_prenotazione ON pagamenti (prenotazione_id);
CREATE INDEX idx_pagamenti_gruppo ON pagamenti (gruppo_id);
```

Nessun campo per dati carta in nessuna tabella (PCI scope zero) — il
gestionale riceve solo `external_payment_id` + `stato` via webhook.

### B.7 — `webhook_log` (predisposta, non ancora popolata — modulo 2.3)

```sql
CREATE TABLE webhook_log (
  id              SERIAL PRIMARY KEY,
  fonte           VARCHAR(30) NOT NULL,     -- 'wubook','acube'
  payload_raw     JSONB NOT NULL,
  hmac_valido     BOOLEAN,
  processato      BOOLEAN NOT NULL DEFAULT false,
  errore          TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT now()
);
```

Scrivere qui sempre, prima di qualunque elaborazione, anche se la firma HMAC
non è valida (loggare `hmac_valido = false` e uscire, non scartare in silenzio).

### B.8 — `alloggiati_invii` (predisposta, non ancora popolata — modulo 2.5)

```sql
CREATE TABLE alloggiati_invii (
  id              SERIAL PRIMARY KEY,
  soggiorno_id    INTEGER NOT NULL REFERENCES soggiorni(id),
  data_invio      TIMESTAMP NOT NULL DEFAULT now(),
  protocollo      VARCHAR(255),
  esito           VARCHAR(20),    -- 'ok','errore','in_attesa'
  created_at      TIMESTAMP NOT NULL DEFAULT now()
);
```

Traccia solo l'invio, mai i dati del documento — base giuridica TULPS,
separata dall'anagrafica ospiti. Conservazione 5 anni, indipendente dai 10
anni di `ospiti`.

### B.9 — `camere.piano`

```sql
ALTER TABLE camere ADD COLUMN piano SMALLINT;
```

Nullable, 0=piano terra, negativi=seminterrati, positivi=piani superiori.
Popolato il 17/07/2026 per le 20 camere reali (bande da 5: 1-5→1, 6-10→2,
11-15→3, 16-21→4 con 17 mancante; l'unità `'app'` resta NULL, è un
appartamento esterno, non un dato dimenticato).

### B.10 — `tipi_camera` (modulo 2.2, migration `018_tariffe_pacchetti.sql`)

```sql
CREATE TABLE tipi_camera (
  id            SERIAL PRIMARY KEY,
  nome          VARCHAR(50) NOT NULL UNIQUE,
  capienza_max  SMALLINT,
  note          TEXT,       -- riferimento manuale alla categoria OTA, finché non c'è il modulo 2.3
  created_at    TIMESTAMP NOT NULL DEFAULT now()
);
```

Seed delle 5 categorie concordate: Singola, Doppia uso singola, Matrimoniale,
Tripla, Quadrupla. Tabella vera (non `VARCHAR` libero) per avere un `id`
stabile da referenziare sia dal listino tariffe sia, in futuro, dalla
mappatura OTA del modulo 2.3.

`camere.tipo_camera_id INTEGER REFERENCES tipi_camera(id)` — nullable, da
assegnare manualmente alle camere esistenti dopo la migration (stesso
pattern già usato per `camere.piano`).

### B.11 — `tariffe` (modulo 2.2)

```sql
CREATE TABLE tariffe (
  id              SERIAL PRIMARY KEY,
  tipo_camera_id  INTEGER NOT NULL REFERENCES tipi_camera(id),
  nome_stagione   VARCHAR(100),
  data_inizio     DATE NOT NULL,
  data_fine       DATE NOT NULL,
  prezzo_notte    NUMERIC(10,2) NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_tariffe_date CHECK (data_fine >= data_inizio),
  CONSTRAINT chk_tariffe_prezzo CHECK (prezzo_notte > 0)
);

ALTER TABLE tariffe ADD CONSTRAINT excl_tariffe_tipo_camera_overlap
  EXCLUDE USING gist (
    tipo_camera_id WITH =,
    daterange(data_inizio, data_fine, '[]') WITH &&
  );
```

Range inclusivo su entrambi gli estremi (`'[]'`): qui si definiscono confini
di stagione (giorno di calendario), diverso da `soggiorni` dove `'[)'`
esclude il giorno di partenza (quella è una notte di soggiorno, questa è un
confine di calendario). Due fasce della stessa categoria non possono avere
periodi sovrapposti — stesso meccanismo dell'anti-overbooking su `soggiorni`.

### B.12 — `pacchetti` (modulo 2.2)

```sql
CREATE TABLE pacchetti (
  id             SERIAL PRIMARY KEY,
  nome           VARCHAR(255) NOT NULL,
  descrizione    TEXT,
  num_notti      INTEGER NOT NULL,
  prezzo_totale  NUMERIC(10,2) NOT NULL,
  attivo         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMP NOT NULL DEFAULT now(),
  updated_at     TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_pacchetti_notti CHECK (num_notti > 0),
  CONSTRAINT chk_pacchetti_prezzo CHECK (prezzo_totale > 0)
);
```

Prezzo fisso indipendente dal calcolo per notte (es. "Weekend Relax 2 notti"
a 250€ tutto compreso, non derivato dal listino `tariffe`). Nessun `DELETE`
fisico previsto lato API — solo `attivo = false`.

`soggiorni.pacchetto_id INTEGER REFERENCES pacchetti(id)` — nullable. Quando
valorizzato, il form usa `pacchetti.prezzo_totale` come `tariffa_totale`
(comunque sempre sovrascrivibile a mano, come il resto del campo).

### Ruoli e permessi — decisione presa

Niente nuovo ruolo "governante": si riusano i 7 ruoli esistenti. Ospiti
(lettura/scrittura/svela): admin, titolare, receptionist; portiere_notte sola
lettura (check-in notturno); cameriere/cuoco/dipendente nessun accesso.
Documento mascherato è una regola di UI/controller, non una view o colonna
separata nel DB.

### Retention — calcolata a runtime, nessun job automatico

```sql
-- limite fiscale (10 anni) per un ospite, dal suo ultimo soggiorno
SELECT MAX(s.data_partenza) + INTERVAL '10 years' AS limite_fiscale
FROM soggiorni s WHERE s.ospite_id = $1;

-- limite Alloggiati Web (5 anni) per un invio
SELECT data_invio + INTERVAL '5 years' AS limite_alloggiati
FROM alloggiati_invii WHERE id = $1;
```

Job di anonimizzazione/cancellazione automatica alla scadenza: rimandato, non
giustificato dal volume attuale (20 camere).

---

## Parte C — UI (as-built)

### Griglia planning (`/planning-camere`)

- Righe: tutte le camere (anche libere), raggruppate per `piano`. Colonne:
  giorni. Selettore vista 7gg/14gg/mese in alto a sinistra, con frecce
  avanti/indietro.
- Colori per stato: `opzione` ambra, `confermata` blu/accent, `check_in`
  verde, `check_out` grigio chiaro, `chiusa` grigio scuro. `interrotta` non
  compare mai (il backend esclude `cancellato=true`).
- Click sulla barra → pannello dettaglio (dati da `GET /api/prenotazioni/:id`):
  ospite, camera, date, num. ospiti, stato, pagamenti, canale. Azioni: Check-in,
  Conferma, Check-out, Annulla (visibili solo per le transizioni valide dallo
  stato corrente), Modifica.
- Drag-and-drop: sposta camera/date via `PATCH /api/soggiorni/:id`,
  aggiornamento ottimistico con rollback immediato su `409` + messaggio
  "Camera già occupata in queste date". Libreria: `@dnd-kit/core` (scelta dopo
  confronto con HTML5 drag nativo e react-big-calendar).
- Permessi: solo admin/titolare/receptionist possono trascinare o usare i
  pulsanti di transizione (eccetto check-in, anche portiere_notte). Applicato
  sia lato frontend (disabled) sia lato backend (già garantito dai permessi
  del controller).

### Elenco prenotazioni (toggle Griglia/Elenco, 14/08/2026)

Nasce dal confronto con la pagina "Reservations" di Cloudbeds (separata dal
calendario): non una voce nuova in sidebar — la sezione OSPITALITÀ era già
segnalata come troppo affollata (7 voci, nota 04/08/2026) — ma un secondo
"modo" della stessa voce Prenotazioni, toggle Griglia/Elenco in alto a
sinistra della pagina `/planning-camere` (stesso pattern già usato per
Alloggiati Web operativa/configurazione).

- `GET /api/prenotazioni` — una riga per soggiorno/camera (non per
  prenotazione: un gruppo multi-camera compare su più righe, è la
  granularità utile a "trova questo ospite"). Filtri combinabili: `ricerca`
  (nome/cognome ospite o numero camera, ILIKE), `data_da`/`data_a` (su
  `data_arrivo`), `stato`, `canale_origine`. Paginazione (`pagina`,
  `per_pagina`, default 50, tetto 200). Stessi permessi di `/griglia`
  (admin/titolare/receptionist/portiere_notte, lettura) — è la stessa vista
  in un'altra forma, non una nuova superficie di accesso.
- Esclude sempre `soggiorni.cancellato = true`, stessa scelta della griglia
  (`/griglia` filtra allo stesso modo nel JOIN) — un soggiorno interrotto
  non compare né lì né qui.
- UI: barra filtri (ricerca, intervallo arrivo, stato), tabella con click →
  stesso pannello dettaglio della griglia (`PannelloDettaglio`, nessun
  componente duplicato), paginazione.

### Ricerca nella griglia (14/08/2026)

Casella di ricerca nella toolbar di `/planning-camere` (solo vista Griglia)
— confronto su nome/cognome ospite e numero camera, stessi dati già
presenti nella risposta di `/griglia` (nessuna chiamata in più). Evidenzia
per contrasto invece di nascondere: le barre che non corrispondono restano
visibili ma con opacità ridotta (stesso pattern "grayed out" di Cloudbeds,
che mantiene il contesto visivo della griglia invece di uno stato vuoto
disorientante). Ambito diverso dalla lente di ricerca globale della
Sidebar (quella è navigazione tra pagine, non filtro sui dati di questa
pagina).

### Form "Nuova prenotazione"

Due punti d'ingresso, stesso componente: pulsante accanto al selettore vista
(form vuoto), o click su cella vuota della griglia (camera + data
pre-compilati). Campi: camera, ospite (autocomplete `GET /api/ospiti?search=`
+ mini-form "+ Nuovo ospite" con solo nome/cognome), date arrivo/partenza
(validazione partenza > arrivo lato form), numero ospiti, tariffa totale,
canale origine (default `diretta`), note. Su `409` (camera occupata) il
form resta aperto con messaggio, l'utente corregge e riprova — non perde i
dati inseriti. Su successo: **non chiude più subito** (15/08/2026) — resta
aperto in modalità "famiglia su più camere" (stesso intestatario, loop
"aggiungi un'altra camera" su `POST /api/prenotazioni/:id/soggiorni`,
rimozione via `PATCH /api/soggiorni/:id/annulla`); refetch griglia avviene
solo alla chiusura ("Fine"), nuove barre `opzione` (ambra) visibili subito
dopo.

### UI Prenotazioni di gruppo (15/08/2026)

Gruppo non più "omesso" dal form rapido come diceva la versione precedente
di questa nota — ora ha un flusso proprio, distinto dalla famiglia su più
camere sopra (prenotazioni SEPARATE con `gruppo_id` condiviso, non
soggiorni della stessa prenotazione): pulsante "Nuovo gruppo" in toolbar
apre `WizardGruppo` (dati gruppo → loop "aggiungi camera", ogni camera è
una `POST /api/prenotazioni` con `gruppo_id` e ospite proprio). Da un
pannello dettaglio già aperto, sezione "Gruppo" con `ModalAssegnaGruppo`
(ricerca su `GET /api/gruppi?search=` + mini "+ nuovo gruppo") per il caso
la stessa comitiva prenoti in un secondo momento. `ModalDettaglioGruppo`:
elenco camere con stato e "Sgancia" (`PATCH gruppo_id: null`), due totali
separati (addebiti/pagato), form pagamento con selettore esplicito "tutto
il gruppo" / "solo questa camera" — instrada verso
`POST /api/gruppi/:id/pagamenti` o `POST /api/prenotazioni/:id/pagamenti`,
scelta della reception caso per caso, non un vincolo del software. Gli
addebiti extra (bar/ristorante) restano sempre per-camera in entrambi i
casi, mai al gruppo o alla famiglia — architettura invariata
(`addebiti_extra.soggiorno_id`).

### Tariffe (`/tariffe`) e Pacchetti (`/pacchetti`) — modulo 2.2

Due pagine nuove, sotto voce sidebar "OSPITALITÀ" (lettura per receptionist,
scrittura solo admin/titolare, controlli di modifica nascosti lato UI per chi
non può scrivere — coerente col backend).

`/tariffe` — tre sezioni in sequenza: categorie camera (CRUD `tipi_camera`),
assegnazione categoria a ciascuna camera esistente (tabella con select
inline, `PATCH /api/camere/:id/tipo`), listino per categoria selezionata
(CRUD `tariffe`, errore leggibile su sovrapposizione date).

`/pacchetti` — lista con toggle attivo/disattivo (mai `DELETE`), form
crea/modifica (nome, descrizione, notti, prezzo totale).

Form "Nuova prenotazione" (`/planning-camere`) esteso con:
- Select "Pacchetto (opzionale)" — se scelto, `tariffa_totale` si imposta al
  prezzo del pacchetto (comunque sovrascrivibile).
- Auto-calcolo tariffa da listino quando non c'è pacchetto selezionato: al
  cambiare camera/date, chiama `GET /api/tariffe/calcola` con il
  `tipo_camera_id` della camera scelta e precompila `tariffa_totale` — solo
  se il campo è vuoto o coincide ancora con l'ultimo valore proposto in
  automatico (se l'utente lo ha modificato a mano, non viene sovrascritto).
  Se ci sono notti senza tariffa configurata, mostra un avviso invece di un
  totale silenziosamente incompleto.

**Non ancora fatto in questa sessione** (fuori scope, vedi
`docs/EVOLUTIVE.md`): il drag-and-drop della griglia planning (`PATCH
/api/soggiorni/:id`) non ricalcola automaticamente la tariffa quando si
sposta una prenotazione — resta manuale come prima del modulo 2.2.

### Pulsanti di transizione stato (pannello dettaglio)

- **Check-in**: da `confermata`, anche portiere_notte.
- **Conferma**: da `opzione`, admin/titolare/receptionist. Nessuna
  validazione di prerequisiti (caparra/documento) — controllo professionale
  manuale della reception.
- **Check-out**: da `check_in`, admin/titolare/receptionist. Non più un
  PATCH diretto (fino al 14/08/2026 lo era, senza nessuna schermata
  dedicata) — apre `PannelloCheckOut`, vedi sezione dedicata più sotto.
- **Annulla**: da `opzione`/`confermata` → `interrotta`, admin/titolare/
  receptionist. Conferma esplicita richiesta prima del PATCH (irreversibile
  via UI).
- `chiusa` resta senza transizione UI per scelta — va collegata
  all'emissione fattura reale (modulo 2.5/A-Cube), non a un click manuale.

### Check-out — schermata dedicata (`PannelloCheckOut`, 14/08/2026)

Segnalato dal titolare come gap reale dopo aver visto il riepilogo
economico appena costruito: fino a questa sessione il check-out era un
singolo `PATCH .../stato` senza nessuna schermata, nessun riepilogo
preciso, nessuna possibilità di stampare qualcosa per l'ospite.

- Click su "Check-out" nel pannello dettaglio apre `PannelloCheckOut`
  (modal separato) invece del PATCH diretto — la transizione avviene solo
  dopo conferma esplicita dentro il nuovo pannello.
- Riusa `RiepilogoEconomico` (stesso componente del pannello dettaglio,
  estratto apposta il 14/08/2026 per evitare duplicazione) — stessa fonte
  dati, `GET /api/prenotazioni/:id/conto`.
- Se `saldo_da_incassare > 0`: banner di avviso + mini-form per registrare
  un pagamento al volo (`POST /api/prenotazioni/:id/pagamenti`, stesso
  endpoint già esistente) senza dover chiudere il pannello. Non blocca il
  check-out se il saldo resta positivo — resta una scelta professionale
  della reception (es. saldato fuori sistema), non un vincolo software.
- Pulsante "Stampa ricevuta di cortesia" apre `/ricevuta-cortesia/:id`
  (nuova scheda, stesso pattern `@media print` + `window.print()` già
  usato per `/menu-stampa`) — documento **esplicitamente NON fiscale**,
  solo promemoria per l'ospite. Nessun collegamento a un registratore
  telematico: l'emissione fiscale reale arriverà con l'integrazione A-Cube
  (modulo 3.1, non ancora iniziata) — questa ricevuta non la anticipa né la
  sostituisce.

---

## Parte D — Viste non ancora costruite

Dal mockup UX originale (15/07/2026), punti 1 e 2 sono fatti (sidebar con
sezione OSPITALITÀ minima, griglia planning). Restano da fare:

**Ospiti — scheda anagrafica.** Accesso da voce sidebar dedicata o dal nome
ospite nel pannello prenotazione. Contenuto: header (nome, cittadinanza,
badge "ospite abituale"), contatti, documento mascherato con svela-su-
richiesta loggato, storico soggiorni (da `soggiorni` filtrato per
`ospite_id`, non una tabella duplicata), riga di stato conservazione,
consenso marketing separato con propria base giuridica.

**Pulizie (housekeeping).** Incrocia due assi: Tipo (fermata/partenza,
calcolato automaticamente da `soggiorni`, sola lettura — sostituisce
l'impostazione manuale attuale in Camere) e Completamento (fatta/da fare,
unico campo manuale della cameriera). Indipendente dal resto — può essere
fatto anche prima. Stato occupazione camera (oggi statico in tre punti
scollegati: Camere, Prenotazioni, Dashboard) andrebbe calcolato dalla stessa
fonte `soggiorni` in tutti e tre.

**Conto ospite (folio) — ✅ Fatto 14/08/2026, riepilogo di sola lettura.**
`GET /api/prenotazioni/:id/conto` aggrega camera (`soggiorni.tariffa_totale`)
+ addebiti extra (`addebiti_extra`, già esistente dal 10/08/2026) + tassa di
soggiorno (`tasse_soggiorno`, se già calcolata — non la calcola qui, nessun
side effect da un endpoint di lettura) − pagamenti (`pagamenti`) = saldo da
incassare. Sostituisce, nel pannello dettaglio, la vecchia lista pagamenti
grezza. La tassa di soggiorno resta un flusso volutamente separato (la sua
riscossione non crea una riga in `pagamenti`, tracciata a parte nella
risposta). Non ancora fatto: una funzione "addebita alla camera" nel flusso
comanda **normale** del modulo Ristorante (oggi solo la griglia rapida
bar/camera scrive su `addebiti_extra`, non la comanda standard con piatti
dal menu) — voce aperta in `docs/EVOLUTIVE.md`.

**Report avanzati.** ADR, RevPAR, tasso di occupazione medio, grafico
andamento 7/30 giorni — tutti calcolabili da `soggiorni`+`pagamenti` una volta
che serve, nessuna nuova tabella.

---

## Note per il modulo 2.5 (Alloggiati Web) — verificate sui manuali ufficiali

Verificate su WS_ALLOGGIATI Rev.01 e Manuale Alloggiati Web (entrambi in
`docs/`, `MANUALEWS.pdf` e `MANUALEALBERGHI.pdf`). Riguardano la *logica di
generazione* della schedina, non la migration (già fatta):

- **Ordine righe obbligatorio**: capofamiglia/capogruppo (tipo 16/17/18)
  seguito immediatamente da familiari/membri gruppo (19/20) dello stesso
  soggiorno — non un ordine qualsiasi.
- **Formato riga fisso**: 168 caratteri, padding a spazi, UTF-8, terminatore
  CR+LF su ogni riga tranne l'ultima del batch.
- **Limite batch**: max 1000 alloggiati per invio.
- **Finestra temporale**: solo data odierna o giorno precedente (invio entro
  24h, o 6h per soggiorni <24h) — il job va progettato per girare a ridosso
  del check-in, non differibile a piacere.
- **Numero Giorni di Permanenza**: calcolato a runtime da
  `data_partenza - data_arrivo`, non salvato come campo.
- **Ricevute**: PDF firmato digitalmente per ogni giorno di invio, scaricabile
  30 giorni dal portale — il modulo 2.5 deve scaricarlo e archiviarlo (non
  solo registrare protocollo/esito a testo).
- **Autenticazione WS_ALLOGGIATI**: `Utente`+`Password`+`WsKey` →
  `GenerateToken` → token per `Send`/`Test`. WsKey da rigenerare ad ogni
  cambio password, in `.env` come le altre chiavi Fase 2.
- Un possibile campo "indirizzo di residenza" visto in una fonte web
  precedente **non** risulta nel tracciato ufficiale — non fa parte dei campi
  trasmessi, nessuna azione necessaria.
