-- Migration 050 — Shared inventory per il Booking Engine Diretto (19/08/2026).
--
-- Contesto (deciso con il titolare in chat, sessione 19/08/2026): la stessa
-- camera fisica può essere venduta sotto identità/prezzi diversi:
--   - 2, 7, 12, 21 (10mq): Singola (1 persona) oppure Matrimoniale Piccola
--     (2 persone) — stesso pool, prezzi diversi.
--   - Tutte le altre camere "pure" (14mq): Doppia uso singola (1 persona)
--     oppure Matrimoniale (2 persone) — stesso pool, prezzi diversi.
--   - 15, 16, 19, 20 (matrimoniale + letti a castello): Tripla (3 persone,
--     +30% sul prezzo Matrimoniale) o Quadrupla (4 persone, +20%).
--
-- Decisione esplicita sul rischio di cannibalizzazione (discussa in chat):
-- 15/16/19/20 sul BOOKING ENGINE ONLINE compaiono SOLO come Tripla/
-- Quadrupla, mai come Matrimoniale/Doppia uso singola — altrimenti una
-- prenotazione online economica potrebbe "rubare" una stanza che valeva di
-- più venduta a una famiglia. Restano vendibili come Matrimoniale/Doppia
-- uso singola SOLO via reception/telefono (prenotazione manuale, che
-- sceglie la camera fisica direttamente e non passa da questa tabella).
--
-- L'appartamento (camera 'app') resta fuori da tutto questo — sganciato
-- dalla logica "Quadrupla" dalla migration 049, non richiesto qui.
--
-- Il vecchio `camere.tipo_camera_id` NON viene toccato: resta l'etichetta
-- fisica di default per planning/reception, ma non è più la fonte di
-- verità per la disponibilità del booking engine diretto (quella ora è
-- `tipi_camera_camere`, sotto).

BEGIN;

