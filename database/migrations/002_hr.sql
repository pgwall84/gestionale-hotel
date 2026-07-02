-- Migration 002: Tabelle modulo HR (Personale)
-- Eseguire DOPO la migration 001.

-- Timbrature: ogni entrata/uscita di ogni dipendente
CREATE TABLE IF NOT EXISTS timbrature (
  id        SERIAL PRIMARY KEY,
  user_id   INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  tipo      VARCHAR(10) NOT NULL CHECK (tipo IN ('entrata', 'uscita')),
  timestamp TIMESTAMP DEFAULT NOW(),
  note      TEXT
);

CREATE INDEX IF NOT EXISTS idx_timbrature_user_id ON timbrature(user_id);
CREATE INDEX IF NOT EXISTS idx_timbrature_timestamp ON timbrature(timestamp);

-- Turni: calendario settimanale assegnato dal titolare ai dipendenti
CREATE TABLE IF NOT EXISTS turni (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  data        DATE    NOT NULL,
  ora_inizio  TIME    NOT NULL,
  ora_fine    TIME    NOT NULL,
  tipo_turno  VARCHAR(50),  -- mattina / sera / split / riposo
  note        TEXT
);

CREATE INDEX IF NOT EXISTS idx_turni_user_data ON turni(user_id, data);

-- Richieste assenza: ferie, permessi, malattie — con stato di approvazione
CREATE TABLE IF NOT EXISTS richieste_assenza (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  tipo        VARCHAR(20) NOT NULL CHECK (tipo IN ('ferie', 'permesso', 'malattia')),
  data_inizio DATE        NOT NULL,
  data_fine   DATE        NOT NULL,
  stato       VARCHAR(20) DEFAULT 'in_attesa' CHECK (stato IN ('in_attesa', 'approvata', 'rifiutata')),
  note        TEXT,
  created_at  TIMESTAMP   DEFAULT NOW()
);

-- Scadenze: visite mediche, corsi HACCP, contratti — con alert configurabile
CREATE TABLE IF NOT EXISTS scadenze (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  tipo           VARCHAR(100) NOT NULL,  -- visita_medica / corso_haccp / contratto / antincendio
  data_scadenza  DATE         NOT NULL,
  giorni_alert   INTEGER      DEFAULT 30,  -- quanti giorni prima inviare l'alert
  notificato     BOOLEAN      DEFAULT false,
  note           TEXT
);

-- Documenti dipendente: buste paga, contratti, certificati
CREATE TABLE IF NOT EXISTS documenti_dipendente (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  tipo            VARCHAR(50) NOT NULL,  -- busta_paga / contratto / certificato / altro
  filename        VARCHAR(255) NOT NULL,
  data_documento  DATE,
  uploaded_at     TIMESTAMP DEFAULT NOW()
);

-- Comunicazioni interne: bacheca aziendale. ruoli_destinatari = null significa tutti.
CREATE TABLE IF NOT EXISTS comunicazioni (
  id                  SERIAL PRIMARY KEY,
  titolo              VARCHAR(255) NOT NULL,
  testo               TEXT         NOT NULL,
  autore_id           INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  ruoli_destinatari   TEXT[],  -- array di ruoli, es: {'cameriere','cuoco'} oppure NULL = tutti
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Checklist HACCP: pulizie e controlli igienici giornalieri compilati dal cuoco
CREATE TABLE IF NOT EXISTS haccp_checklist (
  id            SERIAL PRIMARY KEY,
  attrezzatura  VARCHAR(100) NOT NULL,
  user_id       INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  data          DATE         NOT NULL,
  completata    BOOLEAN      DEFAULT false,
  note          TEXT,
  created_at    TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_haccp_data ON haccp_checklist(data);

-- Ospiti giornalieri: il receptionist inserisce ogni sera i coperti previsti per il giorno dopo.
-- Questi dati sono visibili in cucina come "note cucina giornaliere".
CREATE TABLE IF NOT EXISTS ospiti_giornalieri (
  id                SERIAL PRIMARY KEY,
  data              DATE    NOT NULL UNIQUE,  -- un solo record per giorno
  coperti_colazione INTEGER DEFAULT 0,
  coperti_pranzo    INTEGER DEFAULT 0,
  coperti_cena      INTEGER DEFAULT 0,
  note_allergie     TEXT,   -- allergie/intolleranze degli ospiti hotel — visibili allo chef
  inserito_da       INTEGER REFERENCES users(id),
  updated_at        TIMESTAMP DEFAULT NOW()
);
