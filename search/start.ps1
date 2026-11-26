# Runs the local food search server. Creates the master key in search/.env on first use.
param(
    [string]$EnvFile = (Join-Path $PSScriptRoot ".env"),
    [switch]$KeyOnly
)
$ErrorActionPreference = "Stop"

$lines = @()
if (Test-Path $EnvFile) { $lines = @(Get-Content $EnvFile -Encoding UTF8) }
$entry = $lines | Where-Object { $_ -like "MEILI_MASTER_KEY=*" } | Select-Object -First 1
if (-not $entry) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $entry = "MEILI_MASTER_KEY=" + (($bytes | ForEach-Object { $_.ToString("x2") }) -join "")
    $lines = @($lines) + $entry
    [System.IO.File]::WriteAllLines($EnvFile, [string[]]$lines)
}
if ($KeyOnly) { return }

$exe = Join-Path $PSScriptRoot "data\bin\meilisearch-windows-amd64.exe"
if (-not (Test-Path $exe)) { throw "Meilisearch is not downloaded: $exe" }
$data = Join-Path $PSScriptRoot "data"
Set-Location $data
# Passed through the environment so the key never shows up in the process list.
$env:MEILI_MASTER_KEY = $entry.Substring("MEILI_MASTER_KEY=".Length)
& $exe --db-path (Join-Path $data "meili") --http-addr 127.0.0.1:7700 --no-analytics --log-level WARN
