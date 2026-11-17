# Admin API and Flutter handover

All paths below start with `/api/v1`. Admin routes require `Authorization: Bearer <accessToken>` from the existing login. The session must be active, its user ACTIVE, and the current database role ADMIN. No separate admin login or registration endpoint exists. Missing/invalid bearer, suspended users and revoked/expired sessions return 401; authenticated customers return 403. Every admin controller requires ADMIN and has no Public decorator.

JSON requests are strict: unknown keys return 400. IDs are UUIDs. JSON collections are arrays without pagination or envelopes. POST returns 201; GET/PATCH returns 200. Dates in responses are ISO timestamps, nullable fields are JSON null. PATCH accepts any nonempty subset of the corresponding create fields; omitted fields keep existing values, including slugs. All persisted timestamps are UTC; date-only appointment filtering uses Asia/Dhaka.

| Method | Path | Response |
|---|---|---|
| GET | `/admin/dashboard` | Dashboard object |
| GET | `/admin/categories` | Category[] including inactive |
| GET | `/admin/categories/:id` | Category |
| POST | `/admin/categories` | Created Category |
| PATCH | `/admin/categories/:id` | Updated Category |
| GET | `/admin/services` | AdminService[] including inactive |
| GET | `/admin/services/:id` | AdminService |
| POST | `/admin/services` | Created AdminService |
| PATCH | `/admin/services/:id` | Updated AdminService |
| GET | `/admin/offers` | AdminOffer[] including inactive, expired and future |
| GET | `/admin/offers/:id` | AdminOffer |
| POST | `/admin/offers` | Created AdminOffer |
| PATCH | `/admin/offers/:id` | Updated AdminOffer |
| GET | `/admin/appointments` | AdminAppointment[] |
| GET | `/admin/appointments/:id` | AdminAppointment |
| PATCH | `/admin/appointments/:id/status` | Updated AdminAppointment |
| POST | `/admin/media/images` | `{id,imageUrl}` |
| GET | `/media/images/:id` | Public binary image |

## Administrator provisioning

Configure `.env` using `docs/environment.md`, apply migrations with `npm run prisma:migrate:deploy`, then run `npm run admin:create` from the repository root. The CLI prompts for name, email and a hidden password. Name must be 1–160 trimmed characters, email valid and at most 320 characters, password 10–256 characters. Email is trimmed and lowercased; the existing scrypt password service is used. The command creates an ACTIVE ADMIN, rejects existing email addresses, disconnects on success/failure and exits nonzero on failure. It never promotes a customer. It never runs at application startup or during seeding.

