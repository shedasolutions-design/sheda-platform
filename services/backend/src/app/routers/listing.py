from fastapi import APIRouter, status, Query, HTTPException, BackgroundTasks
from core.dependecies import DBSession
from app.schemas.property_schema import (
    PropertyBase,
    PropertyShow,
    PropertyUpdate,
    FilterParams,
    PropertyFeed,
    DeleteProperty,
    PropertySearchResponse,
)
from app.services.listing import (
    create_property_listing,
    get_user_properties,
    get_property_by_id,
    update_listing,
    filtered_property,
    get_agent_by_id,
    delist_property,
    # Aliased: the route handler below is also called `search_properties`,
    # and an unaliased import would be shadowed by it — the handler would
    # call itself instead of the service.
    search_properties as search_properties_in_db,
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


async def index_property_in_background(property_obj) -> None:
    """Add a property to the search index, quietly.

    Runs after the response has gone out, and swallows everything. One of the
    two deployments cannot reach Elasticsearch at all, so this fails routinely
    and by design — a listing must not get slower, or fail, because a ranking
    index could not be updated. Search itself reads the database and does not
    depend on this.
    """
    if not SEARCH_AVAILABLE:
        return
    try:
        service = await get_search_service()
        await service.index_property(
            property_id=property_obj.id,
            title=property_obj.title,
            description=property_obj.description,
            location=property_obj.location,
            price=float(property_obj.price or 0),
            property_type=property_obj.property_type,
            listing_type=property_obj.listing_type,
            status=property_obj.status,
            bedroom=property_obj.bedroom,
            bathroom=property_obj.bathroom,
            furnished=property_obj.furnished,
            is_negotiable=property_obj.is_negotiable,
            agent_id=property_obj.agent_id,
            # No amenities column on Property; the index accepts the field, so
            # it is passed empty rather than omitted.
            amenities=getattr(property_obj, "amenities", None) or [],
        )
        logger.info("Property indexed", extra={"property_id": property_obj.id})
    except Exception as e:
        logger.warning(f"Could not index property for search: {e}")


@router.post(
    "/list-property",
    response_model=PropertyShow,
    description="Upload Property",
    status_code=status.HTTP_201_CREATED,
)
async def list_property(
    current_user: ActiveAgent,
    payload: PropertyBase,
    db: DBSession,
    background_tasks: BackgroundTasks,
):
    new_property = await create_property_listing(current_user, payload, db)
    background_tasks.add_task(index_property_in_background, new_property)
    return new_property


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
    background_tasks: BackgroundTasks,
):
    updated = await update_listing(property_id, current_user, update_data, db)
    # Re-indexed on edit as well, or the index keeps describing the listing as
    # it was first written — a stale title ranks for the wrong searches.
    background_tasks.add_task(index_property_in_background, updated)
    return updated


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
    response_model=PropertySearchResponse,
    status_code=status.HTTP_200_OK,
    description="Full-text search for properties with advanced filtering",
)
async def search_properties(
    # No default, and first — the way every other handler in this file takes
    # its session. Written as `db: DBSession = None` it had to come last, and
    # whether FastAPI then still resolves the dependency or simply hands over
    # the default depends on the version: on one deployment the session
    # arrived, on the other `None` did, and every search answered 500. This
    # file pins no FastAPI version, so that difference is not stable.
    db: DBSession,
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
    # The database answers the query. Elasticsearch, when it is reachable and
    # has anything indexed, only decides the order.
    #
    # It used to do both, which meant search failed three ways at once: the
    # index is never populated, one deployment cannot reach Elasticsearch at
    # all, and the hits it returns are too thin to draw — ids and titles, no
    # images. The endpoint answered an empty list and looked perfectly
    # healthy. Now a missing index costs ordering quality, not results.
    ranked_ids = None
    if SEARCH_AVAILABLE and query and query.strip() and query.strip() != "*":
        try:
            service = await get_search_service()
            hits = await service.search_properties(
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
            # The service reports its own failures in an `error` key rather
            # than raising, so an unreachable Elasticsearch arrives here as a
            # successful call with no hits.
            if not hits.get("error"):
                ranked_ids = [h["id"] for h in hits.get("results", []) if h.get("id")]
        except Exception as e:
            # Ranking is an optimisation. Losing it must not lose the search.
            logger.warning(f"Search ranking unavailable, falling back to database: {e}")

    try:
        results = await search_properties_in_db(
            db,
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
            ranked_ids=ranked_ids,
        )

        logger.info(
            "Property search executed",
            extra={
                "query": query,
                "total_results": results.get("total", 0),
                "returned": len(results.get("data", [])),
                "source": results.get("source"),
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
            # Property has no `amenities` column. Reading it directly raised
            # AttributeError, which the bare `except` below turned into a 500
            # — so this endpoint could not succeed for any property, and the
            # failure read as "indexing is broken" rather than "that field
            # does not exist". Tolerated here so the rest of the document
            # still indexes; remove once the column exists.
            amenities=getattr(property_obj, "amenities", None) or [],
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
