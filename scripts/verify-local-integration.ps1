[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$integrationRepo = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $integrationRepo
try {
  $integrationPnpmVersion = (& corepack pnpm --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $integrationPnpmVersion -ne '11.10.0') { throw 'Deze proef vereist pnpm 11.10.0 uit packageManager.' }
  $integrationCommands = @(
    @('install', '--frozen-lockfile'), @('build'), @('typecheck'), @('lint'), @('test'),
    @('--filter', '@draconis/api', 'smoke:start'), @('--filter', '@draconis/api', 'smoke:public')
  )
  foreach ($integrationCommand in $integrationCommands) {
    & corepack pnpm @integrationCommand
    if ($LASTEXITCODE -ne 0) { throw "Integratiecontrole mislukt: pnpm $($integrationCommand -join ' ')" }
  }
  & (Join-Path $PSScriptRoot 'dev-cli/tests/catalogus-arguments.ps1')
} finally { Pop-Location }
