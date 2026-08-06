-- Migration 027: Pre check-in self-service (modulo 5.2 Fase B, 04/08/2026).
-- Form pubblico raggiungibile via token (nessun login) dove l'ospite
-- compila i dati di tutti i componenti del soggiorno prima dell'arrivo. I
-- dati NON toccano subito l'anagrafica: restano "in attesa di revisione"
-- finché la reception non li applica (crea/aggiorna gli ospiti veri e li
-- collega al soggiorno). Include anche il "nucleo familiare": un
-- raggruppamento leggero tra clienti (usato quando l'applica crea più
-- ospiti dalla stessa richiesta), visibile anche fuori dal pre check-in
-- nella scheda cliente (/clienti/:id).

-- Quarto tipo di email_template (migration 026): l'invito al pre check-in,
-- sia standalone (pulsante manuale) sia — con placeholder {link_pre_checkin}
-- — dentro il testo del promemoria stesso. Il vincolo CHECK di 026 va
-- ricreato (mai alterare una migration già eseguita) invece di modificato.
ALTER TABLE email_template DROP CONSTRAINT IF EXISTS email_template_tipo_check;
ALTER TABLE email_template ADD CONSTRAINT email_template_tipo_check
  CHECK (tipo IN ('conferma', 'promemoria', 'recensione', 'pre_checkin'));

INSERT INTO email_template (tipo, oggetto, corpo) VALUES
  ('pre_checkin',
   'Completa il pre check-in — Hotel del Golfo',
   E'Gentile {nome_ospite},\n\nmanca poco al suo arrivo! Può completare il pre check-in online, comodamente da casa, in pochi minuti:\n\n{link_pre_checkin}\n\nA presto!')
ON CONFLICT (tipo) DO NOTHING;

-- Token del link pubblico: salvato come hash (stesso pattern di
-- refresh_tokens, backend/controllers/authController.js) — il valore in
-- chiaro esiste solo nell'URL mandato via email, mai in DB.
ALTER TABLE prenotazioni
  ADD COLUMN IF NOT EXISTS pre_checkin_token_hash TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS pre_checkin_inviato_at TIMESTAMP;

-- nuclei_familiari — entità leggera, non una persona: raggruppa più righe
-- di ospiti. Etichetta libera e facoltativa (es. "Famiglia Rossi").
CREATE TABLE IF NOT EXISTS nuclei_familiari (
  id          SERIAL PRIMARY KEY,
  etichetta   TEXT,
  creato_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE ospiti
  ADD COLUMN IF NOT EXISTS nucleo_familiare_id INTEGER REFERENCES nuclei_familiari(id);

CREATE INDEX IF NOT EXISTS idx_ospiti_nucleo_familiare ON ospiti(nucleo_familiare_id);

-- pre_checkin_richieste — una per invio del form pubblico (il form blocca
-- un secondo invio se ne esiste già una non scartata per la stessa
-- prenotazione, vedi backend/controllers/preCheckinPubblicoController.js).
CREATE TABLE IF NOT EXISTS pre_checkin_richieste (
  id                          SERIAL PRIMARY KEY,
  prenotazione_id             INTEGER NOT NULL REFERENCES prenotazioni(id),
  stato                       VARCHAR(20) NOT NULL DEFAULT 'in_attesa'
                                CHECK (stato IN ('in_attesa', 'applicata', 'scartata')),
  consenso_privacy_accettato  BOOLEAN NOT NULL DEFAULT false,
  note_referente              TEXT,
  motivo_scarto               TEXT,
  creato_at                   TIMESTAMP NOT NULL DEFAULT NOW(),
  applicata_da                INTEGER REFERENCES users(id),
  applicata_at                TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pre_checkin_richieste_prenotazione ON pre_checkin_richieste(prenotazione_id);
CREATE INDEX IF NOT EXISTS idx_pre_checkin_richieste_stato ON pre_checkin_richieste(stato);

-- pre_checkin_ospiti — una riga per componente del soggiorno proposto
-- dall'ospite. Testo libero (nessun codice Alloggiati Web: il form pubblico
-- non è autenticato, niente tendine — la reception abbina il codice
-- ufficiale, se serve, quando applica). applicato_ospite_id traccia quale
-- riga di `ospiti` è stata creata/aggiornata da questa proposta, per non
-- riapplicarla due volte per errore.
CREATE TABLE IF NOT EXISTS pre_checkin_ospiti (
  id                   SERIAL PRIMARY KEY,
  richiesta_id         INTEGER NOT NULL REFERENCES pre_checkin_richieste(id) ON DELETE CASCADE,
  soggiorno_id         INTEGER NOT NULL REFERENCES soggiorni(id),
  nome                 TEXT,
  cognome              TEXT,
  sesso                VARCHAR(1),
  data_nascita         DATE,
  cittadinanza_testo   TEXT,
  documento_tipo_testo TEXT,
  documento_numero     TEXT,
  documento_scadenza   DATE,
  luogo_nascita_testo  TEXT,
  provincia_nascita    VARCHAR(2),
  applicato_ospite_id  INTEGER REFERENCES ospiti(id)
);

CREATE INDEX IF NOT EXISTS idx_pre_checkin_ospiti_richiesta ON pre_checkin_ospiti(richiesta_id);
