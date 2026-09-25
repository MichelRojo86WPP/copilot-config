# Desarrollo remoto y asistentes de código en Domino

Cuatro formas de tener un asistente de código trabajando contra Domino, de menos a más
acoplamiento con la plataforma. No son excluyentes.

| Forma | Dónde editas | Dónde se ejecuta | Cuándo elegirla |
|---|---|---|---|
| **MCP server** | Tu portátil | Domino (Jobs) | Por defecto. Ver `mcp-server.md` |
| **SSH + Remote-SSH** | Tu portátil (IDE local) | Dentro del Workspace | Iterar en vivo con GPU o datos que no salen |
| **Extensión VS Code** | Tu portátil | Domino (Jobs o SSH) | Quieres UI: navegar proyectos, elegir tier |
| **Asistente dentro del Workspace** | Navegador, en Domino | Dentro del Workspace | Política que prohíbe sacar código o datos |

---

## SSH: tu IDE local contra el cómputo de Domino

Es el mecanismo real de "remote development" de Domino. Una vez conectado, la terminal
integrada de tu IDE **corre físicamente dentro del contenedor del Workspace**, con su
GPU, sus entornos y sus datasets montados. Si tienes un asistente de código instalado
en local, trabaja contra esos ficheros como si fueran tuyos.

### Requisitos

1. **Entorno de cómputo con `openssh-server`.** Snippet oficial para el Dockerfile:

   ```dockerfile
   USER root
   RUN apt update && \
    apt-get install -y openssh-server && \
    mkdir -p /var/run/sshd && \
    chmod 0755 /var/run/sshd
   USER ubuntu
   ```

   Domino arranca `sshd` solo al lanzar el Workspace.

2. **Marcar "Enable SSH access"** en *Additional settings* al lanzar el Workspace. Si no
   aparece la casilla, un administrador tiene que activar
   `com.cerebro.domino.workbench.workspace.ssh.enabled=true`.

3. **Dom CLI instalado.** Ojo: el **Dom CLI** es *solo* para autenticar SSH y es una
   herramienta **distinta del Domino CLI**. El enlace de descarga solo aparece dentro
   del panel *Settings* de un Workspace **ya en ejecución** (paso 1 de las
   instrucciones "SSH connection").

4. **Extensión Remote - SSH** en VS Code (Cursor la reutiliza si importas extensiones).

5. **Workspace ID**, visible en el panel de ajustes o en *Show Details*.

### Conectar

```bash
dom connect <workspace_id> --domino-api-host=https://<tu-dominio> -l ubuntu
```

Devuelve un comando SSH y la ruta a un fichero de configuración generado. Añade a tu
`~/.ssh/config`:

```
Include ~/.domino/ssh/config
```

En VS Code: *Remote Explorer > SSH* y elige el workspace. El directorio de trabajo por
defecto al abrir es `/mnt`.

### Detalles que importan

- El usuario es **`ubuntu`** en imágenes estándar y **`domino`** en imágenes RHEL/UBI8.
- **PyCharm** necesita `--port <puerto>` en `dom connect`, y hay que reusar el mismo
  puerto para reconectar. Con varios Workspaces a la vez, un puerto distinto para cada
  uno.
- **ParaView** funciona reenviando el puerto 11111
  (`ssh -L 11111:localhost:11111 <workspace-id> -F <config>`).
- Si tu Domino usa una **CA propia** en el certificado TLS, instálala también en local.
  En Windows, al almacén *Entidades de certificación raíz de confianza*.
- Coste: el Workspace consume cuota **mientras lo tienes encendido**, no solo mientras
  entrena. Para lotes largos sale más barato un Job.

---

## Extensión oficial de Domino para VS Code

`DominoDataLab.domino-data-lab-vscode-extension` — también en Open VSX.
Código: `https://github.com/dominodatalab/domino-vscode`

Aporta lo que le falta al MCP server:

- **Conectar por SSH** al Workspace desde el panel lateral (*Connect SSH Tunnel*), sin
  escribir el `dom connect` a mano ni tocar `~/.ssh/config`: lo gestiona la extensión.
- **Lanzar Jobs con selección de hardware tier y entorno** — clic derecho sobre un
  fichero Python, R, notebook, shell o JS/TS → *Run with Domino*.
