import pytest
import json
import httpx
from unittest.mock import patch, MagicMock
from httpx import AsyncClient
from app.models.user import BaseUser
from app.models.property import Property
from app.models.transaction import WalletMapping
from app.services.user_service import get_current_user
from main import app

@pytest.mark.asyncio
async def test_submit_bid_tx_success(async_client: AsyncClient, test_user, test_property, db):
    # Set the authenticated user's near_account_id
    db_user = await db.get(BaseUser, test_user.id)
    db_user.near_account_id = "test_user.testnet"
    
    # Create seller user and wallet mapping
    from app.models.user import Agent
    from app.utils.enums import AccountTypeEnum
    seller = Agent(
        email="seller@example.com",
        fullname="Seller Agent",
        username="seller_agent",
        password="hashed_password_here",
        verified=True,
        account_type=AccountTypeEnum.agent,
        near_account_id="seller.testnet",
    )
    db.add(seller)
    await db.commit()
    await db.refresh(seller)
    
    # Map seller wallet
    seller_wallet = WalletMapping(
        user_id=seller.id,
        wallet_id="seller_wallet_address",
    )
    db.add(seller_wallet)
    
    # Associate property with seller (agent)
    db_prop = await db.get(Property, test_property.id)
    db_prop.agent_id = seller.id
    db_prop.blockchain_property_id = "1"
    
    await db.commit()

    # Override get_current_user authentication dependency
    async def override_get_current_user():
        return db_user

    app.dependency_overrides[get_current_user] = override_get_current_user

    try:
        # Mock response from NEAR RPC for transaction outcome (tx method)
        mock_tx_response = {
            "jsonrpc": "2.0",
            "result": {
                "status": {"SuccessValue": ""},
                "transaction": {
                    "signer_id": "test_user.testnet",
                    "receiver_id": "contract.testnet",
                    "actions": []
                }
            }
        }
        
        # Mock response from NEAR RPC for view function (get_bids_by_bidder)
        mock_bid_view = [
            {
                "id": 99,
                "property_id": 1,
                "bidder_id": "test_user.testnet",
                "bid_amount": "5000000",
                "status": "Pending",
                "action": "Purchase",
                "stablecoin_token": "usdc.testnet"
            }
        ]
        mock_query_response = {
            "jsonrpc": "2.0",
            "result": {
                "result": list(json.dumps(mock_bid_view).encode('utf-8'))
            }
        }
        
        # Define side effect for httpx post to only intercept NEAR RPC calls
        original_post = httpx.AsyncClient.post
        async def mock_post(self_client, url, **kwargs):
            if "rpc.testnet.near.org" not in str(url):
                return await original_post(self_client, url, **kwargs)
                
            json_data = kwargs.get("json", {})
            method = json_data.get("method")
            
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            
            if method == "tx":
                mock_resp.json = MagicMock(return_value=mock_tx_response)
            elif method == "query":
                mock_resp.json = MagicMock(return_value=mock_query_response)
            else:
                mock_resp.json = MagicMock(return_value={})
                
            return mock_resp

        with patch("httpx.AsyncClient.post", new=mock_post):
            # We also mock FCM and WS manager to avoid actual network/async issues
            with patch("app.services.push.send_push_notification") as mock_push:
                with patch("app.routers.websocket.ws_manager.send_personal_message") as mock_ws:
                    payload = {
                        "tx_hash": "0xhash",
                        "expected_bid_id": 99,
                        "expected_property_id": 1,
                        "expected_amount": 5000000
                    }
                    
                    response = await async_client.post(
                        "/api/v1/transactions/submit-bid-tx",
                        json=payload,
                        headers={"Authorization": "Bearer test_token"}
                    )
                    
                    assert response.status_code == 201
                    resp_data = response.json()
                    assert resp_data["status"] == "success"
                    assert resp_data["transaction"]["bid_id"] == "99"
                    assert resp_data["transaction"]["property_id"] == "1"
                    assert resp_data["transaction"]["bid_amount"] == "5000000"
                    
                    # Check that WS and FCM were triggered
                    mock_push.assert_called_once()
                    mock_ws.assert_called_once()
    finally:
        # Clear overrides after the test
        app.dependency_overrides.pop(get_current_user, None)
