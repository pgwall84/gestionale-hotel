-- Migration 034: dettaglio errore su alloggiati_invii (modulo 2.5 Fase 2 —
-- invio automatico notturno, 13/08/2026).
--
-- alloggiati_invii (migration 016) tracciava solo un esito sintetico
-- ('ok'/'parziale') senza il motivo — sufficiente quando l'invio era solo
-- manuale (un operatore che ha appena premuto il pulsante sa già cosa ha
-- inviato). Con l'invio automatico notturno, la coda in
-- Impostazioni > Alloggiati Web deve poter mostrare AL VOLO perché un
-- soggiorno non è ancora stato inviato con successo, senza dover rilanciare
-- il tentativo per scoprirlo.
--
-- Non aggiunge un CHECK su esito (mai stato presente, resta testo libero):
-- i valori usati dal job sono 'ok', 'parziale', 'errore' — testo libero
-- per restare coerente con l'unica colonna esistente.

ALTER TABLE alloggiati_invii
  ADD COLUMN IF NOT EXISTS dettaglio_errore TEXT;
