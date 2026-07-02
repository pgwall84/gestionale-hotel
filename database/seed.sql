-- Seed iniziale: crea l'utente TITOLARE per il primo accesso.
-- Eseguire UNA SOLA VOLTA dopo le migration.
--
-- Password iniziale: Admin1234
-- IMPORTANTE: cambiare la password al primo accesso dall'interfaccia!
--
-- L'hash qui sotto è bcrypt di "Admin1234" con cost factor 12.
-- Per generarne uno nuovo: node -e "require('bcrypt').hash('TuaPassword',12).then(console.log)"

INSERT INTO users (nome, cognome, email, password_hash, ruolo)
VALUES (
  'Titolare',
  'Hotel',
  'admin@hotel.it',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMqJqhcanFp8.VEFRJkBmST0K2',
  'titolare'
)
ON CONFLICT (email) DO NOTHING;
-- ON CONFLICT: se l'utente esiste già, non fa nulla (seed sicuro da eseguire più volte)
