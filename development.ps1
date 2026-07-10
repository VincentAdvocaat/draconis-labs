# Bootstrap voor je PowerShell-profiel.
# Profiel: . "C:\git\development.ps1"
#
# Kopieer of symlink dit bestand naar C:\git\development.ps1

Set-StrictMode -Version Latest

$repoCandidates = @(
  $env:DRACONIS_LABS_ROOT,
  'C:\git\draconis-labs',
  (Join-Path $PSScriptRoot 'draconis-labs')
) | Where-Object { $_ }

foreach ($repoRoot in $repoCandidates) {
  if (-not (Test-Path -LiteralPath $repoRoot)) { continue }

  $loader = Join-Path $repoRoot 'scripts\dev-cli\development.ps1'
  if (Test-Path -LiteralPath $loader) {
    . $loader
    return
  }
}

Write-Warning @"
Dev CLI niet gevonden.
Clone draconis-labs naar C:\git\draconis-labs of zet DRACONIS_LABS_ROOT.
"@
