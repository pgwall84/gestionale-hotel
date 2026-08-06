-- Migration 023: Testo libero per i campi documento/nazionalità (Modulo 2.5).
--
-- Corregge un difetto di progettazione della Fase 1b (migration 022): le
-- tendine di stato/comune di nascita, cittadinanza, tipo documento e luogo
-- di rilascio erano compilabili SOLO scegliendo un codice ufficiale
-- sincronizzato da WS_ALLOGGIATI (tabella alloggiati_codici). Se quella
-- tabella è vuota (sincronizzazione mai fatta, o servizio non raggiungibile
-- in un dato momento), la reception non poteva registrare NESSUN dato di
-- documento — inaccettabile per l'operatività quotidiana: il documento va
-- sempre potuto registrare a vista, leggendolo dalla carta d'identità/
-- passaporto del cliente, indipendentemente da Alloggiati Web.
--
-- Le colonne *_codice (migration 016) restano invariate e servono solo per
-- l'invio schedina (modulo 2.5, Fase 2) — vengono valorizzate quando il
-- testo digitato corrisponde a un suggerimento delle tabelle sincronizzate.
-- Le nuove colonne *_testo sono quello che la reception vede e scrive
-- sempre, sincronizzazione disponibile o no.
ALTER TABLE ospiti
  ADD COLUMN IF NOT EXISTS stato_nascita_testo   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS comune_nascita_testo  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cittadinanza_testo    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS documento_tipo_testo  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS luogo_rilascio_testo  VARCHAR(255);
