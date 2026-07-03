# Script backup database gestionale Hotel del Golfo — versione Windows PowerShell
# Eseguito automaticamente ogni sera dal Task Scheduler
# Mantiene gli ultimi 30 backup, elimina i piu' vecchi

$BackupDir  = "$env:USERPROFILE\backups-gestionale"
$DbName     = "gestionale_hotel"
$DbUser     = "postgres"
$Data       = Get-Date -Format "yyyyMMdd_HHmm"
$File       = "$BackupDir\backup_$Data.sql"
$PgDump     = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
}

$env:PGPASSWORD = "postgres"
& $PgDump -U $DbUser $DbName | Out-File -FilePath $File -Encoding utf8

if ($LASTEXITCODE -eq 0 -and (Test-Path $File)) {
    Write-Output "$(Get-Date -Format 'yyyy-MM-dd HH:mm') - Backup completato: $File"
    # Elimina backup piu' vecchi di 30 giorni
    Get-ChildItem "$BackupDir\backup_*.sql" |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
        Remove-Item -Force
} else {
    Write-Output "$(Get-Date -Format 'yyyy-MM-dd HH:mm') - ERRORE: backup fallito per $DbName"
    exit 1
}
