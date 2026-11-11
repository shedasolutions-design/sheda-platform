"""
Search service with Elasticsearch integration.
Provides full-text, fuzzy, and faceted search for properties.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
from enum import Enum

from core.logger import get_logger
from core.exceptions import ExternalServiceError

logger = get_logger(__name__)


class PropertySearchFilter(str, Enum):
    """Property search filter options."""

    PRICE_LOW_TO_HIGH = "price_asc"
    PRICE_HIGH_TO_LOW = "price_desc"
    NEWEST = "created_desc"
    OLDEST = "created_asc"
    MOST_RELEVANT = "relevance"


class SearchService:
    """Full-text search service using Elasticsearch."""

    def __init__(self, elasticsearch_url: str):
        """
        Initialize search service.

        Args:
            elasticsearch_url: Elasticsearch connection URL
        """
        self.es_url = elasticsearch_url
        self.client = None
        self.index_name = "sheda_properties"

    async def initialize(self) -> None:
        """Initialize Elasticsearch client."""
        try:
            from elasticsearch import Elasticsearch

            self.client = Elasticsearch([self.es_url])

            # Create index if not exists
            if not self.client.indices.exists(index=self.index_name):
                await self._create_index()

            logger.info("Elasticsearch initialized")
        except ImportError:
            logger.warning("elasticsearch not installed, search disabled")
        except Exception as e:
            logger.error(f"Elasticsearch initialization failed: {str(e)}")
            raise ExternalServiceError("Elasticsearch", "Failed to initialize")

    async def _create_index(self) -> None:
        """Create Elasticsearch index with mappings."""
        mapping = {
            "mappings": {
                "properties": {
                    "id": {"type": "integer"},
                    "title": {
                        "type": "text",
                        "analyzer": "standard",
                        "fields": {"keyword": {"type": "keyword"}},
                    },
                    "description": {"type": "text", "analyzer": "standard"},
                    "location": {
                        "type": "text",
                        "analyzer": "standard",
                        "fields": {"keyword": {"type": "keyword"}},
                    },
                    "price": {"type": "float"},
                    "property_type": {"type": "keyword"},
                    "listing_type": {"type": "keyword"},
                    "status": {"type": "keyword"},
                    "bedroom": {"type": "integer"},
                    "bathroom": {"type": "integer"},
                    "furnished": {"type": "boolean"},
                    "is_negotiable": {"type": "boolean"},
                    "agent_id": {"type": "integer"},
                    "created_at": {"type": "date"},
                    "updated_at": {"type": "date"},
                    "amenities": {"type": "keyword"},
                }
            }
        }

        try:
            self.client.indices.create(index=self.index_name, body=mapping)
            logger.info(f"Created Elasticsearch index: {self.index_name}")
        except Exception as e:
            logger.error(f"Failed to create index: {str(e)}")

    async def index_property(
        self,
        property_id: int,
        title: str,
        description: str,
        location: str,
        price: float,
        property_type: str,
        listing_type: str,
        status: str,
        bedroom: int,
        bathroom: int,
        furnished: bool,
        is_negotiable: bool,
        agent_id: int,
        amenities: Optional[List[str]] = None,
    ) -> None:
        """
        Index property for search.

        Args:
            property_id: Property ID
            title: Property title
            description: Property description
            location: Property location
            price: Property price
            property_type: Type of property
            listing_type: Listing type (rent, sell)
            status: Property status
            bedroom: Number of bedrooms
            bathroom: Number of bathrooms
            furnished: Is furnished
            is_negotiable: Is price negotiable
            agent_id: Agent ID
            amenities: List of amenities
        """
        if not self.client:
            logger.warning("Elasticsearch not initialized, skipping indexing")
            return

        try:
            doc = {
                "id": property_id,
                "title": title,
                "description": description,
                "location": location,
                "price": price,
                "property_type": property_type,
                "listing_type": listing_type,
                "status": status,
                "bedroom": bedroom,
                "bathroom": bathroom,
                "furnished": furnished,
                "is_negotiable": is_negotiable,
                "agent_id": agent_id,
                "amenities": amenities or [],
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }

            self.client.index(
                index=self.index_name,
                id=property_id,
                document=doc,
            )

            logger.debug(f"Indexed property {property_id}")
        except Exception as e:
            logger.error(f"Failed to index property: {str(e)}")

    async def search_properties(
        self,
        query: str = "*",
        location: Optional[str] = None,
        property_type: Optional[str] = None,
        listing_type: Optional[str] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        min_bedroom: Optional[int] = None,
        max_bedroom: Optional[int] = None,
        min_bathroom: Optional[int] = None,
        max_bathroom: Optional[int] = None,
        furnished: Optional[bool] = None,
        amenities: Optional[List[str]] = None,
        sort: PropertySearchFilter = PropertySearchFilter.MOST_RELEVANT,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        Search properties with filters.

        Args:
            query: Search query (supports fuzzy matching)
            location: Location filter
            property_type: Property type filter
            listing_type: Listing type filter
            min_price: Minimum price
            max_price: Maximum price
            min_bedroom: Minimum bedrooms
            max_bedroom: Maximum bedrooms
            min_bathroom: Minimum bathrooms
            max_bathroom: Maximum bathrooms
            furnished: Furnished filter
            amenities: Amenities filter
            sort: Sort order
            limit: Results per page
            offset: Pagination offset

        Returns:
            Search results
        """
        if not self.client:
            logger.warning("Elasticsearch not initialized")
            return {"results": [], "total": 0}

        try:
            # Build query
            must_clauses = []
            filter_clauses = []

            # Full-text search on title and description
            if query and query != "*":
                must_clauses.append(
                    {
                        "multi_match": {
                            "query": query,
                            "fields": ["title^2", "description"],
                            "fuzziness": "AUTO",
                            "operator": "or",
                        }
                    }
                )

            # Filters
            if location:
                filter_clauses.append({"match": {"location": location}})

            if property_type:
                filter_clauses.append({"term": {"property_type": property_type}})

            if listing_type:
                filter_clauses.append({"term": {"listing_type": listing_type}})

            if furnished is not None:
                filter_clauses.append({"term": {"furnished": furnished}})

            # Price range
            price_range = {}
            if min_price is not None:
                price_range["gte"] = min_price
            if max_price is not None:
                price_range["lte"] = max_price
            if price_range:
                filter_clauses.append({"range": {"price": price_range}})

            # Bedroom range
            bedroom_range = {}
            if min_bedroom is not None:
                bedroom_range["gte"] = min_bedroom
            if max_bedroom is not None:
                bedroom_range["lte"] = max_bedroom
            if bedroom_range:
                filter_clauses.append({"range": {"bedroom": bedroom_range}})

            # Bathroom range
            bathroom_range = {}
            if min_bathroom is not None:
                bathroom_range["gte"] = min_bathroom
            if max_bathroom is not None:
                bathroom_range["lte"] = max_bathroom
            if bathroom_range:
                filter_clauses.append({"range": {"bathroom": bathroom_range}})

            # Amenities
            if amenities:
                filter_clauses.append({"terms": {"amenities": amenities}})

            # Sort
            sort_map = {
                PropertySearchFilter.PRICE_LOW_TO_HIGH: [{"price": "asc"}],
                PropertySearchFilter.PRICE_HIGH_TO_LOW: [{"price": "desc"}],
                PropertySearchFilter.NEWEST: [{"created_at": "desc"}],
                PropertySearchFilter.OLDEST: [{"created_at": "asc"}],
                PropertySearchFilter.MOST_RELEVANT: [],
            }
            sort_order = sort_map.get(sort, [])

            # Build ES query
            es_query = {
                "size": limit,
                "from": offset,
            }

            if must_clauses or filter_clauses:
                es_query["query"] = {"bool": {}}
                if must_clauses:
                    es_query["query"]["bool"]["must"] = (
                        must_clauses if len(must_clauses) > 1 else must_clauses[0]
                    )
                if filter_clauses:
                    es_query["query"]["bool"]["filter"] = filter_clauses

            if sort_order:
                es_query["sort"] = sort_order

            # Execute search
            response = self.client.search(index=self.index_name, body=es_query)

            # Format results
            results = []
            for hit in response.get("hits", {}).get("hits", []):
                results.append(
                    {
                        "id": hit["_source"]["id"],
                        "title": hit["_source"]["title"],
                        "location": hit["_source"]["location"],
                        "price": hit["_source"]["price"],
                        "property_type": hit["_source"]["property_type"],
                        "listing_type": hit["_source"]["listing_type"],
                        "bedroom": hit["_source"]["bedroom"],
                        "bathroom": hit["_source"]["bathroom"],
                        "score": hit.get("_score", 0),
                    }
                )

            return {
                "results": results,
                "total": response.get("hits", {}).get("total", {}).get("value", 0),
                "limit": limit,
                "offset": offset,
            }

        except Exception as e:
            logger.error(f"Search failed: {str(e)}")
            return {"results": [], "total": 0, "error": str(e)}

    async def delete_property(self, property_id: int) -> None:
        """
        Delete property from index.

        Args:
            property_id: Property ID to delete
        """
        if not self.client:
            return

        try:
            self.client.delete(index=self.index_name, id=property_id)
            logger.debug(f"Deleted property {property_id} from index")
        except Exception as e:
            logger.error(f"Failed to delete property from index: {str(e)}")


# Global search service instance
_search_service: Optional[SearchService] = None


async def get_search_service(
    elasticsearch_url: Optional[str] = None,
) -> SearchService:
    """
    Get or create global search service.

    Args:
        elasticsearch_url: Elasticsearch URL (defaults to settings.ELASTICSEARCH_URL)

    Returns:
        SearchService instance
    """
    global _search_service

    if _search_service is None:
        from core.configs import settings

        url = elasticsearch_url or settings.ELASTICSEARCH_URL
        _search_service = SearchService(url)
        try:
            await _search_service.initialize()
        except Exception as e:
            logger.warning(f"Search service initialization failed: {e}")

    return _search_service
