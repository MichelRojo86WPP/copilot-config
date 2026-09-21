# DV360 Custom Bidding — patrones de código reutilizables

Fragmentos limpios, listos para pegar en DV360. Todos respetan las limitaciones del DSL
(sin bucles, sin `def`, sin `try`, sin `is`). Ver
[`syntax-reference.md`](syntax-reference.md) para el catálogo completo de señales.

---

## P1 · Guardas de `None` y casting seguro

**Cuándo:** siempre, sin excepción, tras cualquier llamada `conversion_*`.
Es la causa número uno de "% de errores de ejecución" en el test del script.

```python
_sales_value = total_conversion_value(_FL_SALES_ID, 0)
if _sales_value == None:
    _sales_value = 0.0
else:
    _sales_value = float(_sales_value)

_item_id = conversion_custom_variable(_FL_SALES_ID, 0, 6)
if _item_id == None:
    _item_id = ""
else:
    _item_id = str(_item_id)
```

No existe `try/except`. No uses `is None`, usa `== None`.

---

## P2 · Panel de control de pesos centralizado

**Cuándo:** en cuanto el script tenga más de un segmento. Separa **qué** se puntúa
(la lógica, estable) de **cuánto** vale (los pesos, lo que se itera semana a semana).

```python
# ==========================================
# --- 1. CONFIGURACIÓN DE IDs ---
# ==========================================
_FL_SALES_ID = 10000001
_FL_CHECKOUT_ID = 10000002

_IOS_PROS = {20000001, 20000002, 20000003}
_IOS_RTG = {30000001, 30000002, 30000003}

_ITEMS_PRIO = {"A101", "A102", "A103"}
_ITEMS_DEST = {"B201", "B202", "B203", "B204", "B205", "B206"}

# ==========================================
# --- PANEL DE CONTROL DE PESOS ---
# ==========================================
_fixed_cpa_prio = 15000      # Puntuación máxima y fija para ventas prioritarias
_weight_pros_other = 1.0    # Peso tROAS para cross-sell en prospecting
_chk_pros_prio = 100         # Valor de checkout en producto prioritario
_chk_pros_dest = 50         # Valor de checkout en producto del destino
_chk_pros_other = 10        # Valor de checkout resto del mundo
_weight_fallback = 0.2      # Paracaídas de seguridad
```

Al iterar solo se tocan los números del panel. El diff entre iteraciones queda legible.

---

## P3 · Extracción de datos en un bloque único

**Cuándo:** siempre. Todas las llamadas a señales arriba, una sola vez, antes del scoring.
No puedes definir funciones, así que centralizar es la única forma de no duplicar.

```python
# ==========================================
# --- 2. EXTRACCIÓN DE DATOS ---
# ==========================================
_sales_count = total_conversion_count(_FL_SALES_ID, 0)
_checkout_count = total_conversion_count(_FL_CHECKOUT_ID, 0)
_sales_value = total_conversion_value(_FL_SALES_ID, 0)

_booked_item_id = conversion_custom_variable(_FL_SALES_ID, 0, 6)
_checkout_item_id = conversion_custom_variable(_FL_CHECKOUT_ID, 0, 6)

if _sales_value == None: _sales_value = 0.0
else: _sales_value = float(_sales_value)

if _booked_item_id == None: _booked_item_id = ""
else: _booked_item_id = str(_booked_item_id)

if _checkout_item_id == None: _checkout_item_id = ""
else: _checkout_item_id = str(_checkout_item_id)

_has_sale = _sales_count > 0
_has_checkout = _checkout_count > 0
```

---

## P4 · tROAS escalonado ("aplanado")

**Cuándo:** el objetivo es revenue pero la distribución tiene cola larga y unas pocas
conversiones caras dominarían el entrenamiento.

En vez de puntuar `_sales_value` en crudo, se aplica un multiplicador por tramos
**acotado**. Multiplicadores agresivos (1.0 → 3.0) hacen explotar el score;
aplanarlos (1.0 → 1.5) estabiliza el modelo.

