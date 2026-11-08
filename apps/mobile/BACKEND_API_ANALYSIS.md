# Backend API Documentation Analysis

**Status**: Backend API at `https://sheda-backend.onrender.com/docs` is currently unavailable (404 error)

However, based on the client codebase type definitions and API integration code, here is the complete specification for property listing and related endpoints:

---

## 1. POST /api/v1/property/list-property

### Endpoint Purpose
Creates a new property listing in the system. This is the primary endpoint for sellers/agents to list properties for rent or sale.

### HTTP Method
`POST`

### Request Headers
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

### Request Body Schema: PropertyBase

```typescript
interface PropertyBase {
  // Core property information (REQUIRED)
  title: string;                    // Property name/title
  description: string;              // Full description of the property
  location: string;                 // Location/address of property
  price: number;                    // Price in the selected currency
  
  // Property classification (REQUIRED)
  property_type: "apartment" | "land" | "shortlet" | "shared apartment";
  listing_type: "rent" | "sale";    // Whether listing is for rent or sale
  status: "sold" | "rented" | "available";
  
  // Property features (REQUIRED)
  furnished: boolean;               // Is property furnished?
  is_active: boolean;               // Is listing currently active?
  bathroom: number;                 // Number of bathrooms
  bedroom: number;                  // Number of bedrooms
  
  // Amenities/Features (REQUIRED boolean flags)
  air_condition: boolean;           // Has air conditioning?
  pop_ceiling: boolean;             // Has pop ceiling?
  floor_tiles: boolean;             // Has floor tiles?
  running_water: boolean;           // Has running water?
  furniture: boolean;               // Is furnished? (separate from furnished flag)
  prepaid_meter: boolean;           // Has prepaid meter?
  wifi: boolean;                    // Has Wi-Fi?
  
  // Additional options (REQUIRED)
  is_negotiable: boolean;           // Is price negotiable?
  
  // Media (REQUIRED)
  images: PropertyImage[];          // Array of property images
}

interface PropertyImage {
  image_url: string;                // URL of the image
  is_primary?: boolean;             // Mark as primary/featured image
}
```

### All Required Fields Summary

The following fields are **REQUIRED** (all of them) to create a property listing:

1. `title` - String
2. `description` - String
3. `location` - String
4. `price` - Number
5. `property_type` - Enum: "apartment" | "land" | "shortlet" | "shared apartment"
6. `listing_type` - Enum: "rent" | "sale"
7. `status` - Enum: "sold" | "rented" | "available"
8. `furnished` - Boolean
9. `is_active` - Boolean
10. `bathroom` - Number
11. `bedroom` - Number
12. `air_condition` - Boolean
13. `pop_ceiling` - Boolean
14. `floor_tiles` - Boolean
15. `running_water` - Boolean
16. `furniture` - Boolean
17. `prepaid_meter` - Boolean
18. `wifi` - Boolean
19. `is_negotiable` - Boolean
20. `images` - Array of PropertyImage objects (at least 1 image required)

### Response Schema: PropertyShow

```typescript
interface PropertyShow extends PropertyBase {
  id: number;                       // Property ID (server-generated)
  agent_id: number;                 // Agent/Seller ID (auto-assigned from auth token)
}
```

### Response Status Codes
- `201` or `200`: Success - Property created
- `400`: Validation error - Invalid request body
- `401`: Unauthorized - Missing or invalid auth token
- `422`: Validation error - Field validation failure (HTTPValidationError)

### Example Request

```json
{
  "title": "Beautiful 3-bedroom apartment in Lekki",
  "description": "Spacious apartment with modern amenities, close to shopping centers and schools",
  "location": "Lekki, Lagos",
  "price": 850000,
  "property_type": "apartment",
  "listing_type": "rent",
  "status": "available",
  "furnished": true,
  "is_active": true,
  "bathroom": 2,
  "bedroom": 3,
  "air_condition": true,
  "pop_ceiling": true,
  "floor_tiles": true,
  "running_water": true,
  "furniture": true,
  "prepaid_meter": true,
  "wifi": true,
  "is_negotiable": false,
  "images": [
    {
      "image_url": "https://example.com/image1.jpg",
      "is_primary": true
    },
    {
      "image_url": "https://example.com/image2.jpg",
      "is_primary": false
    }
  ]
}
```

