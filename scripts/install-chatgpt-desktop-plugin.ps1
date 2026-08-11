[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('install', 'upgrade', 'rollback', 'uninstall')]
  [string]$Operation,
  [Parameter(Mandatory = $true)]
  [string]$RepositoryPath,
  [Parameter(Mandatory = $true)]
  [string]$PluginPath,
  [Parameter(Mandatory = $true)]
  [string]$MarketplacePath,
  [Parameter(Mandatory = $true)]
  [string]$ReceiptPath,
  [string]$PriorReceiptPath,
  [string]$RollbackReceiptPath,
  [string]$ExpectedRepositoryDigest,
  [string]$ExpectedPluginManifestDigest,
  [string]$RepositoryRevision,
  [switch]$SkipDependencyCheck
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try { $hash = $sha256.ComputeHash($stream) } finally { $sha256.Dispose() }
  } finally {
    $stream.Dispose()
  }
  return 'sha256:' + ([BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
}

function Get-TreeDigest([string]$Root, [string[]]$RelativePaths) {
  $rootPrefix = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  $entries = foreach ($relative in $RelativePaths) {
    $absolute = Join-Path $Root $relative
    if (Test-Path -LiteralPath $absolute -PathType Leaf) {
      "$($relative.Replace('\', '/'))`n$(Get-Sha256 $absolute)"
    } elseif (Test-Path -LiteralPath $absolute -PathType Container) {
      Get-ChildItem -LiteralPath $absolute -File -Recurse | Sort-Object FullName | ForEach-Object {
        $itemRelative = $_.FullName.Substring($rootPrefix.Length).Replace('\', '/')
        "$itemRelative`n$(Get-Sha256 $_.FullName)"
      }
    } else {
      throw "Required package path is missing: $relative"
    }
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($entries -join "`n"))
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try { $hash = $sha256.ComputeHash($bytes) } finally { $sha256.Dispose() }
  return 'sha256:' + ([BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
}

function Assert-ChildPath([string]$Parent, [string]$Child, [string]$Label) {
  $parentFull = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  $childFull = [IO.Path]::GetFullPath($Child).TrimEnd('\') + '\'
  if (-not $childFull.StartsWith($parentFull, [StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label must remain beneath its declared parent."
  }
}

function Read-Receipt([string]$Path, [string]$Label) {
  if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label is required and must identify an existing receipt."
  }
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Copy-Directory([string]$Source, [string]$Destination) {
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  Get-ChildItem -LiteralPath $Source -Force | Copy-Item -Destination $Destination -Recurse -Force
}

function Test-DirectoryEqual([string]$Left, [string]$Right) {
  if (-not (Test-Path -LiteralPath $Left -PathType Container) -or -not (Test-Path -LiteralPath $Right -PathType Container)) { return $false }
  $leftFiles = @(Get-ChildItem -LiteralPath $Left -File -Recurse | ForEach-Object { $_.FullName.Substring($Left.TrimEnd('\').Length + 1) } | Sort-Object)
  $rightFiles = @(Get-ChildItem -LiteralPath $Right -File -Recurse | ForEach-Object { $_.FullName.Substring($Right.TrimEnd('\').Length + 1) } | Sort-Object)
  if (($leftFiles -join "`n") -ne ($rightFiles -join "`n")) { return $false }
  foreach ($relative in $leftFiles) { if ((Get-Sha256 (Join-Path $Left $relative)) -ne (Get-Sha256 (Join-Path $Right $relative))) { return $false } }
  return $true
}

function Test-ReceiptInstallation([string]$Path, [string]$Plugin, [string]$Marketplace, [string]$RepositoryRevision, [string]$RepositoryContentDigest, [string]$ManifestDigest) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  try { $existing = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json } catch { return $false }
  if ($existing.interfaceIntentId -ne 'IF-DESKTOP-INSTALLATION' -or
      $existing.outputs.state -ne 'installed' -or
      $existing.outputs.repositoryRevision -ne $RepositoryRevision -or
      $existing.outputs.repositoryContentDigest -ne $RepositoryContentDigest -or
      $existing.outputs.pluginManifestDigest -ne $ManifestDigest -or
      [IO.Path]::GetFullPath($existing.inputs.target.pluginPath) -ne $Plugin -or
      [IO.Path]::GetFullPath($existing.inputs.target.marketplacePath) -ne $Marketplace) { return $false }

  $actualFiles = @(Get-ChildItem -LiteralPath $Plugin,$Marketplace -File -Recurse | Sort-Object FullName)
  $recordedFiles = @($existing.outputs.installedFiles)
  if ($actualFiles.Count -ne $recordedFiles.Count) { return $false }
  $recordedByPath = @{}
  foreach ($recorded in $recordedFiles) { $recordedByPath[[IO.Path]::GetFullPath($recorded.path)] = $recorded.digest }
  foreach ($actual in $actualFiles) {
    if (-not $recordedByPath.ContainsKey($actual.FullName) -or $recordedByPath[$actual.FullName] -ne (Get-Sha256 $actual.FullName)) { return $false }
  }
  return $true
}

if ($env:OS -ne 'Windows_NT') { throw 'ChatGPT Desktop installation is supported only on Windows.' }
$repository = (Resolve-Path -LiteralPath $RepositoryPath).Path
$sourcePlugin = Join-Path $repository 'plugins\devrelay'
$sourceMarketplace = Join-Path $repository '.agents\plugins\marketplace.json'
$sourceManifest = Join-Path $sourcePlugin '.codex-plugin\plugin.json'
foreach ($required in @($sourcePlugin, $sourceMarketplace, $sourceManifest)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Required package path is missing: $required" }
}

$manifest = Get-Content -LiteralPath $sourceManifest -Raw | ConvertFrom-Json
$marketplace = Get-Content -LiteralPath $sourceMarketplace -Raw | ConvertFrom-Json
if ($manifest.name -ne 'devrelay' -or -not $manifest.version -or $marketplace.name -ne 'personal') {
  throw 'The repository plugin or marketplace manifest is invalid.'
}
$entry = @($marketplace.plugins | Where-Object { $_.name -eq 'devrelay' })
if ($entry.Count -ne 1 -or $entry[0].source.source -ne 'local' -or $entry[0].source.path -ne './plugins/devrelay') {
  throw 'The repository marketplace must expose exactly one local DevRelay plugin.'
}

if (-not $SkipDependencyCheck) {
  foreach ($dependency in @('node', 'codex')) {
    if (-not (Get-Command $dependency -ErrorAction SilentlyContinue)) { throw "Required dependency is unavailable: $dependency" }
  }
  $nodeMajor = [int]((& node --version).TrimStart('v').Split('.')[0])
  if ($nodeMajor -lt 20) { throw 'Node.js 20 or newer is required.' }
}

$pluginManifestDigest = Get-Sha256 $sourceManifest
$repositoryDigest = Get-TreeDigest $repository @('plugins\devrelay', '.agents\plugins\marketplace.json')
if ($ExpectedPluginManifestDigest -and $ExpectedPluginManifestDigest -ne $pluginManifestDigest) { throw 'Plugin manifest digest mismatch; no changes were made.' }
if ($ExpectedRepositoryDigest -and $ExpectedRepositoryDigest -ne $repositoryDigest) { throw 'Repository package digest mismatch; no changes were made.' }
if (-not $RepositoryRevision) {
  $RepositoryRevision = (& git -C $repository rev-parse HEAD 2>$null)
  if ($LASTEXITCODE -ne 0) { throw 'RepositoryRevision is required when the source is not a Git checkout.' }
}
if ($RepositoryRevision -notmatch '^[0-9a-f]{40}$') { throw 'RepositoryRevision must be a lowercase 40-character Git commit.' }

$pluginTarget = [IO.Path]::GetFullPath($PluginPath)
$marketplaceTarget = [IO.Path]::GetFullPath($MarketplacePath)
$receiptTarget = [IO.Path]::GetFullPath($ReceiptPath)
$pluginParent = Split-Path -Parent $pluginTarget
$marketplaceParent = Split-Path -Parent $marketplaceTarget
Assert-ChildPath $pluginParent $pluginTarget 'PluginPath'
Assert-ChildPath $marketplaceParent $marketplaceTarget 'MarketplacePath'

$prior = $null
if ($Operation -in @('upgrade', 'uninstall', 'rollback')) { $prior = Read-Receipt $PriorReceiptPath 'PriorReceiptPath' }
$rollback = $null
if ($Operation -eq 'rollback') { $rollback = Read-Receipt $RollbackReceiptPath 'RollbackReceiptPath' }
$resultRevision = $RepositoryRevision
$resultRepositoryDigest = $repositoryDigest
$resultManifestDigest = $pluginManifestDigest

$backupRoot = "$receiptTarget.backups"
$backupPlugin = Join-Path $backupRoot 'plugin'
$backupMarketplace = Join-Path $backupRoot 'marketplace'
$stageRoot = Join-Path ([IO.Path]::GetTempPath()) ('devrelay-install-' + [Guid]::NewGuid().ToString('N'))
$stagePlugin = Join-Path $stageRoot 'plugin'
$stageMarketplace = Join-Path $stageRoot 'marketplace'
$hadPlugin = Test-Path -LiteralPath $pluginTarget
$hadMarketplace = Test-Path -LiteralPath $marketplaceTarget
if ($Operation -eq 'install' -and ($hadPlugin -or $hadMarketplace)) {
  $marketplaceFile = Join-Path $marketplaceTarget 'marketplace.json'
  $receiptMatches = Test-ReceiptInstallation $receiptTarget $pluginTarget $marketplaceTarget $RepositoryRevision $repositoryDigest $pluginManifestDigest
  $contentMatches = (Test-DirectoryEqual $sourcePlugin $pluginTarget) -and (Test-Path -LiteralPath $marketplaceFile) -and ((Get-Sha256 $sourceMarketplace) -eq (Get-Sha256 $marketplaceFile))
  if (-not $receiptMatches -and -not $contentMatches) {
    throw 'Existing installation is ambiguous or drifted; use upgrade with its prior receipt.'
  }
}

try {
  if ($Operation -ne 'uninstall') {
    New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
    if ($Operation -eq 'rollback') {
      $rollbackBackupRoot = "$([IO.Path]::GetFullPath($RollbackReceiptPath)).backups"
      $rollbackBackupPlugin = Join-Path $rollbackBackupRoot 'plugin'
      $rollbackBackupMarketplace = Join-Path $rollbackBackupRoot 'marketplace'
      $rollbackIdentityPath = Join-Path $rollbackBackupRoot 'identity.json'
      if (-not (Test-Path -LiteralPath $rollbackBackupPlugin) -or -not (Test-Path -LiteralPath $rollbackBackupMarketplace) -or -not (Test-Path -LiteralPath $rollbackIdentityPath)) { throw 'Rollback receipt backup is unavailable.' }
      $rollbackIdentity = Get-Content -LiteralPath $rollbackIdentityPath -Raw | ConvertFrom-Json
      $resultRevision = $rollbackIdentity.repositoryRevision
      $resultRepositoryDigest = $rollbackIdentity.repositoryContentDigest
      $resultManifestDigest = $rollbackIdentity.pluginManifestDigest
      Copy-Directory $rollbackBackupPlugin $stagePlugin
      Copy-Directory $rollbackBackupMarketplace $stageMarketplace
    } else {
      Copy-Directory $sourcePlugin $stagePlugin
      New-Item -ItemType Directory -Path $stageMarketplace -Force | Out-Null
      Copy-Item -LiteralPath $sourceMarketplace -Destination (Join-Path $stageMarketplace 'marketplace.json') -Force
    }
  }

  if ($Operation -in @('upgrade', 'uninstall') -and ($hadPlugin -or $hadMarketplace)) {
    if (Test-Path -LiteralPath $backupRoot) { Remove-Item -LiteralPath $backupRoot -Recurse -Force }
    if ($hadPlugin) { Copy-Directory $pluginTarget $backupPlugin }
    if ($hadMarketplace) { Copy-Directory $marketplaceTarget $backupMarketplace }
    [ordered]@{ repositoryRevision = $prior.outputs.repositoryRevision; repositoryContentDigest = $prior.outputs.repositoryContentDigest; pluginManifestDigest = $prior.outputs.pluginManifestDigest } |
      ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $backupRoot 'identity.json') -Encoding utf8
  }

  if (Test-Path -LiteralPath $pluginTarget) { Remove-Item -LiteralPath $pluginTarget -Recurse -Force }
  if (Test-Path -LiteralPath $marketplaceTarget) { Remove-Item -LiteralPath $marketplaceTarget -Recurse -Force }
  if ($Operation -ne 'uninstall') {
    New-Item -ItemType Directory -Path $pluginParent -Force | Out-Null
    New-Item -ItemType Directory -Path $marketplaceParent -Force | Out-Null
    Move-Item -LiteralPath $stagePlugin -Destination $pluginTarget
    Move-Item -LiteralPath $stageMarketplace -Destination $marketplaceTarget
  }
} catch {
  if (Test-Path -LiteralPath $pluginTarget) { Remove-Item -LiteralPath $pluginTarget -Recurse -Force }
  if (Test-Path -LiteralPath $marketplaceTarget) { Remove-Item -LiteralPath $marketplaceTarget -Recurse -Force }
  if (Test-Path -LiteralPath $backupPlugin) { Copy-Directory $backupPlugin $pluginTarget }
  if (Test-Path -LiteralPath $backupMarketplace) { Copy-Directory $backupMarketplace $marketplaceTarget }
  throw
} finally {
  if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
}

$state = @{ install = 'installed'; upgrade = 'upgraded'; rollback = 'rolled-back'; uninstall = 'uninstalled' }[$Operation]
$installedFiles = @()
if ($Operation -ne 'uninstall') {
  $installedFiles = @(Get-ChildItem -LiteralPath $pluginTarget,$marketplaceTarget -File -Recurse | Sort-Object FullName | ForEach-Object {
    [ordered]@{ path = $_.FullName; digest = Get-Sha256 $_.FullName }
  })
}
$receipt = [ordered]@{
  apiVersion = 'devrelay.dev/v1alpha1'
  interfaceIntentId = 'IF-DESKTOP-INSTALLATION'
  inputs = [ordered]@{
    operation = $Operation; repository = ([Uri]$repository).AbsoluteUri; repositoryRevision = $RepositoryRevision
    repositoryContentDigest = $repositoryDigest; pluginManifestDigest = $pluginManifestDigest
    target = [ordered]@{ platform = 'win32'; chatGptDesktopVersion = 'current'; pluginPath = $pluginTarget; marketplacePath = $marketplaceTarget }
  }
  outputs = [ordered]@{
    receiptId = 'DESKTOP-INSTALL-' + [Guid]::NewGuid().ToString('N').ToUpperInvariant()
    operation = $Operation; state = $state; repositoryRevision = $resultRevision
    repositoryContentDigest = $resultRepositoryDigest; pluginManifestDigest = $resultManifestDigest
    installedFiles = $installedFiles; diagnostics = @()
  }
}
if ($prior) { $receipt.inputs.priorInstallation = [ordered]@{ artifactId = $prior.outputs.receiptId; digest = Get-Sha256 $PriorReceiptPath }; $receipt.outputs.priorInstallation = $receipt.inputs.priorInstallation }
if ($rollback) { $receipt.inputs.rollbackReceipt = [ordered]@{ artifactId = $rollback.outputs.receiptId; digest = Get-Sha256 $RollbackReceiptPath }; $receipt.outputs.rollbackReceipt = $receipt.inputs.rollbackReceipt }
New-Item -ItemType Directory -Path (Split-Path -Parent $receiptTarget) -Force | Out-Null
$receipt | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $receiptTarget -Encoding utf8
$receipt | ConvertTo-Json -Depth 12 -Compress
