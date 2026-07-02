-- Migration 005: Ristorante e comande

CREATE TABLE IF NOT EXISTS configurazioni_sala (
  id         SERIAL PRIMARY KEY,
  nome       VARCHAR(100) NOT NULL,
  attiva     BOOLEAN DEFAULT false,
  is_default BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS tavoli (
  id                 SERIAL PRIMARY KEY,
  numero             INTEGER NOT NULL,
  coperti            INTEGER NOT NULL,
  posizione_x        INTEGER,
  posizione_y        INTEGER,
  configurazione_id  INTEGER REFERENCES configurazioni_sala(id),
  attivo             BOOLEAN DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_tavoli_configurazione ON tavoli(configurazione_id);

CREATE TABLE IF NOT EXISTS prenotazioni_ristorante (
  id         SERIAL PRIMARY KEY,
  nome       VARCHAR(255) NOT NULL,
  telefono   VARCHAR(50),
  data       DATE NOT NULL,
  ora        TIME NOT NULL,
  coperti    INTEGER NOT NULL,
  allergie   TEXT,
  note       TEXT,
  stato      VARCHAR(20) DEFAULT 'confermata' CHECK (stato IN ('confermata','in_attesa','cancellata','completata')),
  camera_id  INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prenotazioni_rist_data ON prenotazioni_ristorante(data);

CREATE TABLE IF NOT EXISTS comande (
  id                  SERIAL PRIMARY KEY,
  tavolo_id           INTEGER REFERENCES tavoli(id),
  cameriere_id        INTEGER REFERENCES users(id),
  stato               VARCHAR(20) DEFAULT 'aperta' CHECK (stato IN ('aperta','chiusa','annullata')),
  timestamp_apertura  TIMESTAMP DEFAULT NOW(),
  timestamp_chiusura  TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_comande_tavolo ON comande(tavolo_id);
CREATE INDEX IF NOT EXISTS idx_comande_stato ON comande(stato);

CREATE TABLE IF NOT EXISTS comande_righe (
  id               SERIAL PRIMARY KEY,
  comanda_id       INTEGER REFERENCES comande(id) ON DELETE CASCADE,
  piatto_id        INTEGER REFERENCES menu_piatti(id),
  quantita         INTEGER DEFAULT 1,
  note             TEXT,
  stato            VARCHAR(20) DEFAULT 'in_attesa' CHECK (stato IN ('in_attesa','in_preparazione','pronto','servito')),
  timestamp_pronto TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_comande_righe_comanda ON comande_righe(comanda_id);
CREATE INDEX IF NOT EXISTS idx_comande_righe_stato ON comande_righe(stato);

-- Configurazione di default: sala Standard
INSERT INTO configurazioni_sala (nome, attiva, is_default)
VALUES ('Standard', true, true)
ON CONFLICT DO NOTHING;