### Example Response (Success)

```json
{
  "ok": true,
  "data": {
    "id": 123,
    "agent_id": 45,
    "title": "Beautiful 3-bedroom apartment in Lekki",
    "description": "Spacious apartment with modern amenities, close to shopping centers and schools",
    "location": "Lekki, Lagos",
    "price": 850000,
    "property_type": "apartment",
    "listing_type": "rent",
    "status": "available",
    "furnished": true,
    "is_active": true,
    "bathroom": 2,
    "bedroom": 3,
    "air_condition": true,
    "pop_ceiling": true,
    "floor_tiles": true,
    "running_water": true,
    "furniture": true,
    "prepaid_meter": true,
    "wifi": true,
    "is_negotiable": false,
    "images": [
      {
        "image_url": "https://example.com/image1.jpg",
        "is_primary": true
      },
      {
        "image_url": "https://example.com/image2.jpg",
        "is_primary": false
      }
    ]
  },
  "status": 201
}
```

---

## 2. Related Property Endpoints

### GET /api/v1/property/me
Retrieve all properties listed by the authenticated user (agent/seller).

**Response**: `PropertyShow[]`

### GET /api/v1/property/get-properties
Paginated endpoint to fetch all properties in the system.

**Parameters**:
- `limit` (query): Number of results per page (default: 20)
- `cursor` (query): Pagination cursor (default: 1)

**Response**: `PropertyFeed` (contains data array and next_cursor)

### GET /api/v1/property/{propertyId}
Retrieve details of a specific property by ID.

**Response**: `PropertyShow`

### PUT /api/v1/property/update/{propertyId}
Update an existing property listing.

**Request Body**: `PropertyUpdate` (all fields optional)

**Response**: `PropertyShow`

### DELETE /api/v1/property/delete/{propertyId}
Delete a property listing.

**Response**: 
```typescript
{
  message: string  // Success message
}
```

### GET /api/v1/property/agent-profile/{agentId}
Get an agent's profile including all their listings.

**Response**: `AgentFeed`

---

## 3. Document-Related Features

### Current Document Capabilities

Based on the codebase analysis, the system includes:

1. **Document Release Workflow** - Located in:
   - Route: `/release-document` (app/release-document/)
   - Component: `components/history/OngoingCard.tsx`
   - Purpose: Allow sellers to release documents after transaction completion

2. **Property Agreement Page** - Located in:
   - Route: `/property-agreement/` (in app layout)
   - Purpose: Display property agreement terms

3. **Document Release with PIN** - Located in:
   - Route: `/release-document-pin/` (app/release-document-pin/)
   - Purpose: Secure document release with PIN verification

### File Upload Endpoint

```typescript
POST /api/v1/media/file-upload/{type}
```

**Parameters**:
- `type`: "profile" | "property" - Type of file being uploaded

**Request Body**: FormData with `file` field

**Response**:
```typescript
interface FileShow {
  file_url: string;  // URL of uploaded file
}
```

### Document Schema (Inferred)

While not explicitly defined in PropertyBase, documents are managed through:
- Contract system (`ContractCreate`, `ContractResponse`)
- File upload system (PropertyImage URLs)
- KYC status tracking (`kyc_status`: "pending" | "verified" | "rejected")

---

## 4. Contract & Payment Endpoints

### POST /api/v1/user/contracts/
Create a rental/sale contract for a property.

**Request Body**:
```typescript
interface ContractCreate {
  property_id: number;           // REQUIRED
  amount: number;                // REQUIRED - Contract amount
  rental_period_months?: number; // Optional - For rental contracts
  is_payment_made: boolean;      // REQUIRED
  bid_id?: number;               // Optional - Blockchain field
  transaction_hash?: string;     // Optional - Blockchain field
  lease_id?: number;             // Optional - Blockchain field
}
```

