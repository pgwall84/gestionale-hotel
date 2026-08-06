-- Migration 021: Tassa di soggiorno (Modulo 2.4, Fase 2A).
--
-- Due tabelle separate per una ragione precisa:
--   configurazione_tassa_soggiorno = storico delle aliquote deliberate dal
--     Comune (importo, esenzioni, tetto notti), mai sovrascritta — una nuova
--     delibera è una nuova riga con valido_dal nuovo, la vecchia riga si
--     chiude valorizzando valido_al. Serve perché un soggiorno passato deve
--     restare calcolato con l'aliquota vigente all'epoca, anche se nel
--     frattempo il Comune ne delibera una nuova.
--   tasse_soggiorno = una riga per soggiorno, con l'importo già calcolato
--     (notti tassabili, ospiti tassabili, importo dovuto) e lo stato di
--     riscossione. Congela il risultato del calcolo così un cambio successivo
--     di configurazione non altera retroattivamente soggiorni già chiusi.

-- 1. Storico aliquote tassa di soggiorno.
CREATE TABLE IF NOT EXISTS configurazione_tassa_soggiorno (
  id                   SERIAL PRIMARY KEY,
  importo_a_notte      NUMERIC(5,2) NOT NULL,   -- € per persona per notte
  eta_esente_fino      SMALLINT,                 -- nullable = nessuna esenzione età
  notti_max_tassabili  SMALLINT,                 -- nullable = nessun tetto
  valido_dal           DATE NOT NULL,
  valido_al            DATE,                     -- nullable = tuttora vigente
  note                 TEXT,
  created_at           TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_configurazione_tassa_soggiorno_periodo
    CHECK (valido_al IS NULL OR valido_al > valido_dal)
);
CREATE INDEX IF NOT EXISTS idx_configurazione_tassa_soggiorno_valido_dal
  ON configurazione_tassa_soggiorno (valido_dal);

-- 2. Tassa calcolata per ciascun soggiorno.
CREATE TABLE IF NOT EXISTS tasse_soggiorno (
  id                 SERIAL PRIMARY KEY,
  soggiorno_id       INTEGER NOT NULL UNIQUE REFERENCES soggiorni(id),
  configurazione_id  INTEGER REFERENCES configurazione_tassa_soggiorno(id),
  notti_tassabili    INTEGER NOT NULL,
  ospiti_tassabili   INTEGER NOT NULL,
  importo_dovuto     NUMERIC(10,2) NOT NULL,
  importo_riscosso   NUMERIC(10,2),              -- nullable finché non riscossa
  data_riscossione   TIMESTAMP,
  note               TEXT,
  created_at         TIMESTAMP NOT NULL DEFAULT now(),
  updated_at         TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasse_soggiorno_soggiorno_id
  ON tasse_soggiorno (soggiorno_id);
