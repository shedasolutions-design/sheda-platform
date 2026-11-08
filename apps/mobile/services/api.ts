import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import {
  activeBase,
  alternateBase,
  isUnhealthyStatus,
  mayRetryAcrossBases,
  reportDown,
  reportUp,
} from "./apiEndpoints";

// Base API configuration — reads from app.config.ts's extra block (itself
// driven by the EXPO_PUBLIC_API_URL env var, see app.config.ts). Other files
// needing the backend origin (WebSocket URL, image URL resolution, debug
// tooling) should import API_BASE_URL from here rather than hardcoding their
// own copy.
//
// This is the preferred backend. Requests may still be served by the fallback
// when it is unreachable — see services/apiEndpoints.ts — so this is the right
// value for building a URL, but not a promise about which host answered.
export const API_BASE_URL =
  Constants.expoConfig?.extra?.apiUrl ?? "https://sheda.peni.dev";

// Types based on OpenAPI specification
export interface UserCreate {
  username?: string;
  email?: string;
  password: string;
  // Required by the backend as of its current deployed schema (verified
  // against the live /openapi.json — not yet reflected in the Sheda-Backend
  // repo's main branch). A deterministic preview id from
  // nearWalletService.getPreviewAccountId(email) — the same one shown on
  // the wallet-setup screen — not an actually-created on-chain account.
  near_account_id: string;
}

export interface UserUpdate {
  avatar_url?: string;
  username?: string;
  email?: string;
  phone_number?: string;
  account_type?: "client" | "agent" | "admin";
  fullname?: string;
  location?: string;
  agency_name?: string;
  kyc_status?: "pending" | "verified" | "rejected";
  rating?: number;
}

export interface UserShow {
  id: number;
  avatar_url?: string | null;
  username?: string | null;
  email?: string | null;
  phone_number?: string | null;
  account_type?: "client" | "agent" | "admin" | null;
  fullname?: string | null;
  location?: string | null;
  agency_name?: string | null;
  is_active?: boolean | null;
  is_deleted?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  verified?: boolean | null;
  kyc_status?: "pending" | "verified" | "rejected" | null;
  listing?: PropertyShow[] | null;
  appointments?: AppointmentShow[] | null;
  account_info?: AccountInfoShow[] | null;
  availabilities?: AvailabilityShow[] | null;
}

export interface Token {
  access_token: string;
  token_type?: string;
}

export interface OtpSend {
  email: string;
}

export interface OtpSchema {
  email: string;
  otp: string | number;
}

// Social login (Google OAuth)
export interface SocialLoginRequest {
  token: string;
  provider?: "google";
}

// Forgot password flow
export interface ForgotPasswordResetRequest {
  email: string;
}

export interface ForgotPasswordVerifyRequest {
  email: string;
  otp: string;
}

export interface PasswordReset {
  password: string;
}

export interface SwitchAccountType {
  switch_to: "client" | "agent";
}

export interface PropertyBase {
  title: string;
  description: string;
  location: string;
  price: number;
  property_type: "apartment" | "land" | "shortlet" | "shared apartment" | "bungalow" | "duplex" | "luxury villa" | "townhouse" | "waterfront" | "new development" | "affordable home";
  listing_type: "rent" | "sale";
  status: "sold" | "rented" | "available";
  furnished: boolean;
  is_active: boolean;
  bathroom: number;
  bedroom: number;
  air_condition: boolean;
  pop_ceiling: boolean;
  floor_tiles: boolean;
  running_water: boolean;
  furniture: boolean;
  prepaid_meter: boolean;
  wifi: boolean;
  is_negotiable: boolean;
  images: PropertyImage[];
  // Blockchain integration fields
  blockchain_property_id?: string | null;
  transaction_hash?: string | null;
  is_nft_minted?: boolean;
  blockchain_owner_id?: string | null;
  /**
   * Lease term in DAYS, matching the contract and the backend column.
   *
   * This was `rental_period_months`, which the backend's PropertyBase never
   * declared — Pydantic drops undeclared fields, so every term the seller set
   * was discarded between the form and the database without an error.
   */
  lease_duration_days?: number | null;
  /** Security deposit in atomic stablecoin units. Null or "0" charges none. */
  damage_deposit_required?: string | null;
}

export interface PropertyUpdate {
  title?: string;
  description?: string;
  location?: string;
  price?: number;
  property_type?: "apartment" | "land" | "shortlet" | "shared apartment" | "bungalow" | "duplex" | "luxury villa" | "townhouse" | "waterfront" | "new development" | "affordable home";
  listing_type?: "rent" | "sale";
  status?: "sold" | "rented" | "available";
  furnished?: boolean;
  is_active?: boolean;
  bathroom?: number;
  bedroom?: number;
  air_condition?: boolean;
  pop_ceiling?: boolean;
  floor_tiles?: boolean;
  running_water?: boolean;
  furniture?: boolean;
  prepaid_meter?: boolean;
  wifi?: boolean;
  is_negotiable?: boolean;
  images?: PropertyImage[];
  // Blockchain integration fields
  blockchain_property_id?: string | null;
  transaction_hash?: string | null;
  is_nft_minted?: boolean;
  blockchain_owner_id?: string | null;
  lease_duration_days?: number | null;
  damage_deposit_required?: string | null;
}

export interface PropertyShow extends PropertyBase {
  id: number;
  agent_id: number;
}

export interface PropertyImage {
  image_url: string;
  is_primary?: boolean;
}

export interface PropertyFeed {
  data: PropertyShow[];
  next_coursor?: number;
}

export interface AgentFeed {
  avatar_url?: string | null;
  fullname?: string | null;
  username?: string | null;
  email: string;
  phone_number?: string | null;
  agency_name?: string | null;
  location?: string | null;
  kyc_status?: "pending" | "verified" | "rejected" | null;
  last_seen?: string | null;
  rating?: number | null;
  listings: PropertyShow[];  // renamed from 'listing'
  availabilities: AvailabilityShow[];  // renamed from 'availbilities'
}

export interface AppointmentSchema {
  agent_id: number;
  property_id: number;
  requested_time: string;
  /**
   * The on-chain bid this viewing is for.
   *
   * Optional because people view properties before committing money. Supplied
   * once a bid is accepted so a seller with several accepted bids can tell
   * which buyer is coming.
   */
  bid_id?: number | null;
}

/**
 * `completed` and `not_agreed` describe what the viewing produced.
 *
 * `confirmed` only ever meant the slot was booked — it said nothing about
 * whether the meeting happened, let alone how it went, which is exactly what
 * the seller waits on before releasing the agreement. `not_agreed` is distinct
 * from `canceled`: one means the parties met and didn't agree, the other that
 * the viewing never took place.
 */
export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "canceled"
  | "completed"
  | "not_agreed";

