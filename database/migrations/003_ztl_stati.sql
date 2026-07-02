-- Migration 003: ZTL — estende i 3 stati originali a 6
-- Aggiunge: non_necessaria, da_inviare, scaduta (oltre a mancante, inviata, conclusa)
-- Aggiunge colonne per tracking invio e import source

-- Ricrea il CHECK constraint sullo stato con i 6 valori
ALTER TABLE ztl_prenotazioni
  DROP CONSTRAINT IF EXISTS ztl_prenotazioni_stato_check,
  DROP CONSTRAINT IF EXISTS stato_check;

ALTER TABLE ztl_prenotazioni
  ADD CONSTRAINT stato_check CHECK (
    stato IN ('mancante','non_necessaria','da_inviare','inviata','scaduta','conclusa')
  );

-- Colonne aggiuntive (aggiunte se non esistono)
ALTER TABLE ztl_prenotazioni
  ADD COLUMN IF NOT EXISTS inviata_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS inviata_da  INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS import_source VARCHAR(20) DEFAULT 'manuale',
  ADD COLUMN IF NOT EXISTS created_by  INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_ztl_stato  ON ztl_prenotazioni(stato);
CREATE INDEX IF NOT EXISTS idx_ztl_arrivo ON ztl_prenotazioni(data_arrivo);
