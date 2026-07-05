-- Migration 010: aggiunge campo emoji alla tabella menu_categorie
-- Usato nella colonna categorie della schermata comanda cameriere.

ALTER TABLE menu_categorie
  ADD COLUMN IF NOT EXISTS emoji VARCHAR(10) DEFAULT '🍽️';
