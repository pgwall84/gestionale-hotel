-- Migration 049 — Sgancia l'Appartamento dal tipo camera "Quadrupla" (19/08/2026).
--
-- Trovato durante la diagnosi "non trova mai camere per 3/4 adulti": la
-- camera con numero 'app' (id=21, nome "Appartamento" — la casa in affitto
-- separata dalle 20 camere hotel, vedi CLAUDE.md sezione 1) risultava
-- l'UNICA stanza assegnata al tipo camera "Quadrupla". Se si fosse aggiunta
-- una tariffa a quel tipo senza prima sganciarlo, l'appartamento sarebbe
-- diventato prenotabile e pagabile online tramite il Booking Engine
-- Diretto come se fosse una normale camera hotel — sbagliato: l'appartamento
-- ha logiche proprie (fino a 5 persone, non legate ai letti a castello
-- delle camere 15/16/19/20) e oggi non è nemmeno "registrato sul portale"
-- per gli altri moduli (Alloggiati Web, ROSS1000).
--
-- Nessuna cancellazione: la camera "Appartamento" resta nella tabella
-- `camere`, solo senza un tipo_camera_id (nessuna categoria hotel) finché
-- non verrà deciso come gestirlo (probabilmente un concetto separato dalle
-- 4 tipologie camera, non un quinto tipo — da progettare a parte).

BEGIN;

DO $$
DECLARE
  v_righe INTEGER;
BEGIN
  UPDATE camere SET tipo_camera_id = NULL
    WHERE numero = 'app' AND nome = 'Appartamento';
  GET DIAGNOSTICS v_righe = ROW_COUNT;
  IF v_righe <> 1 THEN
    RAISE EXCEPTION 'Migration 049: attese esattamente 1 riga aggiornata (camera "app"/"Appartamento"), trovate %. Verificare a mano.', v_righe;
  END IF;
  RAISE NOTICE 'Migration 049 completata: Appartamento sganciato dal tipo camera precedente.';
END $$;

COMMIT;
