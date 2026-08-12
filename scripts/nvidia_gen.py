#!/usr/bin/env python3
"""
NVIDIA AI Image & Video Generator
==================================
Genera imagenes y videos usando multiples proveedores gratuitos.

Uso:
  python nvidia_gen.py "un gato astronauta en Marte"
  python nvidia_gen.py "una ciudad futurista" --size 1920x1080
  python nvidia_gen.py "prompt" --model pollinations-flux
  python nvidia_gen.py --list-models

Proveedores (todos gratuitos):
  pollinations  -> image.pollinations.ai  (SIN key, instantaneo ~5s)
  huggingface   -> api-inference.huggingface.co (opcional HF_TOKEN)
  nvidia        -> ai.api.nvidia.com  (requiere NVIDIA_API_KEY, lento)

Requisitos: solo libreria estandar Python. Sin dependencias externas.
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuracion de API keys
# ---------------------------------------------------------------------------

NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")
HF_TOKEN = os.environ.get("HF_TOKEN", "")
REPLICATE_TOKEN = os.environ.get("REPLICATE_API_TOKEN", "")

# ---------------------------------------------------------------------------
# Catalogo de modelos
# ---------------------------------------------------------------------------

IMAGE_MODELS = {
    "pollinations-flux": {
        "provider": "pollinations",
        "model": "flux",
        "description": "Flux via Pollinations - GRATIS, sin key, ~5s [RECOMENDADO]",
    },
    "pollinations-turbo": {
        "provider": "pollinations",
        "model": "turbo",
        "description": "SDXL Turbo via Pollinations - muy rapido",
    },
    "pollinations-dream": {
        "provider": "pollinations",
        "model": "dreamshaperxl",
        "description": "DreamShaper XL via Pollinations - estilo artistico",
    },
    "flux-schnell-hf": {
        "provider": "huggingface",
        "model": "black-forest-labs/FLUX.1-schnell",
        "description": "Flux.1 Schnell via HuggingFace - gratis",
        "params": {"num_inference_steps": 4},
    },
    "sd35-hf": {
        "provider": "huggingface",
        "model": "stabilityai/stable-diffusion-3.5-large",
        "description": "Stable Diffusion 3.5 via HuggingFace",
        "params": {"num_inference_steps": 30},
    },
    "flux-schnell": {
        "provider": "nvidia",
        "path": "black-forest-labs/flux.1-schnell",
        "description": "Flux.1 Schnell via NVIDIA NIM (lento en free tier)",
        "params": {"steps": 4, "cfg_scale": 3.5, "mode": "base"},
    },
    "flux-dev": {
        "provider": "nvidia",
        "path": "black-forest-labs/flux.1-dev",
        "description": "Flux.1 Dev via NVIDIA NIM - max calidad (muy lento)",
        "params": {"steps": 30, "cfg_scale": 3.5, "mode": "base"},
    },
}

VIDEO_MODELS = {
    "cogvideox-hf": {
        "provider": "huggingface",
        "model": "THUDM/CogVideoX-5b",
        "description": "CogVideoX-5B via HuggingFace - gratis, ~5-10 min",
        "params": {"num_frames": 49, "num_inference_steps": 50},
    },
    "animatediff-hf": {
        "provider": "huggingface",
        "model": "guoyww/animatediff-motion-adapter-v1-5-3",
        "description": "AnimateDiff via HuggingFace",
        "params": {},
    },
}

DEFAULT_IMAGE_MODEL = "pollinations-flux"
DEFAULT_VIDEO_MODEL = "cogvideox-hf"


# ---------------------------------------------------------------------------
# Generadores de imagen
# ---------------------------------------------------------------------------

def generate_pollinations(prompt, model_cfg, width, height, seed):
    """Pollinations.ai - completamente gratis, sin registro, instantaneo."""
    model = model_cfg["model"]
    encoded = urllib.parse.quote(prompt)
    url = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width={width}&height={height}&model={model}&nologo=true&seed={seed}"
    )
    print(f"  -> Pollinations ({model})...")

    req = urllib.request.Request(url, headers={"User-Agent": "nvidia-gen/1.0"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if len(data) < 1000:
                raise RuntimeError(f"Imagen muy pequena ({len(data)} bytes)")
            return data
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 2:
                wait = 30 * (attempt + 1)
                print(f"  -> Rate limit, esperando {wait}s...")
                time.sleep(wait)
                continue
            raise


def generate_huggingface(prompt, model_cfg, width, height, seed):
    """HuggingFace Inference API - gratis (100K creditos/mes sin token)."""
    model = model_cfg["model"]
    url = f"https://api-inference.huggingface.co/models/{model}"

    headers = {"Content-Type": "application/json"}
    if HF_TOKEN:
        headers["Authorization"] = f"Bearer {HF_TOKEN}"

    payload = {
        "inputs": prompt,
        "parameters": {
            "width": width,
            "height": height,
            "seed": seed,
            **model_cfg.get("params", {}),
        },
    }
    print(f"  -> HuggingFace ({model})...")

    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                result = r.read()
            if result[:1] == b"{":
                parsed = json.loads(result)
                if "error" in parsed:
                    msg = parsed["error"]
                    if "loading" in msg.lower() and attempt < 2:
                        wait = int(parsed.get("estimated_time", 30))
                        print(f"  -> Modelo cargando, esperando {wait}s...")
                        time.sleep(min(wait, 60))
                        continue
                    raise RuntimeError(f"Error HF: {msg}")
            if len(result) < 1000:
                raise RuntimeError(f"Imagen muy pequena ({len(result)} bytes)")
            return result
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            if "loading" in body.lower() and attempt < 2:
                time.sleep(40)
                continue
            raise RuntimeError(f"HTTP {e.code}: {body[:200]}")
    raise RuntimeError("HuggingFace: modelo no disponible tras 3 intentos")


def generate_nvidia(prompt, model_cfg, width, height, seed):
    """NVIDIA NIM ai.api.nvidia.com - imagen via REST con artifacts[0].base64."""
    if not NVIDIA_API_KEY:
        raise RuntimeError("NVIDIA_API_KEY no configurada")

    url = f"https://ai.api.nvidia.com/v1/genai/{model_cfg['path']}"
    payload = {
        "prompt": prompt,
        "width": width,
        "height": height,
        "seed": seed,
        **model_cfg.get("params", {}),
    }
    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    print(f"  -> NVIDIA NIM ({model_cfg['path']})...")
    print(f"  -> Nota: primer request puede tardar 60-300s (cold start)")

    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")

    with urllib.request.urlopen(req, timeout=300) as r:
        body = json.loads(r.read())

    if "artifacts" in body:
        return base64.b64decode(body["artifacts"][0]["base64"])
    elif "data" in body:
        return base64.b64decode(body["data"][0]["b64_json"])
    else:
        raise RuntimeError(f"Respuesta inesperada: {list(body.keys())}")


# ---------------------------------------------------------------------------
# Generadores de video
# ---------------------------------------------------------------------------

def generate_video_huggingface(prompt, model_cfg, width, height, seed):
    """CogVideoX o similar via HuggingFace (puede tardar 5-10 min)."""
    model = model_cfg["model"]
    url = f"https://api-inference.huggingface.co/models/{model}"

    headers = {"Content-Type": "application/json", "X-Wait-For-Model": "true"}
    if HF_TOKEN:
        headers["Authorization"] = f"Bearer {HF_TOKEN}"

    payload = {
        "inputs": prompt,
        "parameters": {"seed": seed, **model_cfg.get("params", {})},
    }
    print(f"  -> Generando video con {model} (puede tardar 3-10 min)...")
    print(f"  -> HF_TOKEN: {'OK (configurado)' if HF_TOKEN else 'NO configurado (limite bajo)'}")

    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            result = r.read()
        if result[:1] == b"{":
            parsed = json.loads(result)
            if "error" in parsed:
                raise RuntimeError(f"Error: {parsed['error']}")
        return result
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body[:300]}")


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

IMAGE_GENERATORS = {
    "pollinations": generate_pollinations,
    "huggingface": generate_huggingface,
    "nvidia": generate_nvidia,
}

VIDEO_GENERATORS = {
    "huggingface": generate_video_huggingface,
}


def generate(prompt, model=DEFAULT_IMAGE_MODEL, width=1024, height=1024,
             seed=0, output=None, media_type="image", fallback=True):
    """Genera imagen o video con fallback automatico."""
    catalog = IMAGE_MODELS if media_type == "image" else VIDEO_MODELS
    generators = IMAGE_GENERATORS if media_type == "image" else VIDEO_GENERATORS
    ext = "png" if media_type == "image" else "mp4"

    if model not in catalog:
        available = list(catalog.keys())
        raise ValueError(f"Modelo '{model}' no disponible. Usa: {available}")

    if output is None:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe = "".join(c if c.isalnum() or c in " _-" else "" for c in prompt[:30]).strip()
        safe = safe.replace(" ", "_")
        output = f"img_{ts}_{safe}.{ext}"

    short_prompt = prompt[:60] + "..." if len(prompt) > 60 else prompt
    print(f"\n[GEN] {media_type.upper()}: '{short_prompt}'")
    print(f"      Modelo: {model} | {catalog[model]['description']}")
    print(f"      Tamano: {width}x{height}  Seed: {seed}")

    start = time.time()

    # Intentar modelo elegido, con fallback a pollinations
    attempts = [model]
    if fallback and media_type == "image" and catalog[model]["provider"] != "pollinations":
        attempts.append("pollinations-flux")

    last_error = None
    for attempt_model in attempts:
        if attempt_model != model:
            print(f"\n  [!] Fallback a {attempt_model}...")

        cfg = catalog[attempt_model]
        prov = cfg["provider"]
        gen_fn = generators.get(prov)
        if not gen_fn:
            print(f"  [X] Proveedor '{prov}' no implementado")
            continue

        try:
            result_bytes = gen_fn(prompt, cfg, width, height, seed)
            elapsed = time.time() - start
            Path(output).write_bytes(result_bytes)
            size_kb = len(result_bytes) // 1024
            print(f"\n  [OK] Guardado: {output}")
            print(f"       Tamano: {size_kb} KB  |  Tiempo: {elapsed:.1f}s")
            return output

        except Exception as e:
            last_error = e
            print(f"\n  [X] Error con {attempt_model}: {e}")
            if attempt_model != attempts[-1]:
                continue

    raise RuntimeError(f"Todos los proveedores fallaron. Ultimo error: {last_error}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="NVIDIA AI Image & Video Generator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python nvidia_gen.py "un gato astronauta en Marte"
  python nvidia_gen.py "ciudad futurista al atardecer" --size 1920x1080
  python nvidia_gen.py "una rosa roja" --model flux-dev
  python nvidia_gen.py "playa tropical" --model pollinations-turbo --seed 42
  python nvidia_gen.py "un robot bailando" --video
  python nvidia_gen.py --list-models
        """,
    )
    parser.add_argument("prompt", nargs="?", help="Descripcion de la imagen/video")
    parser.add_argument("--model", "-m", default=DEFAULT_IMAGE_MODEL,
                        help=f"Modelo (default: {DEFAULT_IMAGE_MODEL})")
    parser.add_argument("--size", "-s", default="1024x1024",
                        help="Tamano WxH (default: 1024x1024)")
    parser.add_argument("--seed", type=int, default=0,
                        help="Semilla para reproducibilidad")
    parser.add_argument("--output", "-o", default=None,
                        help="Archivo de salida (default: auto)")
    parser.add_argument("--video", action="store_true",
                        help="Generar video en lugar de imagen")
    parser.add_argument("--no-fallback", action="store_true",
                        help="No usar fallback si el proveedor falla")
    parser.add_argument("--list-models", action="store_true",
                        help="Listar modelos disponibles")

    args = parser.parse_args()

    if args.list_models:
        print("\n[IMG] MODELOS DE IMAGEN:")
        print(f"  {'ID':<22} {'Proveedor':<14} Descripcion")
        print(f"  {'-'*70}")
        for mid, cfg in IMAGE_MODELS.items():
            marker = " <-- default" if mid == DEFAULT_IMAGE_MODEL else ""
            print(f"  {mid:<22} {cfg['provider']:<14} {cfg['description']}{marker}")

        print("\n[VIDEO] MODELOS DE VIDEO (usa --video):")
        print(f"  {'ID':<22} {'Proveedor':<14} Descripcion")
        print(f"  {'-'*70}")
        for mid, cfg in VIDEO_MODELS.items():
            marker = " <-- default" if mid == DEFAULT_VIDEO_MODEL else ""
            print(f"  {mid:<22} {cfg['provider']:<14} {cfg['description']}{marker}")

        print("\n[TIPS]")
        print("  pollinations-flux  --> Sin key, ~5s, perfecto para empezar")
        print("  flux-schnell-hf    --> HF gratuito, buena calidad")
        print("  flux-dev           --> NVIDIA NIM, max calidad (muy lento free tier)")
        print(f"\n  NVIDIA_API_KEY : {'OK (configurada)' if NVIDIA_API_KEY else 'NO configurada'}")
        print(f"  HF_TOKEN       : {'OK (configurado)' if HF_TOKEN else 'no configurado (funciona sin el)'}")
        return

    if not args.prompt:
        parser.print_help()
        print("\n[ERROR] Debes proporcionar un prompt")
        sys.exit(1)

    try:
        w, h = [int(x) for x in args.size.lower().split("x")]
    except ValueError:
        print(f"[ERROR] Tamano invalido: '{args.size}'. Usa formato WxH, ej: 1024x1024")
        sys.exit(1)

    media_type = "video" if args.video else "image"
    if args.video and args.model == DEFAULT_IMAGE_MODEL:
        model = DEFAULT_VIDEO_MODEL
    else:
        model = args.model

    try:
        output_path = generate(
            prompt=args.prompt,
            model=model,
            width=w,
            height=h,
            seed=args.seed,
            output=args.output,
            media_type=media_type,
            fallback=not args.no_fallback,
        )
        print(f"\n[*] Listo: {output_path}")
        if sys.platform == "win32" and media_type == "image":
            os.startfile(output_path)

    except Exception as e:
        print(f"\n[ERROR] {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
