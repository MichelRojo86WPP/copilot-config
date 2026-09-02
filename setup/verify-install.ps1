# ============================================================
# GitHub Copilot Config - Verificacion de sincronizacion
# ============================================================
# Compara lo que hay instalado en ~/.copilot con lo que declara
# este repositorio, y reporta cualquier divergencia.
#
# Motivo: este repo es la fuente unica del conocimiento portable.
# Si la copia instalada en la maquina se queda atras, se trabaja
# con una version obsoleta de una skill o extension sin notarlo
# (por ejemplo, con una correccion de API ya resuelta en el repo).
#
# Uso:
#   .\setup\verify-install.ps1
#
# Codigo de salida:
#   0 = todo sincronizado
#   1 = hay divergencias (apto para CI o para un hook de git)
# ============================================================

param(
    [string]$RepoRoot = (Split-Path $PSScriptRoot -Parent)
)

$CopilotDir     = "$env:USERPROFILE\.copilot"
$SkillsDir      = "$CopilotDir\skills"
$SuperpowersDir = "$CopilotDir\plugins\superpowers\skills"
$ExtensionsDir  = "$CopilotDir\extensions"

# --- Helper: huella de un directorio ---
# Calcula un hash agregado a partir del nombre y contenido de cada
# fichero, de forma que detecta tanto cambios de contenido como
# ficheros anadidos o eliminados. Se ordena por ruta relativa para
# que la huella sea estable entre maquinas.
#
# Los ficheros de texto se normalizan a LF antes de hashear: git
# convierte los finales de linea al hacer checkout en Windows, de modo
# que un hash byte a byte reportaria divergencias inexistentes entre el
# repositorio y la copia instalada.
function Get-BundleHash {
    param([string]$Path)

    if (-not (Test-Path $Path)) { return $null }

    # Extensiones tratadas como texto a efectos de normalizacion.
    $textExt = @('.md', '.mjs', '.js', '.json', '.py', '.ps1', '.txt', '.yml', '.yaml')
    $sha     = [System.Security.Cryptography.SHA256]::Create()

    $sb = New-Object System.Text.StringBuilder
    Get-ChildItem $Path -Recurse -File |
        Sort-Object { $_.FullName.Substring($Path.Length) } |
        ForEach-Object {
            $rel = $_.FullName.Substring($Path.Length).TrimStart('\')

            if ($textExt -contains $_.Extension.ToLower()) {
                # Normaliza CRLF y CR sueltos a LF antes de calcular el hash.
                $text  = [System.IO.File]::ReadAllText($_.FullName)
                $text  = $text -replace "`r`n", "`n" -replace "`r", "`n"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
                $h     = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '')
            } else {
                $h = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
            }

            [void]$sb.AppendLine("$rel|$h")
        }

    $sha.Dispose()

    if ($sb.Length -eq 0) { return $null }

    $bytes  = [System.Text.Encoding]::UTF8.GetBytes($sb.ToString())
    $stream = New-Object System.IO.MemoryStream(,$bytes)
    return (Get-FileHash -InputStream $stream -Algorithm SHA256).Hash
}

# --- Helper: compara una familia de bundles (skills o extensiones) ---
# Devuelve el numero de divergencias encontradas.
function Compare-Family {
    param(
        [string]$SourceRoot,   # carpeta en el repo
        [string]$InstalledRoot,# carpeta en ~/.copilot
        [string]$Marker,       # fichero que identifica un bundle valido
        [string]$Label
    )

    Write-Host ""
    Write-Host "--- $Label ---"

    if (-not (Test-Path $SourceRoot)) {
        Write-Host "  [!]  No existe en el repo: $SourceRoot"
        return 0
    }

    $bundles = Get-ChildItem $SourceRoot -Directory |
        Where-Object { Test-Path (Join-Path $_.FullName $Marker) }

    $issues = 0
    foreach ($b in $bundles) {
        $installedPath = Join-Path $InstalledRoot $b.Name
        $srcHash = Get-BundleHash $b.FullName
        $dstHash = Get-BundleHash $installedPath

        if ($null -eq $dstHash) {
            Write-Host "  [FALTA]    $($b.Name)"
            $issues++
        } elseif ($srcHash -ne $dstHash) {
            Write-Host "  [DESFASE]  $($b.Name)"
            $issues++
        } else {
            Write-Host "  [OK]       $($b.Name)"
        }
    }

    Write-Host "      $($bundles.Count - $issues)/$($bundles.Count) sincronizados"
    return $issues
}

Write-Host ""
Write-Host "============================================"
Write-Host " Verificacion de sincronizacion"
Write-Host "============================================"

$total = 0

# La ruta oficial es la que decide si la instalacion es correcta.
$total += Compare-Family -SourceRoot "$RepoRoot\skills" `
                         -InstalledRoot $SkillsDir `
                         -Marker 'SKILL.md' -Label 'Skills (~/.copilot/skills)'

$total += Compare-Family -SourceRoot "$RepoRoot\extensions" `
                         -InstalledRoot $ExtensionsDir `
                         -Marker 'extension.mjs' -Label 'Extensiones'

# El espejo en superpowers es opcional: solo se verifica si el plugin existe,
# y sus divergencias no hacen fallar la verificacion.
if (Test-Path $SuperpowersDir) {
    $mirror = Compare-Family -SourceRoot "$RepoRoot\skills" `
                             -InstalledRoot $SuperpowersDir `
                             -Marker 'SKILL.md' -Label 'Espejo superpowers (opcional)'
    if ($mirror -gt 0) {
        Write-Host "      aviso: el espejo tiene $mirror divergencia(s), no afecta al resultado"
    }
}

Write-Host ""
Write-Host "============================================"
if ($total -eq 0) {
    Write-Host " Todo sincronizado"
    Write-Host "============================================"
    Write-Host ""
    exit 0
} else {
    Write-Host " $total divergencia(s) detectada(s)"
    Write-Host "============================================"
    Write-Host ""
    Write-Host "Para sincronizar:  .\setup\install.ps1"
    Write-Host ""
    exit 1
}
