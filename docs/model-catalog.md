# Catalogo de modelos NVIDIA NIM

Catalogo completo de los 116 modelos disponibles via `integrate.api.nvidia.com/v1`.

Todos son **gratuitos** (~40 RPM, sin creditos, sin tarjeta).

## Modelos registrados en Copilot (listos para usar)

| Modelo | Display | Contexto | Especialidad |
|--------|---------|----------|-------------|
| `nvidia/llama-3.1-nemotron-ultra-253b-v1` | Nemotron Ultra 253B | 131K | Razonamiento avanzado, flagship |
| `nvidia/llama-3.3-nemotron-super-49b-v1` | Nemotron Super 49B | 131K | Equilibrio velocidad/calidad |
| `meta/llama-4-maverick-17b-128e-instruct` | Llama 4 Maverick 17B | **1M** | Contexto enorme, multimodal |
| `deepseek-ai/deepseek-v4-flash` | DeepSeek V4 Flash | **1M** | Rapido, contexto enorme |
| `mistralai/codestral-22b-instruct-v0.1` | Codestral 22B | 262K | **Codigo** especializado |
| `meta/llama-3.3-70b-instruct` | Llama 3.3 70B | 131K | Proposito general |
| `mistralai/mistral-large-2-instruct` | Mistral Large 2 | 131K | Proposito general |
| `qwen/qwen3.5-122b-a10b` | Qwen 3.5 122B | 131K | Multilingue |

## LLMs de proposito general

| Modelo | Contexto | Notas |
|--------|----------|-------|
| `nvidia/llama-3.1-nemotron-ultra-253b-v1` | 131K | Mejor modelo NVIDIA, razonamiento |
| `nvidia/llama-3.3-nemotron-super-49b-v1` | 131K | Version rapida del Nemotron |
| `meta/llama-4-maverick-17b-128e-instruct` | 1M | Contexto 1M tokens |
| `meta/llama-3.3-70b-instruct` | 131K | Llama 3.3 clasico |
| `meta/llama-3.1-70b-instruct` | 131K | Llama 3.1 70B |
| `mistralai/mistral-large-2-instruct` | 131K | Mistral flagship |
| `mistralai/mistral-large-3-675b-instruct-2512` | 131K | Mistral 675B |
| `mistralai/mistral-medium-3.5-128b` | 131K | Mistral Medium |
| `qwen/qwen3.5-122b-a10b` | 131K | Qwen 3.5 multilingue |
| `qwen/qwen3.5-397b-a17b` | 131K | Qwen 3.5 grande |
| `google/gemma-4-31b-it` | 131K | Google Gemma 4 |
| `deepseek-ai/deepseek-v4-flash` | 1M | DeepSeek rapido |
| `deepseek-ai/deepseek-v4-pro` | 1M | DeepSeek completo |
| `openai/gpt-oss-120b` | 131K | GPT open source |
| `moonshotai/kimi-k2.6` | 131K | Moonshot Kimi |
| `minimaxai/minimax-m3` | 1M | MiniMax M3 |
| `stepfun-ai/step-3.7-flash` | 131K | StepFun rapido |
| `bytedance/seed-oss-36b-instruct` | 131K | ByteDance |

## Modelos de CODIGO

| Modelo | Contexto | Notas |
|--------|----------|-------|
| `mistralai/codestral-22b-instruct-v0.1` | 262K | **Top para codigo** |
| `bigcode/starcoder2-15b` | 16K | StarCoder 2 |
| `meta/codellama-70b` | 100K | CodeLlama |
| `google/codegemma-7b` | 8K | CodeGemma |
| `ibm/granite-34b-code-instruct` | 8K | IBM Granite Codigo |
| `deepseek-ai/deepseek-coder-6.7b-instruct` | 16K | DeepSeek Coder |

## Modelos VISION (entienden imagenes, NO las generan)

| Modelo | Contexto | Capacidad |
|--------|----------|-----------|
| `meta/llama-3.2-90b-vision-instruct` | 131K | Vision + texto |
| `meta/llama-3.2-11b-vision-instruct` | 131K | Vision + texto |
| `microsoft/phi-3-vision-128k-instruct` | 128K | Vision |
| `nvidia/vila` | 4K | VILA vision |
| `nvidia/nemotron-nano-12b-v2-vl` | 32K | Vision NVIDIA |
| `adept/fuyu-8b` | 4K | Fuyu vision |
| `google/deplot` | 4K | Graficas → texto |
| `google/diffusiongemma-26b-a4b-it` | 4K | DiffusionGemma (mejora prompts) |

## Modelos de EMBEDDINGS

| Modelo | Notas |
|--------|-------|
| `nvidia/llama-nemotron-embed-1b-v2` | Embeddings generales |
| `nvidia/nv-embedqa-e5-v5` | RAG, busqueda |
| `baai/bge-m3` | Multilingue |
| `snowflake/arctic-embed-l` | Snowflake |

## Modelos de DOMINIO ESPECIFICO

| Modelo | Dominio |
|--------|---------|
| `writer/palmyra-med-70b` | **Medicina** |
| `writer/palmyra-fin-70b-32k` | **Finanzas** |
| `writer/palmyra-creative-122b` | **Escritura creativa** |
| `sarvamai/sarvam-m` | **Indio** (Telugu, Hindi, etc.) |
| `upstage/solar-10.7b-instruct` | Proposito general |

## Modelos de SEGURIDAD / GUARDRAILS

| Modelo | Funcion |
|--------|---------|
| `meta/llama-guard-4-12b` | Filtro de contenido |
| `nvidia/llama-3.1-nemoguard-8b-content-safety` | Seguridad contenido |
| `nvidia/llama-3.1-nemotron-safety-guard-8b-v3` | Guardrails |
| `nvidia/nemotron-3.5-content-safety` | Clasificacion contenido |

## Modelos de TRADUCCION

| Modelo | Notas |
|--------|-------|
| `nvidia/riva-translate-4b-instruct` | Traduccion Riva |
| `nvidia/riva-translate-4b-instruct-v1.1` | Riva v1.1 |

## Como agregar mas modelos a Copilot

Para agregar un modelo del catalogo al selector de Copilot, edita `setup/install-nvidia-provider.py` 
y agrega una entrada a `NVIDIA_MODELS`:

```python
{
    "model_id": "nombre/del-modelo",
    "display_name": "Nombre visible",
    "max_prompt": 131072,
    "max_output": 32768,
},
```

Luego ejecuta:
```bash
python setup/install-nvidia-provider.py --api-key "nvapi-TU_KEY"
```
