-- Booking Engine v2, Fase C (19/08/2026).
-- Testo della politica di cancellazione da mostrare in due punti:
--   1) email di conferma prenotazione (backend/lib/emailPrenotazioni.js,
--      che oggi usa il segnaposto TERMINI_CANCELLAZIONE_SEGNAPOSTO fisso)
--   2) pagina /prenota del sito, prima dello step di pagamento
-- Stessa riga singleton (id=1) di impostazioni_email — un'unica versione
-- attiva, editabile da Impostazioni ▸ Testi email.
-- Valore di default = segnaposto esplicito, MAI un testo legale inventato:
-- va sostituito da Marco con la politica reale (percentuali/scadenze)
-- prima di andare in produzione con pagamenti reali.

ALTER TABLE impostazioni_email
  ADD COLUMN IF NOT EXISTS termini_cancellazione TEXT
    DEFAULT '[DA COMPLETARE — inserire qui la politica di cancellazione reale prima del go-live: entro quanti giorni dall''arrivo si può cancellare gratuitamente, cosa succede alla caparra dopo quella scadenza, come richiedere la cancellazione.]';

COMMENT ON COLUMN impostazioni_email.termini_cancellazione IS
  'Politica di cancellazione mostrata nella mail di conferma prenotazione e in /prenota prima del pagamento (Booking Engine v2, Fase C, 19/08/2026). Editabile da Impostazioni > Testi email.';
