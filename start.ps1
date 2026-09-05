# RestobarService :: arranque automático
# Inicia Docker Desktop, levanta el stack, lanza ngrok e imprime el link público.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$dockerCli     = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
$dockerDesktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
$ngrokUrlApi   = 'http://127.0.0.1:4040/api/tunnels'
$serverUrl     = 'http://localhost:3000'
$webUrl        = 'http://localhost:8080'
$composeDir    = $PSScriptRoot

function Wait-Engine {
  param([int]$TimeoutSec = 180)
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
    & $dockerCli info *> $null
    if ($LASTEXITCODE -eq 0) {
      Write-Host '  Docker motor listo.' -ForegroundColor Green
      return $true
    }
    Start-Sleep -Seconds 3
  }
  return $false
}

function Wait-Port {
  param([int]$Port, [int]$TimeoutSec = 120)
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
      $ok = $async.AsyncWaitHandle.WaitOne(1500)
      if ($ok) { $client.Close(); return $true }
      $client.Close()
    } catch { }
    Start-Sleep -Milliseconds 1500
  }
  return $false
}

Write-Host ''
Write-Host '== RestobarService :: arranque automatico ==' -ForegroundColor Cyan
Write-Host ''

if (Test-Path $dockerDesktop) {
  $running = Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue
  if (-not $running) {
    Write-Host 'Iniciando Docker Desktop...'
    Start-Process -FilePath $dockerDesktop
  } else {
    Write-Host 'Docker Desktop ya estaba abierto.'
  }
}

if (-not (Wait-Engine)) {
  Write-Host 'Docker no respondio tras 3 minutos. Abrelo manualmente y vuelve a intentar.' -ForegroundColor Red
  exit 1
}

Write-Host 'Levantando contenedores (db, server, web)...'
Push-Location $composeDir
try {
  & $dockerCli compose up -d
  if ($LASTEXITCODE -ne 0) { throw 'docker compose up fallo' }
} finally {
  Pop-Location
}

Write-Host 'Esperando la API (puerto 3000)...'
if (-not (Wait-Port -Port 3000)) {
  Write-Host '  La API no arranco a tiempo. Revisa: docker compose logs server' -ForegroundColor Red
}

Write-Host 'Esperando la web (puerto 8080)...'
if (-not (Wait-Port -Port 8080)) {
  Write-Host '  La web no respondio. Revisa: docker compose logs web' -ForegroundColor Red
}

$publicUrl = $null
try {
  $tunnels = Invoke-RestMethod -Uri $ngrokUrlApi -TimeoutSec 5
  $publicUrl = ($tunnels.tunnels | Where-Object { $_.config.addr -match '8080' } | Select-Object -First 1).public_url
} catch { }

if (-not $publicUrl) {
  Write-Host 'Lanzando tunel ngrok...'
  Start-Process -FilePath 'ngrok' -ArgumentList 'http', '8080' -WindowStyle Hidden
  Start-Sleep -Seconds 8
  try {
    $tunnels = Invoke-RestMethod -Uri $ngrokUrlApi -TimeoutSec 5
    $publicUrl = ($tunnels.tunnels | Where-Object { $_.config.addr -match '8080' } | Select-Object -First 1).public_url
  } catch { }
}

Write-Host ''
Write-Host '== Listo ==' -ForegroundColor Green
Write-Host "  App (web):       $webUrl"
Write-Host "  API:             $serverUrl/api"
if ($publicUrl) {
  Write-Host "  Ngrok (publico): $publicUrl" -ForegroundColor Yellow
} else {
  Write-Host '  Ngrok: sin URL (revisa http://127.0.0.1:4040)' -ForegroundColor Yellow
}
Write-Host ''

Read-Host 'Presiona Enter para cerrar'