export interface AppointmentShow {
  id: number;
  client_id: number;
  agent_id: number;
  property_id: number;
  bid_id?: number | null;
  scheduled_at: string;
  status: AppointmentStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Where a deal stands in the off-chain half of the flow.
 *
 * The buyer's escrow is locked from the moment their bid is accepted, but the
 * next on-chain step — the seller releasing the agreement — waits on a meeting
 * the chain can't observe. Pair this with the on-chain bid status to show one
 * continuous timeline instead of two disconnected halves.
 */
export interface AppointmentStageShow {
  bid_id: number;
  property_id: number;
  appointments: AppointmentShow[];
  /** A viewing reached `completed` — the seller can release the agreement. */
  ready_for_documents: boolean;
  /** The parties met and didn't agree; the buyer can cancel and be refunded. */
  viewing_not_agreed: boolean;
}

export interface AccountInfoBase {
  account_name?: string;
  bank_name?: string;
  acount_number?: string;
}

export interface AccountInfoShow extends AccountInfoBase {
  id: number;
  user_id: number;
}

export interface AgentAvailabilitySchema {
  weekday: string;
  start_time: string;
  end_time: string;
}

export interface AvailabilityShow extends AgentAvailabilitySchema {
  id: number;
  agent_id: number;
  is_booked: boolean;
}

export interface ContractCreate {
  property_id: number;
  amount: number;
  /**
   * Days, matching the contract. Omit it to take the term from the property,
   * which is the normal case — the length was agreed when it was listed.
   */
  lease_duration_days?: number | null;
  is_payment_made: boolean;
  // Blockchain fields
  bid_id?: number;
  transaction_hash?: string | null;
  lease_id?: number | null;
}

export interface ContractResponse {
  contract_id: number;
  property_id: number;
  contract_type: "rent" | "sale";
  amount: number;
  start_date: string;
  end_date?: string;
  is_active: boolean;
}

export interface ChatMessageSchema {
  sender_id?: number;
  receiver_id: number;
  message: string;
  timestamp?: string;
  property_id?: number;
  is_read?: boolean | null;
}

// Detailed chat message with sender/receiver info (returned by /chat/history/{user_id})
export interface ChatMessageDetailSchema {
  id: number;
  sender_id: number;
  receiver_id: number;
  message: string;
  timestamp?: string | null;
  property_id?: number | null;
  is_read: boolean;
  sender_info?: UserInfoSchema | null;
  receiver_info?: UserInfoSchema | null;
  property_info?: PropertyInfoSchema | null;
}

// Basic user info for chat context
export interface UserInfoSchema {
  id: number;
  username?: string | null;
  avatar_url?: string | null;
  fullname?: string | null;
}

// Minimal property info for chat context
export interface PropertyInfoSchema {
  id: number;
  title?: string | null;
  address?: string | null;
  images?: string[];
}

// Conversation list item
export interface ConversationSchema {
  other_user_id: number;
  other_user_name?: string | null;
  other_user_avatar_url?: string | null;
  other_user_fullname?: string | null;
  last_message?: string | null;
  last_message_timestamp?: string | null;
  last_message_sender_id?: number | null;
  unread_count: number;
  property_id?: number | null;
  property_title?: string | null;
  /**
   * Which of your two profiles this conversation belongs to. Only sent when
   * the account actually has both, so its absence means "this account has one
   * profile" — not "unknown".
   */
  as_profile?: "buyer" | "seller" | null;
  /**
   * Your own user id on this thread. Your buyer and seller rows have
   * different ids, so acting here means using this one rather than assuming
   * the active profile.
   */
  my_user_id?: number | null;
}

// Send message request/response
export interface SendMessageRequest {
  receiver_id: number;
  message: string;
  property_id?: number | null;
}

export interface SendMessageResponse {
  id: number;
  sender_id: number;
  receiver_id: number;
  message: string;
  timestamp: string;
  property_id?: number | null;
  is_read: boolean;
  sender_info?: UserInfoSchema | null;
}

// Mark read response
export interface MarkReadResponse {
  messages_marked: number;
  success: boolean;
}

// Unread count response
export interface UnreadCountResponse {
  total_unread: number;
  conversations_with_unread: number;
}

export interface FileShow {
  file_url: string;
}

// IPFS upload response
export interface IPFSResponse {
  IpfsUrl: string;
  IpfsHash: string;
}

export interface DeleteProperty {
  message: string;
}

// Transaction lifecycle types (updated to match live backend)
export type TransactionStatusEnum =
  | "pending" | "accepted" | "rejected" | "cancelled"
  | "docs_released" | "docs_confirmed" | "payment_released"
  | "completed" | "disputed";

export type TransactionActionEnum = "purchase" | "lease";

export type TransactionEventEnum =
  | "bid_placed" | "bid_accepted" | "bid_rejected" | "bid_cancelled"
  | "docs_released" | "docs_confirmed" | "payment_released"
  | "transaction_completed" | "dispute_raised"
  // Appointment sub-flow — persisted in metadata_payload, not the main
  // status column (see Sheda-Backend PR #17).
  | "appointment_booked" | "appointment_accepted" | "appointment_rejected"
  // Lease lifecycle, post-completion (see Sheda-Backend PR #18).
  | "lease_completed" | "lease_renewed";

export interface TransactionPropertyInfo {
  id?: number | null;
  blockchain_property_id?: string | null;
  title?: string | null;
  location?: string | null;
  images: string[];
}

export interface TransactionCounterpartyInfo {
  id?: number | null;
  name?: string | null;
  avatar_url?: string | null;
  wallet_id?: string | null;
}

export interface TransactionView {
  bid_id: string;
  property_id: string;
  status: TransactionStatusEnum;
  action?: TransactionActionEnum | null;
  bid_amount?: string | null;
  stablecoin_token?: string | null;
  document_token_id?: string | null;
  escrow_release_tx?: string | null;
  // No on-chain BidStatus equivalent — persisted separately via
  // upsert_transaction_from_event's appointment-event branch. One of
  // "booked" | "accepted" | "rejected" | null/undefined.
  appointment_status?: string | null;
  updated_at?: string | null;
  property?: TransactionPropertyInfo | null;
  counterparty?: TransactionCounterpartyInfo | null;
}

export interface TransactionListResponse {
  data: TransactionView[];
}

// Keep backward-compat alias
export type TransactionFeedItem = TransactionView;

export interface TransactionUploadResponse {
  uploaded_urls: string[];
  description?: string | null;
}

// Keep backward-compat alias
export type DocumentUploadResult = TransactionUploadResponse;

export interface TransactionNotificationPayload {
  transaction_id: string;
  event: TransactionEventEnum;
  recipient_user_id: number;
  property_id: number;
  metadata?: Record<string, any> | null;
}

// Backend notification types (from /api/v1/notifications endpoints) — updated to match live
export interface NotificationItem {
  id: number;
  transaction_id: string;
  event: TransactionEventEnum;
  recipient_user_id: number;
  property_id: number;
  metadata_payload?: Record<string, any> | null;
  is_read: boolean;
  created_at?: string | null;
}

export interface NotificationListResponse {
  data: NotificationItem[];
}

// Keep backward-compat alias
export type BackendNotification = NotificationItem;

export interface TransactionUpdatePayload {
  transaction_id: string;
  event: TransactionEventEnum;
  recipient_user_id: number;
  property_id: number;
  message?: string; // app-level description; backend may ignore
  metadata?: Record<string, any> | null;
}

// Keep backward-compat alias
export type TransactionNotificationRequest = TransactionUpdatePayload;

export interface TransactionNotificationResponse {
  id: number;
  transaction_id: string;
  event: TransactionEventEnum;
  recipient_user_id: number;
  property_id: number;
  metadata_payload?: Record<string, any> | null;
}

export interface RegisterDevicePayload {
  device_token: string;
  platform?: string | null;
}

// Keep backward-compat alias
export type DeviceTokenRequest = RegisterDevicePayload;

export interface DeviceTokenResponse {
  id: number;
  device_token: string;
  platform?: string | null;
}

// ---- Rating Types (updated to match live backend) ----

export interface RatingCreate {
  score: number; // 1-5
  comment?: string | null;
  ratee_id: number; // user being rated
}

export interface RatingShow {
  id: number;
  score: number;
  comment?: string | null;
  rater_id: number;
  ratee_id: number;
  created_at: string;
}

// ---- Wallet Types (updated paths) ----

export interface WalletUserInfo {
  id: number;
  wallet_id: string;
  name?: string | null;
  avatar_url?: string | null;
}

// Keep backward-compat alias
export type WalletLookupResponse = WalletUserInfo;

export interface WalletRegisterRequest {
  wallet_id: string;
}

// ---- KYC Types ----

export interface KycStartParams {
  email: string;
  first_name: string;
  last_name: string;
  phone_number?: string | null;
}

export interface KycStartResponse {
  verification_id: string;
  redirect_url: string;
  status: string;
}

export interface KycStatusResponse {
  id: string;
  status: "pending" | "approved" | "declined";
  created_at?: string;
  completed_at?: string;
  reason?: string;
}

export interface KycVerifiedResponse {
  user_id: number;
  is_verified: boolean;
  verification_status: string;
}

// ---- Minted Properties (Blockchain) ----

// ---- Collections (fractional property raises) ----
//
// Amounts are strings everywhere, deliberately. They are u128 atomic units
// of a stablecoin, and a JSON number is an IEEE double, exact only up to
// 2^53.
//
// A single unit price sits below that line: 18,000,000 naira at six
// decimals is 1.8e13, comfortably inside. What does not is everything
// computed from one. The vault's income accumulator is scaled by 1e18 and
// runs past 1e25 in ordinary use, a holder's claim is `balance *
// acc_per_share` before it is divided back down, and a raise beyond about
// 9 billion naira crosses the line on its own.
//
// Parsing any of those through a number loses the low digits in silence,
// and nobody finds out until a holder is shown a figure the chain
// disagrees with. One rule for every amount is cheaper than remembering
// which ones are safe.

export type CollectionRole = "builder" | "manager";

export type CollectionRaiseStatus =
    | "draft"
    | "open"
    | "funded"
    | "building"
    | "delivered"
    | "stalled"
    | "cancelled";

export type CollectionPhaseState =
    | "locked"
    | "building"
    | "awaiting_inspection"
    | "objection_window"
    | "held"
    | "released";

export type CollectionDocumentStatus = "verified" | "uploaded" | "missing";

/**
 * The counts a rank is computed from, exactly as the chain reported them.
 *
 * There is no score here and there is not meant to be. The app holds the
 * scoring function so it can show its working; a server that returned
 * "87, strong" would be asking to be trusted on the one point the product
 * promises not to need trust for.
 */
export interface CollectionChainRecord {
    projects_on_time: number;
    projects_late: number;
    projects_abandoned: number;
    projects_running: number;
    total_raised: string;
    stake_total: string;
    stake_allocated: string;
    stake_slashed_total: string;
    slash_count: number;

