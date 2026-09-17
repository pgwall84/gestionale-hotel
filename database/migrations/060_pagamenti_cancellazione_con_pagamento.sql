-- Migration 060: gestione esplicita della cancellazione di una prenotazione
-- CONFERMATA E GIA' PAGATA (transizione confermata -> interrotta via
-- PATCH /api/prenotazioni/:id/stato). Prima di questa migration, quella
-- transizione non toccava mai `pagamenti`: un pagamento 'completato' restava
-- 'completato' per sempre anche dopo la cancellazione della prenotazione,
-- senza nessuna traccia che servisse un rimborso (o una decisione esplicita
-- di trattenerlo) — diverso e piu' subdolo del caso race/scaduta gia'
-- gestito da migration 056, perche' quello almeno produce un
-- 'richiede_rimborso_manuale' visibile.
--
-- Trovato il 17/09/2026 verificando manualmente il percorso di rifiuto Nexi
-- (pagamento 1097, prenotazione 6010: 'completato' su prenotazione
-- 'interrotta' per cancellazione manuale di pulizia test) — vedi
-- claude/nexi-carte-di-test.md nel project HOTEL DEL GOLFO.
--
-- Decisione di Marco (17/09/2026): niente rimborso automatico via API
-- (nè Stripe nè Nexi) da questo flusso — sempre e solo un flag esplicito,
-- deciso a mano da chi cancella, con motivo obbligatorio. Il rimborso vero
-- (se scelto) resta un'azione manuale da dashboard Stripe/backoffice Nexi,
-- fuori da questo sistema — stessa cautela già in vigore per Nexi dal caso
-- race (nessuna integrazione di storno automatico, 'richiede_rimborso_manuale'
-- esistente riusato qui).
--
-- 'trattenuto': nuovo, per il caso "cancellazione confermata, importo NON da
-- rimborsare" (es. penale di cancellazione, accordo col cliente) — diverso
-- da 'completato' (ancora aperto/nessuna decisione presa) e da
-- 'richiede_rimborso_manuale' (decisione presa: va rimborsato, in sospeso).

ALTER TABLE pagamenti ADD COLUMN nota_cancellazione TEXT;

ALTER TABLE pagamenti DROP CONSTRAINT chk_pagamenti_stato;
ALTER TABLE pagamenti ADD CONSTRAINT chk_pagamenti_stato CHECK (
  stato IN ('pending','completato','fallito','rimborsato','richiede_rimborso_manuale','trattenuto')
);
