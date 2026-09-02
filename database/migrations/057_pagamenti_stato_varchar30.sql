-- Migration 057: allarga pagamenti.stato da VARCHAR(20) a VARCHAR(30).
-- Bug trovato da un giro di npm test REALE (02/09/2026, Marco): la
-- migration 056 ha aggiunto 'richiede_rimborso_manuale' (25 caratteri) al
-- CHECK chk_pagamenti_stato senza allargare la colonna, ancora
-- VARCHAR(20) da 016_prenotazioni_fase2.sql — ogni UPDATE che ci scrive
-- quel valore falliva con "il valore e' troppo lungo per il tipo
-- character varying(20)". VARCHAR(30) per coerenza con pagamenti.metodo
-- (stessa larghezza, migration 016), con margine sopra i 25 caratteri di
-- oggi.

ALTER TABLE pagamenti ALTER COLUMN stato TYPE VARCHAR(30);