    units_managed: number;
    let_months: number;
    mandate_months: number;
    rent_paid_out: string;
    periods_paid_on_time: number;
    periods_due: number;
    disputes_upheld: number;

    /** When this cache was last rebuilt. Null means it never has been. */
    synced_at?: string | null;
    synced_block_height?: number | null;
}

export interface CollectionProfile {
    id: number;
    user_id: number;
    role: CollectionRole;
    display_name: string;
    near_account_id?: string | null;
    location?: string | null;
    about?: string | null;
    since_year?: number | null;
    /** Set where a manager belongs to a builder's own group. See R2. */
    part_of_group?: string | null;
    suspended: boolean;
    kyc_verified: boolean;
    avatar_url?: string | null;
    chain_record?: CollectionChainRecord | null;
    created_at: string;
}

export interface CollectionProfileCreate {
    role: CollectionRole;
    display_name: string;
    near_account_id?: string;
    location?: string;
    about?: string;
    since_year?: number;
    part_of_group?: string;
}

export interface CollectionDirectoryEntry {
    profile: CollectionProfile;
    live_projects: number;
}

export interface CollectionImage {
    id: number;
    image_url: string;
    position: number;
}

export interface CollectionDocument {
    id: number;
    label: string;
    status: CollectionDocumentStatus;
    file_url?: string | null;
    verified_at?: string | null;
}

export interface CollectionPhaseUpdate {
    id: number;
    body: string;
    image_url?: string | null;
    author_id: number;
    created_at: string;
}

export interface CollectionPhase {
    id: number;
    position: number;
    name: string;
    tranche_bps: number;
    state: CollectionPhaseState;
    attested_at?: string | null;
    objection_closes_at?: string | null;
    updates: CollectionPhaseUpdate[];
}

export interface CollectionUnit {
    id: number;
    code: string;
    label: string;
    bedrooms: number;
    price_atomic: string;
    total_shares: string;
    shares_sold: string;
    vault_account_id?: string | null;
}

export interface CollectionProjectSummary {
    id: number;
    slug: string;
    name: string;
    location: string;
    units: number;
    status: CollectionRaiseStatus;
    estimated_return_pct?: number | null;
    vault_account_id?: string | null;
    escrow_account_id?: string | null;
    closes_at?: string | null;
    cover_image_url?: string | null;
    builder?: CollectionProfile | null;
    manager?: CollectionProfile | null;
    /**
     * Share of the raise whose phases have passed, in basis points.
     * A proportion, never an amount: how much money that is stays the
     * chain's to say.
     */
    phases_released_bps: number;
}

export interface CollectionProjectDetail extends CollectionProjectSummary {
    description?: string | null;
    property_token_id?: string | null;
    image_urls: string[];
    documents: CollectionDocument[];
    phases: CollectionPhase[];
    /** The flats. Named apart from `units`, which is how many there are. */
    unit_list: CollectionUnit[];
}

export interface CollectionProjectCreate {
    slug: string;
    name: string;
    location: string;
    units: number;
    description?: string;
    estimated_return_pct?: number;
    manager_profile_id?: number;
    closes_at?: string;
    phases: { name: string; tranche_bps: number }[];
    unit_list: {
        code: string;
        label: string;
        bedrooms: number;
        price_atomic: string;
        total_shares: string;
    }[];
}

export interface MintedPropertyCreate {
  blockchain_property_id: string;
  owner_wallet_id: string;
  metadata_uri?: string | null;
  title?: string | null;
  description?: string | null;
}

export interface MintedPropertyShow {
  id: number;
  blockchain_property_id: string;
  owner_wallet_id: string;
  metadata_uri?: string | null;
  title?: string | null;
  description?: string | null;
  linked_property_id?: number | null;
  linked_at?: string | null;
  created_at: string;
}

export interface MintedPropertyLinkRequest {
  property_data: PropertyBase;
}

export interface MintedPropertyLinkResponse {
  minted_property: MintedPropertyShow;
  property: PropertyShow;
}

// ---- Search Types ----

export interface PropertySearchParams {
  query: string;
  min_price?: number;
  max_price?: number;
  location?: string;
  property_type?: string;
  listing_type?: string;
  min_bedroom?: number;
  max_bedroom?: number;
  min_bathroom?: number;
  max_bathroom?: number;
  furnished?: boolean;
  amenities?: string[];
  sort?: string;
  limit?: number;
  offset?: number;
}

export interface PropertySearchResult {
  data: PropertyShow[];
  total: number;
  limit: number;
  offset: number;
}

export interface ValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export interface HTTPValidationError {
  detail: ValidationError[];
}

// Unified API response shape
export type ApiResponse<T> =
  | { ok: true; data: T; status?: number }
  | { ok: false; error: any; status?: number; canceled?: boolean };

// API Service Class
class ApiService {
  private baseURL: string;
  private token: string | null = null;
  /**
   * Whether this instance follows the shared primary/fallback pair.
   *
   * The app's own `apiService` does. Anything constructed with an explicit
   * URL — a test, a debug screen pointed somewhere deliberately — keeps the
   * URL it was given, because silently redirecting it elsewhere would defeat
   * the reason it was constructed that way.
   */
  private readonly usesSharedBases: boolean;

