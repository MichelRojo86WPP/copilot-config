<#
.SYNOPSIS
    Cambia el perfil de plugins activos para reducir el consumo de tokens.

.DESCRIPTION
    Cada plugin instalado inyecta sus definiciones de herramientas en el
    contexto del agente en CADA llamada al modelo, se usen o no. Medido en
    este entorno: los plugins de Power Platform / M365 anaden ~39.000 tokens
    fijos por llamada, lo que supone en torno al 25% del gasto de entrada
    cuando se trabaja en analitica y no se toca ninguna de esas herramientas.

    Este script activa solo los plugins relevantes para el tipo de trabajo,
    dejando el resto instalados pero inactivos (no se pierden: volver a
    activarlos es cambiar de perfil).

    IMPORTANTE: el cambio solo afecta a SESIONES NUEVAS. Los plugins se cargan
    al arrancar la sesion, asi que la que tengas abierta seguira con los de
    antes aunque reinicies la aplicacion (hay procesos que sobreviven).
    Verifica con 'copilot plugin list': deben aparecer como [disabled].

.PARAMETER Perfil
    analytics  Analitica avanzada (CausalImpact, GeoX, Meridian MMM, Power BI
               solo lectura). Ningun plugin activo: las skills y las
               extensiones propias no son plugins y siguen disponibles.
    powerbi    Desarrollo Power BI / Fabric. Activa powerbi-authoring y
               power-bi-development.
    m365       Agentes M365 / Copilot Studio / Power Automate.
    full       Todos los plugins (estado original).
    status     Solo muestra el estado actual, no modifica nada.

.EXAMPLE
    .\switch-profile.ps1 analytics
    Deja el entorno en modo analitica. Es el perfil recomendado para el
    trabajo en advanced_analytics_melia.

.EXAMPLE
    .\switch-profile.ps1 status
    Muestra que perfil esta activo y el ahorro estimado.
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('analytics', 'powerbi', 'm365', 'full', 'status')]
    [string]$Perfil = 'status'
)

$ErrorActionPreference = 'Stop'

$RutaSettings = Join-Path $env:USERPROFILE '.copilot\settings.json'
$RutaConfig   = Join-Path $env:USERPROFILE '.copilot\config.json'

# --- Definicion de perfiles ---------------------------------------------
# Cada perfil lista los plugins que deben quedar ACTIVOS. El resto se
# desactiva. Los nombres son los identificadores 'nombre@marketplace' que
# usa Copilot en settings.json.
$PERFILES = @{
    'analytics' = @()   # ninguno: el trabajo analitico no usa plugins
    'powerbi'   = @(
        'powerbi-authoring@copilot-plugins',
        'power-bi-development@awesome-copilot'
    )
    'm365'      = @(
        'microsoft-365-agents-toolkit@copilot-plugins',
        'power-automate@copilot-plugins',
        'mcp-m365-copilot@awesome-copilot',
        'skills-for-copilot-studio@awesome-copilot'
    )
    'full'      = @('*')   # comodin: todos
}

# Coste fijo aproximado por llamada de cada plugin, en tokens.
# Medido con tiktoken (cl100k_base) sobre las definiciones reales.
$COSTE_TOKENS = @{
    'power-automate@copilot-plugins'           = 22815  # flowagent, ~45 tools
    'powerbi-authoring@copilot-plugins'        = 15420  # powerbi-modeling-mcp
    'skills-for-copilot-studio@awesome-copilot' = 1200
    'power-bi-development@awesome-copilot'      =  400
    'ai-team-orchestration@awesome-copilot'     =  300
    'mcp-m365-copilot@awesome-copilot'          =  150
    'microsoft-365-agents-toolkit@copilot-plugins' = 500
    'awesome-copilot@awesome-copilot'           =  200
    'ai-ready@awesome-copilot'                  =   50
}

function Get-PluginsInstalados {
    <#  Devuelve la lista de identificadores 'nombre@marketplace' de todos
        los plugins instalados, leidos de config.json.  #>
    if (-not (Test-Path $RutaConfig)) { return @() }
    # config.json empieza con comentarios //, hay que retirarlos antes de parsear
    $txt = Get-Content $RutaConfig -Raw -Encoding UTF8
    $txt = ($txt -split "`n" | Where-Object { $_.TrimStart() -notlike '//*' }) -join "`n"
    $cfg = $txt | ConvertFrom-Json
    return $cfg.installedPlugins | ForEach-Object { "$($_.name)@$($_.marketplace)" }
}

function Get-EstadoActual {
    <#  Devuelve un hashtable identificador -> bool con el estado activo.  #>
    $estado = @{}
    if (Test-Path $RutaSettings) {
        $s = Get-Content $RutaSettings -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($s.enabledPlugins) {
            $s.enabledPlugins.PSObject.Properties | ForEach-Object {
                $estado[$_.Name] = [bool]$_.Value
            }
        }
    }
    return $estado
}

