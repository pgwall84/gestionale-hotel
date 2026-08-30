-- Migration 055 — Integrazione Beds24, Fase 1 (lettura prenotazioni OTA).
-- Due tabelle:
-- 1. beds24_config — riga singola (stesso pattern di configurazione_ztl,
--    migration 038): credenziali API Beds24 e stato di sincronizzazione.
--    Il refresh token NON va mai in .env (ruota nel tempo).
-- 2. beds24_prenotazioni_da_revisionare — coda per le prenotazioni che
--    non si possono scrivere automaticamente su prenotazioni/soggiorni
--    (roomId non mappato in tipi_camera_canali, oppure nessuna camera
--    fisica libera per quelle date — soggiorni.camera_id è NOT NULL con
--    vincolo EXCLUDE, migration 017, non si può scrivere una riga "a
--    metà"). La reception la registra a mano con lo strumento già in uso
--    oggi per una prenotazione telefonica, poi la segna risolta.

CREATE TABLE IF NOT EXISTS beds24_config (
  id                          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- riga singola
  refresh_token               VARCHAR(255),
  token                        VARCHAR(255),
  token_scade_at               TIMESTAMP,
  ultima_sincronizzazione_at   TIMESTAMP,
  updated_at                   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS beds24_prenotazioni_da_revisionare (
  id                    SERIAL PRIMARY KEY,
  external_booking_id  VARCHAR(255) NOT NULL,
  payload_raw           JSONB NOT NULL,
  motivo                 VARCHAR(30) NOT NULL,
  risolto                BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMP NOT NULL DEFAULT now(),
  updated_at             TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_beds24_da_revisionare_motivo CHECK (
    motivo IN ('camera_non_mappata', 'nessuna_camera_disponibile')
  )
);
CREATE INDEX IF NOT EXISTS idx_beds24_da_revisionare_risolto
  ON beds24_prenotazioni_da_revisionare (risolto, created_at);
