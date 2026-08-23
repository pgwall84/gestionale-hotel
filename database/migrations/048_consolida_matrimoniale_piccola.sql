-- Migration 048 — Consolidamento Singola/Doppia uso singola (19/08/2026).
--
-- Contesto (Booking Engine v2, Fase B/C — discusso con il titolare): le
-- camere 2, 7, 12, 21 sono FISICAMENTE la stessa stanza (10mq, un letto
-- matrimoniale alla francese), venduta finora su Booking.com sotto due nomi
-- diversi ("Camera Singola" e "Camera Matrimoniale Piccola") per
-- intercettare due modi di cercare diversi — un trucco da marketplace, non
-- due inventari distinti. Nel gestionale però ogni camera fisica appartiene
-- SEMPRE a un solo tipo (camere.tipo_camera_id, FK singola) — tenerle come
-- due tipi separati sul booking engine diretto avrebbe rischiato di far
-- risultare "piena" una stanza libera solo perché assegnata all'altra
-- etichetta. Deciso con il titolare (19/08/2026): un solo tipo camera per
-- queste 4 stanze, prezzo unico indipendente dal numero di occupanti (la
-- policy tariffe/tipologie più ampia resta da rivedere con il titolare in
-- futuro, annotata separatamente — questa migration sistema SOLO la
-- duplicazione fisica, non tocca la strategia di prezzo).
--
-- Tripla (camere 15, 16) e Quadrupla (camere 17, 18) NON sono toccate da
-- questa migration: sono pool fissi, confermati dal titolare, senza
-- ambiguità di doppia identità.
--
-- Sicurezza: la migration non decide da sola quale dei due tipi_camera
-- "vince" (quale id sopravvive) — lo deduce da quale dei due ha già
-- tariffe configurate, e si ferma con un errore esplicito se il segnale è
-- ambiguo (entrambi con tariffe, o nessuno dei due), invece di procedere
-- alla cieca. Nessuna riga viene MAI cancellata (stesso principio già in
-- uso per `camere.attivo`, migration 019) — il tipo escluso viene solo
-- disattivato, per non rompere eventuali riferimenti storici da soggiorni
-- passati.

BEGIN;

-- Flag di disattivazione per tipi_camera — non esisteva ancora (colonna
-- introdotta solo su `camere`, migration 019). Stesso pattern: mai una
-- DELETE reale, solo attivo = false.
ALTER TABLE tipi_camera ADD COLUMN IF NOT EXISTS attivo BOOLEAN NOT NULL DEFAULT true;

DO $$
DECLARE
  v_id_singola      INTEGER;
  v_id_doppia       INTEGER;
  v_tariffe_singola INTEGER;
  v_tariffe_doppia  INTEGER;
  v_survivor_id     INTEGER;
  v_eliminato_id    INTEGER;
  v_camere_spostate INTEGER;
BEGIN
  SELECT id INTO v_id_singola FROM tipi_camera WHERE nome = 'Singola';
  SELECT id INTO v_id_doppia  FROM tipi_camera WHERE nome = 'Doppia uso singola';

  IF v_id_singola IS NULL OR v_id_doppia IS NULL THEN
    RAISE EXCEPTION 'Migration 048: non trovo sia "Singola" (id=%) sia "Doppia uso singola" (id=%) in tipi_camera — nomi cambiati da quando questa migration è stata scritta? Verificare a mano prima di procedere.',
      v_id_singola, v_id_doppia;
  END IF;

  SELECT count(*) INTO v_tariffe_singola FROM tariffe WHERE tipo_camera_id = v_id_singola;
  SELECT count(*) INTO v_tariffe_doppia  FROM tariffe WHERE tipo_camera_id = v_id_doppia;

  IF v_tariffe_singola > 0 AND v_tariffe_doppia = 0 THEN
    v_survivor_id  := v_id_singola;
    v_eliminato_id := v_id_doppia;
  ELSIF v_tariffe_doppia > 0 AND v_tariffe_singola = 0 THEN
    v_survivor_id  := v_id_doppia;
    v_eliminato_id := v_id_singola;
  ELSE
    RAISE EXCEPTION 'Migration 048: segnale ambiguo su quale tipo tenere — "Singola" (id=%) ha % tariffe, "Doppia uso singola" (id=%) ha % tariffe. Se sono entrambi a zero o entrambi valorizzati, decidere a mano quale id sopravvive (e quali tariffe eventualmente spostare) prima di rilanciare questa migration.',
      v_id_singola, v_tariffe_singola, v_id_doppia, v_tariffe_doppia;
  END IF;

  -- Le 4 stanze fisiche (confermate dal titolare) vanno TUTTE sul
  -- sopravvissuto, indipendentemente da dove sono assegnate oggi.
  UPDATE camere SET tipo_camera_id = v_survivor_id
    WHERE numero IN ('2', '7', '12', '21');
  GET DIAGNOSTICS v_camere_spostate = ROW_COUNT;

  UPDATE tipi_camera SET
    nome = 'Matrimoniale Piccola',
    note = COALESCE(note || E'\n', '') ||
      'Su Booking.com questa stanza compare sia come "Camera Singola" sia come "Camera Matrimoniale Piccola" (stessa camera fisica, due nomi). Consolidata qui in un tipo unico il 19/08/2026 — prezzo unico indipendente dal numero di occupanti, policy da rivedere con il titolare.'
    WHERE id = v_survivor_id;

  UPDATE tipi_camera SET attivo = false WHERE id = v_eliminato_id;

  RAISE NOTICE 'Migration 048 completata: sopravvive id=% (rinominato "Matrimoniale Piccola"), disattivato id=%, % camere riassegnate (attese: 4 — numeri 2,7,12,21). Se il conteggio non è 4, verificare a mano quali stanze non sono state trovate.',
    v_survivor_id, v_eliminato_id, v_camere_spostate;
END $$;

COMMIT;
