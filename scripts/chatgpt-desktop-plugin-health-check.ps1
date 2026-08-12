[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ReceiptPath,
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
  'sha256:' + ([BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
}

function Invoke-McpProbe($Declaration) {
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $Declaration.command
  $start.UseShellExecute = $false
  $start.RedirectStandardInput = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.CreateNoWindow = $true
  $start.WorkingDirectory = $Declaration.cwd
  $start.Arguments = (@($Declaration.args) | ForEach-Object { '"' + ([string]$_).Replace('"', '\"') + '"' }) -join ' '
  if ($Declaration.env) {
    foreach ($property in $Declaration.env.PSObject.Properties) { $start.EnvironmentVariables[$property.Name] = [string]$property.Value }
  }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $start
  if (-not $process.Start()) { throw 'Installed MCP command could not be started.' }
  try {
    $requests = @(
      [ordered]@{ jsonrpc = '2.0'; id = 1; method = 'initialize'; params = @{} },
      [ordered]@{ jsonrpc = '2.0'; id = 2; method = 'tools/list' },
      [ordered]@{ jsonrpc = '2.0'; id = 3; method = 'tools/call'; params = [ordered]@{ name = 'devrelay_list_runs'; arguments = [ordered]@{ operation = 'list-runs'; requestId = 'HEALTH-CHECK' } } }
    )
    foreach ($request in $requests) { $process.StandardInput.WriteLine(($request | ConvertTo-Json -Depth 12 -Compress)) }
    $process.StandardInput.Flush()
    $responses = @()
    foreach ($request in $requests) {
      $read = $process.StandardOutput.ReadLineAsync()
      if (-not $read.Wait([TimeSpan]::FromSeconds(30))) { throw "Installed MCP command timed out for request $($request.id)." }
      if ($null -eq $read.Result) { throw "Installed MCP command closed before response $($request.id)." }
      $responses += ($read.Result | ConvertFrom-Json)
    }
    if ($responses[0].result.serverInfo.name -ne 'devrelay') { throw 'Installed MCP initialize proof failed.' }
    if (@($responses[1].result.tools | Where-Object name -eq 'devrelay_list_runs').Count -ne 1) { throw 'Installed MCP tools/list proof failed.' }
    if ($responses[2].result.structuredContent.status -ne 'completed') { throw 'Installed MCP devrelay_list_runs proof failed.' }
    return $responses.Count
  } finally {
    if (-not $process.HasExited) { $process.Kill() }
    $process.Dispose()
  }
}

$mcpProofs = 0
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
  $entry = @($marketplace.plugins | Where-Object name -eq 'devrelay')[0]
  $resolvedPlugin = [IO.Path]::GetFullPath((Join-Path $receipt.inputs.target.marketplacePath $entry.source.path))
  if ($resolvedPlugin -ne [IO.Path]::GetFullPath($receipt.inputs.target.pluginPath)) { throw 'Installed marketplace source.path does not resolve to the installed plugin.' }
  $mcp = Get-Content -LiteralPath (Join-Path $resolvedPlugin '.mcp.json') -Raw | ConvertFrom-Json
  $declaration = $mcp.mcpServers.devrelay
  if (-not $declaration -or $declaration.type -ne 'stdio' -or -not [IO.Path]::IsPathRooted([string]$declaration.args[0]) -or -not [IO.Path]::IsPathRooted([string]$declaration.cwd) -or -not [IO.Path]::IsPathRooted([string]$declaration.env.DEVRELAY_DESKTOP_RUN_ROOT) -or -not [IO.Path]::IsPathRooted([string]$declaration.env.DEVRELAY_DESKTOP_CORE_ADAPTER)) { throw 'Installed MCP declaration is invalid.' }
  $mcpProofs = Invoke-McpProbe $declaration
}
if (-not $SkipDependencyCheck) {
  foreach ($dependency in @('node', 'codex')) { if (-not (Get-Command $dependency -ErrorAction SilentlyContinue)) { throw "Required dependency is unavailable: $dependency" } }
}
[ordered]@{ state = 'healthy'; receiptId = $receipt.outputs.receiptId; checkedFiles = @($receipt.outputs.installedFiles).Count; mcpProofs = $mcpProofs; diagnostics = @() } | ConvertTo-Json -Compress