```python
return max_aggregate([
    ([_has_sale and 0 < _sales_value < 1500],     (1.0 * _sales_value) * _weight),
    ([_has_sale and 1500 <= _sales_value < 3000], (1.2 * _sales_value) * _weight),
    ([_has_sale and 3000 <= _sales_value],        (1.5 * _sales_value) * _weight)
])
```

Alternativa continua, sin tramos, usando la función `log()` del DSL:

```python
if _sales_value > 0:
    _score = log(_sales_value)
else:
    _score = 0.0
```

---

## P5 · CPA fijo (volumen sobre eficiencia)

**Cuándo:** prospecting, o cualquier caso donde importa el **número** de conversiones y no
su importe. Desacopla la puja del precio del producto, lo que da pujas predecibles y
acelera el aprendizaje cuando hay pocas conversiones.

```python
return max_aggregate([
    # Venta en el subconjunto prioritario: score fijo, ignora el precio
    ([_has_sale and _sale_is_priority], _fixed_cpa_prio),

    # Resto de ventas: tROAS aplanado, para no matar la entrega
    ([_has_sale and not _sale_is_priority and 0 < _sales_value < 1500],     (1.0 * _sales_value) * _weight_other),
    ([_has_sale and not _sale_is_priority and 1500 <= _sales_value < 3000], (1.2 * _sales_value) * _weight_other),
    ([_has_sale and not _sale_is_priority and 3000 <= _sales_value],        (1.5 * _sales_value) * _weight_other)
])
```

**Trade-off:** el CPA fijo maximiza volumen y estabiliza el aprendizaje, pero puede pujar
por encima del valor real de conversiones baratas. El tROAS es más eficiente pero fragmenta
los datos por rango de precio y ralentiza el entrenamiento.

---

## P6 · Routing por `insertion_order_id`

**Cuándo:** un mismo algoritmo se comparte entre campañas con objetivos distintos
(prospecting vs. retargeting, mercados distintos). Es la forma de tener un único script
mantenible en lugar de N algoritmos.

```python
if insertion_order_id in _IOS_PROS:
    # Bloque A: prospecting — prioriza volumen
    return max_aggregate([...])

elif insertion_order_id in _IOS_RTG:
    # Bloque B: retargeting — prioriza eficiencia
    return max_aggregate([...])

else:
    # Bloque C: fallback
    return max_aggregate([...])
```

Se puede enrutar igual por `line_item_id`, `advertiser_id` o `country_code`.
Enrutar por IO escala mejor: añadir un LI nuevo dentro de un IO ya cubierto no exige
tocar el script.

---

## P7 · Bloque fallback de seguridad

**Cuándo:** **siempre**. Es la rama `else` final. Sin ella, si alguien asigna el algoritmo
a una campaña no contemplada, el script devuelve un score indefinido o cero y esa campaña
queda ciega.

```python
# ----------------------------------------------------
# BLOQUE C: FALLBACK (seguridad para otras campañas)
# ----------------------------------------------------
else:
    return max_aggregate([
        ([_has_sale and 0 < _sales_value < 1500],     (1.0 * _sales_value) * _weight_fallback),
        ([_has_sale and 1500 <= _sales_value < 3000], (1.2 * _sales_value) * _weight_fallback),
        ([_has_sale and 3000 <= _sales_value],        (1.5 * _sales_value) * _weight_fallback)
    ])
```

El peso del fallback es bajo (p. ej. `0.2`) y **no** puntúa micro-conversiones:
la rama por defecto debe ser conservadora.

Variante aún más estricta, cuando prefieres que una campaña no contemplada quede
completamente fuera del entrenamiento:

```python
else:
    return 0
```

---

## P8 · Segmentación por u-variable (ID de producto)

