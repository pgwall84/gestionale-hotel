-- Migration 035: ora reale del check-in su soggiorni (13/08/2026).
--
-- Prerequisito per la Fase D del piano Alloggiati Web/RIMOVCLI concordato
-- il 13/08/2026 (docs/EVOLUTIVE.md, "Modulo 2.5 — Fase 2, stato al
-- 13/08/2026"): la regola WS_ALLOGGIATI di scadenza 24h (6h per i
-- soggiorni sotto le 24 ore, "day-use") richiede di sapere QUANDO è
-- avvenuto il check-in, non solo la data di arrivo. Oggi soggiorni.
-- data_arrivo è DATE, nessuna tabella salva un orario reale.
--
-- Questa migration si limita a catturare il dato (nessun enforcement
-- della regola 24h/6h ancora implementato — nessuna prenotazione day-use
-- reale oggi, costruire l'enforcement ora sarebbe prematuro). Valorizzata
-- da prenotazioniController.js alla transizione di stato verso 'check_in'.

ALTER TABLE soggiorni
  ADD COLUMN IF NOT EXISTS check_in_effettuato_at TIMESTAMP;
