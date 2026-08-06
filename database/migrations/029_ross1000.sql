-- Migration 029: stato/comune di residenza dell'ospite (modulo 2.6 — Export
-- ROSS1000/ISTAT, Fase 1, 04/08/2026). Campo diverso dal luogo di NASCITA
-- (già presente): il tracciato ROSS1000 (docs/ross1000/tracciato.pdf) lo
-- richiede come obbligatorio per ogni arrivo (<statoresidenza>/
-- <luogoresidenza>), e non era mai stato raccolto — esplicitamente scartato
-- il 03/08/2026 in migration 024 ("non serve a questo scopo, si aggiungerà
-- se servirà per altro in futuro"): questo è quel "futuro".
--
-- Stesso pattern testo libero + codice ufficiale già usato per nascita/
-- cittadinanza (migration 016 + 023): tabella 'Luoghi' di alloggiati_codici,
-- mai bloccante, il codice si abbina solo se il testo corrisponde a un
-- suggerimento sincronizzato.

ALTER TABLE ospiti
  ADD COLUMN IF NOT EXISTS stato_residenza_codice   VARCHAR(9),
  ADD COLUMN IF NOT EXISTS stato_residenza_testo     TEXT,
  ADD COLUMN IF NOT EXISTS comune_residenza_codice   VARCHAR(9),
  ADD COLUMN IF NOT EXISTS comune_residenza_testo    TEXT;

-- Stesse colonne anche in pre_checkin_ospiti (modulo 5.2 Fase B, migration
-- 027) — il titolare ha chiesto di raccogliere anche questo dato nel form
-- di pre check-in self-service, non solo nella scheda cliente in reception.
ALTER TABLE pre_checkin_ospiti
  ADD COLUMN IF NOT EXISTS stato_residenza_codice   VARCHAR(9),
  ADD COLUMN IF NOT EXISTS stato_residenza_testo     TEXT,
  ADD COLUMN IF NOT EXISTS comune_residenza_codice   VARCHAR(9),
  ADD COLUMN IF NOT EXISTS comune_residenza_testo    TEXT;
