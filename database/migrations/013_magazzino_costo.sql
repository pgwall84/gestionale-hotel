-- Migration 013: costo unitario sui movimenti di magazzino.
-- Necessario per calcolare il food cost globale (Modulo 1.7): senza un
-- prezzo associato ai carichi non è possibile sapere quanto si è speso
-- in materie prime nel periodo. Nullable: un carico senza costo_unitario
-- viene escluso dal calcolo food cost (COALESCE), non blocca l'inserimento.

ALTER TABLE movimenti_magazzino ADD COLUMN IF NOT EXISTS costo_unitario DECIMAL(10,2);
