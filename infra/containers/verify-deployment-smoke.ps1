#Requires -Version 7.3
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$project = 'draconis-e7-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
$compose = @('-p', $project, '-f', (Join-Path $PSScriptRoot 'compose.smoke.yml'))
$oldSmokeKey = $env:DRACONIS_SMOKE_KEY

try {
  docker compose @compose up --build --detach
  $address = docker compose @compose port draconis-planner 8080
  $env:DRACONIS_SMOKE_KEY = 'fictitious-local-smoke-key'
  node (Join-Path $PSScriptRoot 'deployment-smoke.mjs') "http://$address" --write-fixture
} finally {
  $env:DRACONIS_SMOKE_KEY = $oldSmokeKey
  docker compose @compose down --rmi local
}
