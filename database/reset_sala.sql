-- Script reset sala: elimina tutte le configurazioni e tavoli esistenti (inclusi quelli di test)
-- e ricarica la configurazione Standard con 20 tavoli T1-T20.
-- DA ESEGUIRE UNA SOLA VOLTA dopo aver applicato la migration 007.
--
-- Esecuzione:
--   psql -U postgres -d gestionale_hotel -f database/reset_sala.sql

-- Applica prima la migration 007 se non ancora fatto
ALTER TABLE tavoli ADD COLUMN IF NOT EXISTS etichetta TEXT;
ALTER TABLE tavoli ADD COLUMN IF NOT EXISTS prenotazione_id INTEGER REFERENCES prenotazioni_ristorante(id) ON DELETE SET NULL;

-- Pulisci nell'ordine corretto (rispettando FK)
UPDATE tavoli SET prenotazione_id = NULL;
DELETE FROM comande_righe
  WHERE comanda_id IN (SELECT id FROM comande WHERE tavolo_id IN (SELECT id FROM tavoli));
DELETE FROM comande WHERE tavolo_id IN (SELECT id FROM tavoli);
DELETE FROM tavoli;
DELETE FROM configurazioni_sala;

-- Inserisci configurazione Standard
INSERT INTO configurazioni_sala (nome, attiva, is_default)
VALUES ('Standard', true, true);

-- Inserisci 20 tavoli (T1-T20, 2 coperti di default — modificabili dall'interfaccia)
DO $$
DECLARE cfg_id INT;
BEGIN
  SELECT id INTO cfg_id FROM configurazioni_sala WHERE nome = 'Standard' LIMIT 1;
  FOR i IN 1..20 LOOP
    INSERT INTO tavoli (numero, coperti, configurazione_id, attivo)
    VALUES (i, 2, cfg_id, true);
  END LOOP;
END$$;

-- Verifica
SELECT 'Configurazioni:' AS info, COUNT(*) AS n FROM configurazioni_sala
UNION ALL
SELECT 'Tavoli:', COUNT(*) FROM tavoli WHERE attivo = true;