**Cuándo:** el Floodlight es global y dispara para todo el site, pero solo interesan
las conversiones de un subconjunto de productos. Filtrar por el conteo global de
conversiones puntuaría ventas ajenas a la campaña.

```python
_ITEMS_DEST = {"B201", "B202", "B203", "B204", "B205"}

_booked_item_id = conversion_custom_variable(_FL_SALES_ID, 0, 6)
if _booked_item_id == None: _booked_item_id = ""
else: _booked_item_id = str(_booked_item_id)

_sale_is_dest = _booked_item_id in _ITEMS_DEST
_sale_weight = _weight_rtg_dest if _sale_is_dest else _weight_rtg_other
```

> ⚠️ Los conjuntos son de **strings**: `conversion_custom_variable` devuelve `String`.
> `"A101"` con comillas, nunca `A101` sin ellas ni un entero.

**Punto crítico:** extrae la u-variable **de forma independiente para cada Floodlight**.
El ID de producto de la venta y el del checkout son variables distintas; reutilizar una
para la otra abre el agujero del píxel global (un checkout en cualquier producto del site
acabaría puntuando como si fuera del producto objetivo).

```python
_booked_item_id   = conversion_custom_variable(_FL_SALES_ID, 0, 6)
_checkout_item_id = conversion_custom_variable(_FL_CHECKOUT_ID, 0, 6)
```

---

## P9 · Micro-conversiones de checkout con valor fijo

**Cuándo:** hay *data sparsity* — no llegan suficientes ventas para que el modelo entrene
o para que salga del periodo de aprendizaje.

Se inyecta una señal intermedia (checkout, formulario, add-to-cart) con un valor
**fijo y pequeño**, nunca proporcional al revenue.

```python
if _chk_is_priority:
    _checkout_val = _chk_pros_prio      # 100
elif _chk_is_dest:
    _checkout_val = _chk_pros_dest     # 50
else:
    _checkout_val = _chk_pros_other    # 10

return max_aggregate([
    ([_has_sale and _sale_is_priority], _fixed_cpa_prio),
    ([_has_checkout], _checkout_val)
])
```

Reglas de calibración:

- El valor del checkout debe ser **órdenes de magnitud menor** que el de una venta.
  Si se sobrevalora, el modelo optimiza a micro-conversiones y el ROAS se hunde.
- Punto de partida razonable: ~2% del valor medio de pedido. **Es solo un arranque**:
  en la práctica ese valor suele acabar siendo mucho más bajo tras las primeras semanas.
  Revisa la distribución de scores del test y baja el valor si el checkout compite con la venta.
- Segmenta el valor del checkout igual que la venta, si no el píxel global mete ruido.
- Decide si el peso va **incorporado** en la constante (`_chk_prio = 100`, valores finales) o
  se aplica aparte (`_chk_base * _chk_weight`). Ambas valen, pero mézclalas y acabarás
  aplicando el peso dos veces sin darte cuenta. Elige una y documéntala.
- Requiere que el **Floodlight de checkout esté asignado a los Line Items**; si no,
  `total_conversion_count` devuelve 0 y la señal no existe.
- En ese Floodlight secundario, desmarca **Include in Conversions**: debe alimentar el
  script, no contaminar el reporting de conversiones de negocio.

---

## P10 · Selección de operador ternario para pesos

**Cuándo:** decidir un peso entre dos opciones sin escribir un `if/else` de cuatro líneas.

```python
_sale_weight  = _weight_rtg_dest if _sale_is_dest else _weight_rtg_other
_checkout_val = _chk_rtg_dest    if _chk_is_dest  else _chk_rtg_other
```

---

## P11 · Excluir impresiones del entrenamiento

**Cuándo:** hay un slice contaminado (una fecha con tracking roto, un formato que no
aplica) que no debe entrar en el modelo.

```python
# Excluir una fecha con datos corruptos
if date == 20260711:
    return None

# Entrenar solo con vídeo
if ad_type != 1:
    return None
```

