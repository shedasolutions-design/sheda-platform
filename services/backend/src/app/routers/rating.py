from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.rating import Rating
from app.models.user import Client, Agent
from app.schemas.rating_schema import RatingCreate, RatingShow
from core.database import get_db
from app.services.user_service import ActiveUser

router = APIRouter(
    tags=["Rating"],
    prefix="/rating"
)

@router.post("/", response_model=RatingShow, status_code=status.HTTP_201_CREATED)
async def create_rating(
    rating: RatingCreate, 
    current_user: ActiveUser,
    db: AsyncSession = Depends(get_db)
):
    # Verify rater is a client (user) - typically clients rate agents, or users rate sellers
    # Adjust logic based on exact requirements. Assuming User -> Agent rating for now.
    
    # Check if ratee exists and is an Agent
    ratee = await db.get(Agent, rating.ratee_id)
    if not ratee:
        raise HTTPException(status_code=404, detail="Agent (Seller) not found")
        
    # One person owns two rows (a buyer and a seller profile, sharing an
    # email), so comparing ids alone let someone rate their own seller
    # profile from their buyer one.
    if current_user.id == rating.ratee_id or (
        current_user.email and ratee.email and current_user.email.lower() == ratee.email.lower()
    ):
        raise HTTPException(status_code=400, detail="You cannot rate yourself")

    new_rating = Rating(
        rater_id=current_user.id,
        ratee_id=rating.ratee_id,
        score=rating.score,
        comment=rating.comment
    )
    
    db.add(new_rating)
    await db.commit()
    await db.refresh(new_rating)
    
    # Update Agent's average rating
    # Calculate new average
    result = await db.execute(select(Rating).where(Rating.ratee_id == rating.ratee_id))
    ratings = result.scalars().all()
    
    total_score = sum(r.score for r in ratings)
    count = len(ratings)
    new_average = total_score / count if count > 0 else 0.0
    
    ratee.rating = new_average
    await db.commit()
    
    return new_rating


@router.get("/", response_model=List[RatingShow])
async def list_ratings(
    ratee_id: int = Query(..., description="The seller (agent) whose ratings to list"),
    db: AsyncSession = Depends(get_db),
):
    """A seller's ratings, newest first. Public: they are shown on listings."""
    result = await db.execute(
        select(Rating).where(Rating.ratee_id == ratee_id).order_by(Rating.created_at.desc())
    )
    return result.scalars().all()
