from typing import Optional

from pydantic import BaseModel


class WalletLookupResponse(BaseModel):
    id: int
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    wallet_id: str

    class Config:
        from_attributes = True


class WalletRegisterRequest(BaseModel):
    wallet_id: str
