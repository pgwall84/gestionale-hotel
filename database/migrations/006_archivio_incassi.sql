-- Migration 006: Archivio documentale e incassi giornalieri

CREATE TABLE IF NOT EXISTS archivio_documenti (
  id             SERIAL PRIMARY KEY,
  tipo           VARCHAR(50) NOT NULL CHECK (tipo IN ('resoconto_z','ddt','fattura','pos','altro')),
  data_documento DATE NOT NULL,
  filename       VARCHAR(255) NOT NULL,
  note           TEXT,
  user_id        INTEGER REFERENCES users(id),
  created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_archivio_data ON archivio_documenti(data_documento);
CREATE INDEX IF NOT EXISTS idx_archivio_tipo ON archivio_documenti(tipo);

CREATE TABLE IF NOT EXISTS incassi_giornalieri (
  id         SERIAL PRIMARY KEY,
  data       DATE NOT NULL UNIQUE,
  contanti   DECIMAL(10,2) DEFAULT 0,
  pos        DECIMAL(10,2) DEFAULT 0,
  note       TEXT,
  user_id    INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_incassi_data ON incassi_giornalieri(data);
