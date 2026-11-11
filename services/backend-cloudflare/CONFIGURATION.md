# Configuration Guide

## Overview

This guide explains all configuration options for the Sheda backend, including which external services are required vs. optional.

---

## Required Configuration

These settings are **required** for the application to start:

### 1. Security Keys
```env
SECRET_KEY=your-super-secret-jwt-key-change-this
ADMIN_SECRET_KEY=your-admin-secret-key-different-from-jwt
```
**How to generate:**
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 2. Database
```env
# Development (SQLite)
DB_URL=sqlite+aiosqlite:///./sheda.db

# Production (PostgreSQL)
# DB_URL=postgresql+asyncpg://user:password@host:5432/sheda
```

### 3. Redis (Required for Phase 3 caching + Phase 2 Celery)
```env
REDIS_URL=redis://localhost:6379/0
```
**How to start Redis:**
```bash
# macOS
brew install redis
redis-server

# Docker
docker run -d -p 6379:6379 redis:7-alpine

# Ubuntu
sudo apt install redis
redis-server
```

### 4. Email (SMTP for OTP verification)
```env
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SEND_FROM_MAIL=noreply@sheda.com
```
**Gmail App Password:** https://myaccount.google.com/apppasswords

### 5. Cloudinary (Media storage)
```env
CLOUDINARY_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
CLOUDINARY_URL=cloudinary://key:secret@name
```
**Sign up:** https://cloudinary.com

---

## Optional Services (Phase 2)

These services are **optional** and have graceful fallbacks. If not configured, related endpoints will return `501 Not Implemented`.

### 1. Firebase Cloud Messaging (Push Notifications)

**Purpose:** Send push notifications to mobile and web apps

**Configuration:**
```env
FCM_CREDENTIALS=./firebase-credentials.json
```

**How to get Firebase credentials:**

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (or select existing)
3. Go to **Project Settings** > **Service Accounts**
4. Click **"Generate new private key"**
5. Download JSON file and save as `firebase-credentials.json` in project root

**Endpoints using FCM:**
- `POST /notifications/register-device`
- `POST /notifications/unregister-device`
- `POST /notifications/send`
- `POST /notifications/send-bid-notification`
- `POST /notifications/send-payment-notification`

**Without FCM:** These endpoints will return `501 Not Implemented`

---

### 2. Persona API (KYC Verification)

**Purpose:** Identity verification for users (Know Your Customer)

**Configuration:**
```env
PERSONA_API_KEY=your_api_key_here
PERSONA_ENVIRONMENT=sandbox  # or 'production'
```

**How to get Persona API key:**

