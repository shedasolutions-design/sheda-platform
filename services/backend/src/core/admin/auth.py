from starlette_admin.auth import AuthProvider,AdminConfig,AdminUser as StarletteAdminUser
from starlette_admin.exceptions import LoginFailed
from starlette.requests import Request
from starlette.responses import Response
from sqlalchemy import select
from app.models.user import Admin
from core.database import AsyncSessionLocal
from app.utils.utils import verify_password



class AdminAuthProvider(AuthProvider):
    async def is_authenticated(self, request: Request) -> bool:
        """Check if user is logged in by verifying session data."""
        return request.session.get("admin_user") is not None

    async def login(
        self, 
        username: str, 
        password: str, 
        remember_me: bool, 
        request: Request, 
        response: Response
    ) -> Response:
        """
        Handle login. 
        MUST return a Response object (the redirect) on success.
        """
        
        async with AsyncSessionLocal() as session:
            # Query only for users who are Admins
            # The form field is named 'username', so we map it to our email field
            query = select(Admin).where(Admin.username == username)
            result = await session.execute(query)
            admin_user = result.scalar_one_or_none()

            if admin_user and verify_password(password, admin_user.password):
                # Store minimal info in the encrypted session cookie
                request.session["admin_user"]={
                    "id": admin_user.id,
                    "email": admin_user.email,
                    "username": admin_user.username,
                    "avatar_url":admin_user.avatar_url or str(request.url_for('static',path="sheda-solutions.png"))
                }
                # Return the 'response' object, which is the Response to the dashboard
                return response
            
        raise LoginFailed("Invalid username or password")

    async def logout(self, request: Request, response: Response) -> Response:
        """Clear the session on logout."""
        request.session.clear()
        return response
    

    
    def get_admin_config(self, request: Request) -> AdminConfig:
        user = request.session["admin_user"]  # Retrieve current user
        # Update app title according to current_user
        custom_app_title = "Hello, " + user.get("username","There") + "!"
       
        custom_logo_url = user.get("avatar_url",None) 
        
        return AdminConfig(
            app_title=custom_app_title,
            logo_url=custom_logo_url,
        )
    
    def get_admin_user(self, request: Request) -> StarletteAdminUser:
        user = request.session["admin_user"]  # Retrieve current user
        photo_url = user.get("avatar_url")
        
        return StarletteAdminUser(username=user["username"], photo_url=photo_url)
    
