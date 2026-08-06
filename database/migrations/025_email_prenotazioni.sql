-- Migration 025: colonne di tracciamento per le email automatiche di
-- prenotazione (modulo 5.3, parte email — 04/08/2026).
-- Tre momenti: conferma (invio immediato alla transizione 'confermata'),
-- promemoria pre-arrivo e richiesta recensione post-partenza (entrambi da
-- un job giornaliero, backend/jobs/promemoriaEmail.js). Timestamp e non
-- boolean: sapere QUANDO è partita l'email è utile per debug/supporto, e la
-- colonna valorizzata (non NULL) è comunque la condizione per "non
-- reinviare" usata dal job.
-- Nessun invio SMS in questa migration — solo email (Resend), per decisione
-- esplicita del titolare (SMS richiederebbe un provider a pagamento, fuori
-- dalla sequenza di moduli gratuiti seguita finora).

ALTER TABLE prenotazioni
  ADD COLUMN IF NOT EXISTS email_conferma_inviata_at    TIMESTAMP,
  ADD COLUMN IF NOT EXISTS email_promemoria_inviata_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS email_recensione_inviata_at  TIMESTAMP;
