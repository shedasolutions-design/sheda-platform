# Testing Guide

## Overview

This testing guide covers all aspects of testing the Sheda backend application.

## Prerequisites

```bash
# Install test dependencies
pip install -r requirements.txt

# Additional dependencies for testing
pip install pytest pytest-asyncio pytest-cov httpx locust
```

## Running Tests

### Unit Tests

Unit tests cover individual functions and classes:

```bash
# Run all unit tests
pytest tests/unit/ -v

# Run specific test file
pytest tests/unit/test_validators.py -v

# Run with coverage
pytest tests/unit/ --cov=app --cov-report=html --cov-report=term
```

### Integration Tests

Integration tests cover API endpoints and service integration:

```bash
# Run all integration tests
pytest tests/integration/ -v

# Run specific test class
pytest tests/integration/test_api.py::TestAuthEndpoints -v

# Run with markers
pytest -m integration -v
```

### All Tests

```bash
# Run all tests with coverage
pytest tests/ --cov=app --cov-report=html --cov-report=term-missing

# Run with verbosity
pytest tests/ -vv

# Run with specific markers
pytest -m "not slow" -v
```

## Load Testing with Locust

### Running Locust

```bash
# Start Locust web interface
locust -f tests/load/locustfile.py --host=http://localhost:8000

# Open browser to http://localhost:8089
# Configure:
# - Number of users: 100
# - Spawn rate: 10 users/second
# - Run time: 5m
```

### Headless Load Testing

```bash
# Run without web UI
locust -f tests/load/locustfile.py \
  --host=http://localhost:8000 \
  --users 100 \
  --spawn-rate 10 \
  --run-time 10m \
  --headless \
  --csv=results/load_test

# Results will be saved in:
# - results/load_test_stats.csv
# - results/load_test_stats_history.csv
# - results/load_test_failures.csv
```

### Specific User Classes

```bash
# Test only property browsing
locust -f tests/load/locustfile.py PropertyBrowserUser --host=http://localhost:8000

# Test only transactions
locust -f tests/load/locustfile.py TransactionUser --host=http://localhost:8000

# Test only chat
locust -f tests/load/locustfile.py ChatUser --host=http://localhost:8000
```

## Coverage Reports

### Generate HTML Coverage Report

```bash
# Generate report
pytest tests/ --cov=app --cov-report=html

# Open in browser
open htmlcov/index.html  # macOS
xdg-open htmlcov/index.html  # Linux
start htmlcov/index.html  # Windows
```

### Coverage Targets

- **Overall**: 70%+ coverage
- **Core modules**: 80%+ coverage
- **Critical paths**: 90%+ coverage

## Test Structure

```
tests/
├── conftest.py              # Shared fixtures
├── unit/                    # Unit tests
│   └── test_validators.py  # Validator tests
├── integration/             # Integration tests
│   └── test_api.py         # API endpoint tests
└── load/                    # Load tests
    └── locustfile.py       # Locust scenarios
```

## Writing Tests

### Unit Test Example

```python
import pytest

def test_validator():
    """Test validator function."""
    from app.utils.validators import PropertyValidators
    
    result = PropertyValidators.validate_price(1000)
    assert result == 1000
```

### Integration Test Example

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_get_properties(async_client: AsyncClient):
    """Test property endpoint."""
    response = await async_client.get("/api/v1/property/get-properties")
    assert response.status_code == 200
```

### Load Test Example

```python
from locust import HttpUser, task, between

class MyUser(HttpUser):
    wait_time = between(1, 3)
    
    @task
    def my_endpoint(self):
        self.client.get("/api/v1/my-endpoint")
```

## Continuous Integration

### GitHub Actions

```yaml
# .github/workflows/tests.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt
      - run: pytest tests/ --cov=app --cov-report=xml
      - uses: codecov/codecov-action@v3
```

## Performance Targets

| Metric | Target | Validation |
|--------|--------|------------|
| Response Time (p95) | <100ms | Locust |
| Concurrent Users | 1000+ | Locust |
| Error Rate | <0.1% | Locust |
| Cache Hit Rate | >60% | Redis metrics |
| Test Coverage | >70% | pytest-cov |

## Troubleshooting

### Redis Connection Errors

```bash
# Start Redis locally
redis-server

# Or use Docker
docker run -d -p 6379:6379 redis:7-alpine
```

### Database Errors

Tests use in-memory SQLite. If you encounter issues:

```bash
# Clear test cache
rm -rf .pytest_cache

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

### Async Test Errors

Ensure pytest-asyncio is installed and configured:

```bash
pip install pytest-asyncio==1.3.0
```

## Best Practices

1. **Isolate tests**: Each test should be independent
2. **Use fixtures**: Share setup code with fixtures
3. **Mock external services**: Mock Firebase, Elasticsearch, etc.
4. **Test edge cases**: Validate error handling
5. **Keep tests fast**: Unit tests should be <1s each
6. **Run tests locally**: Always run before pushing
7. **Monitor coverage**: Aim for >70% overall coverage

## Resources

- [Pytest Documentation](https://docs.pytest.org/)
- [Locust Documentation](https://docs.locust.io/)
- [httpx Documentation](https://www.python-httpx.org/)