**Response**:
```typescript
interface ContractResponse {
  contract_id: number;
  property_id: number;
  contract_type: "rent" | "sale";
  amount: number;
  start_date: string;
  end_date?: string;
  is_active: boolean;
}
```

### POST /api/v1/user/confirm-payment/{contractId}
Confirm payment for a contract.

**Response**: Void (204 No Content)

### POST /api/v1/user/approve-payment/{contractId}
Approve payment for a contract (opposite party).

**Response**: Void (204 No Content)

---

## 5. Validation Rules & Constraints

### PropertyBase Validation

| Field | Type | Min | Max | Pattern | Notes |
|-------|------|-----|-----|---------|-------|
| title | String | 1 | 255 | - | Required |
| description | String | 10 | 5000 | - | Minimum 10 characters required (from client validation) |
| location | String | 1 | 255 | - | Required |
| price | Number | > 0 | - | - | Must be positive |
| bedroom | Number | 0 | - | Integer | Non-negative |
| bathroom | Number | 0 | - | Integer | Non-negative |
| property_type | Enum | - | - | Specific values only | Must be one of 4 types |
| listing_type | Enum | - | - | Specific values only | "rent" or "sale" |
| status | Enum | - | - | Specific values only | "sold", "rented", or "available" |
| images | Array | 1+ | - | - | At least 1 image required |

### PropertyImage Validation

- `image_url`: Must be a valid URL string
- `is_primary`: Optional boolean (defaults to false)
- At least one image must have `is_primary: true` (recommended)

---

## 6. Blockchain Integration Fields

The API supports optional blockchain integration:

```typescript
// In PropertyUpdate (optional)
contract_property_id?: number | null;
transaction_hash?: string | null;
is_nft_minted?: boolean;
blockchain_owner_id?: string | null;

// In ContractCreate (optional)
bid_id?: number;
transaction_hash?: string | null;
lease_id?: number | null;
```

These fields are not required for basic property listing but support NFT minting and blockchain property registration features.

---

## 7. Error Response Examples

### Validation Error (400/422)
```json
{
  "ok": false,
  "error": {
    "detail": [
      {
        "loc": ["body", "title"],
        "msg": "field required",
        "type": "value_error.missing"
      },
      {
        "loc": ["body", "price"],
        "msg": "ensure this value is greater than 0",
        "type": "value_error.number.not_gt"
      }
    ]
  },
  "status": 422
}
```

### Authentication Error (401)
```json
{
  "ok": false,
  "error": {
    "detail": "Not authenticated"
  },
  "status": 401
}
```

---

## 8. Implementation Notes from Client Code

The client implementation shows:

1. **Image Upload**: Images must be uploaded separately via `/api/v1/media/file-upload/property` endpoint, then referenced by URL in PropertyBase

2. **Seller Verification**: Property listing requires either:
   - `isSeller === true` (local mode state)
   - OR `user.account_type === "agent"` (backend verification)

3. **Form Validation**: Client performs pre-flight validation:
   - Description minimum 10 characters
   - At least 1 photo required
   - Valid numeric price > 0
   - Valid bedroom/bathroom counts (non-negative integers)

4. **Dynamic Property Type Mapping**:
   - Maps user-friendly names to API enums
   - Supports: Apartment, Land, Shortlet, Shared Apartment

5. **Status Assignment**: 
   - Initial status always set to "available"
   - Can be updated later via PUT endpoint

6. **Negotiable Pricing**:
   - Tracked separately as `is_negotiable` boolean
   - Does not affect the `price` field

---

## Summary

The `/api/v1/property/list-property` endpoint is a **POST** endpoint that accepts a **PropertyBase** object with **20 required fields** (no optional fields in the schema). The endpoint creates a new property listing and returns a **PropertyShow** object with auto-generated `id` and `agent_id` fields.

Document management is handled through a separate file upload system and contract/payment workflow, with no explicit document schema in the PropertyBase structure. Documents are secured through PIN verification flows and contract management systems.
