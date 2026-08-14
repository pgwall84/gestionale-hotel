-- Migration 033: tipologia di contratto per dipendente (Fase B, 13/08/2026).
-- Richiesta dal titolare per far dipendere l'orario standard proposto in
-- "Turni standard" dal tipo di contratto: tempo indeterminato (8h, fascia
-- diurna 07-15 o notturna 23-07 a scelta), part-time (5h, orario libero),
-- chiamata (nessuno standard proposto). Entrambe le colonne nullable: un
-- utente esistente senza contratto impostato continua a funzionare come
-- prima (nessuna proposta automatica, comportamento identico a 'chiamata').
--
-- Ipotesi di lavoro dichiarate dal titolare, non ancora consolidate:
-- 8h/23-7/7-15 sono valori di partenza, rivedibili — vedi CLAUDE.md Sezione 16.

ALTER TABLE users ADD COLUMN IF NOT EXISTS contratto_tipo VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS fascia_oraria VARCHAR(20);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_contratto_tipo_check;
ALTER TABLE users ADD CONSTRAINT users_contratto_tipo_check
  CHECK (contratto_tipo IS NULL OR contratto_tipo IN ('tempo_indeterminato', 'part_time', 'chiamata'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_fascia_oraria_check;
ALTER TABLE users ADD CONSTRAINT users_fascia_oraria_check
  CHECK (fascia_oraria IS NULL OR fascia_oraria IN ('diurna', 'notturna'));