-- 1. Quali camere fisiche possono soddisfare la ricerca di un dato tipo
--    camera sulle rotte pubbliche /api/booking-pubblico/*. Non usata dalla
--    prenotazione manuale in reception (sceglie sempre la camera diretta).
CREATE TABLE IF NOT EXISTS tipi_camera_camere (
  id              SERIAL PRIMARY KEY,
  tipo_camera_id  INTEGER NOT NULL REFERENCES tipi_camera(id),
  camera_id       INTEGER NOT NULL REFERENCES camere(id),
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (tipo_camera_id, camera_id)
);
CREATE INDEX IF NOT EXISTS idx_tipi_camera_camere_tipo   ON tipi_camera_camere (tipo_camera_id);
CREATE INDEX IF NOT EXISTS idx_tipi_camera_camere_camera ON tipi_camera_camere (camera_id);

-- 2. Supplemento letto extra — Tripla/Quadrupla non hanno più una tariffa
--    fissa propria: il prezzo si calcola sempre dal tipo base (Matrimoniale)
--    + percentuale, così non si disallinea quando cambia il prezzo base.
ALTER TABLE tipi_camera ADD COLUMN IF NOT EXISTS prezzo_base_tipo_id INTEGER REFERENCES tipi_camera(id);
ALTER TABLE tipi_camera ADD COLUMN IF NOT EXISTS supplemento_percentuale NUMERIC(5,2);

-- 3. Quale identità è stata venduta per un dato soggiorno — indipendente
--    dall'etichetta fisica di default della camera (`camere.tipo_camera_id`),
--    necessaria perché con lo shared inventory una prenotazione "Singola"
--    può finire su una camera etichettata "Matrimoniale Piccola" e
--    viceversa. NULL per i soggiorni storici (pre-shared-inventory): mail e
--    planning ricadono sul comportamento precedente in quel caso.
ALTER TABLE soggiorni ADD COLUMN IF NOT EXISTS tipo_camera_venduto_id INTEGER REFERENCES tipi_camera(id);

DO $$
DECLARE
  v_id_singola              INTEGER;
  v_id_matrimoniale_piccola INTEGER;
  v_id_doppia_uso_singola   INTEGER;
  v_id_matrimoniale         INTEGER;
  v_id_tripla                INTEGER;
  v_id_quadrupla              INTEGER;
BEGIN
  SELECT id INTO v_id_singola              FROM tipi_camera WHERE nome = 'Singola';
  SELECT id INTO v_id_matrimoniale_piccola FROM tipi_camera WHERE nome = 'Matrimoniale Piccola';
  SELECT id INTO v_id_matrimoniale         FROM tipi_camera WHERE nome = 'Matrimoniale';
  SELECT id INTO v_id_tripla                FROM tipi_camera WHERE nome = 'Tripla';
  SELECT id INTO v_id_quadrupla              FROM tipi_camera WHERE nome = 'Quadrupla';

  IF v_id_singola IS NULL OR v_id_matrimoniale_piccola IS NULL OR v_id_matrimoniale IS NULL
     OR v_id_tripla IS NULL OR v_id_quadrupla IS NULL THEN
    RAISE EXCEPTION 'Migration 050: tipo camera atteso non trovato — Singola=%, Matrimoniale Piccola=%, Matrimoniale=%, Tripla=%, Quadrupla=%. Verificare a mano prima di rilanciare.',
      v_id_singola, v_id_matrimoniale_piccola, v_id_matrimoniale, v_id_tripla, v_id_quadrupla;
  END IF;

  -- Riattiva "Singola" (disattivato dalla migration 048 — ora torna un
  -- tipo a sé, con prezzo diverso da Matrimoniale Piccola, come da listino
  -- ufficiale del titolare).
  UPDATE tipi_camera SET attivo = true WHERE id = v_id_singola;

  -- Crea "Doppia uso singola" se non esiste già (rieseguibile senza rischi).
  SELECT id INTO v_id_doppia_uso_singola FROM tipi_camera WHERE nome = 'Doppia uso singola';
  IF v_id_doppia_uso_singola IS NULL THEN
    INSERT INTO tipi_camera (nome, capienza_max, note)
      VALUES (
        'Doppia uso singola',
        1,
        'Camera matrimoniale standard (14mq) occupata da una sola persona — stesso pool fisico del tipo "Matrimoniale", nessuna stanza dedicata. Introdotto 19/08/2026.'
      )
      RETURNING id INTO v_id_doppia_uso_singola;
  END IF;

  -- Capienze — impostate esplicitamente per tutti e 6 i tipi coinvolti,
  -- invece di assumere che i valori già presenti fossero corretti (uno dei
  -- sospetti iniziali del bug "non trova mai camere per 3/4 adulti").
  UPDATE tipi_camera SET capienza_max = 1 WHERE id = v_id_singola;
  UPDATE tipi_camera SET capienza_max = 2 WHERE id = v_id_matrimoniale_piccola;
  UPDATE tipi_camera SET capienza_max = 1 WHERE id = v_id_doppia_uso_singola;
  UPDATE tipi_camera SET capienza_max = 2 WHERE id = v_id_matrimoniale;
  UPDATE tipi_camera SET capienza_max = 3 WHERE id = v_id_tripla;
  UPDATE tipi_camera SET capienza_max = 4 WHERE id = v_id_quadrupla;

  -- Supplemento Tripla/Quadrupla, sempre dal prezzo Matrimoniale corrente.
  UPDATE tipi_camera SET prezzo_base_tipo_id = v_id_matrimoniale, supplemento_percentuale = 30 WHERE id = v_id_tripla;
  UPDATE tipi_camera SET prezzo_base_tipo_id = v_id_matrimoniale, supplemento_percentuale = 20 WHERE id = v_id_quadrupla;

  -- Idoneità pool piccole (2,7,12,21): Singola + Matrimoniale Piccola.
  INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id)
    SELECT v_id_singola, id FROM camere WHERE numero IN ('2','7','12','21')
    ON CONFLICT DO NOTHING;
  INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id)
    SELECT v_id_matrimoniale_piccola, id FROM camere WHERE numero IN ('2','7','12','21')
    ON CONFLICT DO NOTHING;

  -- Idoneità pool letto extra (15,16,19,20): SOLO Tripla + Quadrupla sul
  -- canale online — decisione esplicita anti-cannibalizzazione, vedi
  -- commento in testa al file. Vendibili come Matrimoniale solo da reception.
  INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id)
    SELECT v_id_tripla, id FROM camere WHERE numero IN ('15','16','19','20')
    ON CONFLICT DO NOTHING;
  INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id)
    SELECT v_id_quadrupla, id FROM camere WHERE numero IN ('15','16','19','20')
    ON CONFLICT DO NOTHING;

  -- Idoneità pool standard: tutte le camere attive che non sono né nel pool
  -- piccole né nel pool letto extra né l'appartamento — "tutte le altre
  -- matrimoniali pure" (definizione del titolare), calcolata per esclusione
  -- invece di elencare a mano i numeri, che da questo ambiente non è
  -- possibile verificare uno per uno contro il database reale.
  INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id)
    SELECT v_id_doppia_uso_singola, id FROM camere
      WHERE attivo = true AND numero NOT IN ('2','7','12','21','15','16','19','20','app')
    ON CONFLICT DO NOTHING;
  INSERT INTO tipi_camera_camere (tipo_camera_id, camera_id)
    SELECT v_id_matrimoniale, id FROM camere
      WHERE attivo = true AND numero NOT IN ('2','7','12','21','15','16','19','20','app')
    ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Migration 050 completata. Controllare la query di verifica subito sotto per i conteggi per tipo.';
END $$;

-- Verifica: quante camere sono risultate idonee per ciascun tipo — atteso
-- 4 per Singola/Matrimoniale Piccola, 4 per Tripla/Quadrupla, il resto
-- (tutte le "pure") per Doppia uso singola/Matrimoniale (stesso numero per
-- entrambe, essendo lo stesso pool fisico).
SELECT tc.nome, count(*) AS camere_idonee
FROM tipi_camera_camere tcc
JOIN tipi_camera tc ON tc.id = tcc.tipo_camera_id
GROUP BY tc.nome
ORDER BY tc.nome;

COMMIT;
