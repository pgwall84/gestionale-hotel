-- Migration 037 — CRM ospiti (14/08/2026)
-- Estende l'anagrafica clienti con i 7 punti emersi dal confronto
-- competitor (docs/RICERCA_ANAGRAFICA_CLIENTI_COMPETITOR.md), unificati
-- in un'unica evolutiva su richiesta esplicita del titolare: VIP,
-- blacklist, allergie/preferenze persistenti, tag liberi, rilevamento
-- duplicati (soft-merge, mai cancellazione), base per il promemoria
-- compleanno (data_nascita già esisteva) e per la segmentazione Offerte.
--
-- duplicato_di: un ospite "assorbito" da un'unione manuale (mai
-- automatica, vedi anagraficaOspitiController.unisci) non viene MAI
-- cancellato — resta in tabella con questo campo valorizzato, per non
-- perdere lo storico/audit collegato a documenti e Alloggiati Web.

ALTER TABLE ospiti ADD COLUMN vip BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ospiti ADD COLUMN blacklist BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ospiti ADD COLUMN blacklist_motivo TEXT;
ALTER TABLE ospiti ADD COLUMN allergie TEXT;
ALTER TABLE ospiti ADD COLUMN tag TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE ospiti ADD COLUMN duplicato_di INTEGER REFERENCES ospiti(id);

-- Ricerca/filtro per tag (contiene almeno uno dei tag richiesti, operatore &&)
CREATE INDEX idx_ospiti_tag ON ospiti USING GIN(tag);

-- Indice parziale: velocizza sia "escludi i duplicati assorbiti" (la
-- query più frequente, WHERE duplicato_di IS NULL) sia il caso raro di
-- risalire da un id assorbito al suo vincitore.
CREATE INDEX idx_ospiti_duplicato_di ON ospiti(duplicato_di) WHERE duplicato_di IS NOT NULL;
