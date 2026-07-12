-- Migration 014: geolocalizzazione timbratura (verifica lato client, salvata per audit).
ALTER TABLE timbrature
  ADD COLUMN IF NOT EXISTS latitudine DECIMAL(10,8),
  ADD COLUMN IF NOT EXISTS longitudine DECIMAL(11,8),
  ADD COLUMN IF NOT EXISTS distanza_hotel INTEGER;
