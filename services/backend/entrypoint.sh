#!/bin/sh

# Exit immediately if a command exits with a non-zero status
set -e

# Run database migrations
echo "Running database migrations..."
#RUn allembic and stream out[ut to devnull if succesful print success message otherwise print error message
alembic upgrade heads > /dev/null && echo "Database migrations completed successfully." || { echo "Database migrations failed. Check logs for details."; exit 1; }

# Start the application with Gunicorn
# Adjust workers/bind address as needed via environment variables or defaults
# WORKERS=${GUNICORN_WORKERS:-4}
# Hosts like Railway choose the port and pass it in PORT.
BIND_ADDRESS=${BIND_ADDRESS:-0.0.0.0:${PORT:-8000}}

echo "Starting application with Gunicorn ($WORKERS workers) on $BIND_ADDRESS..."
# Trust the X-Forwarded-* headers from the host's proxy, so redirects keep https.
exec gunicorn -k uvicorn.workers.UvicornWorker main:app --chdir src --bind "$BIND_ADDRESS" --forwarded-allow-ips="*"
