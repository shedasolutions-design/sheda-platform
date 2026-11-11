"""Load testing scenarios using Locust."""

from locust import HttpUser, task, between
import random
import json


class PropertyBrowserUser(HttpUser):
    """User browsing property listings."""

    wait_time = between(1, 3)

    def on_start(self):
        """Setup: Login or get auth token."""
        # In production, implement actual login
        self.auth_headers = {"Authorization": "Bearer test_token"}

    @task(3)
    def browse_properties(self):
        """Browse property feed."""
        cursor = random.randint(0, 100)
        with self.client.get(
            f"/api/v1/property/get-properties?cursor={cursor}&limit=20",
            headers=self.auth_headers,
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                response.success()
            elif response.status_code == 401:
                response.failure("Authentication required")
            else:
                response.failure(f"Failed with status {response.status_code}")

    @task(1)
    def search_properties(self):
        """Search for properties with filters."""
        queries = ["apartment", "house", "luxury", "modern", "villa"]
        query = random.choice(queries)

        min_price = random.choice([1000000, 2000000, 5000000])
        max_price = min_price + random.randint(5000000, 10000000)

        with self.client.get(
            f"/api/v1/property/search?query={query}&min_price={min_price}&max_price={max_price}",
            headers=self.auth_headers,
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Search failed: {response.status_code}")

    @task(2)
    def view_property_details(self):
        """View individual property details."""
        property_id = random.randint(1, 100)
        with self.client.get(
            f"/api/v1/property/details/{property_id}",
            headers=self.auth_headers,
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                response.success()
            elif response.status_code == 404:
                response.success()  # Expected for non-existent properties
            else:
                response.failure(f"Failed: {response.status_code}")

    @task(1)
    def view_agent_profile(self):
        """View agent profile."""
        agent_id = random.randint(1, 50)
        with self.client.get(
            f"/api/v1/property/agent-profile/{agent_id}",
            headers=self.auth_headers,
            catch_response=True,
        ) as response:
            if response.status_code in [200, 404]:
                response.success()
            else:
                response.failure(f"Failed: {response.status_code}")


class TransactionUser(HttpUser):
    """User performing transactions (bidding, payments)."""

    wait_time = between(2, 5)

    def on_start(self):
        """Setup authentication."""
        self.auth_headers = {"Authorization": "Bearer test_token"}

    @task(2)
    def place_bid(self):
        """Place a bid on property."""
        property_id = random.randint(1, 100)
        bid_amount = random.randint(1000000, 10000000)

        with self.client.post(
            "/api/v1/transaction/place-bid",
            headers=self.auth_headers,
            json={"property_id": property_id, "bid_amount": bid_amount},
            catch_response=True,
        ) as response:
            if response.status_code in [200, 201]:
                response.success()
            elif response.status_code in [400, 401, 404]:
                response.success()  # Expected errors
            else:
                response.failure(f"Failed: {response.status_code}")

    @task(1)
    def process_payment(self):
        """Queue payment processing."""
        contract_id = random.randint(1, 50)
        transaction_hash = "0x" + "".join(random.choices("0123456789abcdef", k=64))

        with self.client.post(
            "/api/v1/transactions/process-payment",
            headers=self.auth_headers,
            json={
                "contract_id": contract_id,
                "transaction_hash": transaction_hash,
                "amount": random.randint(1000000, 10000000),
            },
            catch_response=True,
        ) as response:
            if response.status_code in [200, 201]:
                response.success()
            elif response.status_code == 501:
                response.success()  # Service not configured
            else:
                response.failure(f"Failed: {response.status_code}")

    @task(1)
    def check_task_status(self):
        """Check background task status."""
        task_id = "".join(random.choices("0123456789abcdef", k=36))

        with self.client.get(
            f"/api/v1/transactions/task-status/{task_id}",
            headers=self.auth_headers,
            catch_response=True,
        ) as response:
            if response.status_code in [200, 404]:
                response.success()
            else:
                response.failure(f"Failed: {response.status_code}")


class ChatUser(HttpUser):
    """User sending messages."""

    wait_time = between(1, 2)

    def on_start(self):
        """Setup authentication."""
        self.auth_headers = {"Authorization": "Bearer test_token"}

    @task(3)
    def send_message(self):
        """Send chat message."""
        conversation_id = random.randint(1, 50)
        messages = [
            "Hello! I'm interested in this property.",
            "Is the property still available?",
            "Can we schedule a viewing?",
            "What's the final price?",
            "Thank you for the information!",
        ]

        with self.client.post(
            "/api/v1/chat/send",
            headers=self.auth_headers,
            json={
                "conversation_id": conversation_id,
                "message": random.choice(messages),
            },
            catch_response=True,
        ) as response:
            if response.status_code in [200, 201]:
                response.success()
            elif response.status_code in [400, 401, 404]:
                response.success()  # Expected errors
            else:
                response.failure(f"Failed: {response.status_code}")

    @task(1)
    def get_chat_history(self):
        """Get chat history."""
        conversation_id = random.randint(1, 50)

        with self.client.get(
            f"/api/v1/chat/{conversation_id}/messages",
            headers=self.auth_headers,
            catch_response=True,
        ) as response:
            if response.status_code in [200, 404]:
                response.success()
            else:
                response.failure(f"Failed: {response.status_code}")


class HealthCheckUser(HttpUser):
    """Monitoring user checking health endpoints."""

    wait_time = between(5, 10)

    @task(1)
    def check_health(self):
        """Check basic health."""
        with self.client.get("/api/v1/health", catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure("Health check failed")

    @task(1)
    def check_readiness(self):
        """Check readiness probe."""
        with self.client.get("/api/v1/health/ready", catch_response=True) as response:
            if response.status_code in [200, 503]:
                response.success()
            else:
                response.failure("Readiness check failed")
