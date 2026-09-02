# Optimización del consumo de tokens

Guía para reducir el gasto de cuota sin perder capacidad de trabajo.

---

## El problema, medido

Datos reales de un periodo de 7 días en este entorno:

| Métrica | Valor |
|---|---|
| Tokens de **entrada** | 117.000.000 |
| Tokens de **salida** | 858.000 |
| Ratio entrada/salida | **136 : 1** |
| Llamadas al modelo | 758 |
| Media de entrada por llamada | 154.395 |
| **Mínimo observado** | **6.887** |

La conclusión es contraintuitiva pero inequívoca: **lo que consume cuota no es
lo que el agente escribe, sino el contexto que se le reenvía en cada llamada.**

Que el mínimo observado sea 6.887 tokens mientras la media es 154.395 demuestra
que gran parte de ese contexto es evitable.

---

## Causa principal: definiciones de herramientas siempre presentes

Cada plugin instalado y activo inyecta las definiciones de sus herramientas
—nombre, descripción y esquema JSON completo de parámetros— en el contexto
del modelo **en todas y cada una de las llamadas**, se usen o no.

### Prueba A/B empírica

Mismo prompt trivial (`"Responde unicamente: ok"`), misma máquina, sesión
nueva y limpia en cada caso, con minutos de diferencia:

| Perfil | Tokens de entrada | Créditos AI |
|---|---|---|
| `full` (9 plugins) | **95.200** | **23,81** |
| `analytics` (ninguno) | **32.500** | **8,14** |
| **Diferencia** | **−62.700 (−66%)** | **−15,67 (−66%)** |

Es decir: **una pregunta trivial costaba casi tres veces más** solo por
tener cargadas herramientas que no se iban a usar.

> Estos 62.700 tokens son el coste real medido, y superan en un 53% la
> estimación previa por `tiktoken` (~41.000). La estimación contaba las
> definiciones de las herramientas, pero no las instrucciones de uso,
> los agentes y las skills que cada plugin arrastra consigo.

### Desglose estimado por plugin

Medición con `tiktoken` (codificación `cl100k_base`) sobre las definiciones
de herramientas. Sirve para ordenar culpables, no como cifra total:

| Plugin | Herramientas | Coste aprox. |
|---|---|---|
| `power-automate` (flowagent) | ~45 | ~22.800 tokens |
| `powerbi-authoring` (powerbi-modeling-mcp) | ~20 | ~15.400 tokens |
| `skills-for-copilot-studio` | varias | ~1.200 tokens |
| Resto de plugins | — | ~1.600 tokens |

> El catálogo de skills, en cambio, es barato: ~177 tokens por skill, unos
> 5.800 tokens para las 33. No merece la pena recortarlo, y las skills sí se
> usan a diario.

---

## Solución: perfiles de herramientas

`setup/switch-profile.ps1` activa solo los plugins pertinentes para el tipo de
trabajo. Los demás quedan instalados pero inactivos; recuperarlos es cambiar
de perfil.

```powershell
.\setup\switch-profile.ps1 status      # ver estado y coste actual
.\setup\switch-profile.ps1 analytics   # trabajo analítico (recomendado)
.\setup\switch-profile.ps1 powerbi     # desarrollo Power BI / Fabric
.\setup\switch-profile.ps1 m365        # agentes M365 / Copilot Studio
.\setup\switch-profile.ps1 full        # todo (estado original)
```

### Perfiles

| Perfil | Plugins activos | Coste fijo |
|---|---|---|
| `analytics` | ninguno | **~0 tokens** |
| `powerbi` | `powerbi-authoring`, `power-bi-development` | ~15.800 |
| `m365` | toolkit M365, Power Automate, Copilot Studio | ~24.700 |
| `full` | los 9 | ~41.000 |

> Las cifras de coste que imprime el script son las estimadas por `tiktoken`.
> El coste real medido de `full` frente a `analytics` es de **~62.700 tokens**,
> así que el ahorro efectivo es mayor que el que anuncia.

### Cómo verificar que está aplicado

```powershell
copilot plugin list     # los plugins deben aparecer como [disabled]
```

