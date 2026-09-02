# ============================================================
# GitHub Copilot Config - Instalacion automatica (Windows)
# ============================================================
# Ejecutar desde PowerShell como administrador:
#   .\setup\install.ps1
#
# Que hace este script:
#   1. Instala las skills custom en el plugin superpowers global
#   2. Instala las extensiones de agente en el scope de usuario
#   3. Instala la configuracion MCP global (context7)
#   4. Instala el proveedor NVIDIA NIM en la base de datos de Copilot
#   5. Instala el script de generacion de imagenes
#
# Las skills y extensiones se descubren dinamicamente: cualquier carpeta
# nueva en skills/ (con SKILL.md) o en extensions/ (con extension.mjs) se
# instala sin tocar este script.
# ============================================================

param(
    [string]$NvidiaApiKey = "",
    [string]$RepoRoot = (Split-Path $PSScriptRoot -Parent),
    # Muestra que se instalaria sin escribir nada en disco.
    [switch]$DryRun
)

$CopilotDir = "$env:USERPROFILE\.copilot"
$SuperpowersDir = "$CopilotDir\plugins\superpowers\skills"
$ExtensionsDir  = "$CopilotDir\extensions"

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

# --- Helper: instala un directorio de origen en destino ---
# Devuelve $true si la instalacion se realizo (o se simulo con -DryRun).
function Install-Bundle {
    param(
        [string]$Source,      # carpeta origen dentro del repo
        [string]$Destination, # carpeta destino en ~/.copilot
        [string]$Label        # nombre a mostrar
    )

    if ($DryRun) {
        Write-Host "  [DRY] $Label"
        return $true
    }

    # Se limpia el destino antes de copiar para que los ficheros eliminados
    # en el repo no sobrevivan en la instalacion local.
    if (Test-Path $Destination) {
        Remove-Item $Destination -Recurse -Force
    }
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    Copy-Item "$Source\*" $Destination -Recurse -Force
    Write-Host "  [OK]  $Label"
    return $true
}

# --- PASO 1: Instalar skills ---
Write-Host "[1/5] Instalando skills custom..."

$SkillsSrc = "$RepoRoot\skills"

# Descubrimiento dinamico: se instala toda carpeta que contenga un SKILL.md.
# Antes habia una lista fija de 7 nombres que dejaba fuera al resto del repo.
$SkillDirs = @()
if (Test-Path $SkillsSrc) {
    $SkillDirs = Get-ChildItem $SkillsSrc -Directory |
        Where-Object { Test-Path (Join-Path $_.FullName 'SKILL.md') }
}

$installed = 0
foreach ($skill in $SkillDirs) {
    if (Install-Bundle -Source $skill.FullName `
                       -Destination "$SuperpowersDir\$($skill.Name)" `
                       -Label $skill.Name) {
        $installed++
    }
}

if ($SkillDirs.Count -eq 0) {
    Write-Host "  [!]  No se encontraron skills en $SkillsSrc"
} else {
    Write-Host "      $installed/$($SkillDirs.Count) skills instaladas"
}

# --- PASO 2: Instalar extensiones de agente ---
Write-Host ""
Write-Host "[2/5] Instalando extensiones de agente..."

$ExtSrc = "$RepoRoot\extensions"

# Descubrimiento dinamico: toda carpeta con extension.mjs es una extension.
# Instalarlas en el scope de usuario hace que esten disponibles en cualquier
# repositorio, no solo en aquel donde vivan como extension de proyecto.
$ExtDirs = @()
if (Test-Path $ExtSrc) {
    $ExtDirs = Get-ChildItem $ExtSrc -Directory |
        Where-Object { Test-Path (Join-Path $_.FullName 'extension.mjs') }
}

if (-not $DryRun) {
    New-Item -ItemType Directory -Path $ExtensionsDir -Force | Out-Null
}

$extInstalled = 0
foreach ($ext in $ExtDirs) {
    if (Install-Bundle -Source $ext.FullName `
                       -Destination "$ExtensionsDir\$($ext.Name)" `
                       -Label $ext.Name) {
        $extInstalled++
    }
}

if ($ExtDirs.Count -eq 0) {
    Write-Host "  [!]  No se encontraron extensiones en $ExtSrc"
} else {
    Write-Host "      $extInstalled/$($ExtDirs.Count) extensiones instaladas"
}

# --- PASO 3: Configurar MCP global ---
Write-Host ""
Write-Host "[3/5] Configurando MCP global (context7)..."

$McpSrc = "$RepoRoot\mcp\mcp.json"
$McpDst = "$CopilotDir\mcp.json"

if (Test-Path $McpSrc) {
    if ($DryRun) {
        Write-Host "  [DRY] mcp.json"
    } elseif (Test-Path $McpDst) {
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

# --- PASO 4: Instalar proveedor NVIDIA NIM ---
Write-Host ""
Write-Host "[4/5] Configurando proveedor NVIDIA NIM..."

$DbPath = "$CopilotDir\data.db"
if ($DryRun) {
    Write-Host "  [DRY] proveedor NVIDIA NIM"
} elseif (-not (Test-Path $DbPath)) {
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

# --- PASO 5: Instalar script nvidia_gen.py ---
Write-Host ""
Write-Host "[5/5] Instalando script de generacion de imagenes..."

$ScriptSrc = "$RepoRoot\scripts\nvidia_gen.py"
$ScriptDst = "$env:USERPROFILE\nvidia_gen.py"

if (-not (Test-Path $ScriptSrc)) {
    Write-Host "  [!]  Script no encontrado: $ScriptSrc"
} elseif ($DryRun) {
    Write-Host "  [DRY] nvidia_gen.py"
} else {
    Copy-Item $ScriptSrc $ScriptDst -Force
    Write-Host "  [OK] nvidia_gen.py instalado en $ScriptDst"
    Write-Host "       Uso: python $ScriptDst 'tu prompt aqui'"
}

# --- Resumen ---
Write-Host ""
Write-Host "============================================"
Write-Host " Instalacion completada"
Write-Host "============================================"
Write-Host ""
Write-Host "  Skills:      $installed"
Write-Host "  Extensiones: $extInstalled"
Write-Host ""
if ($DryRun) {
    Write-Host "MODO DRY-RUN: no se ha escrito nada en disco."
    Write-Host ""
} else {
    Write-Host "SIGUIENTE PASO: Reinicia GitHub Copilot para"
    Write-Host "que cargue las nuevas skills, extensiones y configuracion."
    Write-Host ""
}
Write-Host "Comandos utiles:"
Write-Host "  Generar imagen: python ~/nvidia_gen.py 'prompt'"
Write-Host "  Ver modelos:    python ~/nvidia_gen.py --list-models"
Write-Host ""
