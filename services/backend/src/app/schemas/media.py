from pydantic import BaseModel,AnyUrl


class IPFSResponse(BaseModel):
    IpfsUrl:AnyUrl
    IpfsHash:str