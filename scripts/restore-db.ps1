# Restores the linked Supabase project from a backups/ full dump (schema + data).
#
# NB: DESTRUCTIVE. Applying the dump re-creates the dumped objects on the
# remote database and reloads their data. Objects created after the backup
# are not removed, but objects present in the dump are replaced.
#
# Usage:
#   .\scripts\restore-db.ps1 [-Latest]                  # pick newest backups\full-*.sql (dry-run)
#   .\scripts\restore-db.ps1 -File dump.sql             # explicit dump (dry-run)
#   .\scripts\restore-db.ps1 -Latest -Execute -Confirm  # apply for real (requires -Confirm)
#
# The restore applies the dump via the Management API (supabase db query --linked -f <file>).

param(
    [switch]$Latest,
    [string]$File,
    [switch]$Execute,
    [switch]$Confirm
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$outPath = Join-Path $repoRoot "backups"

if ($Latest) {
    $dump = Get-ChildItem $outPath -Filter "full-*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $dump) { throw "no backups found in $outPath" }
    $dumpFile = $dump.FullName
} else {
    if (-not $File) { throw "provide -File <dump.sql> or use -Latest" }
    $dumpFile = $File
}

if (-not (Test-Path $dumpFile)) { throw "dump file not found: $dumpFile" }
if ((Get-Item $dumpFile).Length -eq 0) { throw "dump file empty - refusing" }

Write-Host "Dump: $dumpFile" -ForegroundColor Cyan

if (-not $Execute) {
    Write-Host ""
    Write-Host "DRY-RUN: nothing was modified. Re-run with -Execute -Confirm to apply." -ForegroundColor Yellow
    Write-Host "Applying would run: supabase db query --linked -f $dumpFile (destructive)." -ForegroundColor Yellow
    exit 0
}

if (-not $Confirm) {
    throw "refusing to apply without -Confirm. This is a destructive restore of the remote database."
}

Write-Host "==> Applying dump ..." -ForegroundColor Cyan
& supabase db query --linked -f $dumpFile
if ($LASTEXITCODE -ne 0) { throw "restore apply failed (exit $LASTEXITCODE)" }

Write-Host "==> Restore complete." -ForegroundColor Green