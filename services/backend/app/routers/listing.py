from fastapi import APIRouter, status, Query, HTTPException
from core.dependecies import DBSession
from app.schemas.property_schema import (
    PropertyBase,
    PropertyShow,
    PropertyUpdate,
    FilterParams,
    PropertyFeed,
    DeleteProperty,
)
from app.services.listing import (
    create_property_listing,
    get_user_properties,
    get_property_by_id,
    update_listing,
    filtered_property,
    get_agent_by_id,
    delist_property,
)
from app.services.user_service import ActiveAgent, ActiveUser
from app.schemas.user_schema import AgentFeed
from typing import List, Annotated
from pydantic import Field
from fastapi import Query


router = APIRouter(
    prefix="/property",
    tags=["Property"],
)


@router.post(
    "/list-property",
    response_model=PropertyShow,
    description="Upload Property",
    status_code=status.HTTP_201_CREATED,
)
async def list_property(
    current_user: ActiveAgent, payload: PropertyBase, db: DBSession
):
    return await create_property_listing(current_user, payload, db)


@router.get("/me", response_model=List[PropertyShow], status_code=status.HTTP_200_OK)
async def get_my_listing(
    current_user: ActiveAgent,
    filter_query: Annotated[FilterParams, Query()],
    db: DBSession,
):
    return await get_user_properties(current_user, filter_query, db)


update_desc = """pick your field of interest and ignore the rest, the server will dynamically update them"""


@router.put(
    "/update/{property_id}",
    response_model=PropertyShow,
    status_code=status.HTTP_202_ACCEPTED,
    description=update_desc,
)
async def edit_property_listing(
    property_id: int,
    update_data: PropertyUpdate,
    current_user: ActiveAgent,
    db: DBSession,
):
    return await update_listing(property_id, current_user, update_data, db)


list_desc = """  
Retrieve a paginated list of available properties using cursor-based pagination. Users can filter results based on specific criteria, such as property ID, and define the number of listings returned per request. The response includes a `next_cursor` to facilitate seamless pagination."""


@router.get(
    "/get-properties",
    response_model=PropertyFeed,
    status_code=status.HTTP_200_OK,
    description=list_desc,
)
async def property_feed(
    filter_query: Annotated[FilterParams, Query()],
    _current_user: ActiveUser,
    db: DBSession,
):
    return await filtered_property(filter_query, db)


@router.get(
    "/details/{property_id}",
    response_model=PropertyShow,
    status_code=status.HTTP_200_OK,
    description="Get a single property by its ID",
)
async def get_property(
    property_id: int,
    current_user: ActiveUser,
    db: DBSession,
):
    return await get_property_by_id(property_id, db)


@router.get(
    "/agent-profile/{agent_id}",
    response_model=AgentFeed,
    status_code=status.HTTP_200_OK,
)
async def agent_profile(agent_id: int, current_user: ActiveUser, db: DBSession):
    return await get_agent_by_id(agent_id, db)


@router.delete(
    "/delete/{property_id}",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=DeleteProperty,
)
async def delete_property(
    property_id: Annotated[
        int, Field(ge=1, description="ID of property to be deleted")
    ],
    current_user: ActiveAgent,
    db: DBSession,
):
    return await delist_property(property_id, db, current_user)


# Elasticsearch Search Endpoints (Phase 2)

try:
    from app.services.search import get_search_service, PropertySearchFilter
    from core.logger import logger

    SEARCH_AVAILABLE = True
except ImportError:
    SEARCH_AVAILABLE = False
    logger.warning("Search service not available")


