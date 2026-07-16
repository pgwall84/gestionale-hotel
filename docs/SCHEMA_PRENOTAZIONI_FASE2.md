# Schema Prenotazioni — Fase 2 (proposta per validazione)

Preparato 16/07/2026. Traduce in DDL PostgreSQL lo schema concettuale definito
nella sessione del 15/07/2026 (vedi CLAUDE.md Sezione 16, "Architettura Fase 2 —
modulo Prenotazioni"), rispettando le 3 decisioni prioritarie: PCI scope zero,
sicurezza webhook, GDPR a due basi giuridiche.

Da validare qui prima di passarlo a Claude Code come migration. Numerazione
migration da confermare in base all'ultima applicata (oggi 015).

---

## 1. `ospiti`

Anagrafica. Documento **sempre testuale**, mai foto/scansione (vincolo assoluto,
vedi CLAUDE.md).

```sql
CREATE TABLE ospiti (
  id                      SERIAL PRIMARY KEY,
  nome                    VARCHAR(255) NOT NULL,
  cognome                 VARCHAR(255) NOT NULL,
  sesso                   CHAR(1),        -- 'M'/'F' — convertito in 1/2 solo in fase di generazione tracciato
  data_nascita            DATE,
  stato_nascita_codice    VARCHAR(9),     -- Tabella Stati — SEMPRE obbligatorio per Alloggiati Web
  comune_nascita_codice   VARCHAR(9),     -- Tabella Comuni — obbligatorio solo se nato in Italia
  provincia_nascita       VARCHAR(2),     -- sigla — obbligatorio solo se nato in Italia
  cittadinanza_codice     VARCHAR(9),     -- Tabella Stati
  documento_tipo_codice   VARCHAR(5),     -- Tabella Tipi_Documento — solo capofamiglia/singolo/capogruppo
  documento_numero        VARCHAR(20),    -- testuale, MAI foto/scansione — solo capofamiglia/singolo/capogruppo
  luogo_rilascio_codice   VARCHAR(9),     -- Tabella Stati o Comuni — solo capofamiglia/singolo/capogruppo
  email                   VARCHAR(255),
  telefono                VARCHAR(50),
  note                    TEXT,
  consenso_marketing        BOOLEAN NOT NULL DEFAULT false,
  consenso_marketing_data   TIMESTAMP,  -- quando è stato dato, base giuridica separata
  created_at              TIMESTAMP NOT NULL DEFAULT now(),
  updated_at              TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_ospiti_sesso CHECK (sesso IS NULL OR sesso IN ('M','F'))
);

CREATE INDEX idx_ospiti_cognome_nome ON ospiti (cognome, nome);
```

**Nota — campi codificati, non testo libero (aggiornamento 16/07/2026, verificato
sul tracciato ufficiale WS_ALLOGGIATI Rev.01)**: `cittadinanza_codice`,
`stato_nascita_codice`, `comune_nascita_codice`, `documento_tipo_codice`,
`luogo_rilascio_codice` sono codici delle tabelle ufficiali Alloggiati Web
(scaricabili via metodo SOAP `Tabella`: Stati, Comuni, Tipi_Documento). Non
salvare qui testo libero scelto in UI — l'applicazione dovrà avere una copia
locale (cache periodica) di quelle tabelle per popolare le select in fase di
check-in con nome leggibile + codice associato. Dettaglio implementativo da
definire nel modulo 2.5 (Alloggiati Web), non blocca questa migration.

**Nota — `sesso` codificato 1/2, non M/F**: nel tracciato il valore è
numerico (`1` maschio, `2` femmina). Salvare `M`/`F` nel DB per leggibilità,
convertire in fase di generazione della riga schedina.

**Nota Alloggiati Web generale**: `sesso`, `data_nascita`,
`stato_nascita_codice`, `cittadinanza_codice` sono obbligatori per **tutti**
gli ospiti di un soggiorno (anche familiari/membri gruppo, tipo 19/20).
`comune_nascita_codice`/`provincia_nascita` obbligatori solo se nati in
Italia. `documento_tipo_codice`/`documento_numero`/`luogo_rilascio_codice`
obbligatori **solo** per capofamiglia/ospite singolo/capogruppo (tipo
16/17/18) — per familiari/membri gruppo restano NULL, non è un errore.

**Da verificare separatamente, non aggiunto per incertezza della fonte**: un
possibile campo "indirizzo di residenza" compariva in una fonte web
consultata in precedenza, ma non risulta nel tracciato ufficiale ora
verificato (Tabella 1/2 del documento WS_ALLOGGIATI) — non fa parte dei
campi trasmessi alla schedina. Nessuna azione necessaria, la fonte
precedente era imprecisa.

---

## 1b. `soggiorno_ospiti` (ponte — tutti gli ospiti di un soggiorno)

**Aggiunta 16/07/2026**, verificata necessaria sul tracciato ufficiale: un
soggiorno può includere più persone con ruoli diversi (`Tipo Alloggiato`:
16 singolo, 17 capofamiglia, 18 capogruppo, 19 familiare, 20 membro gruppo).
Solo il capofamiglia/singolo/capogruppo ha documento completo; familiari e
membri gruppo hanno solo anagrafica base. Un solo `ospite_id` su `soggiorni`
non è sufficiente per generare la schedina completa.

```sql
CREATE TABLE soggiorno_ospiti (
  id                SERIAL PRIMARY KEY,
  soggiorno_id      INTEGER NOT NULL REFERENCES soggiorni(id),
  ospite_id         INTEGER NOT NULL REFERENCES ospiti(id),
  tipo_alloggiato   VARCHAR(2) NOT NULL,   -- '16','17','18','19','20' — Codice Tabella Tipo_Alloggiato
  created_at        TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_soggiorno_ospiti_tipo CHECK (
    tipo_alloggiato IN ('16','17','18','19','20')
  ),
  CONSTRAINT uq_soggiorno_ospite UNIQUE (soggiorno_id, ospite_id)
);

CREATE INDEX idx_soggiorno_ospiti_soggiorno ON soggiorno_ospiti (soggiorno_id);
```

**Nota**: `soggiorni.ospite_id` (Sezione 3) resta come riferimento rapido
all'intestatario/capofamiglia per comodità in UI (es. il nome mostrato nel
pannello di dettaglio prenotazione, mockup punto 2) — ma la lista completa e
autorevole degli ospiti di un soggiorno, quella usata per generare le
schedine Alloggiati Web, è sempre `soggiorno_ospiti`. Ogni soggiorno deve
avere esattamente un ospite con `tipo_alloggiato IN ('16','17','18')` — da
validare in applicazione, non a livello di CHECK constraint (richiederebbe
un trigger, valutare se introdurlo in fase di implementazione).

