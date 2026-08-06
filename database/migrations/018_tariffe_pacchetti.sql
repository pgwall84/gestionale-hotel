-- Migration 018: Tariffe, stagionalità e pacchetti (Modulo 2.2, Fase 2A) — 31/07/2026
--
-- Introduce una vera categorizzazione delle camere (tipi_camera) invece di un
-- campo libero, in vista della futura mappatura con le categorie configurate
-- sui canali OTA (modulo 2.3, WuBook/Booking/Airbnb): quella mappatura vera e
-- propria (tipo_camera_id + canale + codice_esterno) si farà quando si arriva
-- al 2.3 — qui si prepara solo un campo `note` per annotazioni manuali nel
-- frattempo. Vedi docs/PRENOTAZIONI_FASE2.md per il contratto API completo.

-- 1. Categorie camera — le 5 concordate con il titolare. Tabella vera e
--    propria (non VARCHAR libero) per avere un id stabile da referenziare
--    sia dal listino tariffe sia, in futuro, dalla mappatura OTA.
CREATE TABLE IF NOT EXISTS tipi_camera (
  id            SERIAL PRIMARY KEY,
  nome          VARCHAR(50) NOT NULL UNIQUE,
  capienza_max  SMALLINT,
  note          TEXT,       -- riferimento manuale alla categoria OTA corrispondente, finché non esiste il modulo 2.3
  created_at    TIMESTAMP NOT NULL DEFAULT now()
);

INSERT INTO tipi_camera (nome) VALUES
  ('Singola'),
  ('Doppia uso singola'),
  ('Matrimoniale'),
  ('Tripla'),
  ('Quadrupla')
ON CONFLICT (nome) DO NOTHING;

-- 2. camere.tipo_camera_id — nullable, da assegnare manualmente alle camere
--    esistenti dopo la migration (stesso pattern già usato per `piano` nella
--    017: capienza_max e assegnazione partono vuote, si popolano dalla UI).
ALTER TABLE camere ADD COLUMN IF NOT EXISTS tipo_camera_id INTEGER REFERENCES tipi_camera(id);

-- 3. Tariffe — fasce di prezzo per notte, per tipo camera e periodo
--    (stagionalità). Un prezzo per notte, non un prezzo per soggiorno.
CREATE TABLE IF NOT EXISTS tariffe (
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
CREATE INDEX IF NOT EXISTS idx_tariffe_tipo_camera ON tariffe (tipo_camera_id);

-- Estensione già installata dalla migration 017 (vincolo anti-overbooking) —
-- IF NOT EXISTS per sicurezza se questa migration venisse eseguita in isolamento.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Vincolo anti-sovrapposizione: due fasce dello stesso tipo camera non
-- possono avere periodi che si sovrappongono, altrimenti il calcolo del
-- prezzo per una notte sarebbe ambiguo. Range inclusivo su entrambi gli
-- estremi ('[]'): qui si definiscono confini di stagione (giorno di
-- calendario), diverso da soggiorni dove '[)' esclude il giorno di partenza
-- (quella è una notte di soggiorno, questa è un confine di calendario).
ALTER TABLE tariffe ADD CONSTRAINT excl_tariffe_tipo_camera_overlap
  EXCLUDE USING gist (
    tipo_camera_id WITH =,
    daterange(data_inizio, data_fine, '[]') WITH &&
  );

-- 4. Pacchetti — prezzo fisso indipendente dal calcolo per notte (es.
--    "Weekend Relax 2 notti" a 250€ tutto compreso, non derivato dal
--    listino). Nessun DELETE fisico: un soggiorno passato può ancora
--    referenziare un pacchetto non più in vendita — la "eliminazione" dalla
--    UI disattiva soltanto (attivo = false).
CREATE TABLE IF NOT EXISTS pacchetti (
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

-- 5. soggiorni.pacchetto_id — nullable. Quando valorizzato, la UI usa
--    pacchetti.prezzo_totale come tariffa_totale invece del calcolo per
--    notte da `tariffe` (comunque sempre sovrascrivibile a mano).
ALTER TABLE soggiorni ADD COLUMN IF NOT EXISTS pacchetto_id INTEGER REFERENCES pacchetti(id);
