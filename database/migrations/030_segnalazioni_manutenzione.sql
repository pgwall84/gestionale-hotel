-- Migration 030: Segnalazioni manutenzione/guasti
-- Permette a tutto il personale di segnalare guasti/manutenzioni (camera o
-- area comune), con foto opzionale e priorità. Lettura e creazione aperte a
-- tutti i ruoli; la gestione dello stato (presa in carico, risoluzione)
-- resta riservata ad admin/titolare (shared/ruoli.js, sezione 'manutenzione').

CREATE TABLE segnalazioni_manutenzione (
  id SERIAL PRIMARY KEY,

  -- Luogo del guasto: 'camera' richiede camera_id valorizzato, le altre
  -- voci sono aree comuni fisse dell'hotel; 'altro' usa luogo_note per il
  -- dettaglio testuale.
  luogo_tipo VARCHAR(30) NOT NULL CHECK (luogo_tipo IN (
    'camera', 'bar', 'sala_ristorante', 'cucina', 'lavanderia',
    'lavaggio_piatti', 'magazzino', 'garage', 'altro'
  )),
  camera_id INTEGER REFERENCES camere(id),
  luogo_note VARCHAR(255),

  descrizione TEXT NOT NULL,
  priorita VARCHAR(10) NOT NULL DEFAULT 'media' CHECK (priorita IN ('bassa', 'media', 'alta')),
  stato VARCHAR(20) NOT NULL DEFAULT 'aperta' CHECK (stato IN ('aperta', 'in_lavorazione', 'risolta')),

  foto_filename VARCHAR(255),

  segnalato_da INTEGER NOT NULL REFERENCES users(id),
  gestito_da INTEGER REFERENCES users(id),
  note_risoluzione TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT now(),
  aggiornato_il TIMESTAMP NOT NULL DEFAULT now(),
  risolta_il TIMESTAMP,

  -- Coerenza luogo_tipo/camera_id: 'camera' deve avere una camera collegata,
  -- le altre voci no (il luogo è già implicito nel tipo, luogo_note resta
  -- un dettaglio facoltativo per tutte).
  CONSTRAINT chk_camera_coerente CHECK (
    (luogo_tipo = 'camera' AND camera_id IS NOT NULL) OR
    (luogo_tipo <> 'camera' AND camera_id IS NULL)
  )
);

-- Usato dalla lista filtrata per stato (pagina) e dall'alert Dashboard
CREATE INDEX idx_segnalazioni_manutenzione_stato ON segnalazioni_manutenzione(stato);
