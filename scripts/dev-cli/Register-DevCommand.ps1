Set-StrictMode -Version Latest

function Register-DevCommand {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string] $Name,

    [Parameter(Mandatory = $true)]
    [scriptblock] $Action,

    [string] $Description = ''
  )

  $metadata = [ordered]@{
    Name        = $Name
    Description = $Description
    Kind        = 'command'
  }

  Set-Item -Path "function:global:$Name" -Value $Action
  $global:DevCommandRegistry[$Name] = $metadata
}

function Register-DevCommandGroup {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string] $Name,

    [Parameter(Mandatory = $true)]
    [hashtable] $Actions,

    [string] $Description = ''
  )

  $actionMap = @{}
  foreach ($key in $Actions.Keys) {
    $actionMap[$key.ToLowerInvariant()] = $Actions[$key]
  }

  $groupName = $Name
  $actions = $actionMap

  $dispatcher = {
    param(
      [Parameter(Position = 0)]
      [string] $Action,

      [Parameter(ValueFromRemainingArguments = $true)]
      [object[]] $Remaining
    )

    if (-not $Action) {
      Write-Host "Usage: $groupName <action>"
      Write-Host "Actions: $($actions.Keys -join ', ')"
      return
    }

    $normalized = $Action.ToLowerInvariant()
    if (-not $actions.ContainsKey($normalized)) {
      throw "Unknown action '$Action' for $groupName. Available: $($actions.Keys -join ', ')"
    }

    & $actions[$normalized] @Remaining
  }.GetNewClosure()

  $metadata = [ordered]@{
    Name        = $Name
    Description = $Description
    Kind        = 'group'
    Actions     = ($actionMap.Keys | Sort-Object)
  }

  Set-Item -Path "function:global:$Name" -Value $dispatcher
  $global:DevCommandRegistry[$Name] = $metadata
}

function Get-DevRepoRoot {
  $candidates = @(
    $env:DRACONIS_LABS_ROOT,
    'C:\git\draconis-labs',
    (Join-Path $env:USERPROFILE 'git\draconis-labs')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

  foreach ($candidate in $candidates) {
    $resolved = (Resolve-Path -LiteralPath $candidate).Path
    $marker = Join-Path $resolved 'package.json'
    if (Test-Path -LiteralPath $marker) {
      return $resolved
    }
  }

  throw 'Draconis Labs repo niet gevonden. Zet DRACONIS_LABS_ROOT of clone naar C:\git\draconis-labs.'
}
