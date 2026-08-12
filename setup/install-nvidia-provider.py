#!/usr/bin/env python3
"""
Instala el proveedor NVIDIA NIM en la base de datos de GitHub Copilot.

Uso:
  python install-nvidia-provider.py --api-key nvapi-TU_KEY
  python install-nvidia-provider.py --api-key nvapi-TU_KEY --db C:/ruta/data.db
  python install-nvidia-provider.py --remove   # Eliminar proveedor NVIDIA
"""

import argparse
import json
import os
import sqlite3
import sys
import uuid
from datetime import datetime, timezone


NVIDIA_PROVIDER_ID = "203e8e64-ec9a-44ac-915e-d454697bacc6"
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

# Modelos verificados como disponibles en el plan gratuito de build.nvidia.com
# Ultima verificacion: 2026-08-12
# Eliminados por EOL (410) o no disponibles en cuenta gratuita (404):
#   Nemotron Ultra 253B, Llama 4 Maverick 17B, Mistral Large 2,
#   Codestral 22B, Qwen 3.5 122B, Qwen3-Coder 480B, Kimi K2.6, GLM-5.2
# DeepSeek V4 Flash: el alias sin fecha llego a EOL el 2026-08-07; se usa
# la variante fechada 'deepseek-v4-flash-0731', que sigue disponible.
NVIDIA_MODELS = [
    {
        "model_id": "nvidia/llama-3.3-nemotron-super-49b-v1",
        "display_name": "Nemotron Super 49B",
        "max_prompt": 131072,
        "max_output": 32768,
    },
    {
        "model_id": "meta/llama-3.3-70b-instruct",
        "display_name": "Llama 3.3 70B",
        "max_prompt": 131072,
        "max_output": 32768,
    },
    {
        "model_id": "deepseek-ai/deepseek-v4-flash-0731",
        "display_name": "DeepSeek V4 Flash",
        "max_prompt": 1000000,
        "max_output": 32768,
    },
]


