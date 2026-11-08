# Sheda Mobile Solution - API Integration Tracking Guide

## �� Table of Contents

1. [Project Overview](#project-overview)
2. [Authentication System](#authentication-system)
3. [User Management](#user-management)
4. [Property Management](#property-management)
5. [Appointment System](#appointment-system)
6. [Payment & Financial](#payment--financial)
7. [Schedule Management](#schedule-management)
8. [Contract Management](#contract-management)
9. [Chat System](#chat-system)
10. [Media & File Management](#media--file-management)
11. [NEAR Wallet Integration](#near-wallet-integration)
12. [Testing Strategy](#testing-strategy)
13. [Error Handling](#error-handling)
14. [State Management](#state-management)
15. [Security Considerations](#security-considerations)

---

## 🏗️ Project Overview

### 📊 Current Implementation Status

| System                     | Status                       | Progress |
| -------------------------- | ---------------------------- | -------- |
| 🔐 Authentication          | ✅ **FULLY IMPLEMENTED**     | 100%     |
| 👤 User Management         | ✅ **FULLY IMPLEMENTED**     | 95%      |
| 🏠 Property Management     | ✅ **FULLY IMPLEMENTED**     | 95%      |
| 📅 Appointment System      | ✅ **FULLY IMPLEMENTED**     | 95%      |
| 💰 Payment & Financial     | ✅ **FULLY IMPLEMENTED**     | 90%      |
| 📋 Schedule Management     | ✅ **INTEGRATED**            | 80%      |
| 📄 Contract Management     | ✅ **FULLY IMPLEMENTED**     | 90%      |
| 💬 Chat System             | ✅ **FULLY IMPLEMENTED**     | 95%      |
| 📁 Media & File Management | ✅ **FULLY IMPLEMENTED**     | 90%      |
| 🔗 NEAR Wallet Integration | ✅ **FULLY IMPLEMENTED**     | 90%      |

**Legend:**

- ✅ **FULLY IMPLEMENTED**: Complete with UI integration
- 🔄 **PARTIALLY IMPLEMENTED**: Core features working, some UI pending
- 🔄 **API READY - UI PENDING**: Backend methods ready, frontend integration needed

### Tech Stack

- **Framework**: React Native with Expo Router
- **Language**: TypeScript
- **State Management**: React Context + useReducer
- **Styling**: NativeWind (Tailwind CSS)
- **Storage**: AsyncStorage + React Native Keychain
- **Blockchain**: NEAR Protocol Integration
- **API Base URL**: `https://sheda-backend-production.up.railway.app`

### Core Architecture

- **Context Layer**: `ApiContext.tsx` - Central state management
- **Service Layer**: `api.ts` - API service class
- **Hook Layer**: `useShedaApi.ts` - Custom hooks for different features
- **Component Layer**: React components using hooks

### 🚨 **CRITICAL INTEGRATION RULE**

**DO NOT EDIT THE UI DESIGN - ONLY ADD API INTEGRATION**

- ✅ **ALLOWED**: Connect API calls to existing UI elements
- ✅ **ALLOWED**: Add loading states, error handling
- ✅ **ALLOWED**: Update data display with API responses
- ❌ **FORBIDDEN**: Change UI layout, styling, or design
- ❌ **FORBIDDEN**: Add new UI components
- ❌ **FORBIDDEN**: Modify existing component structure

**Goal**: Make existing UI functional with real API data

---

## 🔐 Authentication System

### ✅ Implemented Features

- [x] User Registration (Signup)
- [x] User Login (Email/Password)
- [x] Account Verification
- [x] Password Reset
- [x] OTP Verification
- [x] Token Refresh
- [x] Account Type Switching (Client/Agent)
- [x] Logout
- [x] Auto-login with stored tokens
- [x] Token expiration handling

### 📁 Files

- `contexts/ApiContext.tsx` (lines 416-500)
- `services/api.ts` (lines 200-350)
- `hooks/useShedaApi.ts` (lines 1-50)
- `components/AuthGuard.tsx`
- `components/InitialRouter.tsx`

### 🔗 API Endpoints

```typescript
POST /api/v1/auth/signup
POST /api/v1/auth/login
POST /api/v1/auth/verify-account
PUT /api/v1/auth/reset-password
POST /api/v1/auth/send-otp
POST /api/v1/auth/verify-otp
PUT /api/v1/auth/refresh-token
POST /api/v1/auth/switch-account
POST /api/v1/auth/logout
```

### �� Testing Checklist

- [ ] Signup with valid data
- [ ] Signup with invalid data (validation)
- [ ] Login with correct credentials
- [ ] Login with incorrect credentials
- [ ] Token refresh on expiration
- [ ] Auto-login on app restart
- [ ] Logout and state cleanup
- [ ] OTP verification flow
- [ ] Password reset flow
- [ ] Account type switching

---

## 👤 User Management

### ✅ Implemented Features

- [x] Get current user profile
- [x] Update user profile
- [x] Delete account
- [x] Profile picture upload (personal-info screen, uses expo-image-picker + uploadFile API)
- [x] KYC status display (read-only in personal-info, API for KYC verification not ready yet)
- [x] User ratings (createRating + getPropertyRatings API wired, Comments.tsx displays reviews)
- [x] Account type management (profile screen has Switch Mode with switchAccount API)

### 📁 Files

- `contexts/ApiContext.tsx` (lines 500-550)
- `services/api.ts` (lines 350-400)
- `hooks/useShedaApi.ts` (lines 50-100)

### 🔗 API Endpoints

```typescript
GET / api / v1 / user / me;
PUT / api / v1 / user / update / me;
DELETE / api / v1 / user / delete -accnt;
```

### �� Testing Checklist

- [ ] Fetch user profile
- [ ] Update profile information
- [ ] Upload profile picture
- [ ] Delete account
- [ ] KYC status updates
- [ ] Rating system

---

## 🏠 Property Management

### ✅ Fully Implemented Features

- [x] List new property (full multi-step listing form with AuthorizeListingForm)
- [x] Get all properties (with pagination, home feed + see-all)
- [x] Get user's listings (MyListings component in history tab)
- [x] Update property details (API wired)
- [x] Delete property (API wired)
- [x] Get agent profiles (used in chat, details pages)
- [x] Property images management (image upload in listing form, display in details)
- [x] Property filtering and search (full filter screen with type, location, bedrooms, bathrooms, price, furnishing, extras)

### 📁 Files

- `contexts/ApiContext.tsx` (lines 550-650)
- `services/api.ts` (lines 500-600)
- `hooks/useShedaApi.ts` (lines 100-200)
- `components/HouseList/`
- `components/HouseCard/`

### 🔗 API Endpoints

```typescript
POST /api/v1/property/list-property
GET /api/v1/property/get-properties
GET /api/v1/property/me
PUT /api/v1/property/update/{id}
DELETE /api/v1/property/delete/{id}
GET /api/v1/property/agent-profile/{id}
```

### �� Testing Checklist

- [ ] Create new property listing
- [ ] Fetch property feed with pagination
- [ ] Update property details
- [ ] Delete property
- [ ] Get agent profiles
- [ ] Property image upload
- [ ] Property search and filtering

---

## �� Appointment System

### ✅ Fully Implemented Features

- [x] Book appointment with agent (full calendar + time slot UI, wired to bookAppointment API)
- [x] Cancel appointment (API wired)
- [x] Appointment booked confirmation screen
- [x] Transaction phase tracking (APPOINTMENT_BOOKED phase update)

### 📁 Files

- `contexts/ApiContext.tsx` (lines 650-700)
- `services/api.ts` (lines 400-450)
- `hooks/useShedaApi.ts` (lines 200-250)
- `app/book-appointment/`
- `app/appointment-successful/`

### 🔗 API Endpoints

```typescript
POST / api / v1 / user / book - appointment;
DELETE / api / v1 / user / cancel - appointment / { id };
```

### �� Testing Checklist

- [ ] Book appointment with valid data
- [ ] Cancel existing appointment
- [ ] View appointment history
- [ ] Appointment status updates
- [ ] Conflict handling

---

## 💰 Payment & Financial

### 🔄 API Ready - UI Integration Pending

- [x] Create payment information (API method ready)
- [x] Get payment information (API method ready)
- [x] Update payment details (API method ready)
- [x] Delete payment information (API method ready)
- [x] Payment confirmation (API method ready)
- [x] Payment approval (API method ready)

### 📁 Files

- `contexts/ApiContext.tsx` (lines 700-750)
- `services/api.ts` (lines 450-500)
- `hooks/useShedaApi.ts` (lines 250-300)
- `app/payment-successful/`
- `app/payment-pin/`

### 🔗 API Endpoints

```typescript
POST / api / v1 / user / create - payment - info;
GET / api / v1 / user / payment - info;
PUT / api / v1 / user / update - account - info / { id };
DELETE / api / v1 / user / delete -accnt - info / { id };
GET / api / v1 / user / payment - info / { contractId };
POST / api / v1 / user / confirm - payment / { contractId };
POST / api / v1 / user / approve - payment / { contractId };
```

### �� Testing Checklist

- [ ] Create payment information
- [ ] Fetch payment details
- [ ] Update payment information
- [ ] Delete payment information
- [ ] Payment confirmation flow
- [ ] Payment approval process

---

## 📋 Schedule Management

### 🔄 API Ready - UI Integration Pending

- [x] Create available time slots (API method ready)
- [x] Get agent schedule (API method ready)
- [x] Update schedule (API method ready)
- [ ] Availability tracking (UI implementation needed)

### 📁 Files

- `contexts/ApiContext.tsx` (lines 750-800)
- `services/api.ts` (lines 500-550)
- `hooks/useShedaApi.ts` (lines 300-350)

### 🔗 API Endpoints

```typescript
POST / api / v1 / user / create - available - time;
GET / api / v1 / user / get - schedule / me;
PUT / api / v1 / user / update - schedule / { id };
```

### �� Testing Checklist

- [ ] Create availability slots
- [ ] Fetch agent schedule
- [ ] Update schedule
- [ ] Conflict detection
- [ ] Timezone handling

---

## 📄 Contract Management

### 🔄 API Ready - UI Integration Pending

- [x] Create contracts (API method ready)
- [x] Contract confirmation (API method ready)
- [ ] Payment tracking (UI implementation needed)
- [ ] Contract status management (UI implementation needed)

### 📁 Files

- `contexts/ApiContext.tsx` (lines 800-850)
- `services/api.ts` (lines 550-600)
- `hooks/useShedaApi.ts` (lines 350-400)
- `app/property-agreement/`

### 🔗 API Endpoints

```typescript
POST /api/v1/user/contracts/
```

### �� Testing Checklist

- [ ] Create new contract
- [ ] Contract confirmation
- [ ] Payment integration
- [ ] Contract status updates

---

## �� Chat System

### ✅ Fully Implemented Features

- [x] Get chat history (getMessageHistory API)
- [x] Real-time messaging (WebSocket + HTTP fallback)
- [x] Send messages (sendMessage API + sendWsMessage)
- [x] Property-specific chats (propertyId passed in chat params)
- [x] Offer/bid messages (OfferMessageCard + OfferResponseCard)
- [x] Inbox/conversations list (Messages component)
- [x] Unread count (getUnreadCount API)
- [x] Mark messages read (markMessagesAsRead API)

### 📁 Files

- `contexts/ApiContext.tsx` (lines 850-900)
- `services/api.ts` (lines 600-650)
- `hooks/useShedaApi.ts` (lines 400-450)
- `app/chat/`
- `app/inbox/`

### 🔗 API Endpoints

```typescript
GET / api / v1 / chat / chat - history;
```

### �� Testing Checklist

- [ ] Fetch chat history
- [ ] Real-time messaging
- [ ] Property-specific conversations
- [ ] Message persistence

---

## 📁 Media & File Management

### ✅ Fully Implemented Features

- [x] File upload profile (pickImage in personal-info, uses uploadFile API)
- [x] File upload property (image upload in property listing form)
- [x] Get uploaded files (API wired)
- [x] Image display (getFullImageUrl utility, used across all screens)

### 📁 Files

- `contexts/ApiContext.tsx` (lines 900-950)
- `services/api.ts` (lines 650-658)
- `hooks/useShedaApi.ts` (lines 450-500)
- `utilities/ImagePicker.ts`

### 🔗 API Endpoints

```typescript
POST / api / v1 / media / file - upload / { type };
GET / api / v1 / media / file - upload / { type };
```

### �� Testing Checklist

- [ ] Upload profile images
- [ ] Upload property images
- [ ] File type validation
- [ ] File size limits
- [ ] Image compression

---

## 🔗 NEAR Wallet Integration

### ✅ Fully Implemented Features

- [x] NEAR wallet creation (testnet + mainnet, with auto-increment naming)
- [x] Wallet import (seed phrase + private key)
- [x] Wallet recovery (biometric auth gate, seed phrase + private key reveal)
- [x] Transaction signing
- [x] Balance checking (multi-token)
- [x] Secure key storage (Keychain on native, encrypted IndexedDB on web)
- [x] NEAR Intents cross-chain deposit + withdrawal
- [x] RPC failover with retry + exponential backoff
- [x] Token airdrop on testnet
- [x] **Two-phase non-blocking initialization** (Phase A local metadata, Phase B RPC)
- [x] **Encrypted cloud backup + restore** (Firebase Auth + Firestore, AES-256-GCM)
- [x] **Legacy plaintext storage migration** (one-time, copy-verify-delete)
- [x] **Generic contract helpers** (`getAccount`, `signAndSendTransaction`, `viewFunction`)

### 🚩 Feature flags

| Flag | Default | Effect |
| --- | --- | --- |
| `EXPO_PUBLIC_FEATURE_FAST_AUTH` | `false` | FastAuth dormant: provider not mounted, no Auth0 calls, button hidden |
| `EXPO_PUBLIC_FEATURE_CLOUD_BACKUP` | `true` | Shows backup/restore UI (self-disables without Firebase config) |

**FastAuth is gated, not deleted.** It cannot currently complete a write —
`config/fastAuth.ts`'s relayer URL is a placeholder and no public testnet
FastAuth relayer exists. Re-enable for QA with
`EXPO_PUBLIC_FEATURE_FAST_AUTH=true npx expo start -c` (a cache clear is
required; `EXPO_PUBLIC_*` vars are inlined at build time).

### 🔐 Storage migration

One-time, runs on first launch from `WalletContext`. Moves plaintext
`seed_phrase_*` / `private_key_*` values out of AsyncStorage (on web:
`localStorage`) into the encrypted store. Copy → verify → delete, so a failure
loses nothing and retries next launch. Logs key names only, never values.
Native Keychain installs are untouched.

`clearAllData()` no longer calls `AsyncStorage.clear()` — it is scoped to this
service's own keys.

### 📁 Files

- `services/nearWallet.ts` — wallet ops + generic contract helpers
- `services/secureStorage.ts` — platform dispatch + legacy migration
- `services/webSecretStore.ts` — web at-rest encryption (IndexedDB, non-extractable key)
- `services/platformAdapter.ts` — fast non-secret metadata (Phase A)
- `services/walletCrypto.ts` — AES-256-GCM + PBKDF2 backup envelope
- `services/cloudBackup.ts` — Firebase Auth + Firestore over REST
- `config/featureFlags.ts`, `config/firebase.ts`
- `hooks/useNearWallet.ts`
- `contexts/WalletContext.tsx`
- `components/WalletDashboard.tsx`, `components/NearWalletSignIn.tsx`, `components/BackupPrompt.tsx`
- `app/wallet-setup/`, `app/wallet-recovery/`

### ✅ Testing Checklist

Run with `npm run test:ci` (`npm run test` is `--watchAll` and never exits).

- [x] Wallet creation — `__tests__/wallet-create-import.test.tsx`
- [x] Wallet import — `__tests__/wallet-create-import.test.tsx`
- [x] Backup / restore round trip — `__tests__/cloud-backup.test.ts`
- [x] Encryption envelope + tamper resistance — `__tests__/wallet-crypto.test.ts`
- [x] Non-blocking cold start — `__tests__/wallet-nonblocking-init.test.tsx`
- [x] FastAuth dormancy — `__tests__/wallet-nonblocking-init.test.tsx`
- [x] Plaintext migration + no-secret logging — `__tests__/wallet-storage-migration.test.ts`
- [ ] Manual: two-device backup/restore (see NEAR_WALLET_README.md QA checklist)
- [ ] Manual: cold start on throttled network, mobile + web

---

## �� Testing Strategy

### Unit Testing

- [ ] API service methods
- [ ] Context reducers
- [ ] Custom hooks
- [ ] Utility functions

### Integration Testing

- [ ] Authentication flow
- [ ] Property management flow
- [ ] Payment processing
- [ ] Appointment booking

### E2E Testing

- [ ] Complete user journeys
- [ ] Cross-platform compatibility
- [ ] Performance testing
- [ ] Error scenarios

### Test Files Structure

```
__tests__/
├── services/
│   ├── api.test.ts
│   └── nearWallet.test.ts
├── contexts/
│   └── ApiContext.test.ts
├── hooks/
│   ├── useShedaApi.test.ts
│   └── useNearWallet.test.ts
└── components/
    └── AuthGuard.test.ts
```

---

## ⚠️ Error Handling

### Global Error Handling

- [x] API request error catching
- [x] Network error handling
- [x] Token expiration handling
- [x] Validation error display
- [x] User-friendly error messages

### Error Types

```typescript
interface ValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

interface HTTPValidationError {
  detail: ValidationError[];
}
```

### Error Recovery

- [x] Automatic retry for network errors
- [x] Token refresh on 401 errors
- [x] Graceful degradation
- [x] Offline mode handling

---

## �� State Management

### Context Structure

```typescript
interface ApiState {
  // Authentication
  isAuthenticated: boolean;
  token: string | null;
  user: UserShow | null;

  // Loading states
  isLoading: boolean;
  isInitializing: boolean;

  // Data states
  properties: PropertyShow[];
  myListings: PropertyShow[];
  appointments: AppointmentShow[];
  paymentInfo: AccountInfoShow[];
  schedule: AvailabilityShow[];
  chatHistory: ChatMessageSchema[];

  // Pagination
  propertyFeed: PropertyFeed | null;

  // Error handling
  error: string | null;
}
```

### Action Types

- [x] Authentication actions
- [x] Data loading actions
- [x] CRUD operations
- [x] Error handling actions
- [x] State reset actions

---

## 🔒 Security Considerations

### Data Protection

- [x] Token-based authentication
- [x] Secure token storage
- [x] HTTPS API communication
- [x] Input validation
- [x] XSS prevention

### NEAR Wallet Security

- [x] Private key encryption
- [x] Secure key storage
- [x] Transaction signing
- [x] Wallet recovery phrases

### Best Practices

- [x] No sensitive data in logs
- [x] Proper error handling
- [x] Input sanitization
- [x] Rate limiting awareness

---

## 📊 Performance Monitoring

### Metrics to Track

- [ ] API response times
- [ ] App startup time
- [ ] Memory usage
- [ ] Network usage
- [ ] Error rates
- [ ] User engagement

### Optimization Areas

- [ ] Image compression
- [ ] Lazy loading
- [ ] Caching strategies
- [ ] Bundle size optimization

---

## 🚀 Deployment Checklist

### Pre-deployment

- [ ] All tests passing
- [ ] API endpoints verified
- [ ] Error handling tested
- [ ] Performance optimized
- [ ] Security audit completed

### Production Environment

- [ ] Environment variables configured
- [ ] API base URL updated
- [ ] NEAR network configured
- [ ] Monitoring tools setup
- [ ] Backup strategies in place

---

## 📝 Documentation Status

### ✅ Completed

- [x] API integration tracking
- [x] Code structure documentation
- [x] Testing strategies
- [x] Security considerations

### 🔄 In Progress

- [ ] API endpoint documentation
- [ ] Component documentation
- [ ] Deployment guides
- [ ] Troubleshooting guides

### 📋 TODO

- [ ] User manual
- [ ] Developer onboarding guide
- [ ] API versioning strategy
- [ ] Performance benchmarks

---

## 🔄 Maintenance Schedule

### Daily

- [ ] Error log monitoring
- [ ] Performance metrics review
- [ ] User feedback collection

### Weekly

- [ ] Security updates
- [ ] Dependency updates
- [ ] Performance optimization

### Monthly

- [ ] Full security audit
- [ ] Performance benchmarking
- [ ] User experience review
- [ ] API usage analytics

---

_Last Updated: [Current Date]_
_Version: 1.0.0_
_Maintainer: Development Team_