`return None` **excluye**; `return 0` incluye con valor cero. No es lo mismo.

---

## P12 · Señales de calidad de medio

**Cuándo:** el objetivo es branding o no hay volumen de conversión suficiente ni con
micro-conversiones.

```python
return max_aggregate([
    ([active_view_viewed, time_on_screen_seconds >= 10], 3.0),
    ([active_view_viewed, click],                        2.5),
    ([active_view_viewed],                               1.0),
    ([active_view_measurable],                           0.1)
])
```

Para vídeo:

```python
return max_aggregate([
    ([video_completed, audible, viewable_on_complete], 4.0),
    ([video_completed, viewable_on_complete],          3.0),
    ([video_completed],                                2.0),
    ([active_view_viewed],                             1.0)
])
```

---

## P13 · U-variable numérica como score directo

**Cuándo:** la u-variable no es un identificador sino una **magnitud de negocio**
(noches reservadas, unidades, pasajeros, duración del contrato) y esa magnitud *es* el
valor que quieres maximizar.

```python
_uvar = conversion_custom_variable(_FL_ID, 0, _UVAR_IDX)

if _uvar != None and _uvar != "":
    return float(_uvar)
return 0
```

Dos guardas, no una: `conversion_custom_variable` devuelve `None` si no hubo conversión,
pero devuelve **string vacío** si la conversión existe y la variable no venía informada.
`float("")` revienta igual que `float(None)`.

Toda impresión sin conversión —y toda impresión que el modelo de atribución no acredite—
vale 0.

---

## P14 · Ponderar clic frente a post-view

**Cuándo:** una conversión post-clic y una post-view no valen lo mismo, y quieres que el
modelo lo sepa en lugar de tratarlas como el mismo evento.

```python
return sum_aggregate([
    ([click,     total_conversion_count(_FL_ID, 0) > 0], _weight_ct),
    ([not click, total_conversion_count(_FL_ID, 0) > 0], _weight_vt)
])
```

Las dos condiciones son mutuamente excluyentes, así que `sum_aggregate` y `max_aggregate`
dan el mismo resultado. Se usa `sum_aggregate` por convención de la documentación oficial.

Variante para valorar el clic por sí mismo como señal intermedia cuando faltan
conversiones:

```python
return max_aggregate([
    ([click],                                    _weight_click),
    ([total_conversion_count(_FL_ID, 0) > 0],    _weight_conv)
])
```

---

## P15 · Conversiones ponderadas multi-Floodlight

**Cuándo:** hay varias actividades de conversión que valen cosas distintas, y quieres que
el score refleje la **suma** de todo lo que hizo el usuario.

```python
return sum_aggregate([
    ([total_conversion_count(_FL_ID_1, 0) > 0], total_conversion_count(_FL_ID_1, 0) * _w1),
    ([total_conversion_count(_FL_ID_2, 0) > 0], total_conversion_count(_FL_ID_2, 0) * _w2),
    ([total_conversion_count(_FL_ID_3, 0) > 0], total_conversion_count(_FL_ID_3, 0) * _w3)
])
```

Comportamiento de `sum_aggregate` aquí:

- Si una impresión lleva a **conversiones de actividades distintas**, los valores se **suman**.
- Si lleva a **varias conversiones de la misma actividad**, se suma el conteo y luego se
  multiplica por el peso.

Casos de uso típicos:

- Un fabricante de coches con páginas de producto por gama (monovolumen, SUV, berlina),
  cada una con un valor distinto.
- Una ONG cuyo evento de donación es raro: añade actividades de *upper funnel* con pesos
  bajos para generar volumen de señal sin dejar de priorizar la donación.

**Elegir el agregador según la intención:**

| Quieres… | Agregador |
|---|---|
| Acumular todo lo que hizo el usuario | `sum_aggregate` |
| Quedarte con el evento de mayor valor | `max_aggregate` |
| Quedarte con el primero que case, por orden del script | `first_match_aggregate` |

