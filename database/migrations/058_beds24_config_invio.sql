-- database/migrations/058_beds24_config_invio.sql
-- Migration 058 — Configurazione invio tariffe/disponibilità a Beds24
-- (Modulo 2.3, Fase 2/3, 04/09/2026). Vedi
-- docs/superpowers/specs/2026-09-03-invio-tariffe-beds24-design.md.
--
-- unita_esposte: tetto di unità vendibili su Beds24 per quella tipologia,
-- indipendente dalla disponibilità fisica reale (Beds24 fattura per unità
-- esposta — vedi sezione Contesto della spec). NULL = nessun tetto oltre
-- la disponibilità fisica.
-- maggiorazione_percentuale: applicata al prezzo base diretto per ottenere
-- il prezzo inviato a Beds24 (assorbe la commissione OTA/Beds24).
--
-- beds24_invio_log: stesso principio di webhook_log ma per la direzione
-- opposta (noi -> Beds24). tipo distingue disponibilita/tariffe perché
-- hanno cadenza e granularità diverse (evento singolo vs batch periodico).
-- dettaglio JSONB conserva errors/warnings/info così come li restituisce
-- Beds24 (POST /inventory/rooms/calendar), non appiattiti in una stringa
-- — vedi sezione "Gestione errori" della spec.

BEGIN;

ALTER TABLE tipi_camera_canali
  ADD COLUMN IF NOT EXISTS unita_esposte SMALLINT,
  ADD COLUMN IF NOT EXISTS maggiorazione_percentuale NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE tipi_camera_canali
  ADD CONSTRAINT chk_tipi_camera_canali_unita_esposte CHECK (unita_esposte IS NULL OR unita_esposte >= 0);
ALTER TABLE tipi_camera_canali
  ADD CONSTRAINT chk_tipi_camera_canali_maggiorazione CHECK (maggiorazione_percentuale >= 0);

ALTER TABLE beds24_config
  ADD COLUMN IF NOT EXISTS orizzonte_invio_tariffe_fino_a DATE;

CREATE TABLE IF NOT EXISTS beds24_invio_log (
  id              SERIAL PRIMARY KEY,
  tipo            VARCHAR(20) NOT NULL,
  tipo_camera_id  INTEGER REFERENCES tipi_camera(id),
  esito           VARCHAR(20) NOT NULL,
  dettaglio       JSONB,
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_beds24_invio_log_tipo CHECK (tipo IN ('disponibilita', 'tariffe')),
  CONSTRAINT chk_beds24_invio_log_esito CHECK (esito IN ('successo', 'errore', 'saltato_rate_limit'))
);
CREATE INDEX IF NOT EXISTS idx_beds24_invio_log_tipo_data ON beds24_invio_log (tipo, created_at);

COMMIT;
