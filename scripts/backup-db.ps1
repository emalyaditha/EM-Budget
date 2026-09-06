# Backs up the linked Supabase project (schema + data) to backups/.
#
# Usage:
#   .\scripts\backup-db.ps1 [-OutDir backups] [-PurgeOldDays 14]
#
# Produces:
#   backups/full-YYYYMMDD-HHmmss.sql      (complete pg_dump of the linked DB)
#   backups/manifest-YYYYMMDD-HHmmss.txt  (checksum + metadata)
#
# Safe to re-run as often as needed; never touches application data.

param(
    [string]$OutDir = "backups",
    [int]$PurgeOldDays = 14
)

$ErrorActionPreference = "Stop"

function Ensure-Docker {
    # supabase db dump runs pg_dump inside a container, so Docker must be up.
    $pipe = "npipe:////./pipe/dockerDesktopLinuxEngine"
    if (Test-Path "\\.\pipe\dockerDesktopLinuxEngine") { return }
    $exe = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (-not (Test-Path $exe)) { throw "Docker Desktop not found and requested dump needs it: $exe" }
    Write-Host "==> Starting Docker Desktop (first backup lazy-pulls the pg_dump image) ..." -ForegroundColor Cyan
    Start-Process $exe | Out-Null
    for ($i = 0; $i -lt 180; $i++) {
        Start-Sleep -Seconds 2
        if (Test-Path "\\.\pipe\dockerDesktopLinuxEngine") { Write-Host "Docker engine ready." -ForegroundColor Green; return }
    }
    throw "Docker engine did not come up within 6 minutes - start Docker Desktop manually and re-run."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$outPath = Join-Path $repoRoot $OutDir
New-Item -ItemType Directory -Force -Path $outPath | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dumpFile = Join-Path $outPath "full-$stamp.sql"
$manifest = Join-Path $outPath "manifest-$stamp.txt"

Write-Host "==> Backing up linked Supabase project to $outPath" -ForegroundColor Cyan

Ensure-Docker

Write-Host "==> Dumping full database (schema + data) ..." -ForegroundColor Cyan
& supabase db dump --linked --file $dumpFile
if ($LASTEXITCODE -ne 0) { throw "dump failed (exit $LASTEXITCODE)" }

$dumpSize = (Get-Item $dumpFile).Length
if ($dumpSize -eq 0) { throw "backup is empty - aborting, nothing recorded" }

$dumpHash = (Get-FileHash $dumpFile -Algorithm SHA256).Hash

@"
EM-Budget Supabase Backup
Time:        $stamp
Dump file:   $dumpFile
Dump bytes:  $dumpSize
Dump sha256: $dumpHash
"@ | Set-Content -Encoding utf8 $manifest

if ($PurgeOldDays -gt 0) {
    $cutoff = (Get-Date).AddDays(-$PurgeOldDays)
    $old = Get-ChildItem $outPath -Filter "full-*.sql" | Where-Object { $_.LastWriteTime -lt $cutoff }
    foreach ($f in $old) { Remove-Item $f.FullName -Force; Write-Host "Purged stale backup: $($f.Name)" -ForegroundColor Yellow }
}

Write-Host "==> Backup complete." -ForegroundColor Green
Write-Host "  dump:     $dumpFile" -ForegroundColor Green
Write-Host "  manifest: $manifest" -ForegroundColor Green
Write-Host "  note:     restore with .\scripts\restore-db.ps1 -Latest -Execute -Confirm" -ForegroundColor Gray