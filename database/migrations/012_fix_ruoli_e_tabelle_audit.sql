-- Migration 012: allinea i file versionati allo stato reale del database.
-- Segnalato da tests/api/ospiti.test.js e tests/api/audit.test.js (07/07/2026):
-- 1) Il CHECK constraint su users.ruolo in 001_users.sql non includeva 'admin'
--    e 'portiere_notte', pur essendo shared/ruoli.js la fonte di verità con 7 ruoli.
-- 2) Le tabelle audit_log e refresh_tokens (usate dal codice e elencate in
--    CLAUDE.md) non avevano nessuna migration che le creasse.
-- Il DB reale aveva già ruoli e tabelle corretti (create fuori dal flusso
-- migration) — questa migration è idempotente e non modifica dati esistenti,
-- serve solo a rendere ricostruibile il DB da zero seguendo le migration.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_ruolo_check;
ALTER TABLE users ADD CONSTRAINT users_ruolo_check
  CHECK (ruolo IN ('admin', 'titolare', 'receptionist', 'cameriere', 'cuoco', 'portiere_notte', 'dipendente'));

CREATE TABLE IF NOT EXISTS audit_log (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id),
  azione         VARCHAR(50) NOT NULL,
  risorsa_tipo   VARCHAR(50),
  risorsa_id     INTEGER,
  ip_address     INET,
  dettagli       JSONB,
  created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token_hash     VARCHAR(255) NOT NULL UNIQUE,
  expires_at     TIMESTAMP NOT NULL,
  revoked_at     TIMESTAMP,
  created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
