Set-StrictMode -Version Latest

function Invoke-Pnpm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]] $Args)

  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    & pnpm @Args
  } else {
    & corepack pnpm @Args
  }
}

function Test-DraconisSqliteModule {
  param([string] $RepoRoot)

  $apiRoot = Join-Path $RepoRoot 'server\api'
  if (-not (Test-Path -LiteralPath $apiRoot)) { return $false }

  Push-Location -LiteralPath $apiRoot
  try {
    node --input-type=module -e "import Database from 'better-sqlite3'; new Database(':memory:');"
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  } finally {
    Pop-Location
  }
}

function Ensure-DraconisDependencies {
  param([string] $RepoRoot)

  $nodeModules = Join-Path $RepoRoot 'node_modules'
  if (-not (Test-Path -LiteralPath $nodeModules)) {
    Write-Host 'Dependencies installeren (node_modules ontbreekt)...'
    Push-Location -LiteralPath $RepoRoot
    try {
      Invoke-Pnpm install
      if ($LASTEXITCODE -ne 0) { throw 'pnpm install mislukt.' }
    } finally {
      Pop-Location
    }
  }

  if (Test-DraconisSqliteModule -RepoRoot $RepoRoot) { return }

  Write-Host 'Native module better-sqlite3 is verouderd of ontbreekt; pnpm install...'
  Push-Location -LiteralPath $RepoRoot
  try {
    Invoke-Pnpm install
    if ($LASTEXITCODE -ne 0) { throw 'pnpm install mislukt.' }
  } finally {
    Pop-Location
  }

  if (-not (Test-DraconisSqliteModule -RepoRoot $RepoRoot)) {
    throw @"
better-sqlite3 werkt nog niet met Node $(node -v).
Probeer:
  1. Stop alle draaiende node-processen (drstart/vite/api)
  2. drinstall
  3. Of gebruik Node 22 LTS als rebuild blijft falen
"@
  }
}

Register-DevCommand -Name 'drinstall' -Description 'Installeer/rebuild Draconis dependencies' -Action {
  $repoRoot = Get-DevRepoRoot

  Push-Location -LiteralPath $repoRoot
  try {
    Invoke-Pnpm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    if (-not (Test-DraconisSqliteModule -RepoRoot $repoRoot)) {
      throw 'pnpm install voltooid, maar better-sqlite3 laadt nog niet. Controleer je Node-versie.'
    }

    Write-Host 'Dependencies OK.'
  } finally {
    Pop-Location
  }
}

Register-DevCommand -Name 'drstart' -Description 'Start Draconis API + Planner (pnpm dev)' -Action {
  $repoRoot = Get-DevRepoRoot

  Write-Host 'Draconis Planner opstarten...'
  Write-Host "  Repo:    $repoRoot"
  Write-Host "  Node:    $(node -v)"
  Write-Host '  API:     http://localhost:3001'
  Write-Host '  Planner: http://localhost:5173'
  Write-Host ''

  Ensure-DraconisDependencies -RepoRoot $repoRoot

  Write-Host 'Druk Ctrl+C om te stoppen.'
  Write-Host ''

  Push-Location -LiteralPath $repoRoot
  try {
    Invoke-Pnpm dev
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  } finally {
    Pop-Location
  }
}
