# -*- mode: python ; coding: utf-8 -*-
# Spec de PyInstaller para compilar el backend EntrenadorIA como entrenador.exe.
# La base de datos NO se incluye: se distribuye aparte junto al ejecutable.
from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = [], [], []

# Alembic: empaquetamos el INI de configuración y el directorio de migraciones
# para que el ejecutable congelado pueda aplicarlas al arrancar. Se usa el
# nombre "alembic_migrations" para no colisionar con el paquete Python "alembic".
datas += [
    ("alembic.ini", "."),
    ("alembic", "alembic_migrations"),
    # Archivos estáticos servidos por FastAPI (StaticFiles en app/main.py).
    # Sin esto el backend congelado crashea al montar /static.
    ("app/static", "app/static"),
]

# Paquetes de Google (Gemini) con subpaquetes y datos (protos, etc.)
for pkg in (
    "google.generativeai",
    "google.ai.generativelanguage",
    "google.api_core",
    "google.auth",
    "google.rpc",
):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

hiddenimports += [
    # Aplicación FastAPI (el arranque usa uvicorn con cadena "app.main:app")
    "app.main",
    # bcrypt / passlib
    "bcrypt",
    "passlib.handlers.bcrypt",
    # uvicorn: componentes cargados dinámicamente por el launcher
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    # Alembic (migraciones de BD aplicadas al arrancar)
    "alembic",
    "alembic.config",
    "alembic.runtime.migration",
    "alembic.script",
    "alembic.env",
    "alembic.operations",
    "alembic.autogenerate",
    "alembic.ddl",
    "alembic.util",
    "alembic.revision",
    "Mako",
    "Mako.ext",
]

a = Analysis(
    ["server_launcher.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["psycopg", "psycopg2", "tkinter", "matplotlib", "email_validator"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="entrenador",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