**Nota GDPR**: questa tabella vive sotto la base giuridica "finalità fiscale"
(conservabile fino a 10 anni collegata a documenti fiscali). La trasmissione
Alloggiati Web è un obbligo distinto, tracciato separatamente (vedi tabella
`alloggiati_invii` più sotto) e NON giustifica da sola la conservazione qui.

---

## 2. `prenotazioni` (testata)

```sql
CREATE TABLE prenotazioni (
  id                    SERIAL PRIMARY KEY,
  canale_origine        VARCHAR(30) NOT NULL,   -- 'diretta','wubook','booking_com','airbnb'...
  external_booking_id   VARCHAR(255) UNIQUE,    -- idempotenza da WuBook, NULL se diretta
  stato                 VARCHAR(20) NOT NULL DEFAULT 'opzione',
  data_scadenza_opzione TIMESTAMP,              -- per scadenza automatica 24-48h
  note                  TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT now(),
  updated_at            TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_prenotazioni_stato CHECK (
    stato IN ('opzione','confermata','check_in','check_out','chiusa','interrotta')
  )
);

CREATE INDEX idx_prenotazioni_stato ON prenotazioni (stato);
```

**Nota anti-duplicazione (decisione #2)**: `external_booking_id UNIQUE` è la
barriera contro webhook duplicati da WuBook — un INSERT con lo stesso valore
fallisce, il controller deve gestirlo come no-op, non come errore.

---

## 3. `soggiorni` (riga — camera + date)

```sql
CREATE TABLE soggiorni (
  id                SERIAL PRIMARY KEY,
  prenotazione_id   INTEGER NOT NULL REFERENCES prenotazioni(id),
  camera_id         INTEGER NOT NULL REFERENCES camere(id),
  ospite_id         INTEGER NOT NULL REFERENCES ospiti(id),   -- ospite principale
  data_arrivo       DATE NOT NULL,
  data_partenza     DATE NOT NULL,
  num_ospiti        INTEGER NOT NULL DEFAULT 1,
  tariffa_totale    NUMERIC(10,2),
  created_at        TIMESTAMP NOT NULL DEFAULT now(),
  updated_at        TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_soggiorni_date CHECK (data_partenza > data_arrivo)
);

-- Indice per la query "tutte le prenotazioni che intersecano [data_inizio, data_fine]"
-- (vista griglia/planning, MOCKUP_VISTE_FASE2.md punto 2)
CREATE INDEX idx_soggiorni_date ON soggiorni (data_arrivo, data_partenza);
CREATE INDEX idx_soggiorni_camera ON soggiorni (camera_id);
```

**Nota**: `ospite_id` qui è l'intestatario/capofamiglia — usato per comodità
in UI (nome mostrato nel pannello di dettaglio prenotazione). Per la lista
completa degli ospiti del soggiorno, con ruolo Alloggiati Web di ciascuno
(capofamiglia/familiare/membro gruppo), vedi la tabella `soggiorno_ospiti`
in Sezione 1b — necessaria per generare le schedine, non solo "in futuro"
come pensato inizialmente.

---

## 4. `pagamenti`

```sql
CREATE TABLE pagamenti (
  id                    SERIAL PRIMARY KEY,
  prenotazione_id       INTEGER NOT NULL REFERENCES prenotazioni(id),
  importo               NUMERIC(10,2) NOT NULL,
  metodo                VARCHAR(30),             -- carta, contanti, bonifico
  tipo                  VARCHAR(20) NOT NULL,    -- caparra, saldo, corrispettivo
  stato                 VARCHAR(20) NOT NULL DEFAULT 'pending',
  external_payment_id   VARCHAR(255),            -- riferimento WuBook/Nexi/Stripe
  acube_id              VARCHAR(255),             -- riferimento corrispettivo A-Cube, se emesso
  created_at            TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_pagamenti_stato CHECK (
    stato IN ('pending','completato','fallito','rimborsato')
  )
);

CREATE INDEX idx_pagamenti_prenotazione ON pagamenti (prenotazione_id);
```

**Nota PCI scope zero (decisione #1)**: nessun campo per dati carta in nessuna
tabella. Il gestionale riceve solo `external_payment_id` + `stato` via webhook
WuBook — non deve mai vedere PAN/CVV. Se in futuro qualcuno propone un form di
pagamento "fatto in casa", è un red flag architetturale da bloccare qui.

---

## 5. `webhook_log`

Log grezzo di ogni webhook ricevuto, per poter rigiocare un evento in caso di
problemi (decisione #2).

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

CREATE INDEX idx_webhook_log_fonte_data ON webhook_log (fonte, created_at);
```

**Nota**: scrivere qui SEMPRE, prima di qualunque elaborazione — anche se la
firma HMAC non è valida (loggare `hmac_valido = false` ed uscire, non scartare
silenziosamente).

---

## 6. `alloggiati_invii`

Traccia solo l'**invio** ad Alloggiati Web, mai i dati del documento stesso —
base giuridica TULPS, separata dall'anagrafica ospiti (decisione #3).

```sql
CREATE TABLE alloggiati_invii (
  id              SERIAL PRIMARY KEY,
  soggiorno_id    INTEGER NOT NULL REFERENCES soggiorni(id),
  data_invio      TIMESTAMP NOT NULL DEFAULT now(),
  protocollo      VARCHAR(255),
  esito           VARCHAR(20),    -- 'ok','errore','in_attesa'
  created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_alloggiati_soggiorno ON alloggiati_invii (soggiorno_id);
```

**Nota conservazione**: questa tabella si conserva 5 anni (obbligo di
sicurezza pubblica) indipendentemente da quanto a lungo si conserva `ospiti`
per finalità fiscale (fino a 10 anni) — le due scadenze vanno gestite
separatamente, non con un unico campo di retention.

---

## Punti aperti — risolti (16/07/2026)

### 1. Naming migration

Numero di lavoro: **`016_prenotazioni_fase2.sql`**. Da confermare/correggere
in apertura della sessione Claude Code, perché il progetto ha già avuto casi
di migration drift (`stato_camere`, `audit_log`, `refresh_tokens` create fuori
flusso, vedi CLAUDE.md Sezione 6). Prima istruzione da dare: verificare i file
in `database/migrations/` e il DB reale, non fidarsi solo del numero più alto
committato.

### 2. Ruoli e permessi — niente nuovo ruolo, niente controllo a livello di campo nel DB

Non esiste un ruolo "governante" in `shared/ruoli.js` (i 7 ruoli attuali sono
admin, titolare, receptionist, cameriere, cuoco, portiere_notte, dipendente).
Invece di aggiungerne uno nuovo per un solo modulo, si riusano i ruoli esistenti:

- **Ospiti** (lettura/scrittura piena, incluso "svela documento su richiesta"):
  admin, titolare, receptionist. **portiere_notte**: sola lettura (serve per
  check-in notturno), non modifica dati fiscali.
- **cameriere, cuoco, dipendente**: nessun accesso al modulo Ospiti — non è
  nel loro flusso di lavoro, evita di esporre dati che non devono vedere.
- **Pulizie**: dipendente + receptionist possono segnare "fatta/da fare".
  Non serve un permesso speciale perché la vista Pulizie (MOCKUP_VISTE_FASE2.md
  punto 4) non espone mai l'anagrafica ospite, solo tipo/completamento per
  camera — il problema del "governante non deve vedere dati fiscali" non si
  pone perché quella vista non li mostra proprio.
- **Documento mascherato**: resta una regola di UI/controller (come già
  previsto nel mockup: `CI · ••••1847`, "svela su richiesta" solo per
  admin/titolare/receptionist, loggato in `audit_log`, tabella già esistente
  — riusata, non ne serve una nuova). Niente view o colonne separate nel DB:
  tiene lo schema semplice e coerente con l'assenza di controlli a livello di
  campo nel resto del progetto.

Nessuna modifica allo schema SQL sopra: la Sezione 3 (`shared/ruoli.js`) va
estesa in fase di implementazione con le voci `ospiti` e `pulizie`, seguendo
esattamente il pattern già usato per `magazzino`/`archivio`.

### 3. Retention — calcolata a runtime, nessun job automatico per ora

Niente colonna `data_limite_conservazione` nello schema. Il volume attuale (20
camere) non giustifica l'automazione ora. La riga di stato conservazione nella
scheda Ospiti (mockup punto 3) si calcola a runtime in query, non da un campo
salvato:

```sql
-- limite fiscale (10 anni) per un ospite, dal suo ultimo soggiorno
SELECT MAX(s.data_partenza) + INTERVAL '10 years' AS limite_fiscale
FROM soggiorni s WHERE s.ospite_id = $1;

-- limite Alloggiati Web (5 anni) per un invio
SELECT data_invio + INTERVAL '5 years' AS limite_alloggiati
FROM alloggiati_invii WHERE id = $1;
```

Un job di anonimizzazione/cancellazione automatica alla scadenza è rimandato
a evolutiva futura — da aggiungere alla Sezione 14 di CLAUDE.md quando si
deciderà di implementarlo, non ora.

### 4. Scadenza automatica "Opzione" — cron leggero in backend

`data_scadenza_opzione` non resta un campo inerte: un cron (nuova dipendenza
minima, `node-cron`, motivo da scrivere nel piano: previene esaurimento
inventario da opzioni abbandonate) gira ogni 30 minuti e aggiorna:

```sql
UPDATE prenotazioni
SET stato = 'interrotta', updated_at = now()
WHERE stato = 'opzione' AND data_scadenza_opzione < now();
```

Ogni riga aggiornata va anche scritta in `audit_log` per tracciabilità
(coerente con l'uso già esistente di quella tabella). Il cron va avviato in
`backend/server.js` e resta in esecuzione tramite PM2 dopo il deploy (Modulo
1.10) — nessuna infrastruttura aggiuntiva necessaria.

### 5. Trigger `updated_at` — da verificare nel repo, default: nessun trigger DB

Non ho visibilità diretta sul repo da questa chat, quindi non posso confermare
se esiste già un trigger Postgres condiviso per `updated_at`. In CLAUDE.md
Sezione 5 (pattern controller) gli esempi aggiornano i campi via query
esplicita, senza trigger — quindi il default proposto è restare coerenti con
quello stile: ogni UPDATE nei nuovi controller imposta `updated_at = now()`
esplicitamente (come già fatto sopra nel cron del punto 4).

**Prima istruzione da dare a Claude Code**: `grep -rn "CREATE TRIGGER" database/migrations/`
— se salta fuori un trigger condiviso già in uso altrove, riusarlo qui per
coerenza invece di introdurre un'eccezione.

---

## Note implementative per il modulo 2.5 (Alloggiati Web) — confermate 16/07/2026

Verificate su entrambi i manuali ufficiali (WS_ALLOGGIATI Rev.01 e Manuale
Alloggiati Web). Lo schema tabelle sopra risulta corretto — queste sono note
sulla **logica di generazione** della riga/schedina, da tenere presenti
quando si costruirà davvero il modulo 2.5 (non riguardano questa migration):

- **Ordine delle righe obbligatorio**: quando un soggiorno ha capofamiglia/
  capogruppo (`tipo_alloggiato` 16/17/18) più familiari/membri gruppo (19/20),
  questi ultimi devono comparire nelle righe **immediatamente successive** al
  capofamiglia nell'elenco inviato. La funzione che genera `ElencoSchedine` da
  `soggiorno_ospiti` deve ordinare esplicitamente: prima il record con tipo
  16/17/18, poi a seguire gli altri dello stesso soggiorno — non un ordine
  qualsiasi (es. per id o cognome).
- **Formato riga fisso**: 168 caratteri, ogni campo riempito con spazi bianchi
  fino alla lunghezza prevista (es. cognome sempre 50 caratteri, padding a
  destra), encoding UTF-8, terminatore CR+LF (ASCII 13+10) su ogni riga tranne
  l'ultima del file/batch.
- **Limite batch**: max 1000 alloggiati per invio — non rilevante per un hotel
  da 20 camere, ma da sapere se in futuro si aggregano invii multi-giorno.
- **Finestra temporale sulla data di arrivo**: il sistema accetta solo data
  odierna o del giorno precedente (coerente con l'obbligo di invio entro 24h,
  o 6h per soggiorni <24h). Il job di generazione/invio schedine andrà quindi
  progettato per girare a ridosso del check-in, non differibile a piacere —
  da coordinare con il cron di scadenza Opzioni (punto 4 delle decisioni
  sopra) ma è una responsabilità distinta.
- **`Numero Giorni di Permanenza`**: obbligatorio nel tracciato, max 30gg,
  ma resta un valore calcolato a runtime da `soggiorno.data_partenza -
  soggiorno.data_arrivo` in fase di generazione riga — non va salvato come
  campo separato.
- **Ricevute**: il portale genera una ricevuta PDF firmata digitalmente per
  ogni giorno di invio, scaricabile per gli ultimi 30 giorni — coerente con
  l'obbligo di conservazione 5 anni già previsto per `alloggiati_invii`
  (Sezione 6). Il modulo 2.5 dovrà scaricare e archiviare quel PDF (non solo
  registrare protocollo/esito a testo), altrimenti la ricevuta va recuperata
  manualmente dal portale entro la finestra dei 30 giorni.
- **Autenticazione WS_ALLOGGIATI**: richiede `Utente` + `Password` + `WsKey`
  per generare un token temporaneo (metodo `GenerateToken`), poi il token va
  usato per le chiamate `Send`/`Test`. La WsKey va rigenerata ad ogni cambio
  password — da tenere in `.env` come le altre chiavi Fase 2 (Sezione 7 di
  CLAUDE.md), non hardcoded.

## Nota sulla migration correttiva (017)

La migration `016` è già stata applicata senza i campi Alloggiati Web. La
`017` (ALTER TABLE, non modificare la 016) dovrà:
- aggiungere a `ospiti`: `sesso`, `stato_nascita_codice`,
  `comune_nascita_codice`, `provincia_nascita`, `cittadinanza_codice`
  (se non già presente come testo — valutare se rinominare/convertire),
  `documento_tipo_codice`, `luogo_rilascio_codice`
- **creare la nuova tabella `soggiorno_ospiti`** (non è un ALTER, è una
  CREATE TABLE aggiuntiva) — questa è la parte più corposa della 017, non
  solo l'aggiunta di colonne
- popolare `soggiorno_ospiti` per eventuali soggiorni già inseriti nel
  frattempo (script di backfill, se esistono già dati in `soggiorni`)

## Messaggio d'apertura suggerito per la sessione Claude Code

Schema e permessi validati (vedi "Punti aperti — risolti" sopra). Prima di
scrivere la migration, Claude Code deve verificare due cose sul repo reale:

```
Leggi CLAUDE.md. Obiettivo: migration modulo Prenotazioni secondo
SCHEMA_PRENOTAZIONI_FASE2.md (tabelle ospiti, prenotazioni, soggiorni,
pagamenti, webhook_log, alloggiati_invii).
Prima di scrivere la migration:
1. Verifica il prossimo numero libero in database/migrations/ (lavoro
   provvisorio: 016) contro lo stato reale del DB.
2. grep -rn "CREATE TRIGGER" database/migrations/ — se esiste già un trigger
   condiviso per updated_at, riusalo; altrimenti procedi con query esplicite.
Poi estendi shared/ruoli.js con le voci 'ospiti' e 'pulizie' (vedi permessi
proposti nel documento).
Piano in 5 righe, attendi conferma.
```
