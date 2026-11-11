"""The protections added in the security review, so a later change can't
quietly undo them."""

import base64
import hashlib
import hmac
import io
import struct
import time

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from app.utils.uploads import MAX_UPLOAD_BYTES, read_checked, unique_name
from core.admin.auth import _totp_ok

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def _upload(data: bytes, content_type: str, name: str = "photo.png") -> UploadFile:
    return UploadFile(file=io.BytesIO(data), filename=name, headers=Headers({"content-type": content_type}))


@pytest.mark.asyncio
async def test_accepts_a_real_photo():
    assert await read_checked(_upload(PNG, "image/png")) == PNG


@pytest.mark.asyncio
async def test_rejects_html_dressed_up_as_an_image():
    with pytest.raises(HTTPException) as err:
        await read_checked(_upload(b"<html><script>alert(1)</script></html>", "image/png"))
    assert err.value.status_code == 400


@pytest.mark.asyncio
async def test_rejects_types_that_can_carry_script():
    for kind in ("image/svg+xml", "text/html", "application/javascript"):
        with pytest.raises(HTTPException):
            await read_checked(_upload(PNG, kind))


@pytest.mark.asyncio
async def test_rejects_oversized_files():
    with pytest.raises(HTTPException) as err:
        await read_checked(_upload(PNG + b"\x00" * MAX_UPLOAD_BYTES, "image/png"))
    assert err.value.status_code == 413


def test_upload_names_never_collide_or_escape():
    a, b = unique_name("image.jpg"), unique_name("image.jpg")
    assert a != b
    assert "/" not in unique_name("../../other-user/agreement.png")


def _code(secret: str, at: float) -> str:
    key = base64.b32decode(secret)
    digest = hmac.new(key, struct.pack(">Q", int(at) // 30), hashlib.sha1).digest()
    o = digest[-1] & 0x0F
    return f"{(struct.unpack('>I', digest[o:o + 4])[0] & 0x7FFFFFFF) % 1_000_000:06d}"


def test_authenticator_codes():
    secret = "JBSWY3DPEHPK3PXP"
    assert _totp_ok(secret, _code(secret, time.time()))
    assert _totp_ok(secret, _code(secret, time.time() - 30))  # a little clock drift
    assert not _totp_ok(secret, _code(secret, time.time() - 300))  # an old code
    assert not _totp_ok(secret, "000000") or _code(secret, time.time()) == "000000"
    assert not _totp_ok(secret, "12345")


def test_land_listings_can_have_zero_bedrooms():
    from app.utils.validators import ValidatorMixin

    assert ValidatorMixin.validate_bedroom_count(0) == 0
    with pytest.raises(ValueError):
        ValidatorMixin.validate_bedroom_count(-1)
