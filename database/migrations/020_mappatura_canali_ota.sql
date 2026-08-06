-- Migration 020 — Mappatura canali OTA (Modulo 2.3, Fase 1).
-- Unica parte del modulo 2.3 eseguibile senza credenziali WuBook: associa
-- ogni categoria camera (tipi_camera) a un codice esterno per canale.
-- Prima di questa migration l'unico riferimento era tipi_camera.note,
-- un appunto manuale in testo libero (vedi commento su quella colonna,
-- migration 018).
--
-- Tabella separata (non una colonna su tipi_camera): un domani un secondo
-- canale (altro channel manager, o codici diversi per singola OTA) è solo
-- una nuova riga, non una nuova migration. Oggi popolata solo con
-- canale='wubook' (decisione WuBook/WooDoo, vedi docs/EVOLUTIVE.md).
CREATE TABLE IF NOT EXISTS tipi_camera_canali (
  id              SERIAL PRIMARY KEY,
  tipo_camera_id  INTEGER NOT NULL REFERENCES tipi_camera(id) ON DELETE CASCADE,
  canale          VARCHAR(30) NOT NULL DEFAULT 'wubook',
  codice_esterno  VARCHAR(100),
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (tipo_camera_id, canale)
);
