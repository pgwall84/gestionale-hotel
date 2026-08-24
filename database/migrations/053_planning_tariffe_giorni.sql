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
-- mockup HTML di riferimento (mockup_matrice_tariffe_v4.html).

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