  constructor(baseURL?: string) {
    this.usesSharedBases = baseURL === undefined;
    this.baseURL = baseURL ?? API_BASE_URL;
  }

  // Token management
  async setToken(token: string) {
    this.token = token;
    await AsyncStorage.setItem("auth_token", token);
  }

  async getToken(): Promise<string | null> {
    if (!this.token) {
      this.token = await AsyncStorage.getItem("auth_token");
    }
    return this.token;
  }

  async clearToken() {
    this.token = null;
    await AsyncStorage.removeItem("auth_token");
  }

  /**
   * Send a request, and if the backend itself is unreachable, try the other
   * one.
   *
   * The two deployments share a database, so this is a change of route rather
   * than a change of data — the same account sees the same listings either
   * way. Only reads are retried across backends; `mayRetryAcrossBases`
   * explains why a write must not be.
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit & { timeout?: number; silent?: boolean } = {}
  ): Promise<ApiResponse<T>> {
    // An explicitly constructed ApiService keeps whatever base it was given;
    // only the shared instance participates in failover.
    if (!this.usesSharedBases) {
      return this.requestAgainst<T>(this.baseURL, endpoint, options);
    }

    const base = activeBase();
    const first = await this.requestAgainst<T>(base, endpoint, options);

    if (first.ok) {
      reportUp(base);
      return first;
    }

    // A cancelled request is the caller's decision, not a backend fault.
    if (first.canceled) return first;

    const unreachable =
      first.status === undefined || isUnhealthyStatus(first.status);
    if (!unreachable) return first;

    reportDown(base);

    if (!mayRetryAcrossBases(options.method)) return first;

    const other = alternateBase(base);
    if (!other) return first;

    if (!options.silent) {
      console.warn(`⚠️ ${base} is not answering — retrying ${endpoint} on ${other}`);
    }

    const second = await this.requestAgainst<T>(other, endpoint, options);
    if (second.ok) reportUp(other);
    else if (second.status === undefined || isUnhealthyStatus(second.status)) {
      reportDown(other);
      // Both are unreachable, which usually means the device is offline
      // rather than both deployments being down. Report the original failure:
      // it is the one the caller asked for.
      return first;
    }
    return second;
  }

  private async requestAgainst<T>(
    origin: string,
    endpoint: string,
    options: RequestInit & { timeout?: number; silent?: boolean } = {}
  ): Promise<ApiResponse<T>> {
    const token = await this.getToken();
    const url = `${origin}${endpoint}`;
    const silent = options.silent;

    // Avoid setting JSON content-type for FormData uploads
    const isForm = options.body instanceof FormData;

    // Build headers
    // Build headers
    const authHeader = token ? `Bearer ${token}` : "";
    if (token) {
      console.log("🔐 Authorization Header:", authHeader.substring(0, 15) + "...");
    } else {
      console.warn("⚠️ No Authorization Header present!");
    }

    const headers: Record<string, string> = {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: authHeader } : {}),
      "Accept": "application/json",
      ...(options.headers as Record<string, string>),
    };

    // Build config while keeping signal/timeout support
    const { timeout, ...fetchOptions } = options;
    const config: RequestInit = {
      ...fetchOptions,
      headers,
    };

    console.log(`🌐 API Request: ${config.method || "GET"} ${url}`);
    console.log("📤 Request config:", { ...config, body: isForm ? "<FormData>" : config.body });

    // Handle timeout + optional provided signal
    let controller: AbortController | null = null;
    let combinedSignal: AbortSignal | undefined = config.signal as AbortSignal | undefined;

    try {
      if (timeout || !combinedSignal) {
        controller = new AbortController();

        if (combinedSignal) {
          // If caller provided a signal, forward its abort to our controller
          combinedSignal.addEventListener("abort", () => controller?.abort());
        }

        if (timeout) {
          setTimeout(() => controller?.abort(), timeout);
        }

        combinedSignal = controller.signal;
        (config as any).signal = combinedSignal;
      }

      const response = await fetch(url, config);

      console.log(`📥 Response status: ${response.status} ${response.statusText}`);
      console.log("📥 Response headers:", Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch (_e) {
          errorData = responseText || `Error ${response.status}: ${response.statusText}`;
        }

        if (!silent) {
          console.error(`API Error ${response.status} ${response.statusText}`);
          console.error("API Error Response Body:", errorData);
          console.error("Full error details will help debug backend crash");
        }

        return { ok: false, error: errorData, status: response.status };
      }

      // No content
      if (response.status === 204) {
        return { ok: true, data: (null as any) as T, status: response.status };
      }

      const data = await response.json().catch(() => null);
      console.log(`✅ API Success: ${endpoint}`);
      return { ok: true, data: data as T, status: response.status };
    } catch (error: any) {
      // Aborted request
      if (error?.name === "AbortError") {
        if (!silent) console.warn("⚠️ API Request aborted:", endpoint);
        return { ok: false, error: "Request aborted", canceled: true };
      }

      // Network errors or other failures
      if (!silent) {
        console.error("❌ API Request failed details:", {
          endpoint,
          url,
          message: error?.message,
          name: error?.name,
          stack: error?.stack,
          error: error
        });
      }
      const mapped = (error && error.message) || error;
      return { ok: false, error: mapped };
    }
  }

  // Test API connectivity
  async testConnection(): Promise<boolean> {
    try {
      console.log("🔍 Testing API connection...");
      const response = await fetch(`${this.baseURL}/api/v1/health`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log(
        "🔍 Health check response:",
        response.status,
        response.statusText
      );
      return response.ok;
    } catch (error) {
      console.error("🔍 API connection test failed:", error);
      return false;
    }
  }

  // Detailed health check
  async getHealthDetailed(): Promise<ApiResponse<any>> {
    return this.request<any>("/api/v1/health/detailed");
  }

  // Auth endpoints
  async signup(userData: UserCreate): Promise<ApiResponse<UserShow>> {
    return this.request<UserShow>(`/api/v1/auth/signup`, {
      method: "POST",
      body: JSON.stringify(userData),
    });
  }

  async verifyAccount(): Promise<ApiResponse<Token>> {
    return this.request<Token>("/api/v1/auth/verify-account", {
      method: "POST",
    });
  }

  async login(
    identifier: string,
    password: string,
    profile?: "buyer" | "seller"
  ): Promise<ApiResponse<Token>> {
    // Manually build urlencoded string for maximum compatibility in RN
    // The key must be 'username' per OAuth2/FastAPI spec, but it can contain email or phone
    let body = `username=${encodeURIComponent(identifier)}&password=${encodeURIComponent(password)}`;

    // A person owns two rows — buyer and seller — and login resolves one of
    // them. Sending the remembered profile here means a returning seller gets
    // the right token immediately; omitting it resolves buyer, exactly as
    // every build before the chooser did. Callers who don't know yet (a first
    // sign-in, where the choice comes after) correctly send nothing and let
    // the chooser switch afterwards.
    if (profile) {
      body += `&profile=${encodeURIComponent(profile)}`;
    }

    // The endpoint expects urlencoded form
    return this.request<Token>(`/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body,
    });
  }

  async logout(): Promise<ApiResponse<void>> {
    const res = await this.request<void>("/api/v1/auth/logout", {
      method: "POST",
      timeout: 5000, // 5 second timeout for logout
    });
    await this.clearToken();
    return res;
  }

  async resetPassword(password: string): Promise<ApiResponse<Token>> {
    return this.request<Token>("/api/v1/auth/reset-password", {
      method: "PUT",
      body: JSON.stringify({ password }),
    });
  }

  async sendOtp(email: string): Promise<ApiResponse<void>> {
    return this.request<void>("/api/v1/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async verifyOtp(email: string, otp: string | number): Promise<ApiResponse<Token>> {
    return this.request<Token>("/api/v1/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp }),
    });
  }

  async refreshToken(): Promise<ApiResponse<Token>> {
    return this.request<Token>("/api/v1/auth/refresh-token", {
      method: "PUT",
    });
  }

  async switchAccount(accountType: "client" | "agent"): Promise<ApiResponse<Token>> {
    return this.request<Token>("/api/v1/auth/switch-account", {
      method: "POST",
      body: JSON.stringify({ switch_to: accountType }),
    });
  }

  // User endpoints
  async getMe(options?: RequestInit & { timeout?: number; silent?: boolean }): Promise<ApiResponse<UserShow>> {
    return this.request<UserShow>("/api/v1/user/me", options);
  }

  async updateMe(userData: UserUpdate): Promise<ApiResponse<UserUpdate>> {
    return this.request<UserUpdate>("/api/v1/user/update/me", {
      method: "PUT",
      body: JSON.stringify(userData),
    });
  }

  async deleteAccount(): Promise<ApiResponse<void>> {
    return this.request<void>("/api/v1/user/me", {
      method: "DELETE",
    });
  }

  async bookAppointment(
    appointmentData: AppointmentSchema
  ): Promise<ApiResponse<AppointmentShow>> {
    return this.request<AppointmentShow>("/api/v1/user/book-appointment", {
      method: "POST",
      body: JSON.stringify(appointmentData),
    });
  }

  async confirmAppointment(appointmentId: number): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/v1/user/confirm-appointment/${appointmentId}`, {
      method: "PUT",
    });
  }

  async cancelAppointment(appointmentId: number): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/v1/user/cancel-appointment/${appointmentId}`, {
      method: "DELETE",
    });
  }

  /**
   * The off-chain half of a deal's timeline.
   *
   * 404s when no viewing has been booked for the bid yet, which is a normal
   * state rather than an error — the deal just hasn't reached that step.
   */
  async getAppointmentStage(
    bidId: number
  ): Promise<ApiResponse<AppointmentStageShow>> {
    return this.request<AppointmentStageShow>(
      `/api/v1/user/appointment-stage/${bidId}`
    );
  }

