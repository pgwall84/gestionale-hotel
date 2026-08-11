-- Migration 032: tabella turni_standard (turno di default per dipendente).
-- Fix di allineamento schema (11/08/2026): la tabella esiste già nel
-- database in uso (funzionante, usata da backend/controllers/turniStandardController.js
-- e dal pannello "Turni standard" in /personale) ma non era mai stata creata
-- da nessuna migration del repo — probabilmente creata a mano in una sessione
-- precedente. CREATE TABLE IF NOT EXISTS: no-op dove la tabella esiste già,
-- necessaria per una reinstallazione da zero seguendo AVVIO.md.
-- Colonne dedotte dalle query reali del controller (INSERT ... ON CONFLICT (user_id)).
CREATE TABLE IF NOT EXISTS turni_standard (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  tipo_turno  VARCHAR(50) NOT NULL,  -- mattina / sera / notte / riposo
  ora_inizio  TIME,
  ora_fine    TIME,
  note        TEXT,
  updated_at  TIMESTAMP DEFAULT NOW()
);
