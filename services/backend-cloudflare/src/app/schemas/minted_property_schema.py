from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.property_schema import PropertyBase, PropertyShow


class MintedPropertyCreate(BaseModel):
    blockchain_property_id: str = Field(..., description="On-chain property token ID")
    owner_wallet_id: str = Field(..., description="Wallet that minted the property")
    metadata_uri: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None


class MintedPropertyShow(BaseModel):
    id: int
    blockchain_property_id: str
    owner_wallet_id: str
    metadata_uri: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    linked_property_id: Optional[int] = None
    linked_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class MintedPropertyLinkRequest(BaseModel):
    property_data: PropertyBase


class MintedPropertyLinkResponse(BaseModel):
    minted_property: MintedPropertyShow
    property: PropertyShow
