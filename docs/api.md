# REST API

All paths are relative to `/api/v1`. Requests use Zod; unknown booking fields such as `userId`, `price`, `status` or `bayId` are rejected. Route IDs must be UUIDs. Collections return JSON arrays without an envelope.

| Method | Path | Authentication / result |
|---|---|---|
| GET | `/health/status` | Public health |
| POST | `/auth/register` | Public; 201 `{accessToken,user,csrfToken}` + cookie |
| POST | `/auth/login` | Public; 200 same response + independent session cookie |
| GET | `/auth/csrf` | Refresh cookie; `{csrfToken}` for browser restoration |
| POST | `/auth/refresh` | Refresh cookie; 200 `{accessToken,csrfToken}` + rotated cookie |
| POST | `/auth/logout` | Refresh cookie; 204, revoke this session and clear cookie |
| GET | `/auth/me` | Bearer; `{user:{id,name,email}}` |
| PATCH | `/users/me` | Bearer; name/email update, same user envelope |
| GET | `/categories` | Public active categories |
| GET | `/services` | Public active services/packages |
| GET | `/services/:id` | Public Service DTO including package contents |
| GET | `/offers` | Public eligible offers on active catalog items |
| GET | `/offers/:id` | Public eligible offer or 404 |
| GET | `/services/:id/availability?date=YYYY-MM-DD` | Public persisted slot availability |
| GET | `/platform` | Public `{settings,businessHours}` |
| POST | `/assistant/chat` | Optional bearer; public information only, 200 structured assistant message |
| POST | `/appointments` | Bearer; 201 Appointment DTO |
| GET | `/appointments` | Bearer; owned Appointment DTO array |
| GET | `/appointments/:id` | Bearer; owned Appointment DTO |
| PATCH | `/appointments/:id/cancel` | Bearer; cancelled Appointment DTO |

## Authentication

Register: `{ "name":"Customer", "email":"customer@example.com", "password":"a-long-local-password" }`. Name is trimmed (1–160 characters), email trimmed/lowercased (maximum 320), password 10–256 characters. Login accepts email/password; invalid credentials or inactive accounts return 401. Profile updates accept either/both name and email, require one field and reject unknown fields. Passwords and authentication hashes never appear in JSON.

HS256 access JWTs include `sub`, `sid`, `tokenType:access`, `iat`, `exp`, `jti`, configured `iss` and `aud`. Signature, algorithm, issuer, audience, expiry and required claims are verified; database session/user checks follow. Send `Authorization: Bearer ...`. Refresh tokens never appear in JSON. Authentication and private booking responses use `Cache-Control: no-store`.

Refresh/logout read only the host-only HttpOnly refresh cookie at `/api/v1/auth`. Browser mutations require an exact trusted Origin; refresh/logout also require `X-CSRF-Token`. Login/register and refresh responses supply a session-bound HMAC CSRF token. On reload, request `GET /auth/csrf` with credentials before refresh. Cross-origin browser requests require the exact origin in `CORS_ORIGINS`; the CSRF endpoint also checks origin/Fetch Metadata. Native clients without Origin or Fetch Metadata use the existing cookie transport without a CSRF header. Requests identified by Fetch Metadata cannot use that native exemption.

Logout works with an expired/missing access token, revokes only the session identified by a known refresh digest and clears corresponding cookie options. Absent/invalid refresh cookies are cleared idempotently. Consumed-token replay returns 401, clears the cookie and revokes that session. Conditional database updates prevent concurrent refresh successes; clients must share one refresh coordinator.

## Catalog and pricing

`GET /services` filters: `search`, UUID `categoryId`, uppercase `type=INDIVIDUAL|PACKAGE`, decimal-string `minPrice`, `maxPrice`, `featured=true|false`. Price filters use current effective prices inclusively. Search matches name/description case-insensitively. Invalid ranges return 400. Categories and all package components must be active for an item to appear.

Service DTO: `id`, `name`, `slug`, `description`, `categoryId`, `categoryName`, `type`, `price`, `originalPrice`, `effectivePrice`, `currency`, `durationMinutes`, nullable `imageUrl`, `inclusions`, `available`, `isFeatured`, nullable `activeOffer`, `packageItems`. `price` equals `effectivePrice`; monetary fields are JSON numbers. `available=true` means catalog-bookable, not free appointment capacity. Package items contain `serviceId`, `name`, positive `quantity`, catalog `available`. Book the package's own Service ID.

Centralized Decimal pricing chooses the lowest nonnegative price among valid offers. Validity: active, `startsAt <= now < endsAt`, positive fixed discount or percentage `(0,100]`. No stacking. Fixed discounts floor at zero, rounding is half up to two decimals. Equal discounted prices choose the lexicographically smallest offer ID; offers that do not reduce the base price are not applied. Official package prices are independent of component totals.

