"""IM Master — API.

Serves the endpoints the existing React client calls (frontend/src/api.js) on
top of the v2 schema. The mapping between the client's field names and the
tables lives in repo.py.
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .db import ping, pool
from .routers import auth as auth_routes
from .routers import checklist, matrix, meta, reports, sales, styles, uploads
from .settings import settings

log = logging.getLogger("im_master")


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open()
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    yield
    pool.close()


app = FastAPI(title="IM Master", version="0.2.0", lifespan=lifespan)

# The client reads `error` from a failed response, not FastAPI's `detail`
# (frontend/src/api.js), so errors are reshaped to match rather than silently
# showing "Request failed (400)".


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    where = ".".join(str(p) for p in first.get("loc", [])[1:])
    msg = first.get("msg", "Invalid request")
    return JSONResponse(status_code=422,
                        content={"error": f"{where}: {msg}" if where else msg})


app.include_router(auth_routes.router)
app.include_router(meta.router)
app.include_router(styles.router)
app.include_router(reports.router)
app.include_router(sales.router)
app.include_router(checklist.router)
app.include_router(matrix.router)
app.include_router(uploads.router)


@app.middleware("http")
async def guard_writes(request: Request, call_next):
    """Anything that changes something needs an operator session.

    Applied as middleware rather than per route: a dependency has to be
    remembered on every new endpoint, and the one that gets forgotten is the
    one that matters. Signing in is exempt, or there would be no way to start.
    """
    from .auth import WRITE_METHODS, read, OPERATOR

    if request.method in WRITE_METHODS and request.url.path.startswith("/api/"):
        if not request.url.path.startswith("/api/auth/"):
            token = request.headers.get("authorization", "")
            role = read(token.removeprefix("Bearer ").strip() or None)
            if role is None:
                return JSONResponse({"error": "Sign in to make changes"}, status_code=401)
            if role != OPERATOR:
                return JSONResponse(
                    {"error": "Guests can look, but not change anything"},
                    status_code=403)
    return await call_next(request)

# Photos. In production nginx proxies /uploads/ here (frontend/nginx.conf).
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/api/health")
def health():
    """Liveness plus database connectivity — strategy.md Phase 1 exit criteria."""
    try:
        ok = ping()
    except Exception as exc:  # noqa: BLE001 - report, don't crash the probe
        log.warning("health check failed: %s", exc)
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "database": "unreachable", "detail": str(exc)},
        )
    return {"status": "ok", "database": "ok" if ok else "unreachable",
            "db_name": settings.postgres_db}
