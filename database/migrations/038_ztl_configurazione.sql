-- Migration 038 — Switch temporaneo modalità import ZTL (15/08/2026)
-- Oggi le prenotazioni reali restano su TeamSystem Hospitality (il
-- gestionale non è ancora la fonte di verità per le camere, modulo 2.3/
-- migrazione non completata) — ZTL continua a dipendere dall'export Excel
-- di TS (import esistente, invariato). Questa tabella prepara però il
-- passaggio futuro: una riga singola con la modalità attiva, per poter
-- passare a sincronizzare da `soggiorni` (interno) il giorno in cui la
-- migrazione sarà completata, senza dover riscrivere ZTL da zero.
--
-- Deliberatamente NON storicizzata (a differenza di
-- configurazione_tassa_soggiorno): è un interruttore operativo temporaneo,
-- non un dato fiscale — non serve tenere lo storico dei cambi.
--
-- RIMOZIONE FUTURA (post-migrazione, insieme all'import Excel TS): quando
-- il gestionale sostituirà TeamSystem, eliminare questa tabella, lo switch
-- in UI, POST /api/ztl/import e il parsing Excel in ztlController.js —
-- terrà solo sincronizzaDaPlanning (o la renderà automatica). Annotato
-- anche in docs/EVOLUTIVE.md.

CREATE TABLE configurazione_ztl (
  id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- riga singola
  modalita   VARCHAR(20) NOT NULL DEFAULT 'excel_ts'
               CHECK (modalita IN ('excel_ts', 'planning_interno')),
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id)
);

INSERT INTO configurazione_ztl (id, modalita) VALUES (1, 'excel_ts');
