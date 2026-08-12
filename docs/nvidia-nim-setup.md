# Guia: NVIDIA NIM en GitHub Copilot

## Que es NVIDIA NIM

NVIDIA NIM (NVIDIA Inference Microservices) es una plataforma de inferencia de modelos de IA que ofrece:
- **116+ modelos** de codigo abierto (LLMs, vision, embeddings, etc.)
- **Free tier**: ~40 RPM por modelo, sin limite de creditos, sin tarjeta
- **API compatible con OpenAI** — funciona en cualquier cliente OpenAI

## Configuracion actual

### Proveedor registrado en Copilot

```
ID:       203e8e64-ec9a-44ac-915e-d454697bacc6
Nombre:   NVIDIA NIM (build.nvidia.com)
Base URL: https://integrate.api.nvidia.com/v1
Tipo:     openai (compatible)
Auth:     Bearer token (nvapi-...)
```

### Como instalar desde cero

```powershell
# Con el script de este repo:
python setup/install-nvidia-provider.py --api-key "nvapi-TU_KEY"

# Para actualizar la API key (si expiro o cambiaste de cuenta):
python setup/install-nvidia-provider.py --api-key "nvapi-NUEVA_KEY"

# Para eliminar el proveedor:
python setup/install-nvidia-provider.py --remove
```

### Obtener API key gratuita

1. Ir a [build.nvidia.com](https://build.nvidia.com)
2. Crear cuenta gratuita
3. Menu superior derecho → "Get API Key"
4. Copiar la key que empieza por `nvapi-`

## Modelos disponibles

Los modelos se registran en la DB de Copilot. Ver [model-catalog.md](model-catalog.md) para la lista completa.

Los registrados actualmente en Copilot (verificados el 2026-08-12):
- Nemotron Super 49B — equilibrio velocidad/calidad
- Llama 3.3 70B — proposito general
- DeepSeek V4 Flash (`deepseek-v4-flash-0731`) — contexto 1M, muy rapido

> El alias `deepseek-ai/deepseek-v4-flash` (sin fecha) llego a fin de vida el
> 2026-08-07 y devuelve HTTP 410. Usa siempre la variante fechada.

## Limitaciones del free tier

| Limite | Valor |
|--------|-------|
| Requests por minuto (RPM) | ~40 por modelo |
| Creditos | No aplica (eliminado) |
| Tarjeta de credito | No requerida |
| Modelos | 116+ disponibles |

## Generacion de imagenes y video

**IMPORTANTE**: La API de chat (`integrate.api.nvidia.com/v1`) NO soporta generacion de imagenes.

Para imagenes/video usa el script `scripts/nvidia_gen.py`:
- Pollinations (gratis, instantaneo, sin key)
- HuggingFace (gratis con token opcional)
- NVIDIA NIM imagen (endpoint separado, lento en free tier)

```bash
python scripts/nvidia_gen.py "tu prompt" --list-models
```

## Solucionar problemas

### Los modelos no aparecen en el selector de Copilot
1. Reiniciar GitHub Copilot completamente
2. Verificar que el proveedor esta en la DB: `python setup/install-nvidia-provider.py --api-key "tu-key"`

### Error 401 (Unauthorized)
La API key expiró o es incorrecta. Obtener una nueva en [build.nvidia.com](https://build.nvidia.com) y ejecutar:
```
python setup/install-nvidia-provider.py --api-key "nvapi-NUEVA_KEY"
```

### Error "requires apiKey but no secret was found in the keychain"
El proveedor conserva la cabecera de autorizacion, pero Copilot intenta buscar
la API key en el almacen de credenciales del sistema. Vuelve a ejecutar el
instalador para migrar el proveedor a autenticacion por cabecera:
```powershell
python setup/install-nvidia-provider.py --api-key "nvapi-TU_KEY"
```
Despues, reinicia GitHub Copilot y abre una sesion nueva antes de seleccionar
el modelo.

### Error 410 (Gone) — "has reached its end of life"
NVIDIA retira modelos periodicamente. El alias sin fecha (por ejemplo
`deepseek-ai/deepseek-v4-flash`) deja de existir y hay que usar la variante
fechada (`deepseek-ai/deepseek-v4-flash-0731`). Para ver que IDs siguen vivos
en tu cuenta, consulta la API:
```powershell
curl -H "Authorization: Bearer $env:NVIDIA_API_KEY" https://integrate.api.nvidia.com/v1/models
```
Despues actualiza el registro con:
```powershell
python setup/install-nvidia-provider.py --api-key "nvapi-TU_KEY"
```

### Error 429 (Rate limit)
Has superado los ~40 RPM del free tier. Espera 1 minuto.