> ⚠️ `sum_aggregate` sobre condiciones **solapables** infla el score y desbalancea el
> modelo. Úsalo solo cuando la acumulación sea intencionada.

---

## P16 · Conversiones ponderadas de GA4

**Cuándo:** el cliente mide en GA4 y no en Floodlight, o quiere usar eventos de embudo
que solo existen en GA4.

Recuerda los prerrequisitos (vinculación GA↔DV360, evento creado, volumen suficiente):
ver `references/syntax-reference.md` § 5.9.

Ponderar tipos de conversión por valor de negocio:

```python
return sum_aggregate([
    ([ga4_conversions_count(123, "one_time_purchase") > 0],  1),
    ([ga4_conversions_count(124, "newsletter_signup")  > 0],  2),
    ([ga4_conversions_count(125, "subscription")       > 0], 10)
])
```

Priorizar la etapa más profunda del embudo alcanzada:

```python
return max_aggregate([
    ([ga4_conversions_count(123, "landing_page")        > 0], 1),
    ([ga4_conversions_count(124, "application_start")   > 0], 5),
    ([ga4_conversions_count(125, "application_summary") > 0], 7),
    ([ga4_conversions_count(126, "application_complete")> 0], 9)
])
```

tROAS directo sobre el valor de transacción de GA4:

```python
return ga4_conversions_total_value(_PROPERTY_ID, "purchase")
```

---

## P17 · Dayparting y formato en campañas de branding

**Cuándo:** campañas de marca, CTV o audio donde no hay conversión que optimizar y la
señal útil es *cuándo* y *cómo* se ve el anuncio.

Por franja horaria (útil en CTV, donde el consumo se concentra en ciertas horas):

```python
return max_aggregate([
    ([0  <= hour_of_day < 7],   _score_a),
    ([7  <= hour_of_day < 9],   _score_b),
    ([9  <= hour_of_day < 18],  _score_c),
    ([18 <= hour_of_day < 22],  _score_b),
    ([22 <= hour_of_day <= 23], _score_a)
])
```

> ⚠️ En **CTV** el scoring basado en `domain` **no está soportado**. Usa `site_id`,
> `app_id` o señales temporales.

Combinando tiempo en pantalla con un formato concreto:

```python
return max_aggregate([
    ([time_on_screen_seconds > 10, creative_width == 300, creative_height == 600], _score_x),
    ([time_on_screen_seconds >= 3, time_on_screen_seconds <= 10,
      creative_width == 300, creative_height == 600],                              _score_y),
    ([time_on_screen_seconds < 3,  creative_width == 300, creative_height == 600], _score_z)
])
```

Audio — maximizar escuchas completas:

```python
return max_aggregate([
    ([audio_completed], _score_a)
])
```

`audio_completed` se registra **una sola vez por impresión**, aunque el usuario reinicie
el clip, y cuenta como completado aunque salte partes, siempre que llegue al final.

---

