#!/bin/bash
# Script backup database gestionale Hotel del Golfo
# Eseguito automaticamente ogni sera dal cron job
# Mantiene gli ultimi 30 backup, elimina i più vecchi

BACKUP_DIR="$HOME/backups-gestionale"
DB_NAME="gestionale_hotel"
DATA=$(date +%Y%m%d_%H%M)
FILE="$BACKUP_DIR/backup_$DATA.sql"

mkdir -p "$BACKUP_DIR"
pg_dump "$DB_NAME" > "$FILE"

if [ $? -eq 0 ]; then
  echo "Backup completato: $FILE"
  # Elimina backup più vecchi di 30 giorni
  find "$BACKUP_DIR" -name "backup_*.sql" -mtime +30 -delete
else
  echo "ERRORE: backup fallito per $DB_NAME"
  exit 1
fi
