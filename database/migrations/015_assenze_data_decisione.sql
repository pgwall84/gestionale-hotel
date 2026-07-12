-- Migration 015: traccia quando una richiesta assenza è stata approvata/rifiutata,
-- per evidenziare le decisioni recenti (ultime 24h) al dipendente.
ALTER TABLE richieste_assenza ADD COLUMN IF NOT EXISTS data_decisione TIMESTAMP;
