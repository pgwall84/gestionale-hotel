-- Migration 042: registro_temperature passa da stringa fissa
-- (punto_controllo) ad apparecchiatura reale (modulo 6.1, ricostruzione
-- 16/08/2026). `punto_controllo` NON viene droppata: le righe già inserite
-- nei test di sessione 3/4 la usano e non esiste un mapping automatico
-- affidabile stringa→id (es. "Frigorifero cucina" potrebbe corrispondere a
-- uno qualsiasi dei 3 frigo nuovi) — resta come colonna storica, il codice
-- da qui in avanti scrive solo apparecchiatura_id.
--
-- azione_correttiva è un campo distinto da `note` nel template
-- registri_HACCP_A1_A8.xlsx (foglio A2): testo libero per "cosa è stato
-- fatto quando il valore era fuori soglia", non annotazione generica.

ALTER TABLE registro_temperature
  ADD COLUMN apparecchiatura_id INTEGER REFERENCES apparecchiature_haccp(id),
  ADD COLUMN azione_correttiva TEXT;

ALTER TABLE registro_temperature ALTER COLUMN punto_controllo DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registro_temp_apparecchiatura ON registro_temperature(apparecchiatura_id);
