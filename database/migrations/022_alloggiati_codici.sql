-- Migration 022: Tabelle di codifica Alloggiati Web (Modulo 2.5, Fase 1b).
--
-- Tabella generica, non una tabella per tipo (Stati/Comuni/Documenti/Tipi
-- Alloggiato): il servizio SOAP WS_ALLOGGIATI espone queste liste tramite
-- un unico metodo "Tabella" che restituisce un CSV ';'-separato, e la
-- struttura esatta delle colonne per "Luoghi" (che sembra contenere sia
-- Stati che Comuni insieme) non è documentata nei manuali ufficiali
-- disponibili — solo l'esempio di ListaAppartamenti lo è
-- (IDAPP;Descrizione;COMUNE;PROV;Indirizzo;Proprietario). Una tabella
-- generica con dati_extra JSONB evita di dover assumere colonne che
-- potrebbero non esserci, e resta corretta qualunque sia la forma reale
-- del CSV scaricato al primo sync.
--
-- codice = prima colonna del CSV, descrizione = seconda colonna: assunzione
-- basata sull'unico esempio reale visto (ListaAppartamenti), da verificare
-- al primo sync con credenziali vere (vedi docs/DIARIO_SESSIONI.md).
CREATE TABLE IF NOT EXISTS alloggiati_codici (
  id                SERIAL PRIMARY KEY,
  tabella           VARCHAR(30) NOT NULL,    -- 'Luoghi' | 'Tipi_Documento' | 'Tipi_Alloggiato'
  codice            VARCHAR(20) NOT NULL,
  descrizione       VARCHAR(255) NOT NULL,
  dati_extra        JSONB,                    -- tutte le colonne del CSV originale, per non perdere informazione
  sincronizzato_at  TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT uq_alloggiati_codici UNIQUE (tabella, codice)
);
CREATE INDEX IF NOT EXISTS idx_alloggiati_codici_tabella ON alloggiati_codici (tabella);
CREATE INDEX IF NOT EXISTS idx_alloggiati_codici_ricerca ON alloggiati_codici (tabella, descrizione);