1. Sign up at [Persona](https://withpersona.com)
2. Go to **Dashboard** > **API Keys**
3. Create a new API key
4. Use **sandbox** for testing, **production** for live

**Endpoints using Persona:**
- `POST /user/kyc/start-verification`
- `GET /user/kyc/status/{verification_id}`
- `GET /user/kyc/is-verified/{user_id}`

**Without Persona:** These endpoints will return `501 Not Implemented`

**Alternative providers:** The code is designed to support IDology, Trulioo, or Onfido (requires implementation)

---

### 3. Elasticsearch (Full-text Search)

**Purpose:** Advanced property search with fuzzy matching and filters

**Configuration:**
```env
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_INDEX=sheda_properties
```

**How to run Elasticsearch:**

**Option 1: Local installation**
```bash
# macOS
brew install elasticsearch
elasticsearch

# Ubuntu
wget -qO - https://artifacts.elastic.co/GPG-KEY-elasticsearch | sudo apt-key add -
sudo apt-get install elasticsearch
sudo systemctl start elasticsearch
```

**Option 2: Docker (recommended)**
```bash
docker run -d \
  --name elasticsearch \
  -p 9200:9200 \
  -e "discovery.type=single-node" \
  -e "xpack.security.enabled=false" \
  elasticsearch:8.11.0
```

**Option 3: Cloud providers**
- [Elastic Cloud](https://cloud.elastic.co)
- [AWS OpenSearch](https://aws.amazon.com/opensearch-service/)
- [Bonsai](https://bonsai.io)

**Endpoints using Elasticsearch:**
- `GET /property/search` (falls back to database if not available)
- `POST /property/{id}/index`

**Without Elasticsearch:** Search endpoint uses basic database queries (slower, no fuzzy match)

---

## Service Status Summary

| Service | Required? | Phase | Graceful Fallback | Endpoints Affected |
|---------|-----------|-------|-------------------|-------------------|
| **Redis** | ✅ Required | 3 | ❌ App won't start | All (caching + Celery) |
| **Email (SMTP)** | ✅ Required | 1 | ❌ No OTP emails | Auth endpoints |
| **Cloudinary** | ✅ Required | Core | ❌ No media uploads | Media endpoints |
| **Firebase** | ⚠️ Optional | 2 | ✅ Returns 501 | 5 notification endpoints |
| **Persona** | ⚠️ Optional | 2 | ✅ Returns 501 | 3 KYC endpoints |
| **Elasticsearch** | ⚠️ Optional | 2 | ✅ Uses DB queries | 2 search endpoints |

---

## Minimal Setup (Quick Start)

To run the application with **minimal configuration**:

### 1. Create `.env` file
```bash
cp .env.example .env
```

### 2. Set required values
```env
# Generate random keys
SECRET_KEY=<generate-with-python-command>
ADMIN_SECRET_KEY=<generate-with-python-command>

# Email (use Gmail for testing)
SMTP_USERNAME=youremail@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SEND_FROM_MAIL=noreply@sheda.com

# Cloudinary (sign up for free)
CLOUDINARY_NAME=your-name
CLOUDINARY_API_KEY=your-key
CLOUDINARY_API_SECRET=your-secret
CLOUDINARY_URL=cloudinary://key:secret@name

# Database (SQLite for dev)
DB_URL=sqlite+aiosqlite:///./sheda.db

# Redis (must be running)
REDIS_URL=redis://localhost:6379/0

# Server URLs
PROD_URL=https://api.sheda.com
DEV_URL=http://localhost:8000

# CORS (add your frontend URL)
ORIGINS=["http://localhost:3000"]

# Admin
ADMIN_ROUTE=/admin
```

### 3. Start Redis
```bash
redis-server
```

### 4. Run application
```bash
uvicorn main:app --reload
```

**All Phase 2 services** (Firebase, Persona, Elasticsearch) are optional and will gracefully skip if not configured.

---

## Production Configuration

### Required for Production:

1. **Strong secret keys** (not the example values!)
2. **PostgreSQL** instead of SQLite
3. **Redis** (use managed service like Redis Cloud)
4. **HTTPS** for PROD_URL
5. **Email service** (SendGrid, Mailgun, or SMTP)
6. **Cloudinary** (or S3 for media)

### Recommended for Production:

7. **Firebase** - For mobile app push notifications
8. **Persona** - For user verification/KYC
9. **Elasticsearch** - For fast search (or managed service like Elastic Cloud)

---

## Environment-Specific Configs

### Development (.env.local)
```env
DEBUG_MODE=true
DB_URL=sqlite+aiosqlite:///./sheda.db
DEV_URL=http://localhost:8000
```

### Staging (.env.staging)
```env
DEBUG_MODE=false
DB_URL=postgresql+asyncpg://user:pass@staging-db:5432/sheda
PROD_URL=https://staging-api.sheda.com
```

### Production (.env.production)
```env
DEBUG_MODE=false
DB_URL=postgresql+asyncpg://user:pass@prod-db:5432/sheda
PROD_URL=https://api.sheda.com
# All optional services should be enabled
FCM_CREDENTIALS=./firebase-credentials.json
PERSONA_API_KEY=prod_key_here
PERSONA_ENVIRONMENT=production
ELASTICSEARCH_URL=https://elasticsearch.sheda.com:9200
```

---

## Verification

### Check if services are configured:

```bash
# Check Redis
redis-cli ping  # Should return "PONG"

# Check Elasticsearch
curl http://localhost:9200  # Should return JSON with cluster info

# Check Firebase
test -f firebase-credentials.json && echo "Firebase configured" || echo "Firebase not configured"

# Check environment variables
python -c "from core.configs import settings; print(f'Redis: {settings.REDIS_URL}'); print(f'FCM: {settings.FCM_CREDENTIALS}'); print(f'Persona: {settings.PERSONA_API_KEY}')"
```

### Health check after startup:

```bash
# Basic health
curl http://localhost:8000/api/v1/health

# Detailed health (shows all service status)
curl http://localhost:8000/api/v1/health/detailed
```

---

## Troubleshooting

### "Firebase not configured" errors
- Solution: Set `FCM_CREDENTIALS` or leave it empty (endpoints will return 501)

### "Persona API not configured" errors
- Solution: Set `PERSONA_API_KEY` or leave it empty (endpoints will return 501)

### "Elasticsearch connection failed" errors
- Solution: Start Elasticsearch or leave `ELASTICSEARCH_URL` empty (uses DB fallback)

### "Redis connection refused"
- Solution: This is **critical** - start Redis server
- `redis-server` or `docker run -p 6379:6379 redis`

---

## Quick Reference

| Service | Config Key | Get Credentials |
|---------|-----------|-----------------|
| Firebase | `FCM_CREDENTIALS` | https://console.firebase.google.com |
| Persona | `PERSONA_API_KEY` | https://withpersona.com/dashboard |
| Elasticsearch | `ELASTICSEARCH_URL` | Local install or https://elastic.co |
| Redis | `REDIS_URL` | Local install or https://redis.com |
| Cloudinary | `CLOUDINARY_API_KEY` | https://cloudinary.com |

---

## Summary

**Minimum to start:** Redis + Email + Cloudinary + Secret keys  
**Full production:** Add Firebase + Persona + Elasticsearch  
**All optional services gracefully degrade if not configured**

See [.env.example](.env.example) for complete configuration template.
