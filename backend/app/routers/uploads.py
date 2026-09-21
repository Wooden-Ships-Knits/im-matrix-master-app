"""Style photos.

Stored under a generated name in the uploads volume — never the client's own
filename, and the content type is checked rather than the extension trusted
(backend.md §8).
"""
import secrets
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from .. import repo
from ..settings import settings

router = APIRouter(prefix="/api/styles", tags=["styles"])

ALLOWED = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


@router.post("/{style_id}/image")
async def upload_image(style_id: int, image: UploadFile = File(...)):
    if not repo.load_style(style_id):
        raise HTTPException(status_code=404, detail="Style not found")
    ext = ALLOWED.get(image.content_type or "")
    if not ext:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG or WebP images")

    data = await image.read()
    limit = settings.max_upload_mb * 1024 * 1024
    if len(data) > limit:
        raise HTTPException(
            status_code=413,
            detail=f"Image is larger than {settings.max_upload_mb} MB",
        )

    directory = Path(settings.upload_dir)
    directory.mkdir(parents=True, exist_ok=True)
    name = f"{style_id}-{secrets.token_hex(6)}{ext}"
    (directory / name).write_bytes(data)

    path = f"/uploads/{name}"
    repo.set_photo(style_id, path)
    return {"image_path": path}
