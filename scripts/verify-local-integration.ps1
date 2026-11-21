[CmdletBinding()]
param(
  [switch] $HomeBrowser = ($env:DRACONIS_HOME_BROWSER_TESTS -eq '1')
)
$ErrorActionPreference = 'Stop'
$integrationRepo = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $integrationRepo
try {
  $integrationPnpmVersion = (& corepack pnpm --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $integrationPnpmVersion -ne '11.10.0') { throw 'Deze proef vereist pnpm 11.10.0 uit packageManager.' }
  $integrationCommands = @(
    @('install', '--frozen-lockfile'), @('build'), @('typecheck'), @('lint'),
    @('--filter', '@draconis/api', 'exec', 'vitest', 'run', '--maxWorkers=1', '--no-file-parallelism'),
    @('--filter', '!@draconis/api', '-r', '--if-present', 'test'),
    @('--filter', '@draconis/api', 'smoke:start'), @('--filter', '@draconis/api', 'smoke:public')
  )
  if ($HomeBrowser) {
    $installChromium = @('--filter', '@draconis/home', 'exec', 'playwright', 'install', '--only-shell')
    if ($IsLinux -and $env:TF_BUILD -eq 'True') { $installChromium += '--with-deps' }
    $integrationCommands += ,($installChromium + 'chromium')
    $integrationCommands += ,@('--filter', '@draconis/home', 'exec', 'playwright', 'test')
  }
  foreach ($integrationCommand in $integrationCommands) {
    & corepack pnpm @integrationCommand
    if ($LASTEXITCODE -ne 0) { throw "Integratiecontrole mislukt: pnpm $($integrationCommand -join ' ')" }
  }
  & (Join-Path $PSScriptRoot 'dev-cli/tests/catalogus-arguments.ps1')
} finally { Pop-Location }
