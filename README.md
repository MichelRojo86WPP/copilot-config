# GitHub Copilot Config

Repositorio de configuración personal de GitHub Copilot — skills, MCP servers, modelos de IA y scripts.

## Contenido

```
copilot-config/
├── skills/                     # Skills instaladas globalmente en Copilot
│   ├── data-scientist/         # Agente data scientist con Python/pandas
│   ├── data-analyst/           # Analista de datos exploratorio
│   ├── causal-impact/          # Analisis de impacto causal
│   ├── ml-ops-engineer/        # Ingenieria MLOps y despliegue de modelos
│   ├── runbook-generator/      # Generador de runbooks operacionales
│   ├── release-manager/        # Gestion de releases y changelogs
│   └── accelerated-computing-cudf/  # NVIDIA cuDF - GPU DataFrames (oficial NVIDIA)
├── plugins/
│   └── plugins.json            # Inventario de plugins de los marketplaces de Copilot
├── mcp/
│   └── mcp.json                # Configuracion MCP global (context7)
├── scripts/
│   └── nvidia_gen.py           # Generador de imagenes/video con IA (multi-proveedor)
├── setup/
│   ├── install.ps1             # Instalador automatico (Windows PowerShell)
│   ├── install-plugins.ps1     # Restaura los plugins de plugins.json
│   └── install-nvidia-provider.py  # Instala NVIDIA NIM en Copilot DB
└── docs/
    ├── nvidia-nim-setup.md     # Guia NVIDIA NIM
    ├── skills-guide.md         # Guia de uso de skills
    ├── plugins-guide.md        # Guia de plugins, agentes y MCP servers
    └── model-catalog.md        # Catalogo de modelos NVIDIA
```

## Instalacion rapida

### Opcion 1: Script automatico (Windows)

```powershell
# Clonar el repo
git clone https://github.com/MichelRojo86WPP/copilot-config.git
cd copilot-config

# Ejecutar instalador (incluye tu NVIDIA API key)
.\setup\install.ps1 -NvidiaApiKey "nvapi-TU_KEY_AQUI"

# Restaurar los plugins de los marketplaces de Copilot
.\setup\install-plugins.ps1
```

### Opcion 2: Manual

```powershell
# 1. Copiar skills al directorio global de superpowers
$dst = "$env:USERPROFILE\.copilot\plugins\superpowers\skills"
Copy-Item skills\* $dst -Recurse -Force

# 2. Instalar MCP global
Copy-Item mcp\mcp.json "$env:USERPROFILE\.copilot\mcp.json"

# 3. Instalar proveedor NVIDIA NIM
python setup\install-nvidia-provider.py --api-key "nvapi-TU_KEY"

# 4. Registrar los plugins de los marketplaces
.\setup\install-plugins.ps1

# 5. Reiniciar Copilot
```

## Skills disponibles

| Skill | Descripcion | Origen |
|-------|-------------|--------|
| `data-scientist` | Analisis exploratorio, ML, visualizacion con Python | Proyecto WPPOpen |
| `data-analyst` | SQL, pandas, dashboards, reportes de negocio | Proyecto WPPOpen |
| `causal-impact` | Analisis causal, A/B testing, diferencias en diferencias | Proyecto WPPOpen |
| `ml-ops-engineer` | Pipelines ML, Docker, CI/CD para modelos | Proyecto WPPOpen |
| `runbook-generator` | Documentacion operacional automatica | Proyecto WPPOpen |
| `release-manager` | Versioning, changelogs, release notes | Proyecto WPPOpen |
| `accelerated-computing-cudf` | GPU DataFrames con NVIDIA cuDF | NVIDIA Oficial |

Para activar una skill en Copilot escribe `/skill nombre-de-la-skill` en cualquier chat.

## Modelos NVIDIA NIM configurados

Los siguientes modelos estan disponibles directamente en el selector de modelos de Copilot.
Verificados el 2026-08-12 contra la API:

| Modelo | ID | Contexto |
|--------|----|----------|
| Nemotron Super 49B | `nvidia/llama-3.3-nemotron-super-49b-v1` | 131K |
| Llama 3.3 70B | `meta/llama-3.3-70b-instruct` | 131K |
| DeepSeek V4 Flash | `deepseek-ai/deepseek-v4-flash-0731` | 1M |

> El resto de modelos que aparecian antes (Nemotron Ultra, Llama 4 Maverick,
> Codestral, Mistral Large 2, Qwen, Kimi, GLM) devuelven 404/410 en cuenta
> gratuita. Ver [catalogo de modelos](docs/model-catalog.md).

