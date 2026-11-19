Set-StrictMode -Version Latest

# Capture this command's actual checkout. Do not fall back to a personal root checkout.
$catalogusCommandRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path

# The existing group dispatcher forwards a positional array. Parse only these
# documented flags; do not evaluate command text or change the shared dispatcher.
$parseCatalogusArguments = {
  param([object[]] $Arguments, [switch] $Cleanup)
  $Arguments = @($Arguments | Where-Object { $null -ne $_ -and -not [string]::IsNullOrWhiteSpace([string] $_) })
  $options = @{ RepoRoot = $catalogusCommandRoot; FixtureRoot = $null; Port = 0; ConfirmCleanup = $false }
  for ($index = 0; $index -lt $Arguments.Count; $index++) {
    $name = [string] $Arguments[$index]
    if ($name -eq '-ConfirmCleanup' -and $Cleanup) { $options.ConfirmCleanup = $true; continue }
    $key = switch ($name) {
      '-RepoRoot' { 'RepoRoot' }
      '-FixtureRoot' { 'FixtureRoot' }
      '-Port' { if ($Cleanup) { throw '-Port hoort alleen bij start.' }; 'Port' }
      default { throw "Onbekende optie '$name'. Gebruik -RepoRoot, -FixtureRoot, -Port of cleanup -ConfirmCleanup." }
    }
    $index++
    if ($index -ge $Arguments.Count) { throw "Waarde ontbreekt voor $name." }
    $options[$key] = [string] $Arguments[$index]
  }
  $catalogusPort = 0
  if (-not [int]::TryParse([string] $options.Port, [ref] $catalogusPort) -or $catalogusPort -lt 0 -or $catalogusPort -gt 65535) {
    throw '-Port moet tussen 0 en 65535 liggen.'
  }
  $options.Port = $catalogusPort
  return $options
}.GetNewClosure()

$catalogusStartAction = {
  param([Parameter(ValueFromRemainingArguments = $true)][object[]] $Arguments)
  $options = & $parseCatalogusArguments -Arguments $Arguments
  $RepoRoot = $options.RepoRoot
  $FixtureRoot = $options.FixtureRoot
  $Port = $options.Port
  $resolvedRepo = (Resolve-Path -LiteralPath $RepoRoot -ErrorAction Stop).Path
  if (-not (Test-Path -LiteralPath (Join-Path $resolvedRepo 'server/api/src/catalogus/start.ts'))) {
    throw 'Deze checkout bevat de catalogusmodule niet. Geef de juiste -RepoRoot mee.'
  }
  $catalogusArguments = @('--filter', '@draconis/api', 'exec', 'tsx', 'src/catalogus/start.ts', "--port=$Port")
  if ($FixtureRoot) { $catalogusArguments += "--root=$FixtureRoot" }
  Write-Host "Catalogus starten vanuit $resolvedRepo. Ctrl+C stopt alleen dit gestarte proces."
  Push-Location -LiteralPath $resolvedRepo
  try {
    & corepack pnpm @catalogusArguments
    if ($LASTEXITCODE -ne 0) { throw "Catalogus gestopt met exitcode $LASTEXITCODE." }
  } finally { Pop-Location }
}.GetNewClosure()

$catalogusCleanupAction = {
  param([Parameter(ValueFromRemainingArguments = $true)][object[]] $Arguments)
  $options = & $parseCatalogusArguments -Arguments $Arguments -Cleanup
  $RepoRoot = $options.RepoRoot
  $FixtureRoot = $options.FixtureRoot
  if (-not $FixtureRoot -or -not $options.ConfirmCleanup) { throw 'Stop eerst de eigen instantie en geef -FixtureRoot en -ConfirmCleanup mee voor de expliciete tijdelijke fixture.' }
  $resolvedRepo = (Resolve-Path -LiteralPath $RepoRoot -ErrorAction Stop).Path
  if (-not (Test-Path -LiteralPath (Join-Path $resolvedRepo 'server/api/src/media-upload/cleanup.ts'))) {
    throw 'Deze checkout bevat de gecontroleerde fixturecleanup niet.'
  }
  Push-Location -LiteralPath $resolvedRepo
  try {
    & corepack pnpm --filter '@draconis/api' exec tsx src/media-upload/cleanup.ts "--root=$FixtureRoot" --confirm
    if ($LASTEXITCODE -ne 0) { throw 'Fixturecleanup geweigerd of mislukt; controleer pad en gestopte instantie.' }
  } finally { Pop-Location }
}.GetNewClosure()

Register-DevCommandGroup -Name 'catalogus' -Description 'Lokale catalogus: foreground start en expliciete fixturecleanup' -Actions @{
  start = $catalogusStartAction
  cleanup = $catalogusCleanupAction
}
