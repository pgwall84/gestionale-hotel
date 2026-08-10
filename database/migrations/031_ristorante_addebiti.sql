-- Migration 031: Addebiti extra ristorante/bar sul conto camera.
-- Decisione titolare (10/08/2026): gli extra oltre il trattamento incluso
-- (soprattutto bar) si accumulano sul conto camera e si saldano al
-- check-out, con evidenza in una ricevuta di cortesia NON fiscale — i
-- pasti inclusi restano dentro il documento fiscale della camera come oggi.
--
-- Due percorsi verso addebiti_extra:
--   1) comanda reale (ristorante, passa da cucina) con righe marcate
--      addebito_camera, sommate alla chiusura;
--   2) griglia rapida "a quadratoni" (bar/camera, priorità del titolare),
--      che scrive direttamente qui senza passare da comanda/tavolo/cucina.

-- comande: collega la comanda a un soggiorno (ospite hotel) oppure a un
-- nome cliente esterno (nessuna registrazione ospiti necessaria: gli
-- esterni non passano da Alloggiati Web). Nullable: una comanda
-- ospite_hotel senza soggiorno_id risolto resta possibile (es. camera
-- senza soggiorno attivo trovato), ma in quel caso il frontend deve
-- impedire di marcare righe come addebito_camera (nessun conto a cui
-- appenderle).
ALTER TABLE comande
  ADD COLUMN IF NOT EXISTS soggiorno_id INTEGER REFERENCES soggiorni(id),
  ADD COLUMN IF NOT EXISTS nome_cliente_esterno VARCHAR(255);

-- comande_righe: riga da addebitare al conto camera anche se la comanda è
-- ospite_hotel (trattamento incluso) — es. una birra oltre la colazione.
ALTER TABLE comande_righe
  ADD COLUMN IF NOT EXISTS addebito_camera BOOLEAN DEFAULT false;

-- Addebiti accumulati sul conto camera, in attesa di essere saldati al
-- check-out. Non è un pagamento (vedi tabella pagamenti, che modella solo
-- importi ricevuti) — è un debito verso il soggiorno.
CREATE TABLE IF NOT EXISTS addebiti_extra (
  id            SERIAL PRIMARY KEY,
  soggiorno_id  INTEGER NOT NULL REFERENCES soggiorni(id),
  comanda_id    INTEGER REFERENCES comande(id),
  origine       VARCHAR(20) NOT NULL DEFAULT 'ristorante'
                  CHECK (origine IN ('ristorante','bar','altro')),
  descrizione   TEXT,
  importo       NUMERIC(10,2) NOT NULL,
  data          DATE DEFAULT CURRENT_DATE,
  user_id       INTEGER REFERENCES users(id),
  created_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_addebiti_extra_soggiorno ON addebiti_extra(soggiorno_id);

-- Catalogo prodotti per la griglia rapida a quadratoni (Impostazioni).
-- Deliberatamente separato da menu_piatti: quella tabella alimenta anche
-- /menu-pubblico e /menu-stampa (NON toccare, CLAUDE.md Sezione 12) — un
-- prodotto bar finito lì per errore di filtro comparirebbe nel menu
-- stampato o nel QR pubblico.
CREATE TABLE IF NOT EXISTS catalogo_addebiti_rapidi (
  id         SERIAL PRIMARY KEY,
  nome       VARCHAR(255) NOT NULL,
  prezzo     NUMERIC(10,2) NOT NULL,
  ordine     INTEGER DEFAULT 0,
  attivo     BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
