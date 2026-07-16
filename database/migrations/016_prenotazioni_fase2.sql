-- Migration 016: modulo Prenotazioni Fase 2 (schema completo FASE 2A).
-- Tabelle: ospiti, soggiorno_ospiti, prenotazioni, soggiorni, pagamenti,
-- webhook_log, alloggiati_invii.
-- Vedi docs/SCHEMA_PRENOTAZIONI_FASE2.md per le decisioni architetturali
-- (PCI scope zero, anti-duplicazione webhook, GDPR a due basi giuridiche,
-- campi codificati Alloggiati Web Sezione 1, tabella ponte Sezione 1b).
-- Nessun trigger DB per updated_at (verificato con grep "CREATE TRIGGER" su
-- questa cartella: nessuno esistente) — ogni controller imposta
-- updated_at = now() esplicitamente.

CREATE TABLE IF NOT EXISTS ospiti (
  id                        SERIAL PRIMARY KEY,
  nome                      VARCHAR(255) NOT NULL,
  cognome                   VARCHAR(255) NOT NULL,
  sesso                     CHAR(1),        -- 'M'/'F' — convertito in 1/2 solo in fase di generazione tracciato
  data_nascita              DATE,
  stato_nascita_codice      VARCHAR(9),     -- Tabella Stati — sempre obbligatorio per Alloggiati Web
  comune_nascita_codice     VARCHAR(9),     -- Tabella Comuni — obbligatorio solo se nato in Italia
  provincia_nascita         VARCHAR(2),     -- sigla — obbligatorio solo se nato in Italia
  cittadinanza_codice       VARCHAR(9),     -- Tabella Stati
  documento_tipo_codice     VARCHAR(5),     -- Tabella Tipi_Documento — solo capofamiglia/singolo/capogruppo
  documento_numero          VARCHAR(20),    -- testuale, MAI foto/scansione — solo capofamiglia/singolo/capogruppo
  luogo_rilascio_codice     VARCHAR(9),     -- Tabella Stati o Comuni — solo capofamiglia/singolo/capogruppo
  email                     VARCHAR(255),
  telefono                  VARCHAR(50),
  note                      TEXT,
  consenso_marketing        BOOLEAN NOT NULL DEFAULT false,
  consenso_marketing_data   TIMESTAMP,
  created_at                TIMESTAMP NOT NULL DEFAULT now(),
  updated_at                TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_ospiti_sesso CHECK (sesso IS NULL OR sesso IN ('M','F'))
);
CREATE INDEX IF NOT EXISTS idx_ospiti_cognome_nome ON ospiti (cognome, nome);

CREATE TABLE IF NOT EXISTS prenotazioni (
  id                    SERIAL PRIMARY KEY,
  canale_origine        VARCHAR(30) NOT NULL,
  external_booking_id   VARCHAR(255) UNIQUE,
  stato                 VARCHAR(20) NOT NULL DEFAULT 'opzione',
  data_scadenza_opzione TIMESTAMP,
  note                  TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT now(),
  updated_at            TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_prenotazioni_stato CHECK (
    stato IN ('opzione','confermata','check_in','check_out','chiusa','interrotta')
  )
);
CREATE INDEX IF NOT EXISTS idx_prenotazioni_stato ON prenotazioni (stato);

CREATE TABLE IF NOT EXISTS soggiorni (
  id                SERIAL PRIMARY KEY,
  prenotazione_id   INTEGER NOT NULL REFERENCES prenotazioni(id),
  camera_id         INTEGER NOT NULL REFERENCES camere(id),
  ospite_id         INTEGER NOT NULL REFERENCES ospiti(id),
  data_arrivo       DATE NOT NULL,
  data_partenza     DATE NOT NULL,
  num_ospiti        INTEGER NOT NULL DEFAULT 1,
  tariffa_totale    NUMERIC(10,2),
  created_at        TIMESTAMP NOT NULL DEFAULT now(),
  updated_at        TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_soggiorni_date CHECK (data_partenza > data_arrivo)
);
CREATE INDEX IF NOT EXISTS idx_soggiorni_date ON soggiorni (data_arrivo, data_partenza);
CREATE INDEX IF NOT EXISTS idx_soggiorni_camera ON soggiorni (camera_id);

-- Ponte: tutti gli ospiti di un soggiorno con il loro ruolo Alloggiati Web
-- (16 singolo, 17 capofamiglia, 18 capogruppo, 19 familiare, 20 membro gruppo).
-- soggiorni.ospite_id resta il riferimento rapido all'intestatario per l'UI;
-- questa tabella è la fonte autorevole per generare le schedine.
CREATE TABLE IF NOT EXISTS soggiorno_ospiti (
  id                SERIAL PRIMARY KEY,
  soggiorno_id      INTEGER NOT NULL REFERENCES soggiorni(id),
  ospite_id         INTEGER NOT NULL REFERENCES ospiti(id),
  tipo_alloggiato   VARCHAR(2) NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_soggiorno_ospiti_tipo CHECK (
    tipo_alloggiato IN ('16','17','18','19','20')
  ),
  CONSTRAINT uq_soggiorno_ospite UNIQUE (soggiorno_id, ospite_id)
);
CREATE INDEX IF NOT EXISTS idx_soggiorno_ospiti_soggiorno ON soggiorno_ospiti (soggiorno_id);

CREATE TABLE IF NOT EXISTS pagamenti (
  id                    SERIAL PRIMARY KEY,
  prenotazione_id       INTEGER NOT NULL REFERENCES prenotazioni(id),
  importo               NUMERIC(10,2) NOT NULL,
  metodo                VARCHAR(30),
  tipo                  VARCHAR(20) NOT NULL,
  stato                 VARCHAR(20) NOT NULL DEFAULT 'pending',
  external_payment_id   VARCHAR(255),
  acube_id              VARCHAR(255),
  created_at            TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_pagamenti_stato CHECK (
    stato IN ('pending','completato','fallito','rimborsato')
  )
);
CREATE INDEX IF NOT EXISTS idx_pagamenti_prenotazione ON pagamenti (prenotazione_id);

CREATE TABLE IF NOT EXISTS webhook_log (
  id              SERIAL PRIMARY KEY,
  fonte           VARCHAR(30) NOT NULL,
  payload_raw     JSONB NOT NULL,
  hmac_valido     BOOLEAN,
  processato      BOOLEAN NOT NULL DEFAULT false,
  errore          TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_log_fonte_data ON webhook_log (fonte, created_at);

CREATE TABLE IF NOT EXISTS alloggiati_invii (
  id              SERIAL PRIMARY KEY,
  soggiorno_id    INTEGER NOT NULL REFERENCES soggiorni(id),
  data_invio      TIMESTAMP NOT NULL DEFAULT now(),
  protocollo      VARCHAR(255),
  esito           VARCHAR(20),
  created_at      TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alloggiati_soggiorno ON alloggiati_invii (soggiorno_id);
