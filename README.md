# GitHub Copilot Config

Repositorio de configuración personal de GitHub Copilot — skills, MCP servers, modelos de IA y scripts.

## Contenido

```
copilot-config/
├── skills/                     # Skills instaladas globalmente en Copilot (31)
│   ├── meridian-geox/          # Meridian GeoX - diseno y analisis de geo-experimentos
│   ├── meridian-mmm/           # Meridian MMM - media mix modeling bayesiano
│   ├── causal-impact/          # Analisis de impacto causal
│   ├── data-scientist/         # Agente data scientist con Python/pandas
│   ├── data-analyst/           # Analista de datos exploratorio
│   ├── ga4-analyst/            # Analisis en Google Analytics 4
│   ├── google-ads-analyst/     # Analisis en Google Ads
│   ├── meta-ads-analyst/       # Analisis en Meta Ads
│   ├── powerbi-*/              # Desarrollo y diseno de informes Power BI
│   ├── sqldb-*/ sqldw-*/       # Autoria y consumo SQL Database / Warehouse
│   └── ...                     # ver tabla completa mas abajo
├── extensions/                 # Extensiones de agente (scope usuario)
│   ├── meridian-expert/        # Herramientas MMM: workflow, scaffold, pitfalls
│   ├── geox-expert/            # Herramientas GeoX: workflow, design builder, pitfalls
│   └── causal-impact-expert/   # Herramientas CausalImpact: workflow, checklist
├── mcp/
│   └── mcp.json                # Configuracion MCP global (context7)
├── scripts/
│   └── nvidia_gen.py           # Generador de imagenes/video con IA (multi-proveedor)
├── setup/
│   ├── install.ps1             # Instalador automatico (Windows PowerShell)
│   ├── switch-profile.ps1      # Perfiles de plugins para reducir consumo de tokens
│   └── install-nvidia-provider.py  # Instala NVIDIA NIM en Copilot DB
└── docs/
    ├── nvidia-nim-setup.md     # Guia NVIDIA NIM
    ├── skills-guide.md         # Guia de uso de skills
    ├── token-optimization.md   # Como reducir el consumo de cuota
    └── model-catalog.md        # Catalogo de modelos NVIDIA
```

## Consumo de tokens

Los plugins activos inyectan las definiciones de sus herramientas en **cada**
llamada al modelo, se usen o no. Prueba A/B con el mismo prompt trivial y
sesion nueva: **95,2k tokens y 23,81 creditos** con los 9 plugins activos
frente a **32,5k y 8,14 creditos** sin ninguno. Un **66% menos**.

```powershell
.\setup\switch-profile.ps1 status      # ver coste actual
.\setup\switch-profile.ps1 analytics   # perfil recomendado para analitica
copilot plugin list                    # verificar: deben salir [disabled]
```

Las skills y las extensiones **no** son plugins y siguen disponibles en todos
los perfiles. El cambio solo afecta a **sesiones nuevas**. Detalle completo y
las otras dos palancas (una sesion por tarea, modelo segun la tarea) en
[`docs/token-optimization.md`](docs/token-optimization.md).

## Que va aqui y que no

Este repositorio es la **fuente unica** del conocimiento portable: skills, extensiones,
configuracion MCP y modelos. Todo lo que contiene debe ser reutilizable con **cualquier
cliente** y en **cualquier maquina**.

| Va aqui | Va en el repo del cliente |
|---------|---------------------------|
| Skills y sus `references/` | Proyectos, datos y entregables |
| Extensiones de agente | Informes generados |
| Convenciones WPP (paleta, estilo de codigo) | Contexto de negocio del cliente |
| Configuracion MCP y modelos | `.github/instructions/` (dependen de rutas del repo) |

Los repositorios de cliente **consumen** este repo: no deben duplicar skills ni
extensiones. Si necesitas corregir un error en una skill, se corrige aqui y se
propaga con `install.ps1`.

## Instalacion rapida

### Opcion 1: Script automatico (Windows)

```powershell
# Clonar el repo
git clone https://github.com/MichelRojo86WPP/copilot-config.git
cd copilot-config

# Ejecutar instalador (incluye tu NVIDIA API key)
.\setup\install.ps1 -NvidiaApiKey "nvapi-TU_KEY_AQUI"
```

### Opcion 2: Manual

```powershell
# 1. Copiar skills al directorio oficial de personal skills
$dst = "$env:USERPROFILE\.copilot\skills"
Copy-Item skills\* $dst -Recurse -Force

# 2. Copiar extensiones al scope de usuario
$ext = "$env:USERPROFILE\.copilot\extensions"
New-Item -ItemType Directory -Path $ext -Force
Copy-Item extensions\* $ext -Recurse -Force

# 3. Instalar MCP global
Copy-Item mcp\mcp.json "$env:USERPROFILE\.copilot\mcp.json"

# 4. Instalar proveedor NVIDIA NIM
python setup\install-nvidia-provider.py --api-key "nvapi-TU_KEY"

# 5. Reiniciar Copilot
```

> Para ver que se instalaria sin escribir nada en disco: `.\setup\install.ps1 -DryRun`

Las skills y extensiones se descubren **dinamicamente**: cualquier carpeta nueva en
`skills/` que contenga un `SKILL.md`, o en `extensions/` que contenga un
`extension.mjs`, se instala sin tener que tocar el instalador.

## Skills disponibles

