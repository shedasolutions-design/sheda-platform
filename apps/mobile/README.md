# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies
# 🏠 Sheda Solutions Mobile

A decentralized real-estate platform built on **NEAR Protocol** and **React Native (Expo)**. Sheda Solutions lets property owners list, and buyers discover, bid on, and transact on properties — with stablecoin escrow payments secured by smart contracts on the NEAR blockchain.

---

## ✨ Key Features

- **Property NFTs** — Every listed property is minted as an on-chain NFT, creating an immutable ownership record
- **Stablecoin Escrow** — Bids are placed in USDT/USDC via `ft_transfer_call`; funds are held in smart-contract escrow until the deal completes
- **11-Phase Transaction Lifecycle** — Full pipeline from bid placement → appointment → document release → payment → completion, with dispute resolution
- **HD Wallet** — BIP39/SLIP-0010 key derivation with biometric-protected secure storage (Keychain)
- **Dual Mode** — Toggle between Buyer and Seller roles within the same account
- **Live Price Conversion** — Pyth Network oracle for NEAR/USD + Open Exchange Rates for NGN, all prices displayed in ₦
- **In-App Chat** — Real-time messaging between buyers and sellers
- **Ratings & Reviews** — Post-transaction star ratings and comments on properties
- **Push Notifications** — 12 event types with granular user preferences
- **Agreement Monitoring** — Automatic expiration tracking with milestone alerts (30d, 7d, 1d, expired)

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────┐
│              Mobile Client (Expo)                 │
│   ApiCtx · WalletCtx · NotifCtx · ModeCtx        │
│   ──────────────────────────────────────────      │
│   Services: api · nearContract · nearWallet       │
│             tokenRegistry · priceService          │
│             secureStorage · transactionStore      │
└────────┬──────────────┬──────────────┬────────────┘
         │              │              │
    ┌────▼────┐   ┌─────▼─────┐  ┌────▼──────────┐
    │ Backend │   │   NEAR    │  │ Price Oracles  │
    │ REST API│   │ Blockchain│  │ Pyth + OER     │
    │ (Render)│   │ (Testnet/ │  └────────────────┘
    └─────────┘   │  Mainnet) │
                  └───────────┘
```

| Tier | Technology | Role |
|------|-----------|------|
| **Smart Contract** | Rust / NEAR Protocol | Property NFTs, bid escrow, leases, disputes |
| **Backend API** | Python (FastAPI) on Render | Auth, property CRUD, appointments, chat, notifications, ratings |
| **Mobile Client** | React Native (Expo) | UI, wallet management, transaction orchestration |

> For a deep dive into every layer, see [TECHNICAL_PAPER.md](./TECHNICAL_PAPER.md).

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** or **yarn**
- **Expo CLI** — `npm install -g expo-cli` (or use `npx expo`)
- **Expo Go** app on your phone, or an iOS Simulator / Android Emulator

### Installation

```bash
# Clone the repository
git clone https://github.com/shedasolutions-design/sheda-solution-mobile.git
cd sheda-solution-mobile

# Install dependencies
npm install
```

### Running the App

```bash
# Start the Expo dev server
npx expo start
```

Then open the app on:
- 📱 **Expo Go** — Scan the QR code
- 🤖 **Android Emulator** — Press `a`
- 🍎 **iOS Simulator** — Press `i`
- 🌐 **Web** — Press `w`

### Environment

The app ships pre-configured for **NEAR Testnet**. No additional environment variables are required to run it — the backend URL and contract IDs have sane defaults baked into the service configs, overridable via `.env` (see `.env.example`):

| Config | Value | Env override |
|--------|-------|--------------|
| Backend API | `https://sheda.peni.dev` (preferred), falls back to `https://sheda-backend-1.onrender.com` — one shared database | `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_API_URL_FALLBACK`, or the deploy workflow’s `backend` input |
| NEAR Contract | `shedasolution.testnet` | — |
| RPC Endpoint | `https://test.rpc.fastnear.com` |
| USDT Contract | `usdt.testnet` |

---

## 📂 Project Structure

```
sheda-solution-mobile/
├── app/                        # Expo Router pages (file-based routing)
│   ├── (auth)/                 # Login, signup, onboarding
│   ├── (tabs)/                 # Main tab bar screens
│   │   ├── home/               #   Property feed
│   │   ├── saved/              #   Saved properties
│   │   ├── list/               #   List new property (seller)
│   │   ├── inbox/              #   Chat inbox
│   │   ├── history/            #   Transaction history
│   │   └── wallet/             #   NEAR wallet
│   ├── details/[id].tsx        # Property detail + reviews
│   ├── wallet-setup/           # Multi-step wallet create/import
│   ├── book-appointment/       # Appointment booking
│   ├── release-document/       # Document release flow
│   └── ...                     # 20+ additional routes
├── components/                 # Reusable UI components
├── contexts/                   # React Context providers
│   ├── ApiContext.tsx           #   REST API wrapper
│   ├── WalletContext.tsx        #   NEAR wallet lifecycle
│   ├── NotificationContext.tsx  #   Notifications + preferences
│   └── ModeContext.tsx          #   Buyer/seller mode toggle
├── services/                   # Business logic & external APIs
│   ├── api.ts                  #   Backend REST client (60+ endpoints)
│   ├── nearContract.ts         #   Smart contract calls (42 methods)
│   ├── nearWallet.ts           #   Wallet operations (48 functions)
│   ├── nearIndexer.ts          #   NEARBlocks transaction indexer
│   ├── tokenRegistry.ts        #   FT metadata & balances
│   ├── priceService.ts         #   Exchange rate oracle
│   ├── secureStorage.ts        #   Keychain / AsyncStorage
│   └── transactionStore.ts     #   Local transaction state
├── hooks/                      # Custom React hooks
│   ├── useTransactions.ts      #   Transaction aggregation
│   ├── useNearContract.ts      #   Contract method wrappers
│   ├── useExchangeRates.ts     #   Live FX rates
│   └── useExpirationChecker.ts #   Agreement expiry alerts
├── types/                      # TypeScript definitions
│   ├── contract.ts             #   NEAR contract types & enums
│   └── transaction.ts          #   Transaction phases & state
└── utilities/                  # Helper functions
```

