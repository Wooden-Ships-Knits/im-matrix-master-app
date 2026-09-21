"""IM Master — API.

Only /api/health so far. The seven endpoints the existing React client already
calls (see ../im-master/client/src/api.js) come next, on top of the v2 schema.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .db import ping, pool
from .settings import settings

log = logging.getLogger("im_master")


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open()
    yield
    pool.close()


app = FastAPI(title="IM Master", version="0.2.0", lifespan=lifespan)


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
    return {
        "status": "ok",
        "database": "ok" if ok else "unreachable",
        "db_name": settings.postgres_db,
    }