  /**
   * Record what a viewing produced, once it has actually happened.
   *
   * `agreed` is the signal the seller needs before releasing the agreement on
   * chain. `agreed: false` tells the buyer plainly that the deal is off, so
   * they can cancel and reclaim their escrow — which they can do at any time
   * while the bid is merely accepted.
   */
  async recordAppointmentOutcome(
    appointmentId: number,
    agreed: boolean
  ): Promise<ApiResponse<AppointmentShow>> {
    return this.request<AppointmentShow>(
      `/api/v1/user/appointment-outcome/${appointmentId}?agreed=${agreed}`,
      { method: "PATCH" }
    );
  }

  async createPaymentInfo(
    accountInfo: AccountInfoBase
  ): Promise<ApiResponse<AccountInfoShow>> {
    return this.request<AccountInfoShow>("/api/v1/user/create-payment-info", {
      method: "POST",
      body: JSON.stringify(accountInfo),
    });
  }

  async getPaymentInfo(userId?: number): Promise<ApiResponse<AccountInfoShow[]>> {
    const params = userId ? `?user_id=${userId}` : "";
    return this.request<AccountInfoShow[]>(`/api/v1/user/payment-info${params}`);
  }

  async updatePaymentInfo(
    accountInfoId: number,
    accountInfo: AccountInfoBase
  ): Promise<ApiResponse<AccountInfoShow>> {
    return this.request<AccountInfoShow>(`/api/v1/user/update-account-info/${accountInfoId}`, {
      method: "PUT",
      body: JSON.stringify(accountInfo),
    });
  }

