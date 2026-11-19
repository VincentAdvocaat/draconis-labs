[CmdletBinding()]
param([int] $Port = 3016, [switch] $NoOpen)

$ErrorActionPreference = 'Stop'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Kies een lokale poort tussen 1024 en 65535.' }
$cmsRepo = Split-Path -Parent $PSScriptRoot
$cmsRuntime = Join-Path $cmsRepo 'server/api/data/cms-fixture'
$cmsConfig = Join-Path $cmsRuntime 'local-config.json'
$cmsAccess = Join-Path $cmsRuntime 'local-access.json'
New-Item -ItemType Directory -Path $cmsRuntime -Force | Out-Null
if (-not (Test-Path -LiteralPath $cmsConfig)) {
  $cmsTokens = @{}
  $cmsCredentials = @()
  foreach ($cmsRole in @('editor', 'publisher')) {
    $cmsBytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $cmsToken = [Convert]::ToHexString($cmsBytes).ToLowerInvariant()
    $cmsHashBytes = [System.Security.Cryptography.SHA256]::HashData([System.Text.Encoding]::UTF8.GetBytes($cmsToken))
    $cmsHash = [Convert]::ToHexString($cmsHashBytes).ToLowerInvariant()
    $cmsTokens[$cmsRole] = $cmsToken
    $cmsCredentials += @{ name = "local-$cmsRole"; tokenHash = $cmsHash; websiteIds = @('demo-cms'); role = $cmsRole }
  }
  @{ credentials = $cmsCredentials; runtimeRoot = $cmsRuntime; port = $Port } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $cmsConfig
  $cmsTokens | ConvertTo-Json | Set-Content -LiteralPath $cmsAccess
}
if (-not (Test-Path -LiteralPath $cmsAccess)) { throw 'Lokaal toegangsbestand ontbreekt; herstel dit buiten de publieke site.' }
$cmsSettings = Get-Content -LiteralPath $cmsConfig -Raw | ConvertFrom-Json
$cmsSettings.port = $Port
$cmsSettings | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $cmsConfig
$env:CMS_FIXTURE_CONFIG = $cmsConfig
$env:CMS_FIXTURE_OPEN = if ($NoOpen) { '0' } else { '1' }
Write-Host "Toegang voor deze lokale proef staat in $cmsAccess"
Write-Host 'Kopieer het editor- of publisher-token naar het wachtwoordveld. Deel dit bestand niet.'
Push-Location -LiteralPath $cmsRepo
try {
  corepack pnpm --filter @draconis/cms build
  if ($LASTEXITCODE -ne 0) { throw 'CMS-app bouwen mislukt.' }
  corepack pnpm --filter @draconis/api exec tsx src/modules/cms/local.ts
  if ($LASTEXITCODE -ne 0) { throw 'CMS-proef gestopt met een fout.' }
} finally { Pop-Location }
