Set-StrictMode -Version Latest

function Invoke-SqlStart {
  # Pas dit aan voor jouw SQL-setup (LocalDB, Docker, Windows-service, enz.).
  Write-Host 'sql start: nog niet geconfigureerd.'
  Write-Host 'Bewerk scripts/dev-cli/commands/sql.ps1 en voeg je startlogica toe.'
}

function Invoke-SqlStop {
  Write-Host 'sql stop: nog niet geconfigureerd.'
  Write-Host 'Bewerk scripts/dev-cli/commands/sql.ps1 en voeg je stoplogica toe.'
}

Register-DevCommandGroup -Name 'sql' -Description 'SQL-server beheer (voorbeeld/template)' -Actions @{
  start = { Invoke-SqlStart }
  stop  = { Invoke-SqlStop }
}
