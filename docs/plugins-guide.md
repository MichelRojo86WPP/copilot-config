# Guia de plugins de GitHub Copilot

Inventario de los plugins instalados desde los marketplaces de Copilot y las capacidades
que aporta cada uno. El manifiesto reproducible esta en [`plugins/plugins.json`](../plugins/plugins.json).

## Instalacion

```powershell
.\setup\install-plugins.ps1
```

Registra todos los plugins del manifiesto en `~/.copilot/config.json` y los habilita en
`~/.copilot/settings.json`. Despues hay que **reiniciar GitHub Copilot**.

Si algun plugin no se descarga automaticamente, se puede instalar desde el chat con
`/plugin install <nombre>`.

## Plugins instalados

| Plugin | Marketplace | Version | Que aporta |
|--------|-------------|---------|------------|
| `powerbi-authoring` | copilot-plugins | 0.3.9 | Modelos semanticos + informes PBIP/PBIR + MCP de modelado |
| `microsoft-365-agents-toolkit` | copilot-plugins | 1.3.1 | Agentes declarativos M365, apps de Teams, evaluaciones |
| `power-automate` | copilot-plugins | 2.2.0 | Gestion de flujos cloud y RPA + MCP flowagent + Microsoft Learn |
| `power-bi-development` | awesome-copilot | 1.0.0 | 4 modos expertos de Power BI |
| `awesome-copilot` | awesome-copilot | 1.1.0 | Descubrimiento de agentes/skills/instrucciones de la comunidad |
| `mcp-m365-copilot` | awesome-copilot | 1.0.0 | Agentes declarativos M365 basados en MCP |
| `skills-for-copilot-studio` | awesome-copilot | 1.0.11 | Suite completa de Copilot Studio (4 sub-agentes) |
| `ai-ready` | awesome-copilot | 1.1.0 | Genera configuracion AI-ready para cualquier repo |
| `ai-team-orchestration` | awesome-copilot | 1.0.0 | Equipo virtual dev / producer / QA |

## Agentes disponibles en el selector

El desplegable de agentes (junto al selector de modelo) permite fijar un perfil concreto
para toda la conversacion. En modo `Default agent` el asistente delega automaticamente
al sub-agente adecuado segun la intencion detectada.

### Power BI (`power-bi-development`)

| Agente | Uso |
|--------|-----|
| Power BI Data Modeling Expert | Esquema estrella, relaciones, diseno de modelo |
| Power BI DAX Expert | Escritura y optimizacion de formulas DAX |
| Power BI Performance Expert | Diagnostico y mejora de rendimiento |
| Power BI Visualization Expert | Diseno de informes, eleccion de graficos, accesibilidad |

### Copilot Studio (`skills-for-copilot-studio`)

| Agente | Uso |
|--------|-----|
| Copilot Studio Advisor | Guia de diseno, revision/auditoria, troubleshooting |
| Copilot Studio Author | Crear y modificar topics, acciones, knowledge sources, variables |
| Copilot Studio Manage | Clone / push / pull / publish entre local y la nube |
| Copilot Studio Test | Evaluaciones PPAPI, test suites, DirectLine / SDK |

> Flujo tipico: **Advisor** (disenar) → **Author** (implementar) → **Manage** (publicar) → **Test** (validar).
> Si no hay `agent.mcs.yml` en el workspace hay que clonar primero con **Manage**; el Author no crea agentes desde cero.

### Otros agentes

| Agente | Plugin | Uso |
|--------|--------|-----|
| MCP M365 Agent Expert | `mcp-m365-copilot` | Agentes declarativos M365 con MCP |
| Meta Agentic Project Scaffold | `awesome-copilot` | Andamiaje de proyectos agenticos |
| ai-team-dev | `ai-team-orchestration` | Implementacion de features y correccion de bugs |
| ai-team-producer | `ai-team-orchestration` | Planificacion de sprints, triage, coordinacion |
| ai-team-qa | `ai-team-orchestration` | Testing E2E, reportes de bugs, sign-off |

## Servidores MCP aportados por los plugins

Estos servidores se registran automaticamente con el plugin y **no** forman parte de
[`mcp/mcp.json`](../mcp/mcp.json) (que es la configuracion MCP global propia).

| Servidor | Plugin | Transporte | Requisito |
|----------|--------|-----------|-----------|
| `powerbi-modeling-mcp` | powerbi-authoring | stdio (`npx`) | Node.js |
| `flowagent` | power-automate | stdio (`node`) | Node.js |
| `microsoft-learn` | power-automate | http | — |
| `awesome-copilot` | awesome-copilot | stdio (`docker`) | Docker |

### Capacidades destacadas

- **`powerbi-modeling-mcp`** — conectar a Power BI Desktop / Fabric, CRUD de tablas,
  columnas, medidas, relaciones, jerarquias, roles RLS, calculation groups, ejecutar DAX,
  refrescar, exportar TMDL/TMSL y desplegar a Fabric.
- **`flowagent`** — listar / crear / editar / copiar flujos, ejecutar y diagnosticar runs
  fallidos, gestionar conexiones, flujos de escritorio (RPA), backups y restore.
- **`microsoft-learn`** — busqueda en documentacion oficial de Microsoft y ejemplos de codigo.
- **`awesome-copilot`** — catalogo comunitario de agentes, instrucciones y skills.

## Dependencias externas

| Dependencia | Necesaria para |
|-------------|----------------|
| Node.js / npx | MCP `powerbi-modeling-mcp` y `flowagent` |
| Docker | MCP `awesome-copilot` |
| Power BI Desktop | Conexion local del MCP de modelado |
| Azure CLI (`az`) | Skill `powerbi-report-management` (API REST de Fabric) |

## Actualizar el manifiesto

Cuando se instalen o desinstalen plugins, regenerar el inventario a partir de la
configuracion local:

```powershell
Get-Content "$env:USERPROFILE\.copilot\config.json" |
  Where-Object { $_ -notmatch '^\s*//' } |
  Out-String | ConvertFrom-Json |
  Select-Object -ExpandProperty installedPlugins |
  Select-Object name, marketplace, version | Format-Table
```

Luego actualizar a mano `plugins/plugins.json` con las entradas nuevas y su descripcion.
