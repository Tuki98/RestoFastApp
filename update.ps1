# RestobarService :: actualización de imágenes
# Descarga los últimos cambios del repositorio (git pull),
# reconstruye las imágenes de server y web, recrea los contenedores
# y aplica migraciones/seed automáticamente al reiniciar el servidor.
# Uso: .\update.cmd  (o  .\update.cmd --NoCache  para build limpio)
param([switch]$NoCache)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$dockerCli     = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
$dockerDesktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
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
Write-Host '== RestobarService :: actualizacion de imagenes ==' -ForegroundColor Cyan
Write-Host ''

Write-Host 'Descargando cambios del repositorio (git pull)...'
Push-Location $composeDir
try {
  & git pull --ff-only origin main *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host '  git pull fallo. Cierra los cambios locales sin commitear o revisa las credenciales de GitHub.' -ForegroundColor Red
    exit 1
  }
  Write-Host '  Repositorio actualizado.' -ForegroundColor Green
} finally {
  Pop-Location
}

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

Push-Location $composeDir
try {
  if ($NoCache) {
    Write-Host 'Construyendo imagenes (build limpio sin cache)...'
    & $dockerCli compose build --no-cache
  } else {
    Write-Host 'Construyendo imagenes (usa cache)...'
    & $dockerCli compose build
  }
  if ($LASTEXITCODE -ne 0) { throw 'docker compose build fallo' }

  Write-Host 'Recreando contenedores...'
  & $dockerCli compose up -d --force-recreate
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

Write-Host ''
Write-Host '== Actualizacion completada ==' -ForegroundColor Green
Write-Host "  App (web):       $webUrl"
Write-Host "  API:             $serverUrl/api"
Write-Host ''

Read-Host 'Presiona Enter para cerrar'