- **Navegar, crear y cambiar de proyecto** desde la barra lateral.
- **Monitorizar** Jobs y Workspaces con refresco automático.

Requiere el `dom` CLI en el `PATH` para la parte de SSH.

Ajustes útiles:

| Ajuste | Por defecto | Para qué |
|---|---|---|
| `domino.apiUrl` | vacío | Fija la URL y evita que la pregunte |
| `domino.sshUser` | `ubuntu` | Ponlo a `domino` en imágenes RHEL/UBI8 |
| `domino.sshBackgroundProxy` | `false` | El túnel sobrevive al cierre de VS Code |
| `domino.workspaceDefaultDirectory` | `/mnt` | Carpeta al abrir la ventana remota |
| `domino.autoRefreshInterval` | `30000` | Refresco en ms (5.000–300.000) |

Autenticación por OAuth2/Keycloak (`domino.oauthClientId`, por defecto
`domino-connect-client`). Los logs del túnel van a
`~/.domino/vscode-extension/logs/<workspaceId>.log`.

---

## Asistentes dentro del Workspace

La guía oficial *Use Coding Assistants* plantea tres decisiones:

**1. Elegir el LLM backend.** El que tu organización haya aprobado para código: un
servicio comercial o un modelo self-hosted tipo Llama. Casi todos los asistentes
permiten apuntar al LLM que elijas.

**2. Elegir el IDE.** Combinaciones recomendadas por Domino:

| IDE / Lenguaje | Uso típico | Asistente |
|---|---|---|
| Jupyter / Python | Generar o revisar código en notebooks por prompts | Jupyter AI |
| VS Code en el navegador | Autocompletado y scaffolding dentro de Domino | GitHub Copilot |
| VS Code local por SSH | Copilot local contra cómputo de Domino | GitHub Copilot |

**3. Instalarlo en el Compute Environment.** Usar un entorno compartido garantiza que
todo el equipo tenga el mismo montaje aprobado.

### Instalar GitHub Copilot en el entorno

Para que Copilot esté siempre disponible en el VS Code del navegador, va en el
`Dockerfile` del entorno (sustituye las versiones):

```dockerfile
RUN curl -o /tmp/github.copilot.vsix -LSsf https://github.gallery.vsassets.io/_apis/public/gallery/publisher/github/extension/copilot/COPILOT_VERSION/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage && \
    code-server --install-extension /tmp/github.copilot.vsix --force --extensions-dir /home/ubuntu/.local/share/code-server/extensions && \
    rm /tmp/github.copilot.vsix

RUN curl -o /tmp/github-chat.vsix -LSsf https://github.gallery.vsassets.io/_apis/public/gallery/publisher/github/extension/copilot-chat/CHAT_VERSION/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage && \
    code-server --install-extension /tmp/github-chat.vsix --force --extensions-dir /home/ubuntu/.local/share/code-server/extensions && \
    rm /tmp/github-chat.vsix
```

Si la imagen es RHEL/UBI8, la ruta de extensiones cuelga de `/home/domino/`.

### Ya viene de fábrica en 6.3+

El Domino Standard Environment trae preinstalados **GitHub Copilot, Claude Code y
Codex**, con las *Domino Skills* del repositorio `dominodatalab/domino-claude-plugin`
(jobs, datasets, environments, workspaces, projects, flows, model-endpoints,
experiment-tracking, python-sdk). Están optimizadas para Claude Code.

Activa la **persistencia del home** del Workspace para no perder la autenticación ni el
historial entre reinicios.

---

## Cómo decidir

```
¿Los datos o el código pueden salir de Domino?
├── No  → Asistente dentro del Workspace (navegador)
└── Sí
    ├── ¿Necesitas iterar en vivo con GPU o datos enormes?
    │   ├── Sí → SSH + Remote-SSH (o la extensión de VS Code)
    │   └── No → MCP server: editas en local, ejecutas por Jobs
    └── ¿Es el run definitivo para el cliente?
        └── Sí → CLI con --commit y revisión de entorno fijada
```

En la práctica, para un MMM: **MCP para explorar y depurar**, **CLI para el run final**,
y **SSH solo** si hace falta trastear en vivo con la GPU.
