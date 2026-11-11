#!/bin/bash
# Test runner script for Sheda backend

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Sheda Backend Test Suite ===${NC}\n"

# Parse command line arguments
TEST_TYPE=${1:-all}
COVERAGE=${2:-yes}

# Function to run tests
run_tests() {
    local test_path=$1
    local description=$2
    
    echo -e "${YELLOW}Running $description...${NC}"
    
    if [ "$COVERAGE" = "yes" ]; then
        pytest "$test_path" -v --cov=app --cov-report=term-missing
    else
        pytest "$test_path" -v
    fi
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $description passed${NC}\n"
    else
        echo -e "${RED}✗ $description failed${NC}\n"
        exit 1
    fi
}

# Run based on test type
case $TEST_TYPE in
    unit)
        echo "Running unit tests only..."
        run_tests "tests/unit/" "Unit Tests"
        ;;
    
    integration)
        echo "Running integration tests only..."
        run_tests "tests/integration/" "Integration Tests"
        ;;
    
    all)
        echo "Running all tests..."
        run_tests "tests/" "All Tests"
        
        # Generate HTML coverage report
        if [ "$COVERAGE" = "yes" ]; then
            echo -e "${YELLOW}Generating HTML coverage report...${NC}"
            pytest tests/ --cov=app --cov-report=html --quiet
            echo -e "${GREEN}✓ Coverage report generated in htmlcov/index.html${NC}\n"
        fi
        ;;
    
    coverage)
        echo "Running tests with detailed coverage..."
        pytest tests/ -v --cov=app --cov-report=html --cov-report=term-missing
        echo -e "${GREEN}✓ Coverage report generated in htmlcov/index.html${NC}\n"
        ;;
    
    quick)
        echo "Running quick tests (no coverage)..."
        pytest tests/ -v --tb=short
        ;;
    
    *)
        echo -e "${RED}Unknown test type: $TEST_TYPE${NC}"
        echo "Usage: ./run_tests.sh [unit|integration|all|coverage|quick] [yes|no]"
        echo "Examples:"
        echo "  ./run_tests.sh unit          # Run unit tests with coverage"
        echo "  ./run_tests.sh integration   # Run integration tests"
        echo "  ./run_tests.sh all no        # Run all tests without coverage"
        echo "  ./run_tests.sh coverage      # Run with detailed coverage report"
        echo "  ./run_tests.sh quick         # Fast run without coverage"
        exit 1
        ;;
esac

echo -e "${GREEN}=== All tests completed successfully ===${NC}"