Esta es la comprobación fiable: el CLI es la fuente de verdad. Ojo, porque
`~/.copilot/config.json` mantiene `"enabled": true` en `installedPlugins[]`
aunque estén desactivados — ese fichero refleja la instalación, no el estado
activo. El estado real lo manda `settings.json` → `enabledPlugins`.

### Qué NO se pierde con el perfil `analytics`

Las **skills** y las **extensiones propias** no son plugins: se instalan por
separado con `install.ps1` y siguen plenamente disponibles.

- Las 33 skills, incluidas `causal-impact`, `meridian-geox`, `meridian-mmm`,
  `powerbi-developer`, `google-ads-analyst`.
- Las 3 extensiones: `causal-impact-expert`, `geox-expert`, `meridian-expert`.
- Los servidores MCP de `mcp.json` (Context7, GA, Google Ads, Meta, BigQuery,
  Postgres, DV360), que son ligeros.

Lo único que desaparece es la capacidad de **ejecutar** acciones en Power
Automate o de **modificar** modelos semánticos de Power BI vía MCP. Para
analizar, diseñar y escribir DAX no hace falta: para eso está la skill
`powerbi-developer`, que sigue activa.

> **El cambio solo afecta a sesiones nuevas.** Los plugins se cargan al
> arrancar la sesión, así que la que tengas abierta seguirá con los de antes
> aunque reinicies la aplicación: hay procesos que sobreviven. Ábrela nueva y
> comprueba con `copilot plugin list`. El script deja un respaldo en
> `settings.json.bak`.

---

## Las otras dos palancas

El perfil de herramientas ataca el coste **fijo**. Estas dos atacan el
**variable**, y juntas pesan más:

### 1. Una sesión por tarea

El contexto se acumula dentro de una sesión: todo el histórico se reenvía en
cada llamada. En una sesión larga medida, la entrada media pasó de **98.000
tokens al inicio a 178.000 al cabo de unas horas** — un 81% más caro por el
mismo trabajo.

Además, al llenarse el contexto se dispara la **compactación**, que reprocesa
todo el histórico y se paga aparte.

**Regla:** al cambiar de tema, sesión nueva. Un estudio de CausalImpact, un
diseño GeoX y un arreglo de infraestructura son tres sesiones, no una.

### 2. El modelo adecuado a cada tarea

| Modelo | Llamadas | Coste medio relativo |
|---|---|---|
| `claude-opus-5` | 509 | **3×** |
| `claude-sonnet-5` | 125 | 1× |

Opus se llevó el **81%** del gasto del periodo.

- **Sonnet** para: ejecutar scripts, editar ficheros, verificar, buscar,
  operaciones de git.
- **Opus** para: diseño estadístico, interpretación de resultados, decisiones
  de arquitectura, depurar un problema sutil.

---

## Impacto conjunto

| Palanca | Ahorro | Estado |
|---|---|---|
| Perfil `analytics` | **−66%** en el coste de arranque | **medido (A/B)** |
| Una sesión por tarea | 30–40% | estimado sobre datos reales |
| Modelo según tarea | ~30% | estimado sobre datos reales |

No son acumulativos de forma lineal —actúan sobre la misma base—, pero
aplicados a la vez el consumo debería reducirse **a menos de la mitad**.

---

## Reproducir la medición

La prueba A/B es sencilla y cuesta unos pocos créditos:

```powershell
# 1. Con todo activo
.\setup\switch-profile.ps1 full
cd $env:TEMP; copilot -p "Responde unicamente: ok" --allow-all-tools

# 2. Sin plugins
.\setup\switch-profile.ps1 analytics
cd $env:TEMP; copilot -p "Responde unicamente: ok" --allow-all-tools
```

Cada ejecución imprime al terminar una línea `Tokens ↑ …` y otra
`AI Credits …`. Esa es la comparación limpia: mismo prompt, sesión nueva,
sin histórico que contamine el dato.

Resultado obtenido en esta máquina: **95,2k / 23,81 créditos** frente a
**32,5k / 8,14 créditos**.

