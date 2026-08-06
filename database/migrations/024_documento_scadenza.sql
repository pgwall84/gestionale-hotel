-- Migration 024: data di scadenza del documento d'identità (modulo 5.2,
-- Pre check-in digitale + OCR, Fase A — 03/08/2026).
-- Non richiesta da Alloggiati Web (già verificato sui manuali ufficiali,
-- vedi docs/PRENOTAZIONI_FASE2.md — il tracciato non la prevede), ma utile
-- perché la zona MRZ di passaporti/carte d'identità con chip la contiene
-- sempre insieme agli altri dati letti dall'OCR, ed è la base per un futuro
-- alert "documento in scadenza" (non implementato ora, solo il campo).
-- Su indicazione esplicita del titolare: niente colonna residenza (non
-- serve a questo scopo, si aggiungerà se servirà per altro in futuro).

ALTER TABLE ospiti
  ADD COLUMN IF NOT EXISTS documento_scadenza DATE;
