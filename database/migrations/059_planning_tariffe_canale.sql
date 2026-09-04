-- database/migrations/059_planning_tariffe_canale.sql
-- Migration 059 — Eccezioni per canale su planning_tariffe_giorni
-- (Modulo 2.3, Fase 2/3, 04/09/2026).
--
-- canale NULL (default) = vale per tutti i canali, comportamento
-- identico a prima di questa migration — nessuna riga esistente cambia
-- significato. canale = 'beds24' = eccezione con precedenza sulla riga
-- NULL per la stessa (tipo_camera_id, trattamento, data).
--
-- L'indice univoco precedente (uq_planning_tariffe_giorni, migration 053)
-- viene sostituito: un UNIQUE(tipo_camera_id, trattamento, data, canale)
-- "nudo" non basterebbe, perché Postgres tratta NULL come "non uguale a
-- se stesso" nell'unicità di default — permetterebbe righe NULL duplicate
-- per la stessa chiave, rompendo l'invariante "al più una riga di default
-- per giorno". Si usa COALESCE(canale, '') nell'espressione dell'indice:
-- normalizza NULL a '' ai soli fini dell'unicità (mai un valore di canale
-- reale, enforced dal CHECK sotto), così NULL e '' collidono tra loro
-- come previsto mentre 'beds24' resta un valore separato.

BEGIN;

ALTER TABLE planning_tariffe_giorni
  ADD COLUMN IF NOT EXISTS canale VARCHAR(20);

ALTER TABLE planning_tariffe_giorni
  ADD CONSTRAINT chk_planning_tariffe_canale CHECK (canale IS NULL OR (canale <> '' AND canale IN ('beds24')));

DROP INDEX IF EXISTS uq_planning_tariffe_giorni;

CREATE UNIQUE INDEX IF NOT EXISTS uq_planning_tariffe_giorni
  ON planning_tariffe_giorni (tipo_camera_id, trattamento, data, COALESCE(canale, ''));

COMMIT;
