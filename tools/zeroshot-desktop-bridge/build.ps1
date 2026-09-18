param(
  [Parameter(Mandatory = $true)][string]$ToolchainRoot,
  [Parameter(Mandatory = $true)][string]$TargetDirectory
)
$ErrorActionPreference = 'Stop'
$toolchain = (Resolve-Path -LiteralPath $ToolchainRoot).Path
$saved = @{}
foreach ($name in @('RUSTUP_HOME', 'CARGO_HOME', 'RUSTFLAGS', 'PATH')) {
  $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
  $env:RUSTUP_HOME = Join-Path $toolchain 'rustup'
  $env:CARGO_HOME = Join-Path $toolchain 'cargo'
  $env:PATH = (Join-Path $toolchain 'w64devkit/bin') + ';' + (Join-Path $env:CARGO_HOME 'bin') + ';' + $env:PATH
  # Rust's bundled MinGW runtime includes the static exception library that
  # this portable GCC distribution does not ship as a separate library.
  $env:RUSTFLAGS = '-Clink-self-contained=yes'
  $compilerVersion = & (Join-Path $env:CARGO_HOME 'bin/rustc.exe') --version
  if ($LASTEXITCODE -ne 0 -or $compilerVersion -notmatch '^rustc 1\.98\.1 ') { throw 'This candidate was validated with Rust 1.98.1; select that project-local toolchain.' }
  & (Join-Path $env:CARGO_HOME 'bin/cargo.exe') build --locked --manifest-path (Join-Path $PSScriptRoot 'Cargo.toml') --target-dir $TargetDirectory
  if ($LASTEXITCODE -ne 0) { throw 'Desktop bridge build failed' }
} finally {
  foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}
