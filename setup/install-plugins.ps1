# ============================================================
# GitHub Copilot Config - Instalacion de plugins
# ============================================================
# Restaura los plugins declarados en plugins/plugins.json
# registrandolos en ~/.copilot/config.json y ~/.copilot/settings.json.
#
# Uso:
#   .\setup\install-plugins.ps1
#   .\setup\install-plugins.ps1 -WhatIf     # solo mostrar cambios
#
# Nota: este script registra los plugins. La descarga real del
# contenido la hace GitHub Copilot al arrancar, o puedes usar
# /plugin install <nombre> desde el chat si algo no aparece.
# ============================================================

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$RepoRoot = (Split-Path $PSScriptRoot -Parent)
)

$CopilotDir   = "$env:USERPROFILE\.copilot"
$ConfigPath   = "$CopilotDir\config.json"
$SettingsPath = "$CopilotDir\settings.json"
$ManifestPath = "$RepoRoot\plugins\plugins.json"

Write-Host ""
Write-Host "============================================"
Write-Host " Copilot Config - Instalador de plugins"
Write-Host "============================================"
Write-Host ""

if (-not (Test-Path $CopilotDir)) {
    Write-Host "[ERROR] No se encuentra la carpeta de Copilot: $CopilotDir"
    exit 1
}

if (-not (Test-Path $ManifestPath)) {
    Write-Host "[ERROR] No se encuentra el manifiesto: $ManifestPath"
    exit 1
}

$manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json

# --- config.json (installedPlugins) ---
# El archivo lleva comentarios de linea al inicio: se filtran antes de parsear.
if (Test-Path $ConfigPath) {
    $raw = (Get-Content $ConfigPath) | Where-Object { $_ -notmatch '^\s*//' } | Out-String
    $config = $raw | ConvertFrom-Json
} else {
    $config = [PSCustomObject]@{ installedPlugins = @() }
}

if (-not $config.PSObject.Properties['installedPlugins']) {
    $config | Add-Member -NotePropertyName installedPlugins -NotePropertyValue @()
}

$installed = @($config.installedPlugins)
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$added = 0
$kept = 0

foreach ($plugin in $manifest.plugins) {
    $existing = $installed | Where-Object {
        $_.name -eq $plugin.name -and $_.marketplace -eq $plugin.marketplace
    }

    if ($existing) {
        Write-Host "  [=] $($plugin.name)@$($plugin.marketplace) (ya registrado)"
        $kept++
        continue
    }

    $entry = [PSCustomObject]@{
        name         = $plugin.name
        marketplace  = $plugin.marketplace
        installed_at = $timestamp
        enabled      = $true
        version      = $plugin.version
        cache_path   = "$CopilotDir\installed-plugins\$($plugin.marketplace)\$($plugin.name)"
    }

    if ($PSCmdlet.ShouldProcess("$($plugin.name)@$($plugin.marketplace)", "registrar plugin")) {
        $installed += $entry
        Write-Host "  [OK] $($plugin.name)@$($plugin.marketplace) v$($plugin.version)"
        $added++
    }
}

$config.installedPlugins = $installed

if ($PSCmdlet.ShouldProcess($ConfigPath, "guardar config.json")) {
    $header = "// User settings belong in settings.json.`n// This file is managed automatically."
    $body   = $config | ConvertTo-Json -Depth 10
    "$header`n$body" | Set-Content $ConfigPath -Encoding UTF8
}

Write-Host ""
Write-Host "config.json: $added nuevos, $kept ya presentes"

# --- settings.json (enabledPlugins) ---
if (Test-Path $SettingsPath) {
    $settings = Get-Content $SettingsPath -Raw | ConvertFrom-Json
} else {
    $settings = [PSCustomObject]@{}
}

if (-not $settings.PSObject.Properties['enabledPlugins']) {
    $settings | Add-Member -NotePropertyName enabledPlugins -NotePropertyValue ([PSCustomObject]@{})
}

foreach ($plugin in $manifest.plugins) {
    $key = "$($plugin.name)@$($plugin.marketplace)"
    if ($PSCmdlet.ShouldProcess($key, "habilitar plugin")) {
        $settings.enabledPlugins | Add-Member -NotePropertyName $key -NotePropertyValue $true -Force
    }
}

if ($PSCmdlet.ShouldProcess($SettingsPath, "guardar settings.json")) {
    $settings | ConvertTo-Json -Depth 10 | Set-Content $SettingsPath -Encoding UTF8
}

Write-Host "settings.json: $($manifest.plugins.Count) plugins habilitados"

# --- Dependencias externas ---
Write-Host ""
Write-Host "Dependencias externas requeridas por algunos plugins:"
$deps = @{
    "docker" = "MCP de awesome-copilot (docker run ghcr.io/microsoft/mcp-dotnet-samples/awesome-copilot)"
    "node"   = "MCP flowagent (power-automate) y servidores npx"
    "npx"    = "MCP powerbi-modeling-mcp"
}
foreach ($dep in $deps.Keys) {
    $found = Get-Command $dep -ErrorAction SilentlyContinue
    if ($found) {
        Write-Host "  [OK] $dep - $($deps[$dep])"
    } else {
        Write-Host "  [!]  $dep NO encontrado - $($deps[$dep])"
    }
}

Write-Host ""
Write-Host "============================================"
Write-Host " Listo. Reinicia GitHub Copilot."
Write-Host "============================================"
Write-Host ""
Write-Host "Si algun plugin no aparece tras reiniciar, instalalo"
Write-Host "desde el chat con: /plugin install <nombre>"
Write-Host ""
