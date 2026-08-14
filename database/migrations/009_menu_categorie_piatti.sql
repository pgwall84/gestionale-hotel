-- Migration 009: menu_categorie e menu_piatti (modulo 1.5 — Menu)
--
-- RETROATTIVA (scritta il 14/08/2026, non al momento del modulo 1.5): questo
-- file non è mai esistito nel repo — la sequenza delle migration saltava da
-- 008 a 010 (010_menu_categorie_emoji.sql fa solo un ALTER TABLE che
-- presuppone queste due tabelle già esistenti). Le tabelle sono sempre
-- esistite nel database reale, mai messe per iscritto in una migration.
-- Trovato mentre si indagava un bug di test (categoria 'Cat Test Addebiti'
-- duplicata nel menu — vedi docs/DIARIO_SESSIONI.md, voce 14/08/2026), che
-- ha reso visibile ai clienti su /menu-pubblico un piatto di test da 10€:
-- possibile solo perché sia menu_categorie.attivo sia menu_piatti.disponibile
-- hanno default TRUE, confermato dallo schema reale sotto.
--
-- Schema letto direttamente dal database di produzione via
-- information_schema (backend/scripts/dumpSchemaMenu.js, poi cancellato —
-- era uno script diagnostico usa e getta, non va lasciato nel repo).
-- CREATE TABLE IF NOT EXISTS: sicura da eseguire su un database che ha già
-- le tabelle (produzione, sviluppo) — non fa nulla lì. Su un ambiente
-- nuovo/ricostruito da zero, invece, le crea per la prima volta: prima di
-- questa migration un fresh install si sarebbe rotto qui.

CREATE TABLE IF NOT EXISTS menu_categorie (
  id      SERIAL PRIMARY KEY,
  titolo  VARCHAR(100) NOT NULL,
  ordine  INTEGER NOT NULL DEFAULT 0,
  attivo  BOOLEAN NOT NULL DEFAULT true,
  emoji   VARCHAR(10) DEFAULT '🍽️'
);

CREATE TABLE IF NOT EXISTS menu_piatti (
  id            SERIAL PRIMARY KEY,
  categoria_id  INTEGER NOT NULL REFERENCES menu_categorie(id) ON DELETE CASCADE,
  nome          VARCHAR(150) NOT NULL,
  descrizione   TEXT,
  prezzo        NUMERIC(6,2),
  allergeni     TEXT[] NOT NULL DEFAULT '{}',
  immagine_url  TEXT,
  disponibile   BOOLEAN NOT NULL DEFAULT true,
  ordine        INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT now()
);