> Todos gratuitos via NVIDIA NIM (~40 RPM, sin limite de creditos).
> Obtener API key gratuita: [build.nvidia.com](https://build.nvidia.com)

## Plugins instalados

Plugins de los marketplaces `copilot-plugins` y `awesome-copilot`, declarados en
[`plugins/plugins.json`](plugins/plugins.json).

| Plugin | Marketplace | Version | Aporta |
|--------|-------------|---------|--------|
| `powerbi-authoring` | copilot-plugins | 0.3.9 | Modelos semanticos, informes PBIP/PBIR, MCP de modelado |
| `microsoft-365-agents-toolkit` | copilot-plugins | 1.3.1 | Agentes declarativos M365, apps de Teams |
| `power-automate` | copilot-plugins | 2.2.0 | Flujos cloud y RPA, MCP flowagent y Microsoft Learn |
| `power-bi-development` | awesome-copilot | 1.0.0 | 4 modos expertos de Power BI |
| `awesome-copilot` | awesome-copilot | 1.1.0 | Catalogo comunitario de agentes/skills |
| `mcp-m365-copilot` | awesome-copilot | 1.0.0 | Agentes declarativos M365 con MCP |
| `skills-for-copilot-studio` | awesome-copilot | 1.0.11 | Suite de Copilot Studio (Advisor/Author/Manage/Test) |
| `ai-ready` | awesome-copilot | 1.1.0 | Configuracion AI-ready para cualquier repo |
| `ai-team-orchestration` | awesome-copilot | 1.0.0 | Equipo virtual dev / producer / QA |

Detalle de agentes, skills y servidores MCP: [Guia de plugins](docs/plugins-guide.md).

## MCP Servers configurados

| Server | Descripcion | Config |
|--------|-------------|--------|
| context7 | Documentacion actualizada de librerias via LLM | `mcp/mcp.json` |
| google-analytics | Datos de GA4 | `mcp/mcp.json` |
| google-ads | Campanas de Google Ads | `mcp/mcp.json` |
| meta-ads | Campanas de Meta Ads | `mcp/mcp.json` |
| bigquery | Consultas a BigQuery | `mcp/mcp.json` |
| postgres | Consultas a PostgreSQL | `mcp/mcp.json` |
| dv360 | Display & Video 360 | `mcp/mcp.json` |
| powerbi-modeling-mcp | Modelado de Power BI / Fabric | plugin `powerbi-authoring` |
| flowagent | Power Automate | plugin `power-automate` |
| microsoft-learn | Documentacion oficial de Microsoft | plugin `power-automate` |
| awesome-copilot | Catalogo comunitario (requiere Docker) | plugin `awesome-copilot` |

## Script de generacion de imagenes

```bash
# Imagen instantanea (gratis, sin API key)
python scripts/nvidia_gen.py "un gato astronauta en Marte"

# Con tamano personalizado
python scripts/nvidia_gen.py "ciudad futurista" --size 1920x1080

# Ver todos los modelos disponibles
python scripts/nvidia_gen.py --list-models

# Generar video (HuggingFace, ~5-10 min)
python scripts/nvidia_gen.py "un robot bailando" --video
```

Modelos de imagen soportados:
- `pollinations-flux` — Gratis, sin key, ~5s **(default)**
- `pollinations-turbo` — SDXL Turbo, muy rapido
- `flux-schnell-hf` — Flux via HuggingFace, gratis
- `flux-dev` — NVIDIA NIM, maxima calidad (lento en free tier)

## Notas tecnicas

- Las skills se cargan desde `~/.copilot/plugins/superpowers/skills/`
- Los plugins de marketplace se cachean en `~/.copilot/installed-plugins/<marketplace>/<plugin>/`
- El registro de plugins vive en `~/.copilot/config.json` (`installedPlugins`) y su
  activacion en `~/.copilot/settings.json` (`enabledPlugins`)
- El MCP global se lee desde `~/.copilot/mcp.json`; cada plugin puede aportar el suyo en `.mcp.json`
- Los proveedores de modelos se almacenan en `~/.copilot/data.db` (SQLite)
- El plugin `superpowers` debe estar instalado (viene por defecto en Copilot v1.0+)

## Ver documentacion completa

- [Guia NVIDIA NIM](docs/nvidia-nim-setup.md)
- [Guia de Skills](docs/skills-guide.md)
- [Guia de Plugins](docs/plugins-guide.md)
- [Catalogo de modelos](docs/model-catalog.md)
