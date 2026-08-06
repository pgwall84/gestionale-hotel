-- Migration 028: codici ufficiali per cittadinanza/tipo documento nel
-- pre check-in (04/08/2026, segnalato dal titolare dopo il primo test
-- reale). Il form pubblico usava solo testo libero — rischio di
-- incongruenze (es. "Italia" vs "ITALIA" vs "IT") rispetto alle tabelle di
-- codifica Alloggiati Web. Ora sia il form pubblico sia la revisione in
-- reception offrono gli stessi suggerimenti di /clienti (componente
-- SelettoreCodiceAlloggiati), restando comunque testo libero se l'ospite
-- scrive qualcosa che non trova un suggerimento — mai bloccante, stessa
-- filosofia della scheda cliente (vedi migration 023).

ALTER TABLE pre_checkin_ospiti
  ADD COLUMN IF NOT EXISTS cittadinanza_codice   VARCHAR(9),
  ADD COLUMN IF NOT EXISTS documento_tipo_codice VARCHAR(5);
