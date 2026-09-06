#requires -Version 5.1

param(
  [int]$DebugPort = 9222,
  [Parameter(Mandatory=$true)][string]$DashboardUrl,
  [Parameter(Mandatory=$true)][string]$PushUrl,
  [Parameter(Mandatory=$true)][string]$Space,
  [Parameter(Mandatory=$true)][string]$DashboardId,
  [int]$DashboardVersion = 3,
  [Parameter(Mandatory=$true)][string]$TrafficPanelId,
  [switch]$ResetKey
)

$ErrorActionPreference = "Stop"

try {
  $DashboardUri = [Uri]$DashboardUrl
  $PushUri = [Uri]$PushUrl
} catch {
  throw "DashboardUrl en PushUrl moeten geldige HTTPS-adressen zijn."
}
if ($DashboardUri.Scheme -ne "https" -or $PushUri.Scheme -ne "https") {
  throw "DashboardUrl en PushUrl moeten HTTPS gebruiken."
}
$KibanaOrigin = $DashboardUri.GetLeftPart([UriPartial]::Authority)

$StateDir = Join-Path $env:LOCALAPPDATA "RoosteroverzichtTrafficCollector"
$ProfileDir = Join-Path $StateDir "EdgeProfile"
$KeyFile = Join-Path $StateDir "push-key.dpapi"
$HookLocal = Join-Path (Split-Path $PSScriptRoot -Parent) "traffic-collector-extension\page-hook.js"
$HookRemote = "https://raw.githubusercontent.com/svanbergen99/Roosteroverzicht/main/traffic-collector-extension/page-hook.js"

New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null

if ($ResetKey -and (Test-Path $KeyFile)) {
  Remove-Item $KeyFile -Force
  Write-Host "Opgeslagen Traffic push-key is verwijderd." -ForegroundColor Yellow
}

function Convert-SecureStringToPlainText {
  param([Security.SecureString]$Secure)
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Get-TrafficPushKey {
  if (Test-Path $KeyFile) {
    try {
      $encrypted = Get-Content -LiteralPath $KeyFile -Raw
      $secure = ConvertTo-SecureString $encrypted
      $plain = Convert-SecureStringToPlainText $secure
      if ($plain) { return $plain }
    } catch {
      Write-Host "De opgeslagen push-key kon niet worden gelezen; hij wordt opnieuw gevraagd." -ForegroundColor Yellow
    }
  }

  Write-Host "Eerste start: plak je TRAFFIC_PUSH_KEY. Hij wordt alleen versleuteld voor jouw Windows-account opgeslagen." -ForegroundColor Cyan
  $secure = Read-Host "TRAFFIC_PUSH_KEY" -AsSecureString
  $plain = Convert-SecureStringToPlainText $secure
  if (-not $plain) { throw "TRAFFIC_PUSH_KEY is leeg." }
  $secure | ConvertFrom-SecureString | Set-Content -LiteralPath $KeyFile -Encoding UTF8
  return $plain
}

function Find-Edge {
  $candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe")
    (Join-Path $env:LOCALAPPDATA "Microsoft\Edge\Application\msedge.exe")
  ) | Where-Object { $_ -and (Test-Path $_) }
  $candidates = @($candidates)
  if ($candidates.Count -gt 0) { return $candidates[0] }
  $command = Get-Command msedge.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  throw "Microsoft Edge is niet gevonden."
}

function Get-PageHook {
  if (Test-Path $HookLocal) { return Get-Content -LiteralPath $HookLocal -Raw -Encoding UTF8 }
  Write-Host "Collector-hook wordt uit GitHub geladen..." -ForegroundColor DarkGray
  return (Invoke-WebRequest -UseBasicParsing -Uri $HookRemote -TimeoutSec 20).Content
}

function Wait-ForDashboardTarget {
  param([int]$Port)
  $deadline = (Get-Date).AddMinutes(5)
  while ((Get-Date) -lt $deadline) {
    try {
      $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
      $target = $targets | Where-Object {
        $_.type -eq "page" -and $_.url -and $_.url.StartsWith($KibanaOrigin)
      } | Select-Object -First 1
      if ($target -and $target.webSocketDebuggerUrl) { return $target }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  throw "Het Traffic-dashboard werd niet binnen 5 minuten gevonden in Edge."
}

function Send-CdpMessage {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [int]$Id,
    [string]$Method,
    $Params = @{}
  )
  $json = @{ id = $Id; method = $Method; params = $Params } | ConvertTo-Json -Depth 40 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)
  $Socket.SendAsync($segment,[System.Net.WebSockets.WebSocketMessageType]::Text,$true,[Threading.CancellationToken]::None).GetAwaiter().GetResult()
}

