#!/bin/bash
# Quick Start Guide for Sheda Backend with Phase 3

set -e

echo "=== Sheda Backend Quick Start ==="
echo ""

# Check if Redis is running
echo "1. Checking Redis..."
if redis-cli ping > /dev/null 2>&1; then
    echo "✓ Redis is running"
else
    echo "✗ Redis is not running"
    echo "  Starting Redis..."
    if command -v redis-server &> /dev/null; then
        redis-server --daemonize yes
        echo "✓ Redis started"
    else
        echo "  Please install and start Redis:"
        echo "    brew install redis  # macOS"
        echo "    apt install redis   # Ubuntu"
        echo "    redis-server"
        exit 1
    fi
fi

# Install dependencies
echo ""
echo "2. Installing dependencies..."
pip install -r requirements.txt > /dev/null 2>&1
echo "✓ Dependencies installed"

# Run database migrations
echo ""
echo "3. Running database migrations..."
if [ -f "alembic.ini" ]; then
    alembic upgrade head > /dev/null 2>&1
    echo "✓ Database migrations complete"
else
    echo "⚠ alembic.ini not found, skipping migrations"
fi

# Run tests
echo ""
echo "4. Running quick tests..."
pytest tests/unit/ -q --tb=short
if [ $? -eq 0 ]; then
    echo "✓ Tests passed"
else
    echo "⚠ Some tests failed (this is ok for quick start)"
fi

# Start application
echo ""
echo "5. Starting application..."
echo ""
echo "=== Application Ready ==="
echo ""
echo "Health Checks:"
echo "  Basic:     http://localhost:8000/api/v1/health"
echo "  Live:      http://localhost:8000/api/v1/health/live"
echo "  Ready:     http://localhost:8000/api/v1/health/ready"
echo "  Detailed:  http://localhost:8000/api/v1/health/detailed"
echo ""
echo "Documentation:"
echo "  API Docs:  http://localhost:8000/sheda-docs"
echo ""
echo "Load Testing:"
echo "  locust -f tests/load/locustfile.py --host=http://localhost:8000"
echo ""
echo "Testing:"
echo "  ./run_tests.sh quick   # Quick test"
echo "  ./run_tests.sh all     # Full test suite"
echo ""
echo "Starting server..."
echo ""

uvicorn main:app --reload --host 0.0.0.0 --port 8000
