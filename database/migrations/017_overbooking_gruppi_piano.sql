-- Migration 017: aggiunte 16/07/2026 al modulo Prenotazioni Fase 2.
-- Vincolo anti-overbooking (EXCLUDE su soggiorni), gruppi di prenotazione
-- con pagamento unico, campo piano su camere.
-- Vedi docs/SCHEMA_PRENOTAZIONI_FASE2.md, sezione "Nota sulla migration 017"
-- per l'elenco e l'ordine delle operazioni, e sezioni 1c/2/3/4/6b per il
-- dettaglio di ogni tabella/colonna.
--
-- Verifica preventiva eseguita il 16/07/2026: 0 soggiorni sovrapposti sulla
-- stessa camera — il vincolo EXCLUDE sotto può essere applicato in sicurezza.
-- Estensione btree_gist verificata disponibile e installabile (utente DB
-- con permessi sufficienti).

-- 1. Estensione richiesta dal vincolo EXCLUDE (operatore "=" dentro un
--    indice GiST insieme a "&&" sui daterange).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Gruppi di prenotazione — creata prima di alterare prenotazioni, perché
--    quest'ultima avrà una FK verso questa tabella.
CREATE TABLE IF NOT EXISTS gruppi_prenotazione (
  id                  SERIAL PRIMARY KEY,
  nome                VARCHAR(255) NOT NULL,
  referente_nome      VARCHAR(255),
  referente_email     VARCHAR(255),
  referente_telefono  VARCHAR(50),
  note                TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT now()
);

-- 3. prenotazioni.gruppo_id — nullable, la maggior parte delle prenotazioni
--    resta singola, senza gruppo.
ALTER TABLE prenotazioni ADD COLUMN IF NOT EXISTS gruppo_id INTEGER REFERENCES gruppi_prenotazione(id);
CREATE INDEX IF NOT EXISTS idx_prenotazioni_gruppo ON prenotazioni (gruppo_id);

-- 4. soggiorni.cancellato + vincolo anti-overbooking. Il vincolo esclude
--    solo i soggiorni con cancellato = false: quando una prenotazione passa
--    a 'interrotta' il controller deve impostare cancellato = true su tutti
--    i suoi soggiorni nella stessa transazione, altrimenti una prenotazione
--    cancellata continuerebbe a bloccare la camera per sempre.
ALTER TABLE soggiorni ADD COLUMN IF NOT EXISTS cancellato BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE soggiorni ADD CONSTRAINT excl_soggiorni_camera_overlap
  EXCLUDE USING gist (
    camera_id WITH =,
    daterange(data_arrivo, data_partenza, '[)') WITH &&
  ) WHERE (cancellato = false);

-- 5. pagamenti — un pagamento è legato o a una prenotazione singola o a un
--    gruppo, mai a entrambi, mai a nessuno dei due (CHECK tipo XOR).
ALTER TABLE pagamenti ALTER COLUMN prenotazione_id DROP NOT NULL;
ALTER TABLE pagamenti ADD COLUMN IF NOT EXISTS gruppo_id INTEGER REFERENCES gruppi_prenotazione(id);
CREATE INDEX IF NOT EXISTS idx_pagamenti_gruppo ON pagamenti (gruppo_id);

ALTER TABLE pagamenti ADD CONSTRAINT chk_pagamenti_prenotazione_o_gruppo CHECK (
  (prenotazione_id IS NOT NULL AND gruppo_id IS NULL) OR
  (prenotazione_id IS NULL AND gruppo_id IS NOT NULL)
);

-- 6. camere.piano — nullable, 0=piano terra, negativi per seminterrati,
--    positivi per piani superiori. Da popolare manualmente per le camere
--    esistenti dopo la migration.
ALTER TABLE camere ADD COLUMN IF NOT EXISTS piano SMALLINT;