  async deleteAccountInfo(accountInfoId: number): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/v1/user/delete-accnt-info/${accountInfoId}`, {
      method: "DELETE",
    });
  }

  async getPaymentInfoByContract(contractId: number): Promise<ApiResponse<AccountInfoBase>> {
    return this.request<AccountInfoBase>(`/api/v1/user/payment-info/${contractId}`);
  }

  async createAvailableTime(
    availability: AgentAvailabilitySchema
  ): Promise<ApiResponse<AvailabilityShow>> {
    return this.request<AvailabilityShow>("/api/v1/user/create-available-time", {
      method: "POST",
      body: JSON.stringify(availability),
    });
  }

  async getSchedule(): Promise<ApiResponse<AvailabilityShow[]>> {
    return this.request<AvailabilityShow[]>("/api/v1/user/get-schedule/me");
  }

  async updateSchedule(
    scheduleId: number,
    availability: AgentAvailabilitySchema
  ): Promise<ApiResponse<AvailabilityShow>> {
    return this.request<AvailabilityShow>(`/api/v1/user/update-schedule/${scheduleId}`, {
      method: "PUT",
      body: JSON.stringify(availability),
    });
  }

  /**
   * Remove one of the seller's viewing windows.
   * Backend returns 409 when the slot already has a booked viewing — the
   * appointment has to be cancelled first. See Sheda-Backend PR #21.
   */
  async deleteSchedule(scheduleId: number): Promise<ApiResponse<{ detail: string }>> {
    return this.request<{ detail: string }>(`/api/v1/user/delete-schedule/${scheduleId}`, {
      method: "DELETE",
    });
  }

  async confirmPayment(contractId: number): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/v1/user/confirm-payment/${contractId}`, {
      method: "POST",
    });
  }

  async approvePayment(contractId: number): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/v1/user/approve-payment/${contractId}`, {
      method: "POST",
    });
  }

  async createContract(
    contractData: ContractCreate
  ): Promise<ApiResponse<ContractResponse>> {
    return this.request<ContractResponse>("/api/v1/user/contracts/", {
      method: "POST",
      body: JSON.stringify(contractData),
    });
  }

  // Property endpoints
  async listProperty(propertyData: PropertyBase): Promise<ApiResponse<PropertyShow>> {
    return this.request<PropertyShow>("/api/v1/property/list-property", {
      method: "POST",
      body: JSON.stringify(propertyData),
    });
  }

  async getMyListings(options?: RequestInit & { timeout?: number; silent?: boolean }): Promise<ApiResponse<PropertyShow[]>> {
    return this.request<PropertyShow[]>("/api/v1/property/me", options);
  }

  async updateProperty(
    propertyId: number,
    propertyData: PropertyUpdate
  ): Promise<ApiResponse<PropertyShow>> {
    return this.request<PropertyShow>(`/api/v1/property/update/${propertyId}`, {
      method: "PUT",
      body: JSON.stringify(propertyData),
    });
  }

  async getProperties(
    limit: number = 20,
    cursor: number = 1,
    options?: RequestInit & { timeout?: number }
  ): Promise<ApiResponse<PropertyFeed>> {
    return this.request<PropertyFeed>(`/api/v1/property/get-properties?limit=${limit}&cursor=${cursor}`, options);
  }

  async getAgentProfile(agentId: number, options?: RequestInit & { timeout?: number; silent?: boolean }): Promise<ApiResponse<AgentFeed>> {
    return this.request<AgentFeed>(`/api/v1/property/agent-profile/${agentId}`, options);
  }

  async getPropertyById(propertyId: number, options?: RequestInit & { timeout?: number; silent?: boolean }): Promise<ApiResponse<PropertyShow>> {
    return this.request<PropertyShow>(`/api/v1/property/details/${propertyId}`, options);
  }

  async deleteProperty(propertyId: number): Promise<ApiResponse<DeleteProperty>> {
    return this.request<DeleteProperty>(`/api/v1/property/delete/${propertyId}`, {
      method: "DELETE",
    });
  }

  // Chat endpoints
  async getChatHistory(): Promise<ApiResponse<ChatMessageSchema[]>> {
    return this.request<ChatMessageSchema[]>("/api/v1/chat/chat-history");
  }

  async getConversations(): Promise<ApiResponse<any[]>> {
    return this.request<any[]>("/api/v1/chat/conversations");
  }

  async getMessageHistory(receiverId: number): Promise<ApiResponse<ChatMessageSchema[]>> {
    return this.request<ChatMessageSchema[]>(`/api/v1/chat/history/${receiverId}`);
  }

  async sendMessage(messageData: ChatMessageSchema): Promise<ApiResponse<ChatMessageSchema>> {
    return this.request<ChatMessageSchema>("/api/v1/chat/send-message", {
      method: "POST",
      body: JSON.stringify(messageData),
    });
  }

  async markMessagesAsRead(senderId: number): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/v1/chat/mark-read/${senderId}`, {
      method: "POST",
    });
  }

  async getUnreadCount(): Promise<ApiResponse<{ count: number }>> {
    return this.request<{ count: number }>("/api/v1/chat/unread-count");
  }

  // Media endpoints — backend now expects `files` (array) instead of `file`
  async uploadFile(type: "profile" | "property", file: any): Promise<ApiResponse<FileShow>> {
    const formData = new FormData();

    console.log("📤 uploadFile: Processing file for upload...", { type });

    // Helper to append a single file asset to FormData under the `files` key
    const appendFile = async (asset: any) => {
      const filename = asset.fileName || asset.name || asset.uri?.split("/").pop() || `${type}_${Date.now()}.jpg`;
      const mimeType = asset.mimeType || asset.type || "image/jpeg";

      console.log("📸 File details:", { filename, mimeType, uri: asset.uri });

      if (asset.uri) {
        if (Platform.OS === "web") {
          try {
            const response = await fetch(asset.uri);
            const blob = await response.blob();
            const fileObj = new File([blob], filename, { type: mimeType });
            formData.append("files", fileObj);
          } catch (err) {
            console.error("❌ Failed to fetch blob on web:", err);
            throw new Error("Failed to process image for upload");
          }
        } else {
          formData.append("files", {
            uri: asset.uri,
            type: mimeType,
            name: filename,
          } as any);
        }
      } else if (asset instanceof File || asset instanceof Blob) {
        formData.append("files", asset);
      } else {
        console.warn("⚠️ Unknown file format:", asset);
        formData.append("files", asset);
      }
    };

    // Support both single file and array of files
    if (Array.isArray(file)) {
      for (const f of file) await appendFile(f);
    } else {
      await appendFile(file);
    }

    // Backend returns FileShow[] now; unwrap to single for backward compat
    const result = await this.request<FileShow[]>(`/api/v1/media/file-upload/${type}`, {
      method: "POST",
      body: formData,
      headers: { 'Accept': 'application/json' },
    });

    // Flatten: if the response is an array, return the first item for backward compat
    if (result.ok && Array.isArray(result.data)) {
      return { ok: true, data: result.data[0], status: result.status };
    }
    return result as ApiResponse<FileShow>;
  }

  // Batch upload — returns all file URLs
  async uploadFiles(type: "profile" | "property", files: any[]): Promise<ApiResponse<FileShow[]>> {
    const formData = new FormData();

    for (const file of files) {
      const filename = file.fileName || file.name || file.uri?.split("/").pop() || `${type}_${Date.now()}.jpg`;
      const mimeType = file.mimeType || file.type || "image/jpeg";

      if (file.uri) {
        if (Platform.OS === "web") {
          try {
            const response = await fetch(file.uri);
            const blob = await response.blob();
            const fileObj = new File([blob], filename, { type: mimeType });
            formData.append("files", fileObj);
          } catch (err) {
            console.warn("Failed to process file on web:", err);
          }
        } else {
          formData.append("files", {
            uri: file.uri,
            type: mimeType,
            name: filename,
          } as any);
        }
      } else if (file instanceof File || file instanceof Blob) {
        formData.append("files", file);
      } else {
        formData.append("files", file);
      }
    }

    return this.request<FileShow[]>(`/api/v1/media/file-upload/${type}`, {
      method: "POST",
      body: formData,
      headers: { 'Accept': 'application/json' },
    });
  }

  // IPFS upload (via Pinata)
  async uploadToIpfs(files: any[]): Promise<ApiResponse<IPFSResponse[]>> {
    const formData = new FormData();

    for (const file of files) {
      const filename = file.fileName || file.name || file.uri?.split("/").pop() || `ipfs_${Date.now()}.jpg`;
      const mimeType = file.mimeType || file.type || "image/jpeg";

      if (file.uri) {
        if (Platform.OS === "web") {
          try {
            const response = await fetch(file.uri);
            const blob = await response.blob();
            const fileObj = new File([blob], filename, { type: mimeType });
            formData.append("files", fileObj);
          } catch (err) {
            console.warn("Failed to process IPFS file on web:", err);
          }
        } else {
          formData.append("files", {
            uri: file.uri,
            type: mimeType,
            name: filename,
          } as any);
        }
      } else if (file instanceof File || file instanceof Blob) {
        formData.append("files", file);
      } else {
        formData.append("files", file);
      }
    }

    return this.request<IPFSResponse[]>("/api/v1/media/ipfs-upload", {
      method: "POST",
      body: formData,
      headers: { 'Accept': 'application/json' },
    });
  }

  async getFiles(type: "profile" | "property"): Promise<ApiResponse<FileShow[]>> {
    return this.request<FileShow[]>(`/api/v1/media/file-upload/${type}`);
  }

  // Transaction endpoints — paths updated to match live backend
  async getTransactions(status?: "ongoing" | "completed" | "cancelled", options?: RequestInit & { timeout?: number; silent?: boolean }): Promise<ApiResponse<TransactionListResponse>> {
    const query = status ? `?status=${status}` : "";
    return this.request<TransactionListResponse>(`/api/v1/transactions${query}`, { ...options, silent: options?.silent ?? true });
  }

  async uploadTransactionDocuments(
    bidId: number | string,
    files: { uri: string }[],
    description?: string
  ): Promise<ApiResponse<TransactionUploadResponse>> {
    const formData = new FormData();
    if (description) formData.append("description", description);

    for (const file of files) {
      const filename = file.uri.split("/").pop() || `doc_${Date.now()}.jpg`;
      if (Platform.OS === "web") {
        try {
          const response = await fetch(file.uri);
          const blob = await response.blob();
          const fileObj = new File([blob], filename, { type: "image/jpeg" });
          formData.append("images", fileObj);
        } catch {
          console.warn("Failed to process doc image on web");
        }
      } else {
        formData.append("images", {
          uri: file.uri,
          type: "image/jpeg",
          name: filename,
        } as any);
      }
    }

    return this.request<TransactionUploadResponse>(`/api/v1/transactions/${bidId}/upload-documents`, {
      method: "POST",
      body: formData,
      headers: { Accept: "application/json" },
    });
  }

  async sendTransactionNotification(
    payload: TransactionNotificationPayload
  ): Promise<ApiResponse<void>> {
    return this.request<void>("/api/v1/notifications/transaction-update", {
      method: "POST",
      body: JSON.stringify(payload),
      silent: true,
    });
  }

  // Wallet endpoints — paths changed from /user/ to /users/
  async getUserByWallet(walletId: string): Promise<ApiResponse<WalletUserInfo>> {
    return this.request<WalletUserInfo>(`/api/v1/users/by-wallet/${encodeURIComponent(walletId)}`, {
      silent: true,
    });
  }

  async registerWallet(walletId: string): Promise<ApiResponse<WalletUserInfo>> {
    return this.request<WalletUserInfo>("/api/v1/users/wallets/register", {
      method: "POST",
      body: JSON.stringify({ wallet_id: walletId }),
    });
  }

  // ---- Notification API (updated to match live backend response types) ----

  /** GET /api/v1/notifications — Fetch all notifications for the current user */
  async getNotifications(): Promise<ApiResponse<NotificationListResponse>> {
    return this.request<NotificationListResponse>("/api/v1/notifications");
  }

  /** POST /api/v1/notifications/transaction-update — Send a transaction notification */
  async sendTransactionUpdate(
    payload: TransactionUpdatePayload
  ): Promise<ApiResponse<TransactionNotificationResponse>> {
    return this.request<TransactionNotificationResponse>("/api/v1/notifications/transaction-update", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /** POST /api/v1/notifications/{notification_id}/read — Mark a notification as read */
  async markNotificationRead(
    notificationId: number
  ): Promise<ApiResponse<TransactionNotificationResponse>> {
    return this.request<TransactionNotificationResponse>(
      `/api/v1/notifications/${notificationId}/read`,
      { method: "POST" }
    );
  }

  /** POST /api/v1/notifications/register-device — Register device for push notifications */
  async registerNotificationDevice(
    payload: RegisterDevicePayload
  ): Promise<ApiResponse<DeviceTokenResponse>> {
    return this.request<DeviceTokenResponse>("/api/v1/notifications/register-device", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // ---- Rating API (updated: rates a user, not a property) ----

  /** POST /api/v1/rating/ — Create a rating for a user */
  async createRating(payload: RatingCreate): Promise<ApiResponse<RatingShow>> {
    return this.request<RatingShow>("/api/v1/rating/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /** GET /api/v1/rating/?ratee_id={id} — Get ratings for a user */
  async getUserRatings(rateeId: number): Promise<ApiResponse<RatingShow[]>> {
    return this.request<RatingShow[]>(`/api/v1/rating/?ratee_id=${rateeId}`);
  }

  // Backward compat alias — callers doing getPropertyRatings now get user ratings
  async getPropertyRatings(propertyId: number): Promise<ApiResponse<RatingShow[]>> {
    return this.getUserRatings(propertyId);
  }

  // ---- Social Login ----

  async socialLogin(payload: SocialLoginRequest): Promise<ApiResponse<{ token: Token; user_data: UserShow }>> {
    return this.request<{ token: Token; user_data: UserShow }>("/api/v1/auth/social-login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // ---- Forgot Password ----

  async forgotPassword(email: string): Promise<ApiResponse<any>> {
    return this.request<any>("/api/v1/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async verifyForgotPassword(email: string, otp: string): Promise<ApiResponse<Token>> {
    return this.request<Token>("/api/v1/auth/verify-forgot-password", {
      method: "POST",
      body: JSON.stringify({ email, otp }),
    });
  }

  // ---- Get User By ID ----

  async getUserById(userId: number): Promise<ApiResponse<UserShow>> {
    return this.request<UserShow>(`/api/v1/user/${userId}`);
  }

  // ---- KYC Endpoints ----

  async startKycVerification(params: KycStartParams): Promise<ApiResponse<KycStartResponse>> {
    const qs = new URLSearchParams({
      email: params.email,
      first_name: params.first_name,
      last_name: params.last_name,
      ...(params.phone_number ? { phone_number: params.phone_number } : {}),
    }).toString();
    return this.request<KycStartResponse>(`/api/v1/user/kyc/start-verification?${qs}`, {
      method: "POST",
    });
  }

  async getKycStatus(verificationId: string): Promise<ApiResponse<KycStatusResponse>> {
    return this.request<KycStatusResponse>(`/api/v1/user/kyc/status/${verificationId}`);
  }

  async isUserVerified(userId: number): Promise<ApiResponse<KycVerifiedResponse>> {
    return this.request<KycVerifiedResponse>(`/api/v1/user/kyc/is-verified/${userId}`);
  }

  // ---- Advanced Property Search ----

  async searchProperties(params: PropertySearchParams): Promise<ApiResponse<PropertySearchResult>> {
    const queryParts: string[] = [];
    queryParts.push(`query=${encodeURIComponent(params.query)}`);
    if (params.min_price !== undefined) queryParts.push(`min_price=${params.min_price}`);
    if (params.max_price !== undefined) queryParts.push(`max_price=${params.max_price}`);
    if (params.location) queryParts.push(`location=${encodeURIComponent(params.location)}`);
    if (params.property_type) queryParts.push(`property_type=${encodeURIComponent(params.property_type)}`);
    if (params.listing_type) queryParts.push(`listing_type=${encodeURIComponent(params.listing_type)}`);
    if (params.min_bedroom !== undefined) queryParts.push(`min_bedroom=${params.min_bedroom}`);
    if (params.max_bedroom !== undefined) queryParts.push(`max_bedroom=${params.max_bedroom}`);
    if (params.min_bathroom !== undefined) queryParts.push(`min_bathroom=${params.min_bathroom}`);
    if (params.max_bathroom !== undefined) queryParts.push(`max_bathroom=${params.max_bathroom}`);
    if (params.furnished !== undefined) queryParts.push(`furnished=${params.furnished}`);
    if (params.amenities && params.amenities.length > 0) {
      params.amenities.forEach(a => queryParts.push(`amenities=${encodeURIComponent(a)}`));
    }
    if (params.sort) queryParts.push(`sort=${encodeURIComponent(params.sort)}`);
    if (params.limit !== undefined) queryParts.push(`limit=${params.limit}`);
    if (params.offset !== undefined) queryParts.push(`offset=${params.offset}`);

    return this.request<PropertySearchResult>(`/api/v1/property/search?${queryParts.join("&")}`);
  }

  // ---- Minted Properties (Blockchain NFT) ----

  async registerMintedProperty(data: MintedPropertyCreate): Promise<ApiResponse<MintedPropertyShow>> {
    return this.request<MintedPropertyShow>("/api/v1/minted-properties/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async createListingFromMinted(mintedId: number, propertyData: PropertyBase): Promise<ApiResponse<MintedPropertyLinkResponse>> {
    return this.request<MintedPropertyLinkResponse>(`/api/v1/minted-properties/${mintedId}/create-listing`, {
      method: "POST",
      body: JSON.stringify({ property_data: propertyData }),
    });
  }

  // ---- Collections (fractional property raises) ----
  //
  // The backend serves what a contract is the wrong place for: the prose,
  // the photographs, the documents, and a cache of the chain counts a
  // reputation is built from. Targets, balances and ranks are deliberately
  // absent. Those come from the chain or are computed by the app, because a
  // second copy of a number that decides who owns what is a second answer
  // waiting to contradict the first.

  async getCollectionProjects(
    params: { status?: CollectionRaiseStatus; builderProfileId?: number } = {},
    options?: RequestInit & { timeout?: number; silent?: boolean }
  ): Promise<ApiResponse<CollectionProjectSummary[]>> {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.builderProfileId != null) {
      query.set("builder_profile_id", String(params.builderProfileId));
    }
    const suffix = query.toString() ? `?${query}` : "";
    return this.request<CollectionProjectSummary[]>(
      `/api/v1/collections/projects${suffix}`,
      options
    );
  }

  async getCollectionProject(
    slug: string,
    options?: RequestInit & { timeout?: number; silent?: boolean }
  ): Promise<ApiResponse<CollectionProjectDetail>> {
    return this.request<CollectionProjectDetail>(
      `/api/v1/collections/projects/${encodeURIComponent(slug)}`,
      options
    );
  }

  async getMyCollectionProjects(): Promise<ApiResponse<CollectionProjectSummary[]>> {
    return this.request<CollectionProjectSummary[]>("/api/v1/collections/projects/mine");
  }

  async createCollectionProject(
    payload: CollectionProjectCreate
  ): Promise<ApiResponse<CollectionProjectDetail>> {
    return this.request<CollectionProjectDetail>("/api/v1/collections/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async publishCollectionProject(
    slug: string,
    payload: { escrow_account_id: string; manager_profile_id: number; vault_account_id?: string }
  ): Promise<ApiResponse<CollectionProjectSummary>> {
    return this.request<CollectionProjectSummary>(
      `/api/v1/collections/projects/${encodeURIComponent(slug)}/publish`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  }

  async getCollectionDirectory(
    role: CollectionRole,
    options?: RequestInit & { timeout?: number; silent?: boolean }
  ): Promise<ApiResponse<CollectionDirectoryEntry[]>> {
    return this.request<CollectionDirectoryEntry[]>(
      `/api/v1/collections/directory?role=${role}`,
      options
    );
  }

  async getCollectionProfile(
    profileId: number,
    options?: RequestInit & { timeout?: number; silent?: boolean }
  ): Promise<ApiResponse<CollectionProfile>> {
    return this.request<CollectionProfile>(
      `/api/v1/collections/profiles/${profileId}`,
      options
    );
  }

  async getMyCollectionProfiles(): Promise<ApiResponse<CollectionProfile[]>> {
    return this.request<CollectionProfile[]>("/api/v1/collections/profiles/me");
  }

  async createCollectionProfile(
    payload: CollectionProfileCreate
  ): Promise<ApiResponse<CollectionProfile>> {
    return this.request<CollectionProfile>("/api/v1/collections/profiles", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async updateCollectionProfile(
    profileId: number,
    payload: Partial<CollectionProfileCreate>
  ): Promise<ApiResponse<CollectionProfile>> {
    return this.request<CollectionProfile>(`/api/v1/collections/profiles/${profileId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async addCollectionImage(
    slug: string,
    payload: { image_url: string; position?: number }
  ): Promise<ApiResponse<CollectionImage>> {
    return this.request<CollectionImage>(
      `/api/v1/collections/projects/${encodeURIComponent(slug)}/images`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  }

  async removeCollectionImage(imageId: number): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/v1/collections/images/${imageId}`, {
      method: "DELETE",
    });
  }

  async addCollectionDocument(
    slug: string,
    payload: { label: string; file_url?: string }
  ): Promise<ApiResponse<CollectionDocument>> {
    return this.request<CollectionDocument>(
      `/api/v1/collections/projects/${encodeURIComponent(slug)}/documents`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  }

  async getPhaseUpdates(
    phaseId: number,
    options?: RequestInit & { timeout?: number; silent?: boolean }
  ): Promise<ApiResponse<CollectionPhaseUpdate[]>> {
    return this.request<CollectionPhaseUpdate[]>(
      `/api/v1/collections/phases/${phaseId}/updates`,
      options
    );
  }

  async postPhaseUpdate(
    phaseId: number,
    payload: { body: string; image_url?: string }
  ): Promise<ApiResponse<CollectionPhaseUpdate>> {
    return this.request<CollectionPhaseUpdate>(
      `/api/v1/collections/phases/${phaseId}/updates`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;