-- Migration 043: Registri A.1 (ricevimento merci) e A.4 (buffet) — modulo 6.1,
-- sessione 2 (16/08/2026), schema allineato a registri_HACCP_A1_A8.xlsx.
--
-- A.1 è sempre attivo (obbligatorio, elenco "regola pratica" del titolare).
-- A.4 è tra i moduli "in forse" (configurazione_moduli_haccp, migration 041):
-- resta come tabella normale, l'on/off vive solo in applicazione (nessuna
-- differenza strutturale rispetto ad A.1 — coerente col principio "il codice
-- resta, si spegne solo il tab").

-- ─── A.1 — Ricevimento merci ────────────────────────────────────────────────
-- "operatore" e "esito" del template cartaceo: operatore è l'utente
-- autenticato (user_id + join, stesso pattern di registro_temperature/
-- registro_cottura, non un campo testo libero). "esito" resta una
-- valutazione manuale dell'operatore (conforme/non conforme): a differenza
-- di frigo/freezer, il template A.1 non distingue "prodotto refrigerato" da
-- "prodotto congelato/surgelato" con un campo dedicato, quindi non c'è modo
-- affidabile di calcolare automaticamente il fuori-soglia dalla sola
-- temperatura — stesso principio già applicato a registro_cottura (nessuna
-- soglia automatica quando lo schema non la supporta in modo pulito).
CREATE TABLE IF NOT EXISTS registro_ricevimento_merci (
  id                    SERIAL PRIMARY KEY,
  data                  DATE NOT NULL DEFAULT CURRENT_DATE,
  fornitore             VARCHAR(150) NOT NULL,
  prodotto              VARCHAR(150) NOT NULL,
  lotto                 VARCHAR(100),
  scadenza_tmc          DATE,
  quantita              NUMERIC(10,2),
  unita_misura          VARCHAR(20),
  temp_ricevimento      NUMERIC(5,2),
  integrita_confezione  VARCHAR(20) CHECK (integrita_confezione IN ('integra', 'danneggiata')),
  esito                 VARCHAR(20) NOT NULL CHECK (esito IN ('conforme', 'non_conforme')),
  azione_correttiva     TEXT,
  user_id               INTEGER REFERENCES users(id),
  note                  TEXT,
  created_at            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registro_ricevimento_merci_data ON registro_ricevimento_merci(data);

-- ─── A.4 — Temperature buffet ───────────────────────────────────────────────
-- limite_critico/esito NON sono colonne: come per frigo/freezer (A.2), si
-- calcolano da tipologia_buffet + temp_rilevata (SOGLIE_BUFFET nel
-- controller) — stesso principio, non duplichiamo un dato derivabile.
CREATE TABLE IF NOT EXISTS registro_buffet (
  id                 SERIAL PRIMARY KEY,
  data               DATE NOT NULL DEFAULT CURRENT_DATE,
  ora                TIME NOT NULL DEFAULT CURRENT_TIME,
  tipologia_buffet   VARCHAR(20) NOT NULL CHECK (tipologia_buffet IN ('freddo', 'caldo')),
  prodotto_vaschetta VARCHAR(150) NOT NULL,
  temp_rilevata      NUMERIC(5,2) NOT NULL,
  azione_correttiva  TEXT,
  user_id            INTEGER REFERENCES users(id),
  note               TEXT,
  created_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registro_buffet_data ON registro_buffet(data);