def get_db_path():
    """Detecta automaticamente la ruta de la base de datos de Copilot."""
    home = os.path.expanduser("~")
    candidates = [
        os.path.join(home, ".copilot", "data.db"),
        os.path.join(os.environ.get("APPDATA", ""), ".copilot", "data.db"),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def install_provider(db_path: str, api_key: str):
    """Instala o actualiza el proveedor NVIDIA NIM en la DB de Copilot."""
    print(f"[*] Conectando a: {db_path}")
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    # Verificar schema
    tables = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    if "model_providers" not in tables or "provider_models" not in tables:
        con.close()
        raise RuntimeError("La base de datos no tiene las tablas esperadas (model_providers, provider_models)")

    columns = {r[1] for r in cur.execute("PRAGMA table_info(model_providers)").fetchall()}
    uses_settings_json = "settings_json" in columns

    # authKind='none' evita que la app busque un secreto en el llavero del
    # sistema (Windows Credential Manager, donde no existe ninguna entrada
    # para este proveedor); en su lugar, headersJson se envia tal cual en
    # cada peticion, ya con la API key real incluida.
    real_headers_json = json.dumps({"Authorization": f"Bearer {api_key}"})

    existing = cur.execute(
        "SELECT id FROM model_providers WHERE id=?", (NVIDIA_PROVIDER_ID,)
    ).fetchone()

    if uses_settings_json:
        # Esquema actual: columnas planas colapsadas en settings_json (JSON)
        settings = {
            "baseUrl": NVIDIA_BASE_URL,
            "wireApi": "completions",
            "azureApiVersion": None,
            "authKind": "none",
            "headersJson": real_headers_json,
        }
        settings_json = json.dumps(settings)

        if existing:
            cur.execute(
                "UPDATE model_providers SET settings_json=?, updated_at=? WHERE id=?",
                (settings_json, NOW, NVIDIA_PROVIDER_ID),
            )
            print(f"[OK] Proveedor NVIDIA NIM actualizado (settings_json, API key refrescada)")
        else:
            cur.execute("""
                INSERT INTO model_providers
                  (id, name, type, settings_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                NVIDIA_PROVIDER_ID,
                "NVIDIA NIM (build.nvidia.com)",
                "openai",
                settings_json,
                NOW,
                NOW,
            ))
            print(f"[OK] Proveedor NVIDIA NIM instalado (settings_json)")
    else:
        # Esquema antiguo (columnas planas) - se mantiene por compatibilidad
        if existing:
            cur.execute(
                "UPDATE model_providers SET headers_json=?, updated_at=? WHERE id=?",
                (real_headers_json, NOW, NVIDIA_PROVIDER_ID),
            )
            print(f"[OK] Proveedor NVIDIA NIM actualizado (API key refreshed)")
        else:
            cur.execute("""
                INSERT INTO model_providers
                  (id, name, base_url, type, auth_kind, headers_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                NVIDIA_PROVIDER_ID,
                "NVIDIA NIM (build.nvidia.com)",
                NVIDIA_BASE_URL,
                "openai",
                "none",
                real_headers_json,
                NOW,
                NOW,
            ))
            print(f"[OK] Proveedor NVIDIA NIM instalado")

    # Insertar modelos (skip duplicados)
    installed = 0
    for model in NVIDIA_MODELS:
        model_uuid = str(uuid.uuid4())
        try:
            cur.execute("""
                INSERT OR IGNORE INTO provider_models
                  (id, provider_id, model_id, wire_model, display_name,
                   max_prompt_tokens, max_output_tokens, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                model_uuid,
                NVIDIA_PROVIDER_ID,
                model["model_id"],
                model["model_id"],
                model["display_name"],
                model["max_prompt"],
                model["max_output"],
                NOW,
                NOW,
            ))
            if cur.rowcount > 0:
                print(f"  [+] {model['display_name']} ({model['model_id']})")
                installed += 1
            else:
                print(f"  [=] {model['display_name']} (ya existia)")
        except Exception as e:
            print(f"  [X] Error con {model['display_name']}: {e}")

    con.commit()
    con.close()
    print(f"\n[OK] {installed} modelos instalados/actualizados")
    print(f"     Reinicia GitHub Copilot para ver los modelos en el selector.")


def remove_provider(db_path: str):
    """Elimina el proveedor NVIDIA y todos sus modelos."""
    print(f"[*] Eliminando NVIDIA NIM de: {db_path}")
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    deleted_models = cur.execute(
        "DELETE FROM provider_models WHERE provider_id=?", (NVIDIA_PROVIDER_ID,)
    ).rowcount
    deleted_provider = cur.execute(
        "DELETE FROM model_providers WHERE id=?", (NVIDIA_PROVIDER_ID,)
    ).rowcount
    con.commit()
    con.close()
    print(f"[OK] Eliminados: {deleted_models} modelos, {deleted_provider} proveedor")


def main():
    parser = argparse.ArgumentParser(description="Instala NVIDIA NIM en GitHub Copilot")
    parser.add_argument("--api-key", "-k", default="",
                        help="NVIDIA API key (nvapi-...)")
    parser.add_argument("--db", "-d", default=None,
                        help="Ruta a data.db (se detecta automaticamente si no se especifica)")
    parser.add_argument("--remove", action="store_true",
                        help="Eliminar el proveedor NVIDIA NIM")
    args = parser.parse_args()

    db_path = args.db or get_db_path()
    if not db_path:
        print("[ERROR] No se encontro data.db. Especifica la ruta con --db")
        sys.exit(1)

    if not os.path.exists(db_path):
        print(f"[ERROR] data.db no encontrada: {db_path}")
        sys.exit(1)

    if args.remove:
        remove_provider(db_path)
        return

    api_key = args.api_key or os.environ.get("NVIDIA_API_KEY", "")
    if not api_key:
        print("[ERROR] Se necesita una API key. Usa --api-key nvapi-TU_KEY")
        print("        O define la variable de entorno NVIDIA_API_KEY")
        sys.exit(1)
    if not api_key.startswith("nvapi-"):
        print("[ERROR] La API key de NVIDIA debe empezar por 'nvapi-'")
        sys.exit(1)

    install_provider(db_path, api_key)


if __name__ == "__main__":
    main()
