-- Migration 039: Registro temperature HACCP (modulo 6.1, punto 1 — 15/08/2026)
-- Rilevazione manuale rapida per punto di controllo (frigo/cella/abbattitore).
-- I punti di controllo sono hardcoded in backend/controllers/registroHaccpController.js
-- (stesso pattern già in uso per ATTREZZATURE_DEFAULT in haccpController.js),
-- non una tabella di configurazione a parte — coerente con la semplicità del
-- resto del modulo HACCP.
--
-- Soglie di allarme (0-4°C frigo, valore per Abbattitore ancora da confermare
-- col titolare) NON sono in questa migration: nessuna colonna soglia_min/max
-- qui, sono hardcoded lato backend quando/se arrivano — vedi TODO in
-- docs/EVOLUTIVE.md "Modulo 6.1 punto 1". Il dato si registra comunque da
-- subito, l'alert "fuori soglia" arriva dopo senza toccare lo schema.

CREATE TABLE IF NOT EXISTS registro_temperature (
  id               SERIAL PRIMARY KEY,
  punto_controllo  VARCHAR(100) NOT NULL,
  valore           NUMERIC(4,1) NOT NULL,
  data             DATE NOT NULL DEFAULT CURRENT_DATE,
  ora              TIME NOT NULL DEFAULT CURRENT_TIME,
  user_id          INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  note             TEXT,
  created_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registro_temperature_data ON registro_temperature(data);
CREATE INDEX IF NOT EXISTS idx_registro_temperature_punto ON registro_temperature(punto_controllo);
