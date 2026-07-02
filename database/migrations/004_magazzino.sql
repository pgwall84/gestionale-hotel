-- Migration 004: Magazzino

CREATE TABLE IF NOT EXISTS fornitori (
  id        SERIAL PRIMARY KEY,
  nome      VARCHAR(255) NOT NULL,
  contatto  VARCHAR(100),
  email     VARCHAR(255),
  telefono  VARCHAR(50),
  note      TEXT,
  attivo    BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS prodotti (
  id             SERIAL PRIMARY KEY,
  nome           VARCHAR(255) NOT NULL,
  categoria      VARCHAR(100),
  unita_misura   VARCHAR(20),
  soglia_minima  DECIMAL(10,2) DEFAULT 0,
  qr_code        VARCHAR(255) UNIQUE,
  barcode_ean    VARCHAR(50),
  attivo         BOOLEAN DEFAULT true,
  created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prodotti_barcode ON prodotti(barcode_ean);
CREATE INDEX IF NOT EXISTS idx_prodotti_qr ON prodotti(qr_code);

CREATE TABLE IF NOT EXISTS movimenti_magazzino (
  id             SERIAL PRIMARY KEY,
  prodotto_id    INTEGER REFERENCES prodotti(id),
  tipo           VARCHAR(10) NOT NULL CHECK (tipo IN ('carico','scarico')),
  quantita       DECIMAL(10,2) NOT NULL,
  data           TIMESTAMP DEFAULT NOW(),
  fornitore_id   INTEGER REFERENCES fornitori(id),
  ddt_numero     VARCHAR(100),
  data_scadenza  DATE,
  user_id        INTEGER REFERENCES users(id),
  note           TEXT
);
CREATE INDEX IF NOT EXISTS idx_movimenti_prodotto ON movimenti_magazzino(prodotto_id);
CREATE INDEX IF NOT EXISTS idx_movimenti_data ON movimenti_magazzino(data);

CREATE TABLE IF NOT EXISTS ricette (
  id          SERIAL PRIMARY KEY,
  nome_piatto VARCHAR(255) NOT NULL,
  note        TEXT
);

CREATE TABLE IF NOT EXISTS ricette_ingredienti (
  id                   SERIAL PRIMARY KEY,
  ricetta_id           INTEGER REFERENCES ricette(id) ON DELETE CASCADE,
  prodotto_id          INTEGER REFERENCES prodotti(id),
  quantita_riferimento DECIMAL(10,3),
  unita_misura         VARCHAR(20)
);
