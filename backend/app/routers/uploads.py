"""Style photos.

Stored under a generated name in the uploads volume — never the client's own
filename, and the content type is checked rather than the extension trusted
(backend.md §8).

Resized on the way in. A phone photo arrives at 3-5MB and the places that
show it are a 160px Matrix card, a 320px design sheet and a ~500px editor
pane — serving the original is 20-40x the bytes anybody can see, and the
Matrix layout shows three hundred of them per season. 1200px on the long
side keeps the editor pane sharp on a retina screen; JPEG because the
sources are photographs of knitwear, where its artefacts are invisible and
its size is a fifth of PNG's. The one case that is NOT re-encoded is a JPEG
already small enough: re-saving a JPEG costs quality for nothing.
"""
import io
import secrets
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from .. import repo
from ..settings import settings

router = APIRouter(prefix="/api/styles", tags=["styles"])

ALLOWED = {"image/jpeg", "image/png", "image/webp"}

# The long side of what is stored. The biggest place a photo is shown is the
# editor pane at ~500 CSS px, so 1200 is 2.4x that — sharp on retina, tiny
# on disk.
DISPLAY_PX = 1200
JPEG_QUALITY = 82


def shrink(data: bytes) -> tuple[bytes, str]:
    """The bytes to store and the extension they should carry.

    Raises ValueError for anything Pillow cannot read — which also catches a
    file whose content-type header lied.
    """
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("That file is not a readable image") from exc

    # Decide passthrough BEFORE exif_transpose: it returns a copy, and a
    # copy's .format is None, so testing afterwards re-encoded every small
    # JPEG for nothing (caught by the shrink checks).
    upright = img.getexif().get(274, 1) in (None, 1)
    small_jpeg = (img.format == "JPEG" and upright
                  and max(img.size) <= DISPLAY_PX
                  and len(data) <= 300 * 1024)
    if small_jpeg:
        return data, ".jpg"

    # Phones record orientation in EXIF rather than rotating pixels; apply it
    # now or the stored copy lies on its side in any viewer that ignores EXIF.
    img = ImageOps.exif_transpose(img)

    if max(img.size) > DISPLAY_PX:
        img.thumbnail((DISPLAY_PX, DISPLAY_PX), Image.LANCZOS)

    # Photographs with transparency do not exist in this workflow; white
    # matches the card and sheet backgrounds the photos sit on.
    if img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        rgba = img.convert("RGBA")
        background.paste(rgba, mask=rgba.split()[-1])
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    out = io.BytesIO()
    img.save(out, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return out.getvalue(), ".jpg"


@router.post("/{style_id}/image")
async def upload_image(style_id: int, image: UploadFile = File(...)):
    if not repo.load_style(style_id):
        raise HTTPException(status_code=404, detail="Style not found")
    if (image.content_type or "") not in ALLOWED:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG or WebP images")

    data = await image.read()
    limit = settings.max_upload_mb * 1024 * 1024
    if len(data) > limit:
        raise HTTPException(
            status_code=413,
            detail=f"Image is larger than {settings.max_upload_mb} MB",
        )

    try:
        stored, ext = shrink(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    directory = Path(settings.upload_dir)
    directory.mkdir(parents=True, exist_ok=True)
    name = f"{style_id}-{secrets.token_hex(6)}{ext}"
    (directory / name).write_bytes(stored)

    path = f"/uploads/{name}"
    repo.set_photo(style_id, path)
    return {"image_path": path}
