# ============================================================
# GitHub Copilot Config - Instalacion automatica (Windows)
# ============================================================
# Ejecutar desde PowerShell como administrador:
#   .\setup\install.ps1
#
# Que hace este script:
#   1. Instala las skills custom en el plugin superpowers global
#   2. Instala la configuracion MCP global (context7)
#   3. Instala el proveedor NVIDIA NIM en la base de datos de Copilot
#   4. Configura las API keys
# ============================================================

param(
    [string]$NvidiaApiKey = "",
    [string]$RepoRoot = (Split-Path $PSScriptRoot -Parent)
)

$CopilotDir = "$env:USERPROFILE\.copilot"
$SuperpowersDir = "$CopilotDir\plugins\superpowers\skills"

Write-Host ""
Write-Host "============================================"
Write-Host " GitHub Copilot Config - Instalador"
Write-Host "============================================"
Write-Host ""

# --- Verificaciones previas ---
if (-not (Test-Path $CopilotDir)) {
    Write-Host "[ERROR] No se encuentra la carpeta de Copilot: $CopilotDir"
    Write-Host "        Asegurate de tener GitHub Copilot instalado."
    exit 1
}

if (-not (Test-Path $SuperpowersDir)) {
    Write-Host "[ERROR] No se encuentra el plugin superpowers: $SuperpowersDir"
    Write-Host "        El plugin superpowers debe estar instalado en Copilot."
    exit 1
}

# --- PASO 1: Instalar skills ---
Write-Host "[1/4] Instalando skills custom..."

$SkillsSrc = "$RepoRoot\skills"
$CustomSkills = @(
    "data-scientist",
    "data-analyst",
    "causal-impact",
    "ml-ops-engineer",
    "runbook-generator",
    "release-manager",
    "accelerated-computing-cudf"
)

$installed = 0
foreach ($skill in $CustomSkills) {
    $src = "$SkillsSrc\$skill"
    $dst = "$SuperpowersDir\$skill"
    
    if (Test-Path $src) {
        New-Item -ItemType Directory -Path $dst -Force | Out-Null
        Copy-Item "$src\*" $dst -Recurse -Force
        Write-Host "  [OK] $skill"
        $installed++
    } else {
        Write-Host "  [!]  $skill (no encontrado en $src)"
    }
}
Write-Host "      $installed/$($CustomSkills.Count) skills instaladas"

# --- PASO 2: Configurar MCP global ---
Write-Host ""
Write-Host "[2/4] Configurando MCP global (context7)..."

$McpSrc = "$RepoRoot\mcp\mcp.json"
$McpDst = "$CopilotDir\mcp.json"

if (Test-Path $McpSrc) {
    if (Test-Path $McpDst) {
        # Merge: leer ambos y combinar los servidores
        $existing = Get-Content $McpDst -Raw | ConvertFrom-Json
        $new = Get-Content $McpSrc -Raw | ConvertFrom-Json
        
        # Agregar servidores del nuevo al existente
        $new.mcpServers.PSObject.Properties | ForEach-Object {
            $existing.mcpServers | Add-Member -NotePropertyName $_.Name -NotePropertyValue $_.Value -Force
        }
        $existing | ConvertTo-Json -Depth 10 | Set-Content $McpDst -Encoding UTF8
        Write-Host "  [OK] mcp.json actualizado (merge con config existente)"
    } else {
        Copy-Item $McpSrc $McpDst
        Write-Host "  [OK] mcp.json instalado"
    }
} else {
    Write-Host "  [!]  mcp.json no encontrado en $McpSrc"
}

# --- PASO 3: Instalar proveedor NVIDIA NIM ---
Write-Host ""
Write-Host "[3/4] Configurando proveedor NVIDIA NIM..."

$DbPath = "$CopilotDir\data.db"
if (-not (Test-Path $DbPath)) {
    Write-Host "  [!]  data.db no encontrado. Copilot debe abrirse al menos una vez."
} else {
    # Usar el script Python para instalar el proveedor
    $nvSetupScript = "$RepoRoot\setup\install-nvidia-provider.py"
    
    if ($NvidiaApiKey -ne "") {
        Write-Host "  -> Usando API key proporcionada"
        python $nvSetupScript --api-key $NvidiaApiKey --db $DbPath
    } else {
        Write-Host "  [!]  No se proporcionó NVIDIA_API_KEY."
        Write-Host "       Ejecuta de nuevo con: .\install.ps1 -NvidiaApiKey 'nvapi-TU_KEY'"
        Write-Host "       O edita setup\install-nvidia-provider.py con tu key."
    }
}

# --- PASO 4: Instalar script nvidia_gen.py ---
Write-Host ""
Write-Host "[4/4] Instalando script de generacion de imagenes..."

$ScriptSrc = "$RepoRoot\scripts\nvidia_gen.py"
$ScriptDst = "$env:USERPROFILE\nvidia_gen.py"

if (Test-Path $ScriptSrc) {
    Copy-Item $ScriptSrc $ScriptDst -Force
    Write-Host "  [OK] nvidia_gen.py instalado en $ScriptDst"
    Write-Host "       Uso: python $ScriptDst 'tu prompt aqui'"
} else {
    Write-Host "  [!]  Script no encontrado: $ScriptSrc"
}

# --- Resumen ---
Write-Host ""
Write-Host "============================================"
Write-Host " Instalacion completada"
Write-Host "============================================"
Write-Host ""
Write-Host "SIGUIENTE PASO: Reinicia GitHub Copilot para"
Write-Host "que cargue las nuevas skills y configuracion."
Write-Host ""
Write-Host "Comandos utiles:"
Write-Host "  Generar imagen: python ~/nvidia_gen.py 'prompt'"
Write-Host "  Ver modelos:    python ~/nvidia_gen.py --list-models"
Write-Host ""
