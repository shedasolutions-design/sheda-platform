"""Checks every user upload goes through before it is stored anywhere."""

import re
import uuid

from fastapi import HTTPException, UploadFile, status

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

# Photos and documents only. SVG is left out on purpose: it can carry script.
ALLOWED_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "application/pdf",
}

# The first bytes of each allowed format, so a renamed .html can't pass as a .jpg.
_SIGNATURES = (
    b"\xff\xd8\xff",  # JPEG
    b"\x89PNG\r\n\x1a\n",  # PNG
    b"GIF87a",
    b"GIF89a",
    b"%PDF-",
)


def _looks_allowed(head: bytes) -> bool:
    if head.startswith(_SIGNATURES):
        return True
    # WebP: RIFF....WEBP; HEIC/HEIF: ....ftypheic / ftypmif1 etc.
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return True
    return head[4:8] == b"ftyp"


async def read_checked(upload: UploadFile) -> bytes:
    """The file's bytes, if it is an allowed type and size; otherwise 400/413."""
    if (upload.content_type or "").lower() not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only photos (JPEG, PNG, WebP, GIF, HEIC) and PDFs can be uploaded.",
        )
    data = await upload.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Files can be up to 10 MB.",
        )
    if not data or not _looks_allowed(data[:16]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That file doesn't look like a photo or PDF.",
        )
    return data


def unique_name(filename: str | None) -> str:
    """A storage name nobody else's upload can collide with or overwrite: a
    random id plus a tidied version of the original name for readability."""
    stem = re.sub(r"[^A-Za-z0-9_-]+", "-", (filename or "file").rsplit(".", 1)[0]).strip("-")[:40]
    return f"{uuid.uuid4().hex}-{stem or 'file'}"
