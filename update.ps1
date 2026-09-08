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

# Ejecuta un proceso nativo sin que el stderr dispare excepciones
# y devuelve salida + código de salida + fallo.
function Invoke-Native {
  param([scriptblock]$Script)
  $prevEA = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $Script 2>&1
  } finally {
    $ErrorActionPreference = $prevEA
  }
  return [pscustomobject]@{ Output = @($output); ExitCode = $LASTEXITCODE; Failed = ($LASTEXITCODE -ne 0) }
}

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

function Show-Output {
  param([string[]]$Lines, [string]$Color = 'DarkGray', [int]$Tail = 0)
  $selected = if ($Tail -gt 0) { $Lines | Select-Object -Last $Tail } else { $Lines }
  foreach ($line in $selected) {
    if ($line -ne $null) { Write-Host "  $line" -ForegroundColor $Color }
  }
}

try {
  Write-Host ''
  Write-Host '== RestobarService :: actualizacion de imagenes ==' -ForegroundColor Cyan
  Write-Host ''

  Write-Host 'Descargando cambios del repositorio (git pull)...'
  Push-Location $composeDir
  try {
    $pull = Invoke-Native { git pull --ff-only origin main }
    Show-Output -Lines $pull.Output
    if ($pull.Failed) {
      Write-Host '' -ForegroundColor Red
      Write-Host '  git pull fallo (detalle arriba).' -ForegroundColor Red
      Write-Host '  Causas frecuentes:' -ForegroundColor Yellow
      Write-Host '  - Credenciales de GitHub no guardadas. Configuranos una vez:' -ForegroundColor Yellow
      Write-Host '      git config --global credential.helper manager-core' -ForegroundColor White
      Write-Host '      git pull' -ForegroundColor White
      Write-Host '  - Cambios locales sin commitear (git status).' -ForegroundColor Yellow
      throw 'git pull fallo. Revisa el detalle arriba.'
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
    throw 'Docker no respondio tras 3 minutos. Abrelo manualmente y vuelve a intentar.'
  }

  Push-Location $composeDir
  try {
    if ($NoCache) {
      Write-Host 'Construyendo imagenes (build limpio sin cache)...'
      $build = Invoke-Native { & $dockerCli compose build --no-cache }
    } else {
      Write-Host 'Construyendo imagenes (usa cache)...'
      $build = Invoke-Native { & $dockerCli compose build }
    }
    if ($build.Failed) {
      Show-Output -Lines $build.Output -Color Red
      throw 'docker compose build fallo. Revisa el detalle arriba.'
    }
    Show-Output -Lines $build.Output -Tail 15

    Write-Host 'Recreando contenedores...'
    $up = Invoke-Native { & $dockerCli compose up -d --force-recreate }
    if ($up.Failed) {
      Show-Output -Lines $up.Output -Color Red
      throw 'docker compose up fallo. Revisa el detalle arriba.'
    }
    Show-Output -Lines $up.Output -Tail 15
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
} catch {
  Write-Host ''
  Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
  Read-Host 'Presiona Enter para cerrar'
  exit 1
}