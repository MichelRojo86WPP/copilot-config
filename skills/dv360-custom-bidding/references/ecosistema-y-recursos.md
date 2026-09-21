# Ecosistema de herramientas y recursos externos

Qué existe ahí fuera para no reinventarlo, y **cuánto fiarse de cada cosa**.

> **La documentación oficial de Google es la única fuente normativa.** Todo lo demás son
> interpretaciones de terceros. Cada recurso lleva aquí un nivel de confianza explícito;
> lo que no se ha podido verificar se marca como tal.

Fecha de la investigación: **julio de 2026**.

---

## 1. No existe una librería oficial de scripts

Conviene decirlo primero porque ahorra búsquedas: **Google no publica ningún repositorio
con una colección de custom bidding scripts lista para usar.** Los ejemplos oficiales se
limitan a la página [Sample custom bidding scripts](https://support.google.com/displayvideo/answer/11968381).

Los tres repositorios que sí existen se describen abajo. Ninguno es un producto soportado.

---

## 2. `google-marketing-solutions/bid2x` — el más relevante

| Campo | Valor |
|---|---|
| URL | https://github.com/google-marketing-solutions/bid2x |
| Licencia | Apache-2.0 |
| Estrellas | 10 |
| Último push | 4 de julio de 2026 (**mantenido**) |
| Confianza | **Alta.** Organización de Google Marketing Solutions: no es producto oficial soportado, pero es código publicado por Google. |

Se define literalmente como *"First-Party Data for Google Ad Optimization"*. Es la
referencia a mirar siempre que el objetivo sea **modular la puja con un dato propio**.

**Origen.** Nació como `bid2index` (pujar más por rutas aéreas con baja ocupación) y
`bid2inventory` (stock de automoción). Se generalizó a `bid2x`: cualquier factor de
first-party data que deba modular la puja —disponibilidad, margen, ocupación—.

**Arquitectura del despliegue de DV360:**

```
BigQuery ──> Google Sheet (hub de control) ──> Cloud Run (Python)
                                                    │
                                                    ▼
                                       API de DV360: crea, reescribe
                                       y asigna el custom bidding script
```

**Patrón de script que genera** (`bid2x/bid2x_dv.py`):

```python
return max_aggregate([
  ([total_conversion_count(FL_ID, ATTR_MODEL) > 0, line_item_id == <LI_ID>], <factor>),
  # ... una línea por cada combinación (line item x Floodlight)
  ([total_conversion_count(FL_ID, ATTR_MODEL) > 0], <factor_por_defecto>)
])
```

La última fila, sin `line_item_id`, actúa de **fallback**: el mismo patrón de red de
seguridad que documenta [`patterns.md`](patterns.md) como **P7**.

Detalles de implementación que merece la pena copiar:

- **Guardarraíl de factores**: `min(max(factor, low), high)`, con `BIDDING_FACTOR_LOW = 0.5`
  por defecto y techo configurable hasta `1000`. Nunca deja salir un factor sin acotar.
- Si no se procesa ningún line item, emite `return 0;` en vez de un script vacío.
- Modo alternativo (`alternate_algorithm`): cadena `if/elif` con
  `return total_conversion_count(...) * factor` y `else: return 0`.

Puntos operativos documentados en el repositorio:

- Los line items deben seguir una **convención de nombre** (ej. `bid-to-inventory`) para
  que la automatización los identifique y los gestione.
- Cadencia de actualización recomendada: **semanal**, por el periodo de aprendizaje. El
  script queda activo en 1–2 h, pero tarda hasta 24 h en estabilizarse.
- Soporta casi todos los tipos de line item, salvo los que no permiten ajuste de puja a
  nivel de line item.

> El repositorio incluye además despliegues para **SA360 vía GTM** y `budget2x` para
> **Google Ads** (ajusta presupuestos, no pujas). Quedan fuera del alcance de esta skill.

Canal de divulgación: https://www.youtube.com/@bid2x

---

## 3. `google/custom-bidding-script-builder`

| Campo | Valor |
|---|---|
| URL | https://github.com/google/custom-bidding-script-builder |
| Licencia | Apache-2.0 |
| Estrellas | 11 |
| Último push | 13 de septiembre de 2023 (**estancado**) |
| Confianza | **Media.** Organización `google`, pero declara *"This is not an officially supported Google product"* y lleva unos tres años sin cambios. |

Herramienta de Apps Script con interfaz en Google Sheets para construir scripts **sin
escribir Python**. Requiere unirse al grupo `cb-script-builder-users` para acceder a la
plantilla y a la guía, por lo que **su contenido no se ha podido verificar**.

Su valor real es de confirmación estructural: el generador
(`core_functionality/python_parser.js`) se reduce a esto —

```js
finalScript += `return ${aggregationMethod} ([ \n${expressionWeightString}
    #Created with CB Script Builder \n])`;
```

— lo que confirma que la forma canónica de todo script es siempre
`return <agregador>([([expr], peso), ...])`, sin excepciones.

> ⚠️ **Está estancado y no incorpora la migración de IDs de Q3 2025** (ver
> [`syntax-reference.md` § 5.4](syntax-reference.md#54-dispositivo-navegador-y-red)): cualquier
> script que genere con señales de dispositivo o navegador usará los nombres descatalogados.

---

## 4. `mandriano77-prog/deevAI`

| Campo | Valor |
|---|---|
| URL | https://github.com/mandriano77-prog/deevAI |
| Fichero relevante | `packages/bidagent/engines/custom_bidding/feature_catalog.py` |
| Licencia | **Sin licencia** |
| Estrellas | 0 |
| Confianza | **Baja como dependencia, útil como contraste.** Proyecto personal. |

Catálogo exhaustivo de señales en `dataclasses`, citando la referencia oficial. **No debe
usarse como fuente**, pero sirvió para detectar la migración a `*_reportable_id`, que
después se **confirmó contra la documentación oficial**. Buen recordatorio de que una
fuente poco fiable puede valer como pista, nunca como autoridad.

Confirma de forma independiente las restricciones del DSL: sin `import`, sin `def`, sin
bucles, sin `try/except`, sin comprehensions, sin clases, sin E/S; solo tres agregadores,
cuatro *casts* y una función matemática.

---

## 5. Qué no se ha podido verificar

Se deja constancia para que nadie lo dé por cerrado:

- La plantilla de Google Sheets y la guía en Slides del *Custom Bidding Script Builder*,
  por estar tras un Google Group de acceso restringido.
- El contenido completo del `README.md` de `bid2x` (125 KB).
- Cómo sortea `bid2x` la restricción que impide publicar bajo un algoritmo ya asignado a
  line items (ver [`syntax-reference.md` § 8](syntax-reference.md#8-publicación-por-api)).
  Es la incógnita principal para cualquier automatización.
- Ninguna llamada real contra la API: el flujo documentado está verificado contra la
  documentación del cliente oficial, no contra una cuenta viva.
- No se ha encontrado ninguna colección pública de custom bidding scripts de referencia
  para ningún sector concreto.
