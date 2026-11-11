from pydantic import BaseModel, AnyUrl, Field, field_validator,AfterValidator
from typing import List, Union, Annotated, Optional
from app.utils.enums import ListingTypeEnum, PropertyTypeEnum, PropertyStatEnum
from datetime import datetime, time
from app.utils.enums import AppointmentStatEnum
from app.utils.validators import PropertyValidators, ValidatorMixin


class PropertyImage(BaseModel):
    image_url: Annotated[
        Union[AnyUrl, str],
        Field(examples=["https://example/img/property.jpg"], max_length=255),
    ]
    is_primary: Optional[bool] = False

    class Config:
        from_attributes = True


class PropertyBase(BaseModel):
    title: str
    description: str
    blockchain_property_id: Optional[str] = None
    blockchain_owner_id: Annotated[Optional[str],AfterValidator(ValidatorMixin.validate_near_account_id)] 
    is_nft_minted: Optional[bool] = False
    transaction_hash: Annotated[Optional[str],AfterValidator(ValidatorMixin.validate_blockchain_hash)]
    location: Annotated[str,AfterValidator(ValidatorMixin.validate_location)]
    price: Annotated[float,AfterValidator(PropertyValidators.validate_price_field)]
    property_type: PropertyTypeEnum
    listing_type: ListingTypeEnum
    status: PropertyStatEnum
    furnished: bool
    is_active: bool
    bathroom: int
    bedroom: Annotated[int,AfterValidator(ValidatorMixin.validate_bedroom_count)]
    air_condition: bool
    pop_ceiling: bool
    floor_tiles: bool
    running_water: bool
    furniture: bool
    prepaid_meter: bool
    wifi: bool
    is_negotiable: bool
    images: List[PropertyImage]

    class Config:
        from_attributes = True


class PropertyShow(PropertyBase):
    id: int
    agent_id: int

    class Config: #type: ignore
        from_attributes = True


class PropertyUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    blockchain_property_id: Optional[str] = None
    location: Annotated[Optional[str],AfterValidator(ValidatorMixin.validate_location)] = None
    price: Annotated[Optional[float],AfterValidator(PropertyValidators.validate_price_field)] = None
    property_type: Optional[PropertyTypeEnum] = None
    listing_type: Optional[ListingTypeEnum] = None
    status: Optional[PropertyStatEnum] = None
    furnished: Optional[bool] = None
    is_active: Optional[bool] = None
    bathroom: Optional[int] = None
    bedroom: Annotated[Optional[int],AfterValidator(ValidatorMixin.validate_bedroom_count)] = None
    air_condition: Optional[bool] = None
    pop_ceiling: Optional[bool] = None
    floor_tiles: Optional[bool] = None
    running_water: Optional[bool] = None
    furniture: Optional[bool] = None
    prepaid_meter: Optional[bool] = None
    wifi: Optional[bool] = None
    is_negotiable: Optional[bool] = None
    images: Optional[List[PropertyImage]] = None

    class Config:
        from_attributes = True


class FilterParams(BaseModel):
    limit: Annotated[
        int, Field(description="The amount of listings to fetch", ge=10, default=20)
    ]
    cursor: Annotated[
        int, Field(description="The Id of the last listing", ge=1, default=1)
    ]


class PropertyFeed(BaseModel):
    data: List[PropertyShow]
    next_coursor: int | None


class PropertySearchResponse(BaseModel):
    """What a search returns.

    Whole properties, not index fragments. The Elasticsearch path returned
    ids, titles and prices with no images or description, which no client
    could draw a result card from — so a search that "worked" still showed
    nothing. `data` matches the key the property feed already uses.
    """

    data: List[PropertyShow]
    total: int
    limit: int
    offset: int
    # Which path answered: "index" when Elasticsearch ranked the page,
    # "database" when it was unreachable or had nothing indexed. Surfaced so
    # an empty page can be told apart from a missing index without digging
    # through logs.
    source: str

    class Config:
        from_attributes = True


class DeleteProperty(BaseModel):
    message: str


class AgentAvailabilitySchema(BaseModel):
    weekday: Annotated[
        str, Field(..., examples=["MONDAY"])
    ]  # Store as uppercase string
    start_time: Annotated[
        time, Field(..., examples=["09:00"], description="HH:MM format")
    ]  # HH:MM format
    end_time: Annotated[time, Field(..., examples=["17:00"])]


class AppointmentSchema(BaseModel):
    agent_id: int
    property_id: int
    requested_time: datetime
    # The on-chain bid this viewing is for. Optional because people view
    # properties before committing money; supplied once a bid is accepted, so
    # a seller with several accepted bids can tell which buyer is coming.
    bid_id: int | None = None


class AvailabilityShow(AgentAvailabilitySchema):
    id: int
    agent_id: int
    is_booked: bool

    class Config:
        from_attributes = True


class AppointmentShow(BaseModel):
    id: int
    client_id: int
    agent_id: int
    property_id: int
    bid_id: int | None = None
    scheduled_at: datetime
    status: AppointmentStatEnum
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AppointmentStageShow(BaseModel):
    """Where a deal stands in the off-chain half of the flow.

    The buyer's escrow is locked from the moment their bid is accepted, but the
    next on-chain step — the seller releasing the agreement NFT — depends on a
    meeting that happens in the real world. Neither side could see that half,
    so a deal in progress looked identical to a deal that had stalled.

    Returned alongside the on-chain bid status so a client can show one
    continuous timeline instead of two disconnected halves.
    """

    bid_id: int
    property_id: int
    appointments: list[AppointmentShow]
    # True once a viewing for this bid reached `completed` — the signal the
    # seller is waiting on before releasing the agreement.
    ready_for_documents: bool
    # True if the parties met and did not agree. The buyer can cancel and
    # reclaim their escrow; surfaced so the app can say so plainly rather than
    # leaving them to guess.
    viewing_not_agreed: bool

    class Config:
        from_attributes = True


class ContractInDB(BaseModel):
    id: int
    property_id: int
    client_id: int
    agent_id: int
    contract_type: str
    amount: float
    start_date: datetime
    end_date: datetime | None
    is_active: bool
    property: PropertyShow

    class Config:
        from_attributes = True


class ContractCreate(BaseModel):
    property_id: int
    amount: float
    rental_period_months: Optional[int] = None  # Required only for rentals
    is_payment_made: bool  # Ensure payment is confirmed before contract creation


class ContractResponse(BaseModel):
    contract_id: int
    property_id: int
    contract_type: ListingTypeEnum
    amount: float
    start_date: datetime
    end_date: Optional[datetime]
    is_active: bool

    class Config:
        from_attributes = True
