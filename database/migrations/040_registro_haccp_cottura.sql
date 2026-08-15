-- Migration 040: Registro scongelamento/cottura HACCP (modulo 6.1, punto 2 — 15/08/2026)
-- Collegamento opzionale a menu_piatti (non a `ricette`, tabella confermata
-- dal titolare come non utilizzata oggi — 15/08/2026): ON DELETE SET NULL,
-- il registro resta valido anche se il piatto viene rimosso dal menu in
-- futuro, non è un dato fiscale/legale da preservare per forza collegato.

CREATE TABLE IF NOT EXISTS registro_cottura (
  id                 SERIAL PRIMARY KEY,
  tipo               VARCHAR(20) NOT NULL CHECK (tipo IN ('scongelamento', 'cottura')),
  prodotto           VARCHAR(200) NOT NULL,
  menu_piatto_id     INTEGER REFERENCES menu_piatti(id) ON DELETE SET NULL,
  metodo             VARCHAR(100),
  temperatura_cuore  NUMERIC(4,1),
  data               DATE NOT NULL DEFAULT CURRENT_DATE,
  ora                TIME NOT NULL DEFAULT CURRENT_TIME,
  user_id            INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  note               TEXT,
  created_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registro_cottura_data ON registro_cottura(data);
CREATE INDEX IF NOT EXISTS idx_registro_cottura_tipo ON registro_cottura(tipo);