---

## 🔄 Transaction Lifecycle

A property transaction progresses through **11 phases**:

```
ft_transfer_call ──► Pending ──► Accepted ──► Appointment
                        │                        │
                    Rejected                DocsReleased
                    Cancelled                    │
                                          DocsConfirmed
                                                 │
                                         PaymentReleased
                                           │         │
                                      Completed   Disputed
```

| # | Phase | Buyer Action | Seller Action |
|---|-------|-------------|---------------|
| 1 | Bid Pending | Cancel Bid | Accept / Reject |
| 2 | Bid Accepted | Book Appointment | — |
| 3 | Appointment Booked | — | Accept / Reject |
| 4 | Appointment Confirmed | — | Release Docs |
| 5 | Docs Released | Confirm Docs | — |
| 6 | Docs Confirmed | Release Payment | — |
| 7 | Payment Released | — | Complete |
| 8 | Completed | Rate Property | — |
| 9 | Rejected | Claim Refund | — |
| 10 | Cancelled | — | — |
| 11 | Disputed | Rate Property | — |

State is tracked across three layers:
- **On-chain** (NEAR contract) — bid status (source of truth)
- **Backend** (REST API) — property details, contracts, appointments
- **Local** (AsyncStorage) — post-acceptance phases, document hashes

---

## 💰 Smart Contract

| Network | Contract ID |
|---------|------------|
| Testnet | `shedasolution.testnet` |
| Mainnet | `shedasolution.near` (inactive) |

### Key Methods

| `place_property` | 200 TGas + 0.01 Ⓝ | List property on-chain |
| `accept_bid` | 250 TGas + 1 yocto | Accept bid (PATH 1 — immediate) |
| `accept_bid_with_escrow` | 250 TGas + 1 yocto | Accept bid (PATH 3 — 24h escrow) |
| `reject_bid` | 100 TGas + 1 yocto | Reject bid |
| `cancel_bid` | 100 TGas + 1 yocto | Buyer cancels own bid |
| `claim_lost_bid` | 200 TGas + 1 yocto | Refund tokens from rejected bids |
| `release_payment` | 200 TGas + 1 yocto | Release escrow to seller |
| `complete_bid` | 200 TGas + 1 yocto | Finalize transaction |
| `raise_dispute` | 50 TGas + 1 yocto | Freeze escrow, start dispute |

Bids are placed by calling `ft_transfer_call` on the stablecoin token contract (e.g., `usdt.testnet`), which deposits tokens into the Sheda escrow and creates the bid on-chain.

---

## 🔐 Wallet & Security

- **BIP39** 12-word mnemonic generation
- **SLIP-0010** ED25519 key derivation
- **Biometric-protected** storage via `react-native-keychain` (iOS Keychain / Android Keystore)
- **No private keys leave the device** — all transaction signing is client-side
- **JWT auth** for backend API access
- **Escrow-based payments** — funds held by smart contract, not the counterparty

---

## 🛠 Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Client** | React Native 0.76, Expo SDK 52, Expo Router, NativeWind, TypeScript |
| **Blockchain** | NEAR Protocol, @near-js SDK v2, NEP-141 FTs, NEARBlocks Indexer |
| **Backend** | FastAPI (Python), PostgreSQL, Render.com |
| **Crypto** | bip39, @noble/hashes, bs58, expo-crypto |
| **UI** | Lucide icons, react-native-reanimated, react-native-calendars, react-native-star-rating-widget |

---

## 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `npx expo start` | Start Expo dev server |
| `npx expo run:android` | Build & run on Android device/emulator |
| `npx expo run:ios` | Build & run on iOS simulator |
| `npx expo start --web` | Run in web browser |
| `npm test` | Run Jest tests |
| `npm run lint` | Run ESLint |
| `npm run reset-project` | Reset to blank app template |

---

## 📄 Documentation

| Document | Description |
|----------|-------------|
| [TECHNICAL_PAPER.md](./TECHNICAL_PAPER.md) | Comprehensive architecture paper (smart contract flows, API reference, security model) |
| [BACKEND_API_ANALYSIS.md](./BACKEND_API_ANALYSIS.md) | Detailed backend API endpoint documentation |

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📝 License

This project is private and proprietary. All rights reserved.