@router.get(
    "/search",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    description="Full-text search for properties with advanced filtering",
)
async def search_properties(
    query: str = Query(..., min_length=1, description="Search query"),
    min_price: Annotated[int, Query(description="Minimum price")] = None,
    max_price: Annotated[int, Query(description="Maximum price")] = None,
    location: Annotated[str, Query(description="Location filter")] = None,
    property_type: Annotated[str, Query(description="Property type")] = None,
    listing_type: Annotated[
        str, Query(description="Listing type (rent/sell)")
    ] = None,
    min_bedroom: Annotated[
        int, Query(ge=1, description="Minimum bedrooms")
    ] = None,
    max_bedroom: Annotated[
        int, Query(ge=1, description="Maximum bedrooms")
    ] = None,
    min_bathroom: Annotated[
        int, Query(ge=1, description="Minimum bathrooms")
    ] = None,
    max_bathroom: Annotated[
        int, Query(ge=1, description="Maximum bathrooms")
    ] = None,
    furnished: Annotated[
        bool, Query(description="Furnished properties only")
    ] = None,
    amenities: Annotated[
        List[str], Query(description="Required amenities")
    ] = None,
    sort: Annotated[
        str, Query(description="Sort order")
    ] = "MOST_RELEVANT",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """
    Search properties using Elasticsearch full-text search.

    Supports:
    - Fuzzy text search on title and description
    - Multiple filter types (price range, location, amenities, etc.)
    - Various sort options (price low/high, newest, oldest, relevance)
    - Pagination with limit and offset

    Example:
    ```
    GET /property/search?query=luxury%20apartment&min_price=1000000&max_price=5000000&location=Lagos
    ```

    Returns:
    ```json
    {
        "results": [
            {
                "id": 1,
                "title": "Luxury Apartment",
                "location": "Ikoyi",
                "price": 3500000,
                "score": 2.5
            }
        ],
        "total": 45,
        "limit": 20,
        "offset": 0
    }
    ```
    """
    if not SEARCH_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Search service not available",
        )

    try:
        service = await get_search_service()

        results = await service.search_properties(
            query=query,
            location=location,
            property_type=property_type,
            listing_type=listing_type,
            min_price=min_price,
            max_price=max_price,
            min_bedroom=min_bedroom,
            max_bedroom=max_bedroom,
            min_bathroom=min_bathroom,
            max_bathroom=max_bathroom,
            furnished=furnished,
            amenities=amenities,
            sort=sort,
            limit=limit,
            offset=offset,
        )

        logger.info(
            f"Property search executed",
            extra={
                "query": query,
                "total_results": results.get("total", 0),
                "returned": len(results.get("results", [])),
            },
        )

        return results

    except Exception as e:
        logger.error(f"Error searching properties: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Search failed"
        )


@router.post(
    "/{property_id}/index",
    status_code=status.HTTP_202_ACCEPTED,
    description="Index property in Elasticsearch for full-text search",
)
async def index_property_for_search(
    property_id: int,
    current_user: ActiveAgent,
    db: DBSession,
):
    """
    Index a property in Elasticsearch.

    Called automatically when property is created/updated.

    Args:
        property_id: ID of property to index
        current_user: Authenticated user (must own property)

    Returns:
        {"status": "indexed", "property_id": int}
    """
    if not SEARCH_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Search service not available",
        )

    try:
        # Get property from database
        property_obj = await get_property_by_id(property_id, db, use_cache=False)

        if property_obj.agent_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not own this property",
            )

        service = await get_search_service()

        await service.index_property(
            property_id=property_obj.id,
            title=property_obj.title,
            description=property_obj.description,
            location=property_obj.location,
            price=float(property_obj.price),
            property_type=property_obj.property_type,
            listing_type=property_obj.listing_type,
            status=property_obj.status,
            bedroom=property_obj.bedroom,
            bathroom=property_obj.bathroom,
            furnished=property_obj.furnished,
            is_negotiable=property_obj.is_negotiable,
            agent_id=property_obj.agent_id,
            amenities=property_obj.amenities or [],
        )

        logger.info(
            f"Property indexed in Elasticsearch", extra={"property_id": property_id}
        )

        return {"status": "indexed", "property_id": property_id}

    except Exception as e:
        logger.error(f"Error indexing property: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to index property",
        )
