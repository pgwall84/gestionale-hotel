-- Migration 036: ricevute Alloggiati Web (Fase B, 13/08/2026).
--
-- Obbligo di conservazione 5 anni delle ricevute ufficiali WS_ALLOGGIATI —
-- fino ad ora alloggiati_invii salvava solo l'esito testuale (ok/parziale/
-- errore), mai il documento ufficiale scaricabile dal servizio.
--
-- Il metodo SOAP Ricevuta (manuale WS_ALLOGGIATI, pag. 17) restituisce UN
-- PDF PER GIORNO, non per singolo soggiorno/invio: copre tutte le schedine
-- inviate quel giorno per l'intera struttura. Per questo la tabella è
-- chiave per data, non per soggiorno_id come alloggiati_invii — un giorno
-- con più invii ha comunque una sola ricevuta.
--
-- Vincolo del servizio (non replicato qui come CHECK, solo rispettato dal
-- codice che chiama Ricevuta): la ricevuta di una data è scaricabile solo
-- negli "ultimi 30gg escluso il giorno corrente" — non il giorno stesso
-- dell'invio, va scaricata a partire dal giorno dopo.

CREATE TABLE IF NOT EXISTS alloggiati_ricevute (
  id              SERIAL PRIMARY KEY,
  data            DATE NOT NULL UNIQUE,
  percorso_file   VARCHAR(500) NOT NULL,
  scaricata_at    TIMESTAMP NOT NULL DEFAULT now()
);
