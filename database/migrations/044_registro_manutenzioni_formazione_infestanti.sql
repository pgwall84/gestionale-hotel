-- Migration 044: Registri A.6 (manutenzioni programmate), A.7 (formazione),
-- A.8 (infestanti) — modulo 6.1, sessione 3 (16/08/2026), schema allineato a
-- registri_HACCP_A1_A8.xlsx.
--
-- A.6 è tra i moduli "in forse" (configurazione_moduli_haccp, migration 041,
-- già seedato con 'manutenzioni_programmate'). A.7/A.8 sono sempre attivi
-- (obbligatori, elenco "regola pratica" del titolare, come A.1/A.5).

-- ─── A.6 — Manutenzioni programmate ─────────────────────────────────────────
-- "attrezzatura"/"ubicazione" del template NON sono colonne separate: si
-- riusa l'anagrafica apparecchiature_haccp condivisa con A.2 (stesso
-- principio già dichiarato in migration 041 — un'unica fonte per "quali
-- apparecchiature esistono"), nome/ubicazione letti via JOIN, non duplicati.
CREATE TABLE IF NOT EXISTS registro_manutenzioni (
  id                   SERIAL PRIMARY KEY,
  data                 DATE NOT NULL DEFAULT CURRENT_DATE,
  apparecchiatura_id   INTEGER NOT NULL REFERENCES apparecchiature_haccp(id),
  tipo_intervento      VARCHAR(100),
  descrizione_intervento TEXT,
  ditta_operatore      VARCHAR(150),
  pezzi_sostituiti     TEXT,
  esito                VARCHAR(20) NOT NULL CHECK (esito IN ('eseguita', 'non_eseguita')),
  prossima_manutenzione DATE,
  firma_responsabile   VARCHAR(150),
  user_id              INTEGER REFERENCES users(id),
  note                 TEXT,
  created_at           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registro_manutenzioni_data ON registro_manutenzioni(data);
CREATE INDEX IF NOT EXISTS idx_registro_manutenzioni_apparecchiatura ON registro_manutenzioni(apparecchiatura_id);

-- ─── A.7 — Formazione ────────────────────────────────────────────────────────
-- "nome_cognome" è testo libero, non una FK verso users: la formazione può
-- riguardare personale non ancora censito nel gestionale o un ente esterno
-- (docente), stesso principio già usato per fornitore/prodotto in A.1.
-- "attestato"/"firma_partecipante" sono flag booleani (rilasciato/firmato o
-- no), non un file: nessuna gestione documentale prevista in questa sessione.
CREATE TABLE IF NOT EXISTS registro_formazione (
  id                SERIAL PRIMARY KEY,
  data              DATE NOT NULL DEFAULT CURRENT_DATE,
  nome_cognome      VARCHAR(150) NOT NULL,
  qualifica_ruolo   VARCHAR(100),
  titolo_corso      VARCHAR(200) NOT NULL,
  durata_ore        NUMERIC(5,2),
  contenuti         TEXT,
  docente_ente      VARCHAR(150),
  attestato         BOOLEAN NOT NULL DEFAULT false,
  numero_attestato  VARCHAR(100),
  firma_partecipante BOOLEAN NOT NULL DEFAULT false,
  user_id           INTEGER REFERENCES users(id),
  note              TEXT,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registro_formazione_data ON registro_formazione(data);

-- ─── A.8 — Controllo infestanti ─────────────────────────────────────────────
-- "firma_responsabile" resta testo libero (spesso la ditta esterna di
-- disinfestazione, non un utente del gestionale) — stesso principio di
-- ditta_operatore in A.6.
CREATE TABLE IF NOT EXISTS registro_infestanti (
  id                  SERIAL PRIMARY KEY,
  data                DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo_controllo      VARCHAR(100),
  punti_controllati   TEXT,
  esito               VARCHAR(20) NOT NULL CHECK (esito IN ('nessuna_traccia', 'presenza_rilevata')),
  azioni_effettuate   TEXT,
  prossimo_controllo  DATE,
  firma_responsabile  VARCHAR(150),
  user_id             INTEGER REFERENCES users(id),
  note                TEXT,
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registro_infestanti_data ON registro_infestanti(data);