Offer DTO: `id`, `serviceId`, `title`, `description`, `discountType`, numeric `discountValue`, ISO `startsAt`, ISO `endsAt`. Expired/future/inactive offers neither affect pricing nor appear in public offer results.

## Availability and booking

Availability: `{date,timeZone:"Asia/Dhaka",slots:[{id,startsAt,endsAt,workshopTime,timeZone,available}]}`. Absolute timestamps use UTC ISO strings; `workshopTime` is local ISO text without an offset. Dates must be valid and within the horizon. Results omit past starts and slots outside current hours/duration; reserved future slots remain with `available=false`. Different bays may share a start time with different slot IDs. IDs remain stable. Submit a returned slot ID.

Create: `{ "serviceId":"<UUID>", "slotId":"<UUID>" }`, optional owned `vehicleId`. Vehicle registration is optional. Server determines user, bay, pending status, timestamps and price. PostgreSQL enforces capacity including overlaps across services. On 409, refresh availability and choose another slot.

Appointment DTO: `id`, `serviceId`, snapshot `serviceName`, lowercase `status`, nested `slot`, nullable `vehicleId`, snapshot `originalPrice`, `price`, `currency`, `durationMinutes`, nullable `appliedOfferId`, `canCancel`, `createdAt`, nullable `cancelledAt`. Nested slots retain Flutter's required fields and use `available=false` as a historical representation; query availability for current capacity.

List filters: lowercase `status=pending|confirmed|cancelled|completed`; `period=upcoming|previous`. Upcoming: future start and pending/confirmed. Previous: start at/before now or cancelled/completed. Filters combine; order is start descending then ID. Another user's appointment returns 404. Cancellation accepts no body or `{}`. Only pending appointments can be cancelled, including past pending appointments. Repeated/non-pending cancellation returns 409. Capacity releases immediately.

Snapshots retain charged prices and names after catalog changes. No public endpoint confirms/completes appointments or edits the catalog; these workflows are outside scope.

## Errors and examples

400 invalid input/date/window; 401 credentials/session/token; 403 origin/CSRF; 404 missing/non-owned/inactive resource; 409 duplicate email/capacity conflict/non-pending cancellation; 429 throttling; 500 unexpected failure. NestJS error envelopes are used. Validation adds `code:VALIDATION_ERROR` and field `violations`, without submitted values.

Generated examples: [catalog](examples/catalog.json), [availability](examples/availability.json), [appointment](examples/appointment.json), [platform](examples/platform.json). IDs/timestamps belong to the isolated verification database, not every deployment.

## Gemini assistant

Request: `{ "messages": [{ "role": "user", "content": "Suggest a package under 2000 taka." }] }`. Allowed roles are user/assistant, final role must be user. Each trimmed message is 1–2000 characters, at most twelve messages and 12,000 total characters; unknown fields/system messages are rejected. Client assistant-role history is also untrusted. No history is persisted.

Response: `{ "id":"<server UUID>", "role":"assistant", "text":"...", "actions":[{"type":"serviceDetails","serviceId":"<active service/package UUID>"},{"type":"browseServices","categoryId":"<optional active category UUID>"}] }`. Extra/inappropriate action fields, arbitrary routes/URLs, invented/inactive IDs and unknown types are rejected. Duplicate actions are removed, at most four returned. Every action and exact price is checked against refreshed public data after generation. Price/duration lines are server-generated, replacing detected numeric/monetary/time/link claims in model text.

Limits: five/minute and twenty/hour for both IP and authenticated user, configurable. Maximum two concurrent requests per process. The configurable global daily budget defaults to 100 and is enforced atomically in PostgreSQL across instances, resetting at UTC midnight. All admitted attempts count, even failures; retries are manual. The default cap must be checked against the actual provider quota. Responses, including route errors, use no-store.

| Status | Assistant code |
|---|---|
| 400 | `ASSISTANT_SENSITIVE_INPUT` or standard `VALIDATION_ERROR` |
| 401 | Invalid supplied optional bearer token/session |
| 422 | `ASSISTANT_BLOCKED` |
| 429 | `ASSISTANT_RATE_LIMITED`, `ASSISTANT_BUSY`, `ASSISTANT_DAILY_LIMIT`, `ASSISTANT_QUOTA_EXHAUSTED` |
| 502 | `ASSISTANT_PROVIDER_ERROR`, `ASSISTANT_EMPTY_RESPONSE`, `ASSISTANT_INVALID_RESPONSE` |
| 503 | `ASSISTANT_DISABLED`, `ASSISTANT_CONFIGURATION_ERROR`, `ASSISTANT_CONTEXT_TOO_LARGE` |
| 504 | `ASSISTANT_TIMEOUT` |

No raw provider error, key or prompt is returned. Personal appointment queries are outside the assistant scope; it provides public instructions and directs users to My bookings. Specific slot questions are directed to the service booking page rather than fabricated times. [Implementation and privacy details](gemini-assistant.md).
