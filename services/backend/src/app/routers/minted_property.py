from fastapi import APIRouter, status

from app.schemas.minted_property_schema import (
    MintedPropertyCreate,
    MintedPropertyLinkRequest,
    MintedPropertyLinkResponse,
    MintedPropertyShow,
)
from app.services.minted_properties import (
    create_minted_property_draft,
    link_minted_property_to_listing,
)
from app.services.user_service import ActiveAgent
from core.dependecies import DBSession


router = APIRouter(prefix="/minted-properties", tags=["Minted Properties"])


@router.post(
    "/register",
    response_model=MintedPropertyShow,
    status_code=status.HTTP_201_CREATED,
)
async def register_minted_property(
    payload: MintedPropertyCreate, current_user: ActiveAgent, db: DBSession
):
    return await create_minted_property_draft(payload, current_user, db)


@router.post(
    "/{minted_id}/create-listing",
    response_model=MintedPropertyLinkResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_listing_from_minted(
    minted_id: int,
    payload: MintedPropertyLinkRequest,
    current_user: ActiveAgent,
    db: DBSession,
):
    minted, listing = await link_minted_property_to_listing(
        minted_id, payload, current_user, db
    )
    return MintedPropertyLinkResponse(minted_property=minted, property=listing)