Las skills se descubren automaticamente. Las principales del area de analytics:

| Skill | Descripcion |
|-------|-------------|
| `meridian-geox` | Diseno y analisis de geo-experimentos con Meridian GeoX |
| `meridian-mmm` | Media mix modeling bayesiano con Google Meridian |
| `causal-impact` | Analisis causal, A/B testing, diferencias en diferencias |
| `data-scientist` | Analisis exploratorio, ML, visualizacion con Python |
| `data-analyst` | SQL, pandas, dashboards, reportes de negocio |
| `ga4-analyst` | Analisis en Google Analytics 4 |
| `google-ads-analyst` | Analisis y activacion en Google Ads |
| `meta-ads-analyst` | Analisis en Meta Ads |
| `marketing-attribution` | Modelos de atribucion de marketing |
| `client-reporting` | Generacion de informes de cliente |
| `ml-ops-engineer` | Pipelines ML, Docker, CI/CD para modelos |
| `powerbi-developer` | Desarrollo de modelos e informes Power BI |
| `sqldb-*` / `sqldw-*` | Autoria y consumo SQL Database / Warehouse |
| `runbook-generator` | Documentacion operacional automatica |
| `release-manager` | Versioning, changelogs, release notes |
| `accelerated-computing-cudf` | GPU DataFrames con NVIDIA cuDF |

Para activar una skill en Copilot escribe `/skill nombre-de-la-skill` en cualquier chat.

## Extensiones de agente

Se instalan en `~/.copilot/extensions/`, por lo que estan disponibles en **todos** los
repositorios, no solo en aquel donde se desarrollaron.

| Extension | Herramientas que aporta |
|-----------|-------------------------|
| `geox-expert` | Workflow GeoX, constructor de `DesignConfig`, trampas de API, scaffold de proyecto |
| `meridian-expert` | Workflow MMM, scaffold de proyecto, trampas de API |
| `causal-impact-expert` | Workflow CausalImpact, lecciones aprendidas, checklist |

## Modelos NVIDIA NIM configurados

Los siguientes modelos estan disponibles directamente en el selector de modelos de Copilot:

| Modelo | ID | Contexto |
|--------|----|----------|
| Nemotron Ultra 253B | `nvidia/llama-3.1-nemotron-ultra-253b-v1` | 131K |
| Nemotron Super 49B | `nvidia/llama-3.3-nemotron-super-49b-v1` | 131K |
| Llama 3.3 70B | `meta/llama-3.3-70b-instruct` | 131K |
| Llama 4 Maverick 17B | `meta/llama-4-maverick-17b-128e-instruct` | 1M |
| DeepSeek V4 Flash | `deepseek-ai/deepseek-v4-flash` | 1M |
| Mistral Large 2 | `mistralai/mistral-large-2-instruct` | 131K |
| Codestral 22B | `mistralai/codestral-22b-instruct-v0.1` | 262K |
| Qwen 3.5 122B | `qwen/qwen3.5-122b-a10b` | 131K |
| Kimi K2.6 | `moonshotai/kimi-k2.6` | 262K |
| GLM-5.2 | `z-ai/glm-5.2` | 1M |
| Qwen3-Coder 480B | `qwen/qwen3-coder-480b-a35b-instruct` | 262K |

> Todos gratuitos via NVIDIA NIM (~40 RPM, sin limite de creditos).
> Obtener API key gratuita: [build.nvidia.com](https://build.nvidia.com)

## MCP Servers configurados

| Server | Descripcion | Config |
|--------|-------------|--------|
| context7 | Documentacion actualizada de librerias via LLM | `mcp/mcp.json` |

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

- Las skills se instalan en `~/.copilot/skills/`, la **ruta oficial de personal skills**.
  La leen Copilot CLI, la app de Copilot y el modo agente de VS Code, en cualquier repositorio.
- Se replican ademas en `~/.copilot/plugins/superpowers/skills/` como **espejo opcional**,
  solo por compatibilidad con la instalacion anterior. Si el plugin `superpowers` no esta
  instalado, el espejo se omite y **no es un error**: el conocimiento no depende de el.
- Las extensiones se cargan desde `~/.copilot/extensions/` (scope usuario, todos los repos)
- El MCP global se lee desde `~/.copilot/mcp.json`
- Los proveedores de modelos se almacenan en `~/.copilot/data.db` (SQLite)
- El instalador **borra y recrea** cada carpeta destino, de forma que los ficheros
  eliminados en el repo no sobreviven en la instalacion local

### Alcance: donde llega este conocimiento y donde no

| Entorno | Skills disponibles | Como |
|---|---|---|
| Copilot CLI / app / VS Code, en tu maquina | Si, en cualquier repositorio | `~/.copilot/skills/` (scope usuario) |
| Agente en github.com (cloud agent, code review) | **No por defecto** | El runner es efimero y no ve tu `~/.copilot` |

Para dar conocimiento al agente de github.com, el repositorio de cliente debe clonar este
repositorio durante el arranque, mediante `.github/workflows/copilot-setup-steps.yml`.
Como este repositorio es **publico**, no hace falta token ni secret. Ver el README de
`advanced_analytics_melia` para un ejemplo funcionando.

## Ver documentacion completa

- [Guia NVIDIA NIM](docs/nvidia-nim-setup.md)
- [Guia de Skills](docs/skills-guide.md)
- [Catalogo de modelos](docs/model-catalog.md)
