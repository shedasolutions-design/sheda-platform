from fastapi import APIRouter, Depends, HTTPException, status
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
        
    if current_user.id == rating.ratee_id:
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
