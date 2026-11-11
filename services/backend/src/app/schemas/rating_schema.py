from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class RatingBase(BaseModel):
    score: int = Field(..., ge=1, le=5, description="Rating score between 1 and 5")
    comment: Optional[str] = Field(None, description="Optional comment")

class RatingCreate(RatingBase):
    ratee_id: int

class RatingShow(RatingBase):
    id: int
    rater_id: int
    ratee_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True
