-- Migration 011: tabelle omaggi e autoconsumi + tipo_chiusura su comande.
-- Gestisce chiusura comanda con omaggio o autoconsumo (solo titolare/admin).

CREATE TABLE IF NOT EXISTS omaggi (
  id               SERIAL PRIMARY KEY,
  comanda_id       INTEGER REFERENCES comande(id),
  tavolo_id        INTEGER REFERENCES tavoli(id),
  motivo           TEXT NOT NULL,
  valore_omaggio   NUMERIC(10,2),
  user_id          INTEGER REFERENCES users(id),
  data             DATE DEFAULT CURRENT_DATE,
  created_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS autoconsumi (
  id              SERIAL PRIMARY KEY,
  comanda_id      INTEGER REFERENCES comande(id),
  tavolo_id       INTEGER REFERENCES tavoli(id),
  consumatore_id  INTEGER REFERENCES users(id),
  valore_costo    NUMERIC(10,2) NOT NULL,
  valore_listino  NUMERIC(10,2),
  autorizzato_da  INTEGER REFERENCES users(id),
  data            DATE DEFAULT CURRENT_DATE,
  created_at      TIMESTAMP DEFAULT NOW()
);

ALTER TABLE comande
  ADD COLUMN IF NOT EXISTS tipo_chiusura VARCHAR(20)
    DEFAULT 'normale'
    CHECK (tipo_chiusura IN ('normale', 'omaggio', 'autoconsumo'));
