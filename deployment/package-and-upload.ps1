[CmdletBinding()]
param(
  [string]$InstanceIp,
  [string]$KeyPath,
  [switch]$SkipUpload
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Executable failed with exit code $LASTEXITCODE."
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$archiveName = "apartment-portal-demo-$(Get-Date -Format 'yyyyMMdd-HHmmss').zip"
$archivePath = Join-Path $PSScriptRoot $archiveName
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("apartment-portal-build-" + [guid]::NewGuid().ToString("N"))
$buildRoot = Join-Path $tempRoot "build"
$bundleRoot = Join-Path $tempRoot "bundle"

if (-not $SkipUpload) {
  if ([string]::IsNullOrWhiteSpace($InstanceIp) -or [string]::IsNullOrWhiteSpace($KeyPath)) {
    throw "Provide -InstanceIp and -KeyPath, or use -SkipUpload for a local package build."
  }

  $parsedIp = $null
  if (-not [System.Net.IPAddress]::TryParse($InstanceIp, [ref]$parsedIp) -or
      $parsedIp.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
    throw "-InstanceIp must be the Lightsail public IPv4 address."
  }

  if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
    throw "The PEM file path does not exist. Its contents are never opened."
  }

  $null = Get-Command scp.exe -ErrorAction Stop
}

$null = Get-Command node.exe -ErrorAction Stop
$null = Get-Command npm.cmd -ErrorAction Stop

New-Item -ItemType Directory -Path $buildRoot, $bundleRoot -Force | Out-Null

try {
  $frontendBuild = Join-Path $buildRoot "frontend"
  $frontendServices = Join-Path $frontendBuild "src\services"
  New-Item -ItemType Directory -Path $frontendServices -Force | Out-Null

  $frontendFiles = @(
    "index.html",
    "package.json",
    "package-lock.json",
    "src\App.jsx",
    "src\main.jsx",
    "src\style.css",
    "src\services\api.js"
  )
  foreach ($relativePath in $frontendFiles) {
    $sourcePath = Join-Path (Join-Path $projectRoot "frontend") $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
      throw "Required frontend file is missing: frontend\$relativePath"
    }

    $destinationPath = Join-Path $frontendBuild $relativePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $destinationPath) -Force | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath
  }

  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "demo-paymentConfig.js") `
    -Destination (Join-Path $frontendServices "paymentConfig.js")

  $previousApiBaseUrl = [Environment]::GetEnvironmentVariable("VITE_API_BASE_URL", "Process")
  try {
    [Environment]::SetEnvironmentVariable("VITE_API_BASE_URL", "/api", "Process")
    Push-Location $frontendBuild
    try {
      Invoke-CheckedCommand "npm.cmd" @("ci", "--no-audit", "--no-fund")
      Invoke-CheckedCommand "npm.cmd" @("run", "build")
    }
    finally {
      Pop-Location
    }
  }
  finally {
    [Environment]::SetEnvironmentVariable("VITE_API_BASE_URL", $previousApiBaseUrl, "Process")
  }

  $bundleBackendSrc = Join-Path $bundleRoot "backend\src\config"
  $bundleDatabase = Join-Path $bundleRoot "database"
  $bundleFrontend = Join-Path $bundleRoot "frontend"
  $bundleDeployment = Join-Path $bundleRoot "deployment"
  New-Item -ItemType Directory -Path $bundleBackendSrc, $bundleDatabase, $bundleFrontend, $bundleDeployment -Force | Out-Null

  foreach ($relativePath in @("package.json", "package-lock.json", "src\server.js", "src\config\database.js")) {
    $sourcePath = Join-Path (Join-Path $projectRoot "backend") $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
      throw "Required backend file is missing: backend\$relativePath"
    }

    $destinationPath = Join-Path (Join-Path $bundleRoot "backend") $relativePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $destinationPath) -Force | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath
  }

  Copy-Item -LiteralPath (Join-Path (Join-Path $projectRoot "database") "schema.sql") `
    -Destination $bundleDatabase
  Copy-Item -LiteralPath (Join-Path $frontendBuild "dist") -Destination $bundleFrontend -Recurse

  foreach ($fileName in @("setup-ubuntu.sh", "apartment-portal.service", "nginx-apartment-portal.conf")) {
    $sourcePath = Join-Path $PSScriptRoot $fileName
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
      throw "Required deployment file is missing: $fileName"
    }

    Copy-Item -LiteralPath $sourcePath -Destination $bundleDeployment
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory($bundleRoot, $archivePath)
  $zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
  try {
    $entries = @($zip.Entries | ForEach-Object { $_.FullName })
  }
  finally {
    $zip.Dispose()
  }

  $normalizedEntries = @($entries | ForEach-Object { $_.Replace("\", "/") })
  $forbiddenEntry = $normalizedEntries | Where-Object {
    $_ -match '(^|/)(\.git|node_modules)(/|$)' -or
    $_ -match '(^|/)\.env($|[./])' -or
    $_ -match '(^|/)src/services/paymentConfig\.js$'
  }
  if ($forbiddenEntry) {
    throw "The archive contains a forbidden entry: $($forbiddenEntry -join ', ')"
  }

  $requiredEntries = @(
    "backend/package.json",
    "backend/package-lock.json",
    "backend/src/server.js",
    "backend/src/config/database.js",
    "database/schema.sql",
    "deployment/apartment-portal.service",
    "deployment/nginx-apartment-portal.conf",
    "deployment/setup-ubuntu.sh",
    "frontend/dist/index.html"
  )
  foreach ($requiredEntry in $requiredEntries) {
    if ($normalizedEntries -notcontains $requiredEntry) {
      throw "The archive is missing a required entry: $requiredEntry"
    }
  }

  Write-Output "Archive created: $archivePath"
  Write-Output "Archive entries:"
  $entries | Sort-Object | ForEach-Object { Write-Output "  $_" }

  if (-not $SkipUpload) {
    $remotePath = "/tmp/$archiveName"
    Write-Output "Uploading only this archive to ubuntu@${InstanceIp}:$remotePath"
    Invoke-CheckedCommand "scp.exe" @(
      "-i", $KeyPath,
      "-o", "IdentitiesOnly=yes",
      $archivePath,
      "ubuntu@${InstanceIp}:$remotePath"
    )
    Write-Output "Upload completed. The instance has not been configured or started."
  }
}
finally {
  if (Test-Path -LiteralPath $tempRoot -PathType Container) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
