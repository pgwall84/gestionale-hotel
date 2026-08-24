-- Migration 052 — Min/max cartellino sui tipi camera "madre" (23/08/2026).
--
-- Contesto (deciso con il titolare in sessione Cowork, vedi docs/EVOLUTIVE.md
-- voce "Modulo min/max cartellino + planning-tariffe giorno-per-giorno"):
-- regole_derivazione_tariffe ha già prezzo_minimo/prezzo_massimo (migration
-- 051), oggi usati solo per il clamp automatico di calcolaPrezzoCameraPerNotte.
-- I tipi camera "madre" (Matrimoniale, Matrimoniale Piccola — righe dirette
-- in `tariffe`, nessuna riga in regole_derivazione_tariffe) non hanno invece
-- alcun min/max: li aggiungiamo qui, stesso significato, stesso vincolo di
-- range. Nessun valore popolato — il titolare li inserirà dalla UI di
-- /tariffe quando pronta, come già avvenuto per la 051.
--
-- Comportamento (Piano 1, docs/superpowers/plans/2026-08-23-min-max-
-- cartellino.md): a differenza del clamp automatico dei tipi derivati,
-- questi min/max alimentano un alert bloccante-superabile nei due punti dove
-- un umano scrive il prezzo (tariffeController, prenotazioniController/
-- soggiorniController) — nessuna colonna nuova per il log dell'override: si
-- riusa audit_log (migration 012) via logAudit.

BEGIN;

ALTER TABLE tariffe ADD COLUMN IF NOT EXISTS prezzo_minimo NUMERIC(10,2);
ALTER TABLE tariffe ADD COLUMN IF NOT EXISTS prezzo_massimo NUMERIC(10,2);

ALTER TABLE tariffe DROP CONSTRAINT IF EXISTS chk_tariffe_range;
ALTER TABLE tariffe ADD CONSTRAINT chk_tariffe_range CHECK (
  prezzo_minimo IS NULL OR prezzo_massimo IS NULL OR prezzo_massimo >= prezzo_minimo
);

COMMIT;
