-- Migration 007: aggiunge etichetta e collegamento prenotazione ai tavoli.
-- etichetta: testo libero visibile sulla card (es. "Rossi", "Bianchi 8p").
-- prenotazione_id: FK opzionale alla prenotazione del giorno associata al tavolo.
-- ON DELETE SET NULL: se la prenotazione viene cancellata, il tavolo torna libero.

ALTER TABLE tavoli
  ADD COLUMN IF NOT EXISTS etichetta TEXT,
  ADD COLUMN IF NOT EXISTS prenotazione_id INTEGER REFERENCES prenotazioni_ristorante(id) ON DELETE SET NULL;
