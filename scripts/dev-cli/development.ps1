Set-StrictMode -Version Latest

$global:DevCommandRegistry = @{}

$devCliRoot = $PSScriptRoot
. (Join-Path $devCliRoot 'Register-DevCommand.ps1')

Get-ChildItem -LiteralPath (Join-Path $devCliRoot 'commands') -Filter '*.ps1' |
  Sort-Object Name |
  ForEach-Object { . $_.FullName }

function devhelp {
  [CmdletBinding()]
  param()

  Write-Host 'Beschikbare dev-commando''s:'
  Write-Host ''

  foreach ($entry in ($global:DevCommandRegistry.GetEnumerator() | Sort-Object Name)) {
    $name = $entry.Key
    $meta = $entry.Value

    if ($meta.Kind -eq 'group') {
      $actions = ($meta.Actions -join ', ')
      Write-Host ("  {0} <action>  {1}" -f $name, $meta.Description)
      Write-Host ("             actions: {0}" -f $actions)
      continue
    }

    Write-Host ("  {0}  {1}" -f $name, $meta.Description)
  }

  Write-Host ''
  Write-Host 'Nieuw commando toevoegen: scripts/dev-cli/commands/<naam>.ps1'
}
