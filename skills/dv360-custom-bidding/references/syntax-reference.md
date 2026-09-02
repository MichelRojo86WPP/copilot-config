# DV360 Custom Bidding — sintaxis, operadores y límites del lenguaje

Fuente: [Custom bidding script reference](https://support.google.com/displayvideo/answer/11967043)
y [Create a custom bidding script](https://support.google.com/displayvideo/answer/9728993).

El lenguaje de custom bidding **parece** Python pero es un DSL sandboxed muy restringido.
Nunca asumas que algo de Python funciona: si no está en esta página, no existe.

---

## 1. Estructura de un script

Un script recibe **una impresión** y devuelve un **score** (`double`). DV360 entrena el modelo
para maximizar el score por coste. La última sentencia debe ser un `return`.

```python
return aggregate_function([
    ([criteria_a, criteria_b], score),   # criteria1: a AND b
    ([criteria_a], score)                # criteria2: solo a
])
```

Reglas de sintaxis:

- Todos los criterios van entre corchetes `[ ]`.
- La coma `,` dentro de la lista de criterios significa **AND**.
- Cada elemento es una tupla `(lista_de_criterios, peso)`.

### Excluir impresiones del entrenamiento

`return None` **excluye** la impresión del entrenamiento del modelo. Es distinto de
`return 0` (impresión válida con valor cero).

```python
# Excluir una fecha concreta
if date == 20180711:
    return None

# Excluir un slice: quedarse solo con vídeo (ad_type == 1)
if ad_type != 1:
    return None
```

---

## 2. Comentarios

```python
# comentario de una línea

"""
comentario
multilínea
"""

'''
también multilínea
'''
```

---

## 3. Operadores soportados

| Tipo | Operadores |
|---|---|
| Aritméticos | `+` `-` `*` `/` `%` `**` `//` |
| Asignación | `=` `+=` `-=` `*=` `/=` `%=` `**=` `//=` |
| Comparación | `==` `!=` `<` `>` `>=` `<=` |
| Lógicos | `and` `or` `not` |
| Pertenencia | `in` `not in` |

```python
if 123 in channel_id:   # comprueba si 123 está en el channel ID
```

> ⚠️ Aunque los operadores de asignación aumentada (`+=`, `-=`, ...) aparecen listados,
> la sección de limitaciones prohíbe explícitamente las *augmented assignments*
> (`_idx += 1`). **No los uses.** Reasigna siempre de forma simple: `_idx = _idx + 1`.

---

## 4. Funciones

### 4.1 Agregación

| Función | Tipo | Comportamiento |
|---|---|---|
| `first_match_aggregate` | Double | Devuelve el peso del **primer** criterio del array que sea `true`. |
| `max_aggregate` | Double | Devuelve el peso **más alto** entre los criterios que sean `true`. |
| `sum_aggregate` | Double | Devuelve la **suma** de todos los pesos cuyos criterios sean `true`. |

Cómo elegir:

- `first_match_aggregate` → cascada de prioridad estricta, orden importa (ej.: tramos de valor mutuamente excluyentes).
- `max_aggregate` → varios criterios pueden solaparse y quieres que gane el más valioso (ej.: venta vs. checkout).
- `sum_aggregate` → señales **acumulables** (ej.: viewability + click + conversión). Ojo: infla el score y puede desbalancear el modelo.

### 4.2 Casting

| Función | Ejemplo | Resultado |
|---|---|---|
| `bool(x)` | `bool(1)` | `true` |
| `float(x)` | `float(1)` | `1.0` |
| `int(x)` | `int(1.0)` | `1` |
| `str(object)` | `str(1)` | `"1"` |

### 4.3 Matemáticas

| Función | Detalle |
|---|---|
| `log(x)` | Logaritmo natural (base *e*). |
| `log(x, base)` | Logaritmo en la base dada, calculado como `log(x)/log(base)`. |

`log()` es la herramienta estándar para **aplanar** valores de conversión con colas largas
(revenue) y evitar que unas pocas reservas caras dominen el entrenamiento.

---

## 5. Señales disponibles

### 5.1 Dimension variables — jerarquía y tiempo

| Señal | Tipo | Detalle |
|---|---|---|
| `advertiser_id` | Integer | Identificador de anunciante. |
| `insertion_order_id` | Integer | Identificador de insertion order. |
| `line_item_id` | Integer | Identificador de line item. |
| `date` | Integer | Fecha de la impresión, formato `yyyymmdd`. |
| `day_of_week` | Integer | 0 domingo … 6 sábado. |
| `hour_of_day` | Integer | 0–23, zona horaria local del navegador. |
| `utc_date` | Integer | Fecha en UTC, `yyyymmdd`. |
| `utc_hour_of_day` | Integer | Hora en UTC, 0–23. |

### 5.2 Geografía

| Señal | Tipo | Detalle |
|---|---|---|
| `city_id` | Integer | ID de ciudad (vía API DV360 o metadatos SDF). |
| `country_code` | String | Código de país/región (ej.: `"US"`). |
| `country_id` | Integer | ID de país/región. |
| `dma_id` | Integer | Designated Market Area (custom bidding ID sheet). |
| `zip_postal_code` | String | Código postal. |

### 5.3 Creatividad y formato

| Señal | Tipo | Detalle |
|---|---|---|
| `ad_type` | Integer | 0 display, 1 vídeo, 2 audio. |
| `creative_id` | Integer | ID de creatividad. |
| `creative_height` | Integer | Alto en píxeles (solo display). |
| `creative_width` | Integer | Ancho en píxeles (solo display). |

### 5.4 Dispositivo, navegador y red

| Señal | Tipo | Detalle |
|---|---|---|
| `browser_reportable_id` | Integer | ID de navegador. |
| `browser_timezone_offset_minutes` | Integer | Minutos entre la zona del navegador y GMT-12 (1320 = GMT+10). |
| `device_type` | Integer | 0 desktop, 1 unknown, 2 smartphone, 3 tablet, 4 smart TV, 5 connected TV, 6 set top box, 7 connected device. |
| `environment` | Integer | 10 web optimizada, 11 web no optimizada, 12 app. |
| `isp_reportable_isp` | Integer | ID de ISP. |
| `language` | String | Idioma del navegador. |
| `mobile_make_reportable_id` | Integer | Fabricante del móvil. |
| `mobile_model_reportable_id` | Integer | Modelo del móvil. |
| `net_speed` | Integer | 1 broadband/4G, 2 dialup, 3 desconocida, 4 EDGE/2G, 5 UMTS/3G, 6 DSL básico, 7 HSDPA/3.5G. |
| `operating_system_reportable_id` | Integer | Sistema operativo. |

> ⚠️ **Migración Q3 2025.** `browser_id`, `isp_id`, `mobile_make_id`, `mobile_model_id` y
> `operating_system_id` están **descatalogados**. Usa siempre las variantes
> `*_reportable_id`. Los scripts antiguos siguen funcionando temporalmente pero deben migrarse.

### 5.5 Inventario y contexto

| Señal | Tipo | Detalle |
|---|---|---|
| `ad_position` | Integer | 0 desconocida, 1 above the fold, 2 below the fold. |
| `adx_page_categories` | List of integers | Categorías de página (verticales de AdWords API). |
| `channels` | List of integers | IDs de channel de DV360. |
| `domain` | String | Dominio raíz (`domain.com`). **No soportado en CTV** → usa `site_id`. |
| `exchange_id` | Integer | ID de exchange. |
| `site_id` | Integer | ID de site (dimensión app/URL ID en reporting). |

### 5.6 Calidad de la impresión

| Señal | Tipo | Detalle |
|---|---|---|
| `active_view_measurable` | Boolean | 1 si la impresión era medible por Active View. |
| `active_view_viewed` | Boolean | 1 si Active View detectó que el anuncio se vio. |
| `click` | Boolean | 1 si hubo clic. |
| `time_on_screen_seconds` | Integer | Segundos en pantalla. |

### 5.7 Vídeo y audio

| Señal | Tipo | Detalle |
|---|---|---|
| `audible` | Boolean | Solo RTB. Sonido activado al verse. |
| `completed_in_view_audible` | Boolean | Solo RTB. Completado, en vista y con sonido. |
| `viewable_on_complete` | Boolean | Solo RTB. Visible al completarse. |
| `video_completed` | Boolean | Vídeo completado. |
| `video_player_height_start` | Integer | Alto del reproductor en el primer frame (px). |
| `video_player_width_start` | Integer | Ancho del reproductor en el primer frame (px). |
| `video_player_size` | Integer | 0 desconocido, 1 pequeño, 2 grande, 3 HD. |
| `video_resized` | Binary | 1 si el reproductor cambió de tamaño durante la reproducción. |
| `video_content_duration_bucket` | Integer | 0 desconocido, 1 (0–1 min), 2 (1–5), 3 (5–15), 4 (15–30), 5 (30–60), 7 (>60). Límite superior exclusivo. |
| `video_genre_ids` | List of integers | IDs de género de vídeo/audio. |
| `video_livestream` | Boolean | `true` si es retransmisión en directo. |
| `audio_completed` | Boolean | Solo audio. 1 si el anuncio de audio se completó. |

### 5.8 Conversiones (Floodlight)

Todas aceptan un **Attribution Model ID**; usa `0` para last-touch por defecto.

| Función | Tipo | Detalle |
|---|---|---|
| `total_conversion_count(FL_ID, ATTR_ID)` | Double | Nº total de conversiones para ese par de IDs. |
| `total_conversion_value(FL_ID, ATTR_ID)` | Double | Revenue de actividades con Floodlight **Sales**. |
| `total_conversion_quantity(FL_ID, ATTR_ID)` | Double | Cantidad total de conversiones atribuidas. |
| `conversion_custom_variable(FL_ID, ATTR_ID, IDX)` | String | Valor de la u-variable `IDX` de la última conversión atribuida. `None` si no hay conversión o no está informada. |
| `conversion_variable_num(FL_ID, ATTR_ID)` | Integer | Variable Floodlight `num` de la última conversión con crédito positivo, o `None`. |
| `conversion_variable_ord(FL_ID, ATTR_ID)` | String | Variable Floodlight `ord` de la última conversión con crédito positivo, o `None`. |

> Todas estas funciones pueden devolver `None`. **Siempre** protégelas con una guarda antes de operar.

### 5.9 Google Analytics 4

| Función | Tipo | Detalle |
|---|---|---|
| `has_ga4_conversions(property_id, event_name)` | Boolean | `true` si la impresión tiene ≥1 conversión atribuida. |
| `ga4_conversions_count(property_id, event_name)` | Integer | Nº de conversiones atribuidas. |
| `ga4_conversions_max_value(property_id, event_name)` | Double | Valor máximo atribuido; `0` si no hay. |
| `ga4_conversions_max_value_usd(property_id, event_name)` | Double | Ídem en USD (cuentas GA en USD). |
| `ga4_conversions_total_value(property_id, event_name)` | Double | Suma de valores atribuidos; `0` si no hay. |
| `ga4_conversions_total_value_usd(property_id, event_name)` | Double | Ídem en USD. |

---

## 6. Qué NO está soportado

Esta es la fuente número uno de errores. El script parece Python, pero:

**Sintaxis prohibida**

- Argumentos con nombre: `func(arg1="abc")`.
- Subscripts y slices: `userlists[1:3]`.
- Acceso a atributos: `domain.length`.
- Recursión.
- Nombres de variables y funciones fuera del conjunto predefinido.
- Asignaciones avanzadas:
  - múltiple: `_a, _b = 1, 2`
  - swap: `_a, _b = _b, _a`
  - encadenada: `_a = _b = 2`
  - aumentada: `_idx += 1`

**Keywords prohibidas**

`global`, `nonlocal`, `exec`, `class`, `def`, `import` / `from ... import`, `lambda`,
`break`, `continue`, `yield`, `raise`, `assert`, `try`, `finally`, `except`,
`async`, `await`, `del`, `pass`, `...` (ellipsis).

**Bucles**

No hay bucles. Ni `for` ni `while`. Toda iteración debe expresarse como lista de criterios
dentro de una función de agregación.

**Operadores prohibidos**

- `*` y `**` en contextos no aritméticos (unpacking).
- Desplazamientos `<<` `>>`.
- Operadores de bits.
- Decoradores `@`.
- Identidad: `is`, `is not`.

**Consecuencias prácticas**

- No puedes definir funciones auxiliares → duplica la lógica o usa variables intermedias.
- No puedes hacer `try/except` → toda robustez se implementa con `if x == None:`.
- No puedes iterar una lista de hoteles → usa conjuntos literales y `in`.
- Usa `== None` / `!= None`, nunca `is None`.

---

## 7. Ciclo de vida operativo

1. **Crear el algoritmo** en Partner o Advertiser → *Resources › Custom Bidding › New Algorithm*.
   Objetivo **Custom** › **Use script**.
   - Partner level: el algoritmo puede compartirse entre varios advertisers.
   - Advertiser level: queda ligado a ese advertiser.
2. **Script tools** en la ventana *New script* permite buscar y copiar metadatos de
   *Attribution models*, *Floodlight activities* y *U-Variables*. Úsalo en vez de teclear IDs a mano.
3. **Check syntax** valida el script antes de guardar.
4. **Test your script** sobre una muestra aleatoria de **10 000 impresiones**:
   - Tipos de muestra: todas las impresiones (recomendado para ver la distribución),
     solo con clics, solo con conversiones.
   - Métricas devueltas: nº de impresiones muestreadas, impression value/cost (solo con
     "all impressions"), **% de errores de ejecución**, **% de impresiones puntuadas**,
     **% de impresiones con score > 0**.
   - Descargable en `.csv` para inspeccionar valores individuales.
5. **Procesado**: hasta ~20 minutos hasta que el script aparece en la lista.
6. **Entrenamiento**: 1–3 días si se cumplen los
   [requisitos de datos](https://support.google.com/displayvideo/answer/9723477).
   El modelo está listo cuando *Is the model ready?* = **Yes** en la pestaña Summary.
7. **Activación**:
   - IO: *Optimization › Automate bid & budget at insertion order level › Maximize custom value / cost › [algoritmo]*.
   - LI: *Bid strategy › Automated Bidding › Maximize custom value / cost › [algoritmo]*.
8. **Medición**: monta un [experimento A/B](https://support.google.com/displayvideo/answer/9040669)
   con el custom bidding como variante frente a un control.

### Tracking de conversiones — buenas prácticas

- **Custom bidding con scripts**: hay que asegurarse de que **todos los line items** que usan
  el script tengan la conversión dada de alta en *tracked conversions*. Si el Floodlight no
  está asignado al LI, la función devolverá `None` y el script puntuará mal en silencio.
- **Custom bidding con reglas**: el IO/LI trackea la conversión automáticamente; el lookback
  por defecto es 90 días y sigue siendo editable.
- El conteo de conversiones sigue el tipo de scoring: si el script solo usa post-click,
  el tracked conversion será "Post click only"; si considera post-view, será "All Conversions".
