-- PLACEHOLDER: configurazione provvisoria 20 tavoli 2 posti
-- Aggiornare con layout reale prima del go-live

-- Inserisce i 20 tavoli della config Standard solo se non esistono già.
-- Griglia 4 colonne × 5 righe; passo 120px orizzontale, 100px verticale.
DO $$
DECLARE
  v_config_id  INT;
  v_count      INT;
  i            INT;
  v_numero     INT;
  v_col        INT;   -- 0..3
  v_row        INT;   -- 0..4
BEGIN
  SELECT id INTO v_config_id
  FROM configurazioni_sala
  WHERE nome = 'Standard'
  LIMIT 1;

  IF v_config_id IS NULL THEN
    RAISE NOTICE 'Configurazione Standard non trovata — seed saltato.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM tavoli
  WHERE configurazione_id = v_config_id AND attivo = true;

  IF v_count >= 20 THEN
    RAISE NOTICE 'Trovati % tavoli attivi in Standard — seed saltato.', v_count;
    RETURN;
  END IF;

  FOR i IN 1..20 LOOP
    v_numero := i;
    v_col    := (i - 1) % 4;
    v_row    := (i - 1) / 4;

    INSERT INTO tavoli (numero, coperti, posizione_x, posizione_y, configurazione_id, attivo)
    VALUES (
      v_numero,
      2,
      v_col * 120,
      v_row * 100,
      v_config_id,
      true
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Inseriti 20 tavoli placeholder in configurazione Standard (id=%).', v_config_id;
END;
$$;