function Receive-CdpMessage {
  param([System.Net.WebSockets.ClientWebSocket]$Socket)
  $buffer = New-Object byte[] 65536
  $memory = New-Object IO.MemoryStream
  try {
    do {
      $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
      $result = $Socket.ReceiveAsync($segment, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
      if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { return $null }
      if ($result.Count -gt 0) { $memory.Write($buffer, 0, $result.Count) }
    } until ($result.EndOfMessage)
    return [Text.Encoding]::UTF8.GetString($memory.ToArray())
  } finally { $memory.Dispose() }
}

function Push-Snapshot {
  param([string]$Payload,[string]$PushKey)
  $null = $Payload | ConvertFrom-Json
  $request = @{
    Uri = $PushUrl
    Method = "Post"
    Headers = @{ "x-traffic-push-key" = $PushKey }
    ContentType = "application/json"
    Body = $Payload
    TimeoutSec = 20
  }
  $result = Invoke-RestMethod @request
  $stamp = if ($result.receivedAt) { $result.receivedAt } else { (Get-Date).ToString("o") }
  Write-Host "TRAFFIC PUSH OK: 202  $stamp" -ForegroundColor Green
}

$pushKey = Get-TrafficPushKey
$edge = Find-Edge
$pageHook = Get-PageHook

$bridgeJs = @'
(() => {
  "use strict";
  if (window.__roosterTrafficPowerShellBridgeInstalled) return;
  window.__roosterTrafficPowerShellBridgeInstalled = true;
  const HOOK_SOURCE = "roosteroverzicht-traffic-kibana-hook";
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.source !== HOOK_SOURCE || message.type !== "traffic-snapshot") return;
    if (!message.snapshot || typeof message.snapshot !== "object") return;
    try { window.roosteroverzichtTrafficPush(JSON.stringify(message.snapshot)); } catch (_) {}
  });
})();
'@

$configObject = @{
  space = $Space
  dashboardId = $DashboardId
  dashboardVersion = $DashboardVersion
  trafficPanelId = $TrafficPanelId
}
$configJson = $configObject | ConvertTo-Json -Compress
$configJs = "window.postMessage({source:'roosteroverzicht-traffic-kibana-hook',type:'traffic-config',config:$configJson}, window.location.origin);"
$injectScript = $bridgeJs + "`n" + $pageHook + "`n" + $configJs

Write-Host "Traffic Collector zonder extensie" -ForegroundColor Cyan
Write-Host "Edge wordt gestart met een apart Traffic-profiel." -ForegroundColor DarkGray
Write-Host "Bij de eerste start kan de externe omgeving vragen om in te loggen; doe dat in het geopende Edge-venster." -ForegroundColor DarkGray

$edgeArgs = @(
  "--remote-debugging-port=$DebugPort"
  "--user-data-dir=`"$ProfileDir`""
  "--no-first-run"
  "--no-default-browser-check"
  "--new-window"
  $DashboardUrl
)

Start-Process -FilePath $edge -ArgumentList $edgeArgs | Out-Null

$target = Wait-ForDashboardTarget -Port $DebugPort
Write-Host "Dashboard gevonden. Collector wordt vóór de volgende paginalaad geïnjecteerd..." -ForegroundColor Cyan

$socket = New-Object System.Net.WebSockets.ClientWebSocket
$socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

$nextId = 1
Send-CdpMessage -Socket $socket -Id $nextId -Method "Runtime.enable"; $nextId++
Send-CdpMessage -Socket $socket -Id $nextId -Method "Page.enable"; $nextId++
Send-CdpMessage -Socket $socket -Id $nextId -Method "Runtime.addBinding" -Params @{ name = "roosteroverzichtTrafficPush" }; $nextId++
Send-CdpMessage -Socket $socket -Id $nextId -Method "Page.addScriptToEvaluateOnNewDocument" -Params @{ source = $injectScript }; $nextId++
Send-CdpMessage -Socket $socket -Id $nextId -Method "Page.reload" -Params @{ ignoreCache = $false }; $nextId++

Write-Host "Collector actief. Laat dit PowerShell-venster open staan." -ForegroundColor Green
Write-Host "Ctrl+C stopt alleen de lokale collector; Edge blijft open." -ForegroundColor DarkGray

try {
  while ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    $raw = Receive-CdpMessage -Socket $socket
    if (-not $raw) { break }
    try { $message = $raw | ConvertFrom-Json } catch { continue }
    if ($message.method -ne "Runtime.bindingCalled") { continue }
    if ($message.params.name -ne "roosteroverzichtTrafficPush") { continue }
    if (-not $message.params.payload) { continue }
    try { Push-Snapshot -Payload ([string]$message.params.payload) -PushKey $pushKey }
    catch { Write-Host ("TRAFFIC PUSH FOUT: " + $_.Exception.Message) -ForegroundColor Red }
  }
} finally {
  if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    try {
      $socket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,"collector stopped",[Threading.CancellationToken]::None).GetAwaiter().GetResult()
    } catch { }
  }
  $socket.Dispose()
}
