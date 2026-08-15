-- Migration 045: arricchimento A.3 (cottura) e A.5 (checklist pulizie) per
-- allinearli ai campi di registri_HACCP_A1_A8.xlsx — modulo 6.1, sessione 4
-- (16/08/2026). Solo ALTER additivi, nessuna colonna esistente toccata:
-- backward-compatible con le righe già inserite nelle sessioni precedenti.

-- ─── A.3 — Scongelamento/cottura ────────────────────────────────────────────
-- Il template ha 4 campi che registro_cottura non aveva ancora: lotto/
-- partita, limite critico, tempo di cottura, azione correttiva.
-- "limite_critico" resta testo libero (non un CHECK/calcolo automatico): il
-- limite dipende dalla CATEGORIA di prodotto (carne rossa/bianca/pesce/
-- piatto complesso, vedi CSV soglie del titolare) e registro_cottura non ha
-- un campo categoria — stessa scelta già presa e documentata in sessione 1
-- per non inventare un fuori-soglia automatico dove lo schema non lo supporta
-- in modo pulito. L'operatore lo compila guardandosi il valore di
-- riferimento, come farebbe su carta.
ALTER TABLE registro_cottura ADD COLUMN IF NOT EXISTS lotto_partita VARCHAR(100);
ALTER TABLE registro_cottura ADD COLUMN IF NOT EXISTS limite_critico VARCHAR(50);
ALTER TABLE registro_cottura ADD COLUMN IF NOT EXISTS tempo_cottura_min NUMERIC(6,2);
ALTER TABLE registro_cottura ADD COLUMN IF NOT EXISTS azione_correttiva TEXT;

-- ─── A.5 — Pulizie/sanificazione ────────────────────────────────────────────
-- Il template ha 5 campi che haccp_checklist non aveva ancora: ora, prodotto
-- usato, dosaggio, tempo di contatto, firma del responsabile (oltre a quella
-- dell'operatore, già coperta da user_id). "completata" resta la fonte
-- dell'esito (true → eseguita, false → non eseguita in export) — nessuna
-- colonna esito duplicata, stesso principio già usato per limite_critico
-- calcolato di frigo/freezer/buffet invece di essere salvato in tabella.
ALTER TABLE haccp_checklist ADD COLUMN IF NOT EXISTS ora TIME;
ALTER TABLE haccp_checklist ADD COLUMN IF NOT EXISTS prodotto_utilizzato VARCHAR(150);
ALTER TABLE haccp_checklist ADD COLUMN IF NOT EXISTS dosaggio VARCHAR(100);
ALTER TABLE haccp_checklist ADD COLUMN IF NOT EXISTS tempo_contatto_min NUMERIC(6,2);
ALTER TABLE haccp_checklist ADD COLUMN IF NOT EXISTS firma_responsabile VARCHAR(150);
