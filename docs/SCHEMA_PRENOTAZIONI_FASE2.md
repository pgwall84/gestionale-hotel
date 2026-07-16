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

## 1c. `gruppi_prenotazione` (aggiunta 16/07/2026 — pagamento per gruppi di camere)

Caso raro ma reale: un gruppo (squadra, comitiva, evento) prenota più camere,
gestite come prenotazioni separate (una per camera/famiglia) ma con un unico
pagatore/referente e, spesso, un pagamento unico che copre l'intero gruppo
invece di essere spezzato artificialmente su ogni singola prenotazione.
Creata **prima** di `prenotazioni` (sotto) perché quest'ultima ha una FK
verso questa tabella — ordine di creazione obbligato nella migration.

```sql
CREATE TABLE gruppi_prenotazione (
  id                  SERIAL PRIMARY KEY,
  nome                VARCHAR(255) NOT NULL,     -- es. "Squadra calcio X", "Matrimonio Rossi"
  referente_nome      VARCHAR(255),
  referente_email     VARCHAR(255),
  referente_telefono  VARCHAR(50),
  note                TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT now()
);
```

Ogni `prenotazioni.gruppo_id` punta qui (nullable — la maggior parte delle
prenotazioni resta singola, senza gruppo). Vedi Sezione 4 (`pagamenti`) per
come si registra un pagamento a livello di gruppo invece che di singola
prenotazione.

---

## 2. `prenotazioni` (testata)

```sql
CREATE TABLE prenotazioni (
  id                    SERIAL PRIMARY KEY,
  canale_origine        VARCHAR(30) NOT NULL,   -- 'diretta','wubook','booking_com','airbnb'...
  external_booking_id   VARCHAR(255) UNIQUE,    -- idempotenza da WuBook, NULL se diretta
  stato                 VARCHAR(20) NOT NULL DEFAULT 'opzione',
  data_scadenza_opzione TIMESTAMP,              -- per scadenza automatica 24-48h
  gruppo_id             INTEGER REFERENCES gruppi_prenotazione(id),  -- NULL se prenotazione singola
  note                  TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT now(),
  updated_at            TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_prenotazioni_stato CHECK (
    stato IN ('opzione','confermata','check_in','check_out','chiusa','interrotta')
  )
);

CREATE INDEX idx_prenotazioni_stato ON prenotazioni (stato);
CREATE INDEX idx_prenotazioni_gruppo ON prenotazioni (gruppo_id);
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
  cancellato        BOOLEAN NOT NULL DEFAULT false,  -- sincronizzato quando prenotazione → interrotta
  created_at        TIMESTAMP NOT NULL DEFAULT now(),
  updated_at        TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_soggiorni_date CHECK (data_partenza > data_arrivo)
);

-- Indice per la query "tutte le prenotazioni che intersecano [data_inizio, data_fine]"
-- (vista griglia/planning, MOCKUP_VISTE_FASE2.md punto 2)
CREATE INDEX idx_soggiorni_date ON soggiorni (data_arrivo, data_partenza);
CREATE INDEX idx_soggiorni_camera ON soggiorni (camera_id);

-- Vincolo anti-overbooking (aggiunto 16/07/2026, decisione presa dopo ricerca
-- su pattern standard dei PMS — drag&drop planning richiede questa garanzia).
-- Richiede l'estensione btree_gist per usare "=" dentro un EXCLUDE con GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE soggiorni ADD CONSTRAINT excl_soggiorni_camera_overlap
  EXCLUDE USING gist (
    camera_id WITH =,
    daterange(data_arrivo, data_partenza, '[)') WITH &&
  ) WHERE (cancellato = false);
```

**Nota vincolo anti-overbooking — IMPORTANTE, impatta il controller**: il
vincolo `EXCLUDE` impedisce fisicamente due soggiorni non cancellati sulla
stessa camera con date sovrapposte (intervallo `[arrivo, partenza)` —
semiaperto: chi parte il giorno X libera la camera per chi arriva lo stesso
giorno X, convenzione standard alberghiera). Qualunque INSERT/UPDATE che
violi questo vincolo fallisce a livello DB con un errore Postgres — il
controller deve intercettarlo e restituire un `409 Conflict` con messaggio
chiaro ("Camera già occupata in queste date"), non un generico `500`.

**Regola di sincronizzazione obbligatoria**: il vincolo esclude solo i
soggiorni con `cancellato = false`. Quando una prenotazione passa a stato
`interrotta` (Sezione 2 del contratto API, `PATCH .../stato`), il controller
**deve** anche impostare `cancellato = true` su tutti i `soggiorni` di quella
prenotazione, nella stessa transazione — altrimenti una prenotazione
cancellata continuerebbe a bloccare quella camera/date per sempre. Questo è
un accoppiamento reale tra le due tabelle: se in futuro si aggiunge un altro
modo di cancellare un soggiorno (es. WuBook invia una cancellazione via
webhook), deve passare dalla stessa funzione/transazione, non da un percorso
alternativo che dimentica di aggiornare `cancellato`.

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
  prenotazione_id       INTEGER REFERENCES prenotazioni(id),   -- nullable, vedi CHECK sotto
  gruppo_id             INTEGER REFERENCES gruppi_prenotazione(id),  -- nullable, vedi CHECK sotto
  importo               NUMERIC(10,2) NOT NULL,
  metodo                VARCHAR(30),             -- carta, contanti, bonifico
  tipo                  VARCHAR(20) NOT NULL,    -- caparra, saldo, corrispettivo
  stato                 VARCHAR(20) NOT NULL DEFAULT 'pending',
  external_payment_id   VARCHAR(255),            -- riferimento WuBook/Nexi/Stripe
  acube_id              VARCHAR(255),             -- riferimento corrispettivo A-Cube, se emesso
  created_at            TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_pagamenti_stato CHECK (
    stato IN ('pending','completato','fallito','rimborsato')
  ),
  CONSTRAINT chk_pagamenti_prenotazione_o_gruppo CHECK (
    (prenotazione_id IS NOT NULL AND gruppo_id IS NULL) OR
    (prenotazione_id IS NULL AND gruppo_id IS NOT NULL)
  )
);

