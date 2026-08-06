-- Migration 026: gestione testi delle 3 email automatiche (modulo 5.3,
-- estensione 04/08/2026, richiesta esplicita del titolare) + offerte
-- dedicate via email verso i clienti con consenso marketing.

-- email_template — oggetto+corpo modificabili da admin/titolare per le tre
-- email automatiche (conferma/promemoria/recensione, backend/lib/emailPrenotazioni.js).
-- Corpo testo semplice (non HTML): l'operatore scrive testo normale con
-- a-capo, il layout grafico fisso (involucroHtml) resta nel codice. Seed con
-- i testi già in uso prima di questa migration, per non cambiare nulla di
-- default finché il titolare non modifica qualcosa dalla pagina.
CREATE TABLE IF NOT EXISTS email_template (
  tipo            VARCHAR(20) PRIMARY KEY CHECK (tipo IN ('conferma', 'promemoria', 'recensione')),
  oggetto         TEXT NOT NULL,
  corpo           TEXT NOT NULL,
  aggiornato_da   INTEGER REFERENCES users(id),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO email_template (tipo, oggetto, corpo) VALUES
  ('conferma',
   'Prenotazione confermata — Hotel del Golfo',
   E'Gentile {nome_ospite},\n\nla sua prenotazione presso Hotel del Golfo è confermata:\n\n{elenco_soggiorni}\n\nLa aspettiamo!'),
  ('promemoria',
   'Il suo arrivo si avvicina — Hotel del Golfo',
   E'Gentile {nome_ospite},\n\nle ricordiamo il suo prossimo soggiorno presso Hotel del Golfo:\n\n{elenco_soggiorni}\n\nA presto!'),
  ('recensione',
   'Grazie per essere stato nostro ospite — Hotel del Golfo',
   E'Gentile {nome_ospite},\n\nsperiamo che il suo soggiorno presso Hotel del Golfo sia stato piacevole.\n\nSe ha un momento, ci farebbe molto piacere leggere la sua opinione.')
ON CONFLICT (tipo) DO NOTHING;

-- impostazioni_email — riga singola (id fisso 1) con i dati del footer,
-- condiviso da tutte le email (automatiche + offerte). logo_url è un URL
-- pubblico esterno incollato a mano (es. il sito su Vercel): il gestionale
-- oggi è raggiungibile solo da LAN (1.10 Deploy VPS non ancora fatto), quindi
-- un'immagine ospitata qui non sarebbe visibile ai destinatari reali.
CREATE TABLE IF NOT EXISTS impostazioni_email (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  footer_indirizzo TEXT,
  footer_telefono  TEXT,
  footer_email     TEXT,
  footer_sito      TEXT,
  logo_url         TEXT,
  aggiornato_da    INTEGER REFERENCES users(id),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO impostazioni_email (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- offerte_email — storico delle campagne/offerte dedicate inviate.
CREATE TABLE IF NOT EXISTS offerte_email (
  id                SERIAL PRIMARY KEY,
  oggetto           TEXT NOT NULL,
  corpo             TEXT NOT NULL,
  inviato_da        INTEGER REFERENCES users(id),
  inviato_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  totale_destinatari INTEGER NOT NULL DEFAULT 0,
  totale_ok         INTEGER NOT NULL DEFAULT 0,
  totale_falliti    INTEGER NOT NULL DEFAULT 0
);

-- offerte_email_destinatari — un record per ogni destinatario di ogni
-- offerta, con l'email "fotografata" al momento dell'invio (non un JOIN live
-- su ospiti: se l'ospite cambia email dopo, lo storico resta corretto) e
-- l'esito individuale — necessario per il dettaglio "chi ha ricevuto cosa".
CREATE TABLE IF NOT EXISTS offerte_email_destinatari (
  id            SERIAL PRIMARY KEY,
  offerta_id    INTEGER NOT NULL REFERENCES offerte_email(id) ON DELETE CASCADE,
  ospite_id     INTEGER REFERENCES ospiti(id),
  email         TEXT NOT NULL,
  ok            BOOLEAN NOT NULL,
  errore        TEXT
);

CREATE INDEX IF NOT EXISTS idx_offerte_email_destinatari_offerta ON offerte_email_destinatari(offerta_id);
