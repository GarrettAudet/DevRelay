[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ReceiptPath,
  [switch]$SkipDependencyCheck
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Get-Sha256([string]$Path) { 'sha256:' + (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }

$receipt = Get-Content -LiteralPath $ReceiptPath -Raw | ConvertFrom-Json
if ($receipt.apiVersion -ne 'devrelay.dev/v1alpha1' -or $receipt.interfaceIntentId -ne 'IF-DESKTOP-INSTALLATION') { throw 'Installation receipt is invalid.' }
if ($receipt.outputs.state -eq 'uninstalled') {
  if ((Test-Path -LiteralPath $receipt.inputs.target.pluginPath) -or (Test-Path -LiteralPath $receipt.inputs.target.marketplacePath)) { throw 'Uninstalled target still exists.' }
} else {
  foreach ($file in $receipt.outputs.installedFiles) {
    if (-not (Test-Path -LiteralPath $file.path -PathType Leaf)) { throw "Installed file is missing: $($file.path)" }
    if ((Get-Sha256 $file.path) -ne $file.digest) { throw "Installed file digest mismatch: $($file.path)" }
  }
  $manifest = Get-Content -LiteralPath (Join-Path $receipt.inputs.target.pluginPath '.codex-plugin\plugin.json') -Raw | ConvertFrom-Json
  $marketplace = Get-Content -LiteralPath (Join-Path $receipt.inputs.target.marketplacePath 'marketplace.json') -Raw | ConvertFrom-Json
  if ($manifest.name -ne 'devrelay' -or @($marketplace.plugins | Where-Object name -eq 'devrelay').Count -ne 1) { throw 'Installed manifests are invalid.' }
}
if (-not $SkipDependencyCheck) {
  foreach ($dependency in @('node', 'codex')) { if (-not (Get-Command $dependency -ErrorAction SilentlyContinue)) { throw "Required dependency is unavailable: $dependency" } }
}
[ordered]@{ state = 'healthy'; receiptId = $receipt.outputs.receiptId; checkedFiles = @($receipt.outputs.installedFiles).Count; diagnostics = @() } | ConvertTo-Json -Compress