function Show-Estado {
    <#  Imprime el estado actual y el coste fijo estimado por llamada.  #>
    param([hashtable]$Estado)

    $activos = @($Estado.Keys | Where-Object { $Estado[$_] } | Sort-Object)
    $total = 0

    Write-Host ''
    Write-Host '  Plugins activos:' -ForegroundColor Cyan
    if ($activos.Count -eq 0) {
        Write-Host '    (ninguno)' -ForegroundColor DarkGray
    }
    foreach ($a in $activos) {
        $c = if ($COSTE_TOKENS.ContainsKey($a)) { $COSTE_TOKENS[$a] } else { 200 }
        $total += $c
        $col = if ($c -ge 10000) { 'Yellow' } else { 'Gray' }
        Write-Host ('    {0,-46} ~{1,6:N0} tok/llamada' -f $a, $c) -ForegroundColor $col
    }

    Write-Host ''
    Write-Host ('  Coste fijo por llamada: ~{0:N0} tokens' -f $total) -ForegroundColor $(if ($total -ge 10000) { 'Yellow' } else { 'Green' })

    # Proyeccion sobre un volumen de trabajo tipico
    $LLAMADAS_DIA = 100
    Write-Host ('  Proyeccion a {0} llamadas/dia: ~{1:N0} tokens/dia solo en definiciones' -f $LLAMADAS_DIA, ($total * $LLAMADAS_DIA)) -ForegroundColor DarkGray
    Write-Host ''
}

# --- Ejecucion ------------------------------------------------------------

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ' Perfil de herramientas de Copilot' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan

$instalados = Get-PluginsInstalados
if ($instalados.Count -eq 0) {
    Write-Host '  [!] No se encontraron plugins instalados.' -ForegroundColor Yellow
    exit 0
}

$estadoActual = Get-EstadoActual

if ($Perfil -eq 'status') {
    Write-Host ''
    Write-Host "  Plugins instalados: $($instalados.Count)" -ForegroundColor Gray
    Show-Estado -Estado $estadoActual
    Write-Host '  Para cambiar:  .\switch-profile.ps1 analytics' -ForegroundColor DarkGray
    Write-Host ''
    exit 0
}

# Construir el nuevo estado: activo solo lo que pide el perfil
$deseados = $PERFILES[$Perfil]
$nuevo = [ordered]@{}
foreach ($p in ($instalados | Sort-Object)) {
    $nuevo[$p] = ($deseados -contains '*') -or ($deseados -contains $p)
}

# Respaldo antes de escribir, para poder revertir
$bak = "$RutaSettings.bak"
if (Test-Path $RutaSettings) { Copy-Item $RutaSettings $bak -Force }

# Preservar cualquier otra clave de settings.json que no sea enabledPlugins
$settings = if (Test-Path $RutaSettings) {
    Get-Content $RutaSettings -Raw -Encoding UTF8 | ConvertFrom-Json
} else {
    [PSCustomObject]@{}
}
$settings | Add-Member -NotePropertyName 'enabledPlugins' -NotePropertyValue $nuevo -Force

# UTF8 sin BOM: Copilot no parsea bien un settings.json con BOM
$json = $settings | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($RutaSettings, $json, (New-Object System.Text.UTF8Encoding $false))

Write-Host ''
Write-Host "  Perfil aplicado: $Perfil" -ForegroundColor Green
Show-Estado -Estado $nuevo

# Comparar con el estado previo para cuantificar el cambio
$antes = 0
$estadoActual.Keys | Where-Object { $estadoActual[$_] } | ForEach-Object {
    $antes += $(if ($COSTE_TOKENS.ContainsKey($_)) { $COSTE_TOKENS[$_] } else { 200 })
}
$despues = 0
$nuevo.Keys | Where-Object { $nuevo[$_] } | ForEach-Object {
    $despues += $(if ($COSTE_TOKENS.ContainsKey($_)) { $COSTE_TOKENS[$_] } else { 200 })
}
$delta = $antes - $despues
if ($delta -gt 0) {
    Write-Host ('  Ahorro: ~{0:N0} tokens por llamada ({1:N0} -> {2:N0})' -f $delta, $antes, $despues) -ForegroundColor Green
} elseif ($delta -lt 0) {
    Write-Host ('  Incremento: ~{0:N0} tokens por llamada' -f [math]::Abs($delta)) -ForegroundColor Yellow
}

Write-Host ''
Write-Host '  Solo afecta a SESIONES NUEVAS: abre una nueva, no vale reiniciar.' -ForegroundColor Yellow
Write-Host '  Verifica con:  copilot plugin list   (deben salir [disabled])' -ForegroundColor Yellow
Write-Host "  (respaldo del estado anterior en settings.json.bak)" -ForegroundColor DarkGray
Write-Host ''
