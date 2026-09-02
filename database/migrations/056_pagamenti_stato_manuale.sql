-- Migration 056: nuovo stato pagamenti per pagamenti riusciti su
-- prenotazioni non piu' valide (hold scaduto o gia' interrotto dal cron) su
-- provider senza integrazione di storno automatico (oggi: Nexi — vedi
-- docs/superpowers/specs/2026-09-02-payment-provider-switch-design.md).
-- Stripe in questo stesso caso chiama stripe.refunds.create() e usa
-- 'rimborsato' (rimborso reale, automatico). Per Nexi non esiste ancora
-- un'integrazione di storno (fuori scope, bloccata sulla decisione di
-- Nexi su "Incasso senza Pensieri") — marcare questi pagamenti
-- 'rimborsato' senza aver davvero rimborsato sarebbe fuorviante per chi
-- guarda la tabella pagamenti. 'richiede_rimborso_manuale' rende esplicito
-- che serve un intervento (storno da backoffice Nexi).

ALTER TABLE pagamenti DROP CONSTRAINT chk_pagamenti_stato;
ALTER TABLE pagamenti ADD CONSTRAINT chk_pagamenti_stato CHECK (
  stato IN ('pending','completato','fallito','rimborsato','richiede_rimborso_manuale')
);
