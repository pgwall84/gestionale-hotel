-- Migration 046: Composizione ospiti per il Booking Engine Diretto (v2, 19/08/2026).
--
-- Il form di prenotazione online oggi raccoglie solo un numero intero di
-- ospiti (soggiorni.num_ospiti, invariato) — non sa distinguere adulti da
-- bambini né conoscerne l'età. Questo blocca due cose: (1) il calcolo esatto
-- della tassa di soggiorno (oggi solo stimato in emailPrenotazioni.js,
-- perché l'esenzione under-12 richiede l'età reale), (2) qualunque futura
-- tariffa differenziata per bambini (non ancora decisa — vedi
-- docs/EVOLUTIVE.md, per ora tutti pagano tariffa piena).
--
-- composizione_ospiti è JSONB, nullable, e NON sostituisce num_ospiti: resta
-- un dato aggiuntivo, opzionale, popolato solo dal Booking Engine Diretto.
-- Le prenotazioni telefoniche/esistenti restano con questo campo NULL —
-- comportamento invariato ovunque il dato non è disponibile (fallback alla
-- stima esistente per la tassa di soggiorno).
-- Forma attesa: {"adulti": 2, "bambini_eta": [5, 9]}

ALTER TABLE soggiorni ADD COLUMN IF NOT EXISTS composizione_ospiti JSONB;

COMMENT ON COLUMN soggiorni.composizione_ospiti IS
  'Composizione ospiti raccolta dal Booking Engine Diretto: {"adulti": N, "bambini_eta": [età, ...]}. Nullable — assente per prenotazioni telefoniche/preesistenti.';
