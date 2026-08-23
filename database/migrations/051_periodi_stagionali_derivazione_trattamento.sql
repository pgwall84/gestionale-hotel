-- Migration 051 — Periodi stagionali, derivazione tariffe periodizzata,
-- trattamento (B&B/mezza pensione/pensione completa), bambini (20/08/2026).
--
-- Contesto (deciso con il titolare in chat, sessione 20/08/2026): oggi il
-- titolare inserisce un prezzo per notte per OGNI tipo camera per OGNI
-- periodo, uno per uno. Passiamo a un modello "tariffa madre + derivazione":
-- si inserisce solo il prezzo B&B della Matrimoniale/Doppia per periodo, gli
-- altri tipi (Singola, Doppia uso singola, Tripla, Quadrupla) si calcolano
-- da una percentuale configurabile PER PERIODO (confermato: il supplemento
-- non è costante tutto l'anno). Il prezzo derivato deve rispettare sempre il
-- range min/max dichiarato alla Regione (confermato: è una dichiarazione
-- legale vincolante, mai un numero superato) — qui il vincolo è predisposto
-- come clamp lato codice (calcolaTariffa, prossimo step), non ancora
-- popolato con valori reali: il titolare li inserirà dalla UI di /tariffe
-- quando sarà pronta (task successivo), non indovinati qui in migration.
--
-- "Periodo stagionale" è una nuova entità di riferimento condivisa (nome +
-- date, es. "Alta stagione" luglio-agosto) per evitare di inserire le stesse
-- date in più punti (tariffa madre, regole di derivazione, supplemento
-- trattamento) — cambi le date di un periodo una volta, si riflette
-- ovunque. Il numero e i confini dei periodi li decide il titolare, non è
-- fissato qui: la tabella parte vuota.
--
-- Trattamento: nuova dimensione (B&B/mezza pensione/pensione completa),
-- supplemento a persona, per periodo, per categoria camera ('singola' o
-- 'doppia', dedotta da capienza_max — coerente con come il titolare ha
-- fornito i dati, mai un supplemento diverso per i 6 tipi singolarmente).
--
-- Bambini (composizione_ospiti.bambini_eta, migration 046): confermato in
-- chat — età 0-2 non contano ai fini della capienza_max né pagano alcun
-- supplemento; età 3-11 contano pienamente ai fini della capienza (stesso
-- trattamento di un adulto per la scelta della camera) ma hanno uno sconto
-- FISSO (non periodizzato) sul supplemento trattamento. Età 12-17: nessuna
-- regola è stata data dal titolare — assunto qui che contino come un adulto
-- a tutti gli effetti (capienza e supplemento pieno), da confermare quando
-- si rivede la UI booking. Lo sconto bambini 3-11 è in `configurazione_bambini`,
-- seminato a 0% (nessuno sconto) finché il titolare non conferma la
-- percentuale reale — mai un numero indovinato in produzione.

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Periodi stagionali — entità di riferimento condivisa, vuota all'avvio.
CREATE TABLE IF NOT EXISTS periodi_stagionali (
  id           SERIAL PRIMARY KEY,
  nome         VARCHAR(100) NOT NULL,
  data_inizio  DATE NOT NULL,
  data_fine    DATE NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_periodi_stagionali_date CHECK (data_fine >= data_inizio)
);

-- Anti-sovrapposizione: due periodi non possono avere date che si
-- accavallano, altrimenti "in che periodo siamo oggi" sarebbe ambiguo per
-- tutte le tabelle che vi si agganciano sotto.
ALTER TABLE periodi_stagionali ADD CONSTRAINT excl_periodi_stagionali_overlap
  EXCLUDE USING gist (daterange(data_inizio, data_fine, '[]') WITH &&);

-- 2. tariffe.periodo_id — nullable: le tariffe già inserite restano valide
--    con le loro date dirette (nome_stagione libero, invariato); le nuove
--    fasce per la tariffa madre potranno agganciarsi a un periodo condiviso.
ALTER TABLE tariffe ADD COLUMN IF NOT EXISTS periodo_id INTEGER REFERENCES periodi_stagionali(id);

-- 3. Regole di derivazione — generalizza (periodizzandola) la coppia
--    tipi_camera.prezzo_base_tipo_id/supplemento_percentuale introdotta il
--    19/08/2026 per Tripla/Quadrupla, oggi fissa tutto l'anno. Da qui in
--    avanti calcolaTariffa leggerà da questa tabella; le due colonne su
--    tipi_camera restano sul database (non cancellate: sarebbe una modifica
--    distruttiva non necessaria) ma non più lette dal codice nuovo — vedi
--    nota di deprecazione sotto.
--    periodo_id NULL = regola di fallback valida quando non esiste una
--    regola più specifica per il periodo corrente (transizione morbida:
--    il titolare potrà affinare periodo per periodo quando vuole, senza
--    dover coprire subito tutto l'anno).
CREATE TABLE IF NOT EXISTS regole_derivazione_tariffe (
  id                    SERIAL PRIMARY KEY,
  tipo_camera_id        INTEGER NOT NULL REFERENCES tipi_camera(id),
  tipo_camera_base_id   INTEGER NOT NULL REFERENCES tipi_camera(id),
  periodo_id            INTEGER REFERENCES periodi_stagionali(id),
  percentuale           NUMERIC(6,2) NOT NULL,
  prezzo_minimo         NUMERIC(10,2),
  prezzo_massimo        NUMERIC(10,2),
  created_at            TIMESTAMP NOT NULL DEFAULT now(),
  updated_at            TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_regole_derivazione_range CHECK (
    prezzo_minimo IS NULL OR prezzo_massimo IS NULL OR prezzo_massimo >= prezzo_minimo
  )
);
-- Unicità: al massimo una regola per tipo+periodo, e al massimo una regola
-- di fallback (periodo_id NULL) per tipo — due indici parziali perché UNIQUE
-- normale tratta NULL come sempre distinto (permetterebbe N fallback per lo
-- stesso tipo, sbagliato).
CREATE UNIQUE INDEX IF NOT EXISTS uq_regole_derivazione_tipo_periodo
  ON regole_derivazione_tariffe (tipo_camera_id, periodo_id) WHERE periodo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_regole_derivazione_tipo_fallback
  ON regole_derivazione_tariffe (tipo_camera_id) WHERE periodo_id IS NULL;

-- 4. Supplemento trattamento — a persona, per periodo, per categoria camera
--    ('singola' = capienza_max 1, 'doppia' = capienza_max >= 2, coerente con
--    come il titolare ha sempre distinto i due casi, mai per i 6 tipi
--    singolarmente). periodo_id NULL = fallback, stesso principio sopra.
CREATE TABLE IF NOT EXISTS supplementi_trattamento (
  id                     SERIAL PRIMARY KEY,
  categoria              VARCHAR(20) NOT NULL CHECK (categoria IN ('singola', 'doppia')),
  periodo_id             INTEGER REFERENCES periodi_stagionali(id),
  trattamento            VARCHAR(20) NOT NULL CHECK (trattamento IN ('mezza_pensione', 'pensione_completa')),
  supplemento_a_persona  NUMERIC(10,2) NOT NULL CHECK (supplemento_a_persona >= 0),
  created_at             TIMESTAMP NOT NULL DEFAULT now(),
  updated_at             TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplementi_trattamento_periodo
  ON supplementi_trattamento (categoria, periodo_id, trattamento) WHERE periodo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplementi_trattamento_fallback
  ON supplementi_trattamento (categoria, trattamento) WHERE periodo_id IS NULL;

-- 5. Sconto bambini 3-11 sul supplemento trattamento — fisso tutto l'anno
--    (confermato in chat, non periodizzato). Riga singola, pattern già in
--    uso altrove per configurazioni a valore unico. Seminato a 0 (nessuno
--    sconto) con nota esplicita: NON è il valore reale, è un fail-closed
--    finché il titolare non conferma la percentuale — mai inventare un
--    numero che tocca il prezzo mostrato online.
CREATE TABLE IF NOT EXISTS configurazione_bambini (
  id                                  SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sconto_mezza_pensione_percentuale   NUMERIC(5,2) NOT NULL DEFAULT 0,
  note                                TEXT,
  updated_at                          TIMESTAMP NOT NULL DEFAULT now()
);
INSERT INTO configurazione_bambini (id, sconto_mezza_pensione_percentuale, note)
  VALUES (1, 0, 'DA CONFERMARE CON IL TITOLARE — seminato a 0% (nessuno sconto) il 20/08/2026, in attesa della percentuale reale per i bambini 3-11 anni sul supplemento mezza/pensione completa.')
  ON CONFLICT (id) DO NOTHING;

-- 6. soggiorni.trattamento — quale trattamento è stato scelto per quel
--    soggiorno. Default 'bb' per compatibilità con tutti i soggiorni
--    esistenti (mai stato chiesto finora, sempre stato implicitamente B&B).
ALTER TABLE soggiorni ADD COLUMN IF NOT EXISTS trattamento VARCHAR(20) NOT NULL DEFAULT 'bb'
  CHECK (trattamento IN ('bb', 'mezza_pensione', 'pensione_completa'));

-- 7. Migrazione dati: le regole già impostate per Tripla/Quadrupla il
--    19/08/2026 (migration 050, tipi_camera.prezzo_base_tipo_id/
--    supplemento_percentuale) diventano righe di fallback (periodo_id NULL)
--    in regole_derivazione_tariffe, così non si perde nulla di ieri e il
--    nuovo codice (che leggerà solo da questa tabella) trova subito dati
--    validi. Le due colonne su tipi_camera NON vengono toccate/rimosse qui.
INSERT INTO regole_derivazione_tariffe (tipo_camera_id, tipo_camera_base_id, periodo_id, percentuale)
  SELECT id, prezzo_base_tipo_id, NULL, supplemento_percentuale
  FROM tipi_camera
  WHERE prezzo_base_tipo_id IS NOT NULL AND supplemento_percentuale IS NOT NULL
  ON CONFLICT DO NOTHING;

COMMIT;
