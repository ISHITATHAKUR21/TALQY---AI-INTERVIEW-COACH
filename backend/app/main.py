import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError, IntegrityError
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from . import auth, documents, interviews, results
from .db import setup


@asynccontextmanager
async def lifespan(app):
    setup()
    yield


app = FastAPI(title="TALQY Interview Coach", version="1.0", lifespan=lifespan)
for module in (auth, documents, interviews, results):
    app.include_router(module.router)


@app.middleware("http")
async def browser_boundary(request: Request, call_next):
    origin = request.headers.get("origin")
    if (
        request.method not in ("GET", "HEAD", "OPTIONS")
        and origin
        and origin != os.getenv("APP_ORIGIN", "http://localhost:5173")
    ):
        return JSONResponse({"detail": "Unrecognized request origin."}, status_code=403)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(OperationalError)
async def database_unavailable(request, exc):
    return JSONResponse(
        {"detail": "Database unavailable. Retry in a moment."}, status_code=503
    )


@app.exception_handler(IntegrityError)
async def conflicting_update(request, exc):
    return JSONResponse(
        {"detail": "The record changed. Refresh and try again."}, status_code=409
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


# The Docker image serves the built frontend and API from the same origin.

public = Path(__file__).resolve().parent.parent / "public"
if (public / "index.html").is_file():
    app.mount("/assets", StaticFiles(directory=public / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Unknown API route.")
        return FileResponse(public / "index.html")
