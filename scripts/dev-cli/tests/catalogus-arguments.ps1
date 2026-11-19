# Pure argument tests. Neither action is executed and no filesystem cleanup runs.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Register-DevCommandGroup { param($Name, $Description, $Actions) }
. (Join-Path $PSScriptRoot '../commands/catalogus.ps1')
$catalogusChecks = 0

foreach ($emptyArguments in @(@(), @($null), @(''))) {
  $options = & $parseCatalogusArguments -Arguments $emptyArguments
  if ($options.Port -ne 0 -or -not $options.RepoRoot -or $options.ConfirmCleanup) { throw 'Invalid default options' }
  $catalogusChecks++
}
$options = & $parseCatalogusArguments -Arguments @('-RepoRoot', 'C:/fixture checkout', '-FixtureRoot', 'C:/temp/own-fixture', '-Port', '3018')
if ($options.RepoRoot -ne 'C:/fixture checkout' -or $options.FixtureRoot -ne 'C:/temp/own-fixture' -or $options.Port -ne 3018) { throw 'Named flags were not parsed' }
$catalogusChecks++
$options = & $parseCatalogusArguments -Arguments @('-FixtureRoot', 'C:/temp/own-fixture', '-ConfirmCleanup') -Cleanup
if (-not $options.ConfirmCleanup -or $options.FixtureRoot -ne 'C:/temp/own-fixture') { throw 'Confirmation flag was not parsed' }
$catalogusChecks++
foreach ($badArguments in @(@('-Port', '70000'), @('-Port'), @('-Unknown', 'value'))) {
  $rejected = $false
  try { & $parseCatalogusArguments -Arguments $badArguments | Out-Null } catch { $rejected = $true }
  if (-not $rejected) { throw 'Invalid options were accepted' }
  $catalogusChecks++
}
Write-Output "$catalogusChecks pure catalogus argument checks passed; no process or cleanup action executed."
