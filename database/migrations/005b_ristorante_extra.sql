-- Migration 005b: Campi aggiuntivi modulo ristorante
-- Aggiunge: tipo_speciale/motivo su comande_righe, ospite_hotel su prenotazioni e comande
-- NON modificare 005_ristorante.sql — questa è una migration separata

ALTER TABLE comande_righe
  ADD COLUMN IF NOT EXISTS tipo_speciale VARCHAR(20)
    CHECK (tipo_speciale IN ('omaggio','autoconsumo','sconto')),
  ADD COLUMN IF NOT EXISTS motivo_speciale TEXT;

ALTER TABLE prenotazioni_ristorante
  ADD COLUMN IF NOT EXISTS ospite_hotel BOOLEAN DEFAULT false;

ALTER TABLE comande
  ADD COLUMN IF NOT EXISTS ospite_hotel BOOLEAN DEFAULT false;
  -- true = ospite in pensione/mezza pensione: il conto non viene addebitato
