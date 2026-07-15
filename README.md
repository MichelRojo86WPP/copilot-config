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
├── mcp/
│   └── mcp.json                # Configuracion MCP global (context7)
├── scripts/
│   └── nvidia_gen.py           # Generador de imagenes/video con IA (multi-proveedor)
├── setup/
│   ├── install.ps1             # Instalador automatico (Windows PowerShell)
│   └── install-nvidia-provider.py  # Instala NVIDIA NIM en Copilot DB
└── docs/
    ├── nvidia-nim-setup.md     # Guia NVIDIA NIM
    ├── skills-guide.md         # Guia de uso de skills
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

# 4. Reiniciar Copilot
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

- Las skills se cargan desde `~/.copilot/plugins/superpowers/skills/`
- El MCP global se lee desde `~/.copilot/mcp.json`
- Los proveedores de modelos se almacenan en `~/.copilot/data.db` (SQLite)
- El plugin `superpowers` debe estar instalado (viene por defecto en Copilot v1.0+)

## Ver documentacion completa

- [Guia NVIDIA NIM](docs/nvidia-nim-setup.md)
- [Guia de Skills](docs/skills-guide.md)
- [Catalogo de modelos](docs/model-catalog.md)