CREATE INDEX idx_pagamenti_prenotazione ON pagamenti (prenotazione_id);
CREATE INDEX idx_pagamenti_gruppo ON pagamenti (gruppo_id);
```

**Nota pagamento di gruppo (aggiunta 16/07/2026)**: un pagamento è **sempre**
legato o a una singola prenotazione, o a un gruppo (`gruppi_prenotazione`) —
mai a entrambi, mai a nessuno dei due (vincolo CHECK esplicito, tipo XOR).
Per un gruppo che paga un conto unico per più camere, si registra un solo
pagamento con `gruppo_id` valorizzato — non serve spezzarlo artificialmente
tra le prenotazioni del gruppo. Il folio/conto complessivo del gruppo (per
la fatturazione finale) andrà calcolato sommando i `soggiorni.tariffa_totale`
di tutte le prenotazioni con lo stesso `gruppo_id`, meno i pagamenti con
quel `gruppo_id` — logica di aggregazione lato applicazione, non richiede
altre tabelle.

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

## 6b. `camere.piano` (aggiunta a tabella esistente di Fase 1)

Non è una tabella nuova — `camere` esiste già dal Modulo 1.3 (Fase 1). Serve
però aggiungere un campo per raggruppare visivamente le camere per piano
nella vista griglia/planning (pattern standard nei PMS confrontati — vedi
ricerca 16/07/2026). Verificato: probabilmente non presente oggi.

```sql
ALTER TABLE camere ADD COLUMN piano SMALLINT;
```

Nullable (le camere esistenti non hanno questo dato finché non viene
popolato manualmente), `SMALLINT` con 0=piano terra, valori negativi per
eventuali seminterrati, positivi per i piani superiori — il frontend mappa
il numero in etichetta leggibile ("Piano Terra", "1° Piano", ecc.). Da
popolare manualmente per le 20 camere esistenti dopo la migration, non è
automatizzabile.

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

## Nota sulla migration 017 (nuova — per le aggiunte del 16/07/2026)

**Aggiornamento**: la migration `016` era già stata applicata **con tutti i
campi corretti** fin dall'inizio (Alloggiati Web + `soggiorno_ospiti`) —
confermato da Claude Code il 16/07, non serviva più nessuna correttiva su
quella parte. La nota precedente su una "017 correttiva" è quindi superata.

La `017` **reale** che serve ora è per le aggiunte di questa sessione
(overbooking, gruppi, piano camere):

1. `CREATE EXTENSION IF NOT EXISTS btree_gist;`
2. `CREATE TABLE gruppi_prenotazione` (Sezione 1c) — **prima** di toccare
   `prenotazioni`, per via della FK
3. `ALTER TABLE prenotazioni ADD COLUMN gruppo_id ...` (Sezione 2)
4. `ALTER TABLE soggiorni ADD COLUMN cancellato ...` + `ADD CONSTRAINT
   excl_soggiorni_camera_overlap EXCLUDE ...` (Sezione 3) — **attenzione**:
   se esistono già soggiorni con date sovrapposte sulla stessa camera (non
   dovrebbe, ma verificare prima), l'`ALTER TABLE ADD CONSTRAINT` fallisce.
   Query di verifica preventiva da far girare prima:
   ```sql
   SELECT a.id, b.id FROM soggiorni a JOIN soggiorni b
     ON a.camera_id = b.camera_id AND a.id < b.id
     AND daterange(a.data_arrivo, a.data_partenza, '[)') &&
         daterange(b.data_arrivo, b.data_partenza, '[)');
   ```
5. `ALTER TABLE pagamenti ALTER COLUMN prenotazione_id DROP NOT NULL;` +
   `ADD COLUMN gruppo_id ...` + `ADD CONSTRAINT
   chk_pagamenti_prenotazione_o_gruppo ...` (Sezione 4)
6. `ALTER TABLE camere ADD COLUMN piano SMALLINT;` (Sezione 6b)

## Messaggio d'apertura suggerito per la sessione Claude Code

```
Leggi CLAUDE.md e docs/SCHEMA_PRENOTAZIONI_FASE2.md.
Obiettivo: migration 017 — aggiunte del 16/07/2026 al modulo Prenotazioni:
vincolo anti-overbooking, gruppi di prenotazione con pagamento unico,
campo piano su camere. Vedi la sezione "Nota sulla migration 017" nello
schema per l'elenco esatto e l'ordine delle operazioni.

Prima di scrivere la migration:
1. Verifica il prossimo numero libero in database/migrations/.
2. Esegui la query di verifica preventiva indicata nello schema per
   controllare che non esistano già soggiorni sovrapposti sulla stessa
   camera — se ce ne sono, fermati e dimmelo prima di aggiungere il
   vincolo EXCLUDE, non risolverli in autonomia.
3. Verifica che l'estensione btree_gist sia abilitabile sul DB (permessi
   utente sufficienti) prima di includerla nella migration.

Piano in 5 righe, attendi conferma prima di eseguire sul DB.
```

Dopo l'applicazione, aggiorna anche il contratto API
(`API_PRENOTAZIONI_FASE2.md`) se qualche dettaglio implementativo emerge
diverso da quanto previsto qui — è un documento di lavoro, non immutabile.