```python
# [CLIENTE] [MERCADO] - [OBJETIVO] (Iteración N)
# Type: Custom Bidding ([tROAS / CPA / Híbrido])
# Fecha: DD.MM.YYYY

# ==========================================
# --- 1. CONFIGURACIÓN DE IDs ---
# ==========================================
_FL_SALES_ID = 00000000
_FL_CHECKOUT_ID = 00000000

_IOS_PRIMARY = {00000000, 00000000}
_IOS_SECONDARY = {00000000, 00000000}

_ITEMS_PRIORITY = {"0000", "0000"}
_ITEMS_SECONDARY = {"0000", "0000"}

# ==========================================
# --- PANEL DE CONTROL DE PESOS ---
# ==========================================
_weight_priority = 1.5
_weight_other = 0.5
_weight_fallback = 0.2
_checkout_priority = 50
_checkout_other = 15

# ==========================================
# --- 2. EXTRACCIÓN DE DATOS ---
# ==========================================
_sales_count = total_conversion_count(_FL_SALES_ID, 0)
_checkout_count = total_conversion_count(_FL_CHECKOUT_ID, 0)
_sales_value = total_conversion_value(_FL_SALES_ID, 0)

_booked_id = conversion_custom_variable(_FL_SALES_ID, 0, 6)
_checkout_id = conversion_custom_variable(_FL_CHECKOUT_ID, 0, 6)

if _sales_value == None: _sales_value = 0.0
else: _sales_value = float(_sales_value)

if _booked_id == None: _booked_id = ""
else: _booked_id = str(_booked_id)

if _checkout_id == None: _checkout_id = ""
else: _checkout_id = str(_checkout_id)

_has_sale = _sales_count > 0
_has_checkout = _checkout_count > 0

# ==========================================
# --- 3. LÓGICA DE PUNTUACIÓN ---
# ==========================================

# BLOQUE A: funnel primario
if insertion_order_id in _IOS_PRIMARY:
    _sale_is_priority = _booked_id in _ITEMS_PRIORITY
    _chk_is_priority = _checkout_id in _ITEMS_PRIORITY

    _sale_weight = _weight_priority if _sale_is_priority else _weight_other
    _checkout_val = _checkout_priority if _chk_is_priority else _checkout_other

    return max_aggregate([
        ([_has_sale and 0 < _sales_value < 1500],     (1.0 * _sales_value) * _sale_weight),
        ([_has_sale and 1500 <= _sales_value < 3000], (1.2 * _sales_value) * _sale_weight),
        ([_has_sale and 3000 <= _sales_value],        (1.5 * _sales_value) * _sale_weight),
        ([_has_checkout], _checkout_val)
    ])

# BLOQUE B: funnel secundario
elif insertion_order_id in _IOS_SECONDARY:
    _sale_is_secondary = _booked_id in _ITEMS_SECONDARY
    _chk_is_secondary = _checkout_id in _ITEMS_SECONDARY

    _sale_weight = _weight_priority if _sale_is_secondary else _weight_other
    _checkout_val = _checkout_priority if _chk_is_secondary else _checkout_other

    return max_aggregate([
        ([_has_sale and 0 < _sales_value < 1500],     (1.0 * _sales_value) * _sale_weight),
        ([_has_sale and 1500 <= _sales_value < 3000], (1.2 * _sales_value) * _sale_weight),
        ([_has_sale and 3000 <= _sales_value],        (1.5 * _sales_value) * _sale_weight),
        ([_has_checkout], _checkout_val)
    ])

# BLOQUE C: fallback
else:
    return max_aggregate([
        ([_has_sale and 0 < _sales_value < 1500],     (1.0 * _sales_value) * _weight_fallback),
        ([_has_sale and 1500 <= _sales_value < 3000], (1.2 * _sales_value) * _weight_fallback),
        ([_has_sale and 3000 <= _sales_value],        (1.5 * _sales_value) * _weight_fallback)
    ])
```

---

## Checklist antes de guardar

- [ ] Toda llamada `conversion_*` tiene su guarda `== None`.
- [ ] Los conjuntos de u-variables son de **strings**.
- [ ] El ID de producto se extrae **por separado** para cada Floodlight.
- [ ] Existe un bloque `else` de fallback.
- [ ] `max_aggregate` (no `sum_aggregate`) cuando venta y checkout pueden coexistir.
- [ ] El valor del checkout es muy inferior al de la venta.
- [ ] Ningún `for`, `while`, `def`, `try`, `is`, slice ni asignación aumentada.
- [ ] **Check syntax** en verde.
- [ ] **Test your script**: % de errores de ejecución ≈ 0 y % de impresiones con score > 0 razonable.
- [ ] Los Floodlights de ventas **y** de checkout están asignados a los Line Items que usarán el algoritmo.