For noninteractive provisioning provide all three environment variables: `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. Partial configuration fails. Inject secrets through your deployment secret mechanism; do not commit them or put literal passwords into shell history. No defaults exist.

Registration always creates CUSTOMER. Register, login, `GET /auth/me`, profile update and refresh responses expose the safe user object `{id,name,email,role}` with role `CUSTOMER | ADMIN`. Public register/profile payloads reject `role`. JWT claims remain unchanged; role is read from the database on each authenticated request, so promotion/demotion takes effect with the same bearer token. Refresh additionally returns `accessToken`, `csrfToken` and the rotated HttpOnly cookie, as before.

## Categories

Create payload fields:

| Field | Type / rules | Required / default |
|---|---|---|
| name | trimmed string, 1–200 characters | Required |
| slug | lowercase ASCII words/numbers separated by hyphens, max 200 | Generated from name when omitted; UUID fallback for names without ASCII letters/digits |
| description | string, max 10000, or null | null |
| imageUrl | absolute HTTP(S) URL or null | null |
| isActive | boolean | true |
| sortOrder | signed 32-bit integer | 0 |

Category response is `{id,name,slug,description,imageUrl,isActive,sortOrder,createdAt,updatedAt}`. Lists sort by sortOrder then ID. Slugs are unique; conflicts return 409. Deactivate with `PATCH {"isActive":false}`. There is no delete route. Existing relationships remain intact. Public categories/services immediately follow their existing active-category and package-component filtering.

## Services and packages

Create payload fields:

| Field | Type / rules | Required / default |
|---|---|---|
| categoryId | existing category UUID, inactive categories allowed | Required |
| type | `INDIVIDUAL` or `PACKAGE` | Required |
| name | trimmed string, 1–200 | Required |
| slug | same rules as category | Generated on create |
| description | string, max 10000 | Required |
| price | decimal string or JSON number; 0–9999999999.99, at most 2 decimal places | Required |
| currency | literal `BDT` | BDT |
| durationMinutes | positive integer, max 1440 | Required |
| imageUrl | absolute HTTP(S) URL or null | null |
| inclusions | array of up to 100 strings, each trimmed 1–1000 characters | Required |
| isActive | boolean | true |
| isFeatured | boolean | false |
| sortOrder | signed 32-bit integer | 0 |
| packageItems | up to 100 `{serviceId: UUID, quantity: integer 1–1000}` objects | Required nonempty for PACKAGE; omitted/empty for INDIVIDUAL |

Use decimal strings from Flutter for monetary inputs to avoid binary floating point surprises. Decimal exponents, negative amounts, excessive precision and out-of-range values are rejected. Responses use JSON numbers consistent with existing public DTOs.

Example package creation:

```json
{
  "categoryId": "11111111-1111-4111-8111-111111111111",
  "type": "PACKAGE",
  "name": "Care package",
  "description": "Wash and inspection",
  "price": "1200.00",
  "durationMinutes": 90,
  "inclusions": ["Exterior wash", "Inspection"],
  "packageItems": [{"serviceId": "22222222-2222-4222-8222-222222222222", "quantity": 1}]
}
```

Replace example UUIDs with IDs returned by the API. Package items must reference existing INDIVIDUAL services; duplicates, unknown IDs, nested packages and self-references return 400. Explicit package prices are independent of component prices. Composition replacement is atomic; PATCH omitting packageItems preserves composition. Type changes for any service participating in composition return 409, matching the existing database trigger. To change composition, edit items while preserving PACKAGE type. Deactivate rather than delete.

AdminService response fields:

```text
id, categoryId, categoryName, type, name, slug, description,
price: number (configured base price), originalPrice: number (same base),
effectivePrice: number (central pricing result), currency: "BDT",
durationMinutes: number, imageUrl: string|null, inclusions: string[],
available: boolean (existing DTO field; admin detail always true), isFeatured: boolean,
activeOffer: PublicOffer|null,
packageItems: {serviceId,name,quantity,available}[],
isActive: boolean, sortOrder: number, createdAt: ISO timestamp, updatedAt: ISO timestamp
```

Admin `price` is editable base price; public ServiceDto `price` retains its existing effective-price meaning. Use `effectivePrice` to preview a discount and `isActive` plus category/component state for visibility; admin `available` does not indicate booking capacity or public visibility. PublicOffer fields are `{id,serviceId,title,description,discountType,discountValue,startsAt,endsAt}`; discountValue is numeric. Existing centralized best-offer selection and rounding remain authoritative.

Duration edits update future persisted slot end times transactionally; existing appointments keep their own name, price, duration and interval snapshots. Booking locks the service row against concurrent administrative changes and still validates slot duration, business hours and capacity. Refetch availability before booking. No endpoint edits appointment snapshots.

## Offers

| Field | Type / rules | Required / default |
|---|---|---|
| serviceId | existing service UUID | Required |
| title | trimmed string, 1–200 | Required |
| description | string, max 10000 | Required |
| discountType | `PERCENTAGE` or `FIXED_AMOUNT` | Required |
| discountValue | positive decimal string or number, same precision/range as service price; percentage max 100 | Required |
| startsAt | ISO timestamp with Z or explicit offset | Required |
| endsAt | ISO timestamp with Z or explicit offset; strictly after startsAt | Required |
| isActive | boolean | true |

AdminOffer response is `{id,serviceId,title,description,discountType,discountValue,startsAt,endsAt,isActive,createdAt,updatedAt}`. discountValue is numeric. PATCH validates the merged record, including unchanged dates/type. Public offers still require startsAt <= now < endsAt, active offer and active catalog eligibility. Overlapping offers remain allowed; centralized pricing chooses the best without stacking.

## Image upload and retrieval

Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET together; CLOUDINARY_FOLDER defaults to autocare. Completely missing credentials leave the app running and return 503 MEDIA_DISABLED for new uploads. Partial credentials fail startup. PUBLIC_API_BASE_URL is used for online checkout callbacks and is not required for Cloudinary uploads. See [Cloudinary setup](cloudinary-integration.md).

Upload multipart/form-data with exactly one part named `file`, maximum 2097152 bytes (2 MiB), and the bearer header. Let the HTTP library set the multipart boundary; do not manually set a bare Content-Type header. No other form fields are accepted. JPEG, PNG and WebP signatures are verified from bytes; filename and client MIME are untrusted. SVG, executable signatures, empty/unknown content and oversized files fail. New images upload through the authenticated Cloudinary SDK; PostgreSQL stores metadata only. Upload JSON contains exactly `{id,imageUrl}` with a direct HTTPS Cloudinary delivery URL. Binary bytes never appear in catalog or upload JSON.

```sh
curl -H "Authorization: Bearer $ACCESS_TOKEN" -F "file=@photo.png" https://api.your-domain.example/api/v1/admin/media/images
```

The legacy public GET requires no token and returns existing PostgreSQL bytes, verified Content-Type, Content-Length, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, and cross-origin resource policy permitting image embedding. Missing legacy bytes/unknown UUID return 404; malformed UUID 400. New uploads use the returned Cloudinary URL directly. Persist imageUrl in a category/service PATCH. Existing external URLs remain supported. Replacing an image reference never deletes an existing asset; no deletion/library endpoint is provided. Cloudinary delivery uses automatic format and perceptual quality optimization while retaining the original.

## Appointments

GET supports optional `status=pending|confirmed|cancelled|completed` and `date=YYYY-MM-DD`, combined with AND. Date selects startsAt within that Asia/Dhaka calendar day. Invalid status/date/unknown query keys return 400. List order is startsAt descending then ID ascending.

AdminAppointment response (list and detail) fields:

```text
id, userId, serviceId, slotId, vehicleId: UUID|null, bayId,
status: "pending"|"confirmed"|"cancelled"|"completed",
startsAt, endsAt, serviceName, basePrice: number, price: number, currency,
durationMinutes, appliedOfferId: UUID|null, createdAt, updatedAt, cancelledAt: ISO|null,
user: {id,name,email},
vehicle: {id,userId,make,model,year: number|null,registrationNumber: string|null,createdAt,updatedAt}|null
```

All unannotated dates are ISO timestamps. Service name, price and duration are booking snapshots. The user selection excludes credentials/session data. vehicleId is nullable; this module does not introduce vehicle management.

PATCH status body is exactly `{"status":"confirmed"}`, `{"status":"cancelled"}` or `{"status":"completed"}`. Uppercase and extra fields are rejected.

| Current | Allowed target | Additional condition |
|---|---|---|
| pending | confirmed | None |
| pending | cancelled | Sets cancelledAt |
| confirmed | cancelled | Sets cancelledAt |
| confirmed | completed | endsAt <= current server time |
| completed/cancelled | None | Terminal |

Updates lock the appointment row and condition on the previously observed status inside a transaction. Invalid transitions and premature completion return 409; unknown appointment 404. Payment checks use the same lock as initiation/validation. Cancellation is blocked for applied, initiating, pending or review-required payments; REVIEW_REQUIRED also blocks confirmation/completion. Ordinary unpaid customer PENDING cancellation remains available. Paid confirmation/completion remain normal administrative actions. Cancellation/completion release capacity through existing partial unique/exclusion constraints without deleting slots. Paid cancellation/refund cases require manual support; no automatic refund or rescheduling is added.

Admin appointment DTOs add paymentStatus (unpaid|pending|paid|review_required), paymentMethod (sslcommerz|null), canPayOnline and canCancel. Payment attempt details are separate protected endpoints: GET /admin/payments, GET /admin/payments/:id and POST /admin/payments/:id/reconcile. Status/date filters, exact DTOs, reason codes and manual support rules are specified in [payment API](payment-api.md).

## Dashboard

Response contains integer counts:

```json
{"totalCategories":0,"totalServices":0,"activeServices":0,"totalPackages":0,"activeOffers":0,"pendingAppointments":0,"confirmedAppointments":0,"completedAppointments":0}
```

Totals include inactive records. totalServices includes packages; totalPackages includes inactive packages. activeServices counts isActive=true regardless of category eligibility. activeOffers counts currently active time-eligible offers on publicly eligible catalog entries. Appointment counts cover all time.

## Errors and Flutter behavior

Nest exceptions preserve existing JSON errors: `{statusCode,message,error}`. Zod validation uses `{statusCode:400,error:"Bad Request",code:"VALIDATION_ERROR",message:"Invalid request.",violations:[{path,message}]}` (see the shared validation pipe). message may be a string or array for framework errors; avoid depending on English wording.

| Status | Meaning |
|---|---|
| 400 | Invalid schema/UUID/relation/package/offer/image/multipart |
| 401 | Missing, invalid, expired or revoked authentication; inactive user |
| 403 | Current user lacks ADMIN |
| 404 | Resource/image not found |
| 409 | Duplicate slug, composed-service type change, concurrent edit, or invalid/premature status transition |
| 413 | Image exceeds 2 MiB |
| 503 | Public API base URL missing for upload |

Flutter should restore the existing refresh-cookie session with the current CSRF protocol, use the returned user.role for panel navigation, attach the bearer to every admin call, and treat server authorization as authoritative. On 401 refresh once using existing auth flow, then sign in if refresh fails; on 403 leave admin UI. On 409 refetch before offering another edit; do not automatically retry an appointment transition. Re-fetch public catalog/availability after administrative changes; there is no server catalog cache. Show explicit configured and effective prices. For Flutter Web, configure its exact CORS origin and credentialed refresh-cookie requests; native clients retain the existing cookie jar requirements. Never ship admin provisioning credentials, database credentials or Gemini secrets in Flutter.

See `admin-implementation-report.md` for verification and limits.
