-- Migration 041: Anagrafica apparecchiature HACCP (modulo 6.1, ricostruzione
-- 16/08/2026 sui registri A.1-A.8 forniti dal titolare). Condivisa tra
-- registro temperature (A.2) e manutenzioni programmate (A.6, sessione 3) —
-- un'unica fonte per "quali apparecchiature esistono", non due anagrafiche
-- separate che potrebbero disallinearsi nel tempo.

CREATE TABLE IF NOT EXISTS apparecchiature_haccp (
  id          SERIAL PRIMARY KEY,
  nome        VARCHAR(100) NOT NULL,
  -- 'frigo'/'freezer' hanno soglia statica (registroHaccpController.js);
  -- 'abbattitore' ha un limite a tempo (ciclo di raffreddamento), non
  -- rientra nel confronto min/max statico — vedi nota in fuoriSoglia().
  -- Gli altri tipi servono solo per A.6 (manutenzioni), non per A.2.
  tipo        VARCHAR(30) NOT NULL CHECK (tipo IN (
    'frigo', 'freezer', 'abbattitore', 'cappa', 'piano_cottura',
    'forno', 'lavastoviglie', 'zona_rifiuti', 'altro'
  )),
  ubicazione  VARCHAR(100),
  attivo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apparecchiature_haccp_tipo ON apparecchiature_haccp(tipo);

-- Seed iniziale (16/08/2026, elenco reale fornito dal titolare) — editabile
-- da /impostazioni/haccp, questo è solo il punto di partenza.
INSERT INTO apparecchiature_haccp (nome, tipo, ubicazione) VALUES
  ('Frigo 1', 'frigo', 'Cucina'),
  ('Frigo 2', 'frigo', 'Cucina'),
  ('Frigo 3', 'frigo', 'Bar'),
  ('Freezer 1', 'freezer', 'Cucina'),
  ('Freezer 2', 'freezer', 'Cucina'),
  ('Freezer 3', 'freezer', 'Magazzino'),
  ('Abbattitore', 'abbattitore', 'Cucina'),
  ('Cappa', 'cappa', 'Cucina'),
  ('Piano cottura', 'piano_cottura', 'Cucina'),
  ('Forno', 'forno', 'Cucina'),
  ('Lavastoviglie', 'lavastoviglie', 'Cucina'),
  ('Zona rifiuti', 'zona_rifiuti', 'Esterno');

-- Config on/off per i moduli "in forse" (A.4 buffet, A.6 manutenzioni
-- programmate) — il titolare deciderà dopo aver verificato il piano HACCP
-- dell'hotel quali tenere in produzione. Attivi di default: si spengono da
-- /impostazioni/haccp, non si cancella codice.
CREATE TABLE IF NOT EXISTS configurazione_moduli_haccp (
  modulo         VARCHAR(50) PRIMARY KEY,
  attivo         BOOLEAN NOT NULL DEFAULT true,
  aggiornato_da  INTEGER REFERENCES users(id),
  aggiornato_il  TIMESTAMP DEFAULT NOW()
);

INSERT INTO configurazione_moduli_haccp (modulo, attivo) VALUES
  ('buffet', true),
  ('manutenzioni_programmate', true)
ON CONFLICT (modulo) DO NOTHING;
