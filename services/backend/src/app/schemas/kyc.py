from pydantic import BaseModel,AnyUrl
from datetime import datetime

class KycInitResponse(BaseModel):
    verification_id:str
    redirect_url:AnyUrl
    status:str
    user_id:int
    
class KycStatusResponse(BaseModel):
    id:str
    status: str
    created_at:datetime
    completed_at:datetime
    reason:str
    
class KycVerifiedResponse(BaseModel):
    user_id:int
    is_verified:bool
    verification_status:str
    