from fastapi import APIRouter, UploadFile, File, status, HTTPException
from app.services.user_service import ActiveUser, AdminUser
import os
import json

from core.dependecies import FileUploadException
from core.logger import logger
from app.schemas.user_schema import FileShow, FileDir
from typing import List
from app.utils.utils import read_media_dir
from cloudinary import uploader
from cloudinary.utils import cloudinary_url
from app.schemas.media import IPFSResponse


router = APIRouter(
    tags=["Media"],
    prefix="/media",
)


# NOTE - Upload Profile Picture
@router.post(
    "/file-upload/{type}",
    response_model=List[FileShow],
    description="Add max size 500kb - 2MB. Supports batch uploads (1 or more files).",
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_file(
    type: FileDir, current_user: ActiveUser, files: List[UploadFile] = File(...)
):
    results = []
    for file in files:
        if not file.filename:
            continue  # Skip files without filename
        try:
            file_content = await file.read()
            upload_result = uploader.upload(
                file_content,
                public_id=f"{type}/{current_user.id}/{file.filename}",
                overwrite=True,
                folder=type,
            )
            results.append(FileShow(file_url=upload_result.get("secure_url")))  # type: ignore
        except Exception as e:
            logger.error(f"File upload failed for {file.filename}: {e}")
            # Continue processing remaining files instead of failing entire batch
            continue

    if not results:
        raise FileUploadException

    return results


# NOTE - Get the uploaded files
@router.get(
    "/file-upload/{type}",
    response_model=List[FileShow],
    description="Get uploaded files",
    status_code=status.HTTP_200_OK,
)
async def get_file(type: FileDir, current_user: AdminUser):
    file_list = await read_media_dir()
    file_list = [FileShow(file_url=file) for file in file_list]  # type: ignore
    return file_list


# NOTE - IPFS Upload
@router.post(
    "/ipfs-upload",
    response_model=List[IPFSResponse],
    description="Upload files to IPFS (via Pinata). Supports batch uploads (1 or more files).",
    status_code=status.HTTP_200_OK,
)
async def upload_to_ipfs(
    current_user: ActiveUser,
    files: List[UploadFile] = File(...),
):
    """
    Upload files to Pinata v3 uploads endpoint and return gateway URLs + CIDs.
    """

    from core.configs import settings
    import httpx

    url = settings.PINATA_URL

    headers: dict[str, str] = {}
    if settings.PINATA_JWT:
        headers["Authorization"] = f"Bearer {settings.PINATA_JWT}"
    elif (
        settings.PINATA_API_KEY != "Nothing for now"
        and settings.PINATA_SECRET_API_KEY != "Nothing for now"
    ):
        # Backward compatibility for legacy Pinata key auth.
        headers["pinata_api_key"] = settings.PINATA_API_KEY
        headers["pinata_secret_api_key"] = settings.PINATA_SECRET_API_KEY
    else:
        raise HTTPException(
            status_code=500,
            detail="Pinata credentials missing. Set PINATA_JWT or legacy Pinata API keys.",
        )

    results = []
    async with httpx.AsyncClient() as client:
        for file in files:
            if not file.filename:
                continue  # Skip files without filename

            try:
                content = await file.read()
                if not content:
                    logger.warning(f"Skipping empty file: {file.filename}")
                    continue

                file_data = {
                    "file": (
                        file.filename,
                        content,
                        file.content_type or "application/octet-stream",
                    )
                }
                data = {
                    "network": "public",
                    "name": file.filename,
                    "keyvalues": json.dumps({"uploaded_by": str(current_user.id)}),
                }

                response = await client.post(
                    url, files=file_data, data=data, headers=headers
                )

                if response.status_code not in (200, 201):
                    logger.error(
                        f"Pinata IPFS upload failed for {file.filename}: {response.text}"
                    )
                    continue  # Skip failed uploads, continue with remaining files

                response_data = response.json()
                # v3 response shape: {"data": {"cid": "...", ...}}
                ipfs_hash = response_data.get("data", {}).get(
                    "cid"
                ) or response_data.get("IpfsHash")
                if not ipfs_hash:
                    logger.error(
                        f"Pinata response missing CID for {file.filename}: {response_data}"
                    )
                    continue

                gateway_base = settings.PINATA_GATEWAY_URL.rstrip("/")
                if gateway_base.endswith("/ipfs"):
                    ipfs_url = f"{gateway_base}/{ipfs_hash}"
                else:
                    ipfs_url = f"{gateway_base}/ipfs/{ipfs_hash}"

                results.append(IPFSResponse(IpfsUrl=ipfs_url, IpfsHash=ipfs_hash))  # type: ignore
            except Exception as e:
                logger.error(f"IPFS upload failed for {file.filename}: {e}")
                continue  # Continue processing remaining files

    if not results:
        raise HTTPException(
            status_code=400, detail="No files were successfully uploaded"
        )

    return results
