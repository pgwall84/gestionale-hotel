-- Migration 001: Tabella utenti e autenticazione
-- Eseguire questa migration UNA SOLA VOLTA sul database PostgreSQL.
-- Comando: psql -U postgres -d gestionale_hotel -f database/migrations/001_users.sql

-- Crea il database se non esiste (da eseguire come superuser PostgreSQL)
-- CREATE DATABASE gestionale_hotel;

-- Tabella utenti: contiene tutti i dipendenti dell'hotel con il loro ruolo.
-- La password non viene mai salvata in chiaro, solo il suo hash bcrypt.
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  nome          VARCHAR(100)  NOT NULL,
  cognome       VARCHAR(100)  NOT NULL,
  email         VARCHAR(255)  UNIQUE NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  ruolo         VARCHAR(50)   NOT NULL CHECK (ruolo IN ('titolare', 'receptionist', 'cameriere', 'cuoco', 'dipendente')),
  attivo        BOOLEAN       DEFAULT true,  -- false = dipendente non più attivo (non cancellare mai i record)
  created_at    TIMESTAMP     DEFAULT NOW()
);

-- Indice sulla email per velocizzare il login (ricerca per email)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Indice sul ruolo per filtrare rapidamente per categoria
CREATE INDEX IF NOT EXISTS idx_users_ruolo ON users(ruolo);
