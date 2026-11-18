# REST API reference

Local base: `http://localhost:3000/api/v1`\
Hosted base: `https://fb-international-assessment-project.onrender.com/api/v1`

All paths below are relative to the base. JSON requests use `Content-Type: application/json`; upload uses multipart. Collections are direct arrays, IDs are UUIDs, dates/timestamps are ISO strings, nullable fields are JSON null. The examples are illustrative, not real deployed IDs or credentials. Replace IDs with those obtained from the relevant API. Requests reject unknown fields where strict schemas apply.

## Endpoint index

| Method | Path | Access | Success |
|---|---|---|---|
| GET | `/health/status` | Public | 200 health object |
| POST | `/auth/register` | Public | 201 auth response + cookie |
| POST | `/auth/login` | Public | 200 auth response + cookie |
| GET | `/auth/csrf` | Refresh cookie | 200 CSRF object |
| POST | `/auth/refresh` | Refresh cookie / browser CSRF | 200 auth response + rotated cookie |
| POST | `/auth/logout` | Refresh cookie / browser CSRF | 204 |
| GET | `/auth/me` | Bearer | 200 user envelope |
| PATCH | `/users/me` | Bearer | 200 user envelope |
| GET | `/categories` | Public | 200 categories |
| GET | `/services` | Public | 200 services |
| GET | `/services/:id` | Public | 200 service |
| GET | `/offers` | Public | 200 offers |
| GET | `/offers/:id` | Public | 200 offer |
| GET | `/services/:id/availability` | Public | 200 availability |
| GET | `/platform` | Public | 200 platform |
| POST | `/appointments` | Bearer | 201 appointment |
| GET | `/appointments` | Bearer | 200 owned appointments |
| GET | `/appointments/:id` | Bearer | 200 owned appointment |
| PATCH | `/appointments/:id/cancel` | Bearer | 200 appointment |
| POST | `/assistant/chat` | Optional bearer | 200 assistant message |
| GET | `/payments/config` | Public | 200 capabilities |
| POST | `/appointments/:id/pay` | Bearer / owner | 200 payment |
| GET | `/appointments/:id/payments` | Bearer / owner | 200 payment history |
| GET | `/payments/:id` | Bearer / owner or admin | 200 payment |
| POST | `/payments/:id/reconcile` | Bearer / owner or admin | 200 payment |
| GET | `/admin/dashboard` | ADMIN | 200 counts |
| GET | `/admin/categories` | ADMIN | 200 categories |
| GET | `/admin/categories/:id` | ADMIN | 200 category |
| POST | `/admin/categories` | ADMIN | 201 category |
| PATCH | `/admin/categories/:id` | ADMIN | 200 category |
| GET | `/admin/services` | ADMIN | 200 services |
| GET | `/admin/services/:id` | ADMIN | 200 service |
| POST | `/admin/services` | ADMIN | 201 service |
| PATCH | `/admin/services/:id` | ADMIN | 200 service |
| GET | `/admin/offers` | ADMIN | 200 offers |
| GET | `/admin/offers/:id` | ADMIN | 200 offer |
| POST | `/admin/offers` | ADMIN | 201 offer |
| PATCH | `/admin/offers/:id` | ADMIN | 200 offer |
| GET | `/admin/appointments` | ADMIN | 200 appointments |
| GET | `/admin/appointments/:id` | ADMIN | 200 appointment |
| PATCH | `/admin/appointments/:id/status` | ADMIN | 200 appointment |
| POST | `/admin/media/images` | ADMIN | 201 image reference |
| GET | `/media/images/:id` | Public | 200 legacy binary image |
| GET | `/admin/payments` | ADMIN | 200 payment records |
| GET | `/admin/payments/:id` | ADMIN | 200 payment record |
| POST | `/admin/payments/:id/reconcile` | ADMIN | 200 payment record |
| POST | `/payments/sslcommerz/success` | Gateway callback | 200 HTML |
| POST | `/payments/sslcommerz/fail` | Gateway callback | 200 HTML |
| POST | `/payments/sslcommerz/cancel` | Gateway callback | 200 HTML |
| POST | `/payments/sslcommerz/ipn` | Gateway callback | 200 acknowledgement |

## Authentication and profile

Register request:

```json
{"name":"Demo Customer","email":"customer@example.com","password":"example-local-password"}
```

Name is trimmed, 1–160 characters; email is normalized and at most 320 characters; password 10–256 characters. Login uses email/password. Both return a user, access token and CSRF token, plus an HttpOnly refresh cookie:

```json
{"user":{"id":"11111111-1111-4111-8111-111111111111","name":"Demo Customer","email":"customer@example.com","role":"CUSTOMER"},"accessToken":"<JWT>","csrfToken":"<CSRF_TOKEN>"}
```

Use `Authorization: Bearer <JWT>` on protected endpoints. JWTs include sub, sid, tokenType, iat, exp, jti, iss and aud. Refresh token never appears in JSON. Cookies are host-only, scoped to `/api/v1/auth`. Browser requests include credentials, exact trusted Origin and `X-CSRF-Token` for refresh/logout. `GET /auth/csrf` returns `{"csrfToken":"<token>"}` for restoration. Refresh returns the auth response with rotated cookie; logout revokes session and returns 204. Native cookie clients without browser Origin/Fetch Metadata use the native transport exemption. `GET /auth/me` returns `{user:{id,name,email,role}}`. PATCH `/users/me` accepts a nonempty subset of name/email, e.g. `{"name":"Updated Customer"}`; returns the same envelope. Role cannot be supplied or modified by customer payloads. Missing/invalid sessions return 401; unauthorized role returns 403.

## Health and catalog

Health example: `{"status":"ok","timestamp":"2026-11-18T08:00:00Z","uptimeSeconds":42,"environment":"production"}`. It is a liveness check.

`GET /services` optional query fields: `search` (max 160 chars), `categoryId` (UUID), `type=INDIVIDUAL|PACKAGE`, `minPrice`, `maxPrice` (decimal strings, max two fractional digits), `featured=true|false`. Range must be ordered. Price filters use effective price. Public entries require active category/service and active package components.

Example service response:

```json
{
  "id":"22222222-2222-4222-8222-222222222222",
  "name":"Exterior wash","slug":"exterior-wash","description":"Exterior cleaning",
  "categoryId":"33333333-3333-4333-8333-333333333333","categoryName":"Cleaning",
  "type":"INDIVIDUAL","price":650,"originalPrice":650,"effectivePrice":650,
  "currency":"BDT","durationMinutes":45,"imageUrl":null,
  "inclusions":["Exterior wash"],"available":true,"isFeatured":false,
  "activeOffer":null,"packageItems":[]
}
```

`packageItems` entries contain serviceId/name/quantity/available. Public `available` is catalog eligibility, not current slot capacity. Offer fields: id, serviceId, title, description, discountType (`PERCENTAGE` or `FIXED_AMOUNT`), numeric discountValue, startsAt, endsAt. Example: `{"id":"44444444-4444-4444-8444-444444444444","serviceId":"22222222-2222-4222-8222-222222222222","title":"Sample offer","description":"Discount","discountType":"PERCENTAGE","discountValue":10,"startsAt":"2026-11-18T00:00:00Z","endsAt":"2026-12-18T00:00:00Z"}`. Public offer endpoints return eligible offers only. Categories include id, name, slug, description, imageUrl and sort order as applicable; use returned UUIDs, not slugs, for detail/booking routes.

Platform response shape: `{"booking":{"horizonDays":30,"slotStepMinutes":15,"timeZone":"Asia/Dhaka"},"settings":{"platformName":"AutoCare","currency":"BDT"},"businessHours":[{"dayOfWeek":1,"opensAt":"09:00","closesAt":"12:00","isClosed":false}]}`. Settings also expose public policy/FAQ/package/offer keys; internal quota counters are excluded. The example omits other seeded settings and intervals.

## Availability and appointments

`GET /services/:id/availability?date=YYYY-MM-DD` requires a valid date within the configured horizon. Example:

```json
{"date":"2026-11-19","timeZone":"Asia/Dhaka","slots":[{"id":"55555555-5555-4555-8555-555555555555","startsAt":"2026-11-19T03:00:00.000Z","endsAt":"2026-11-19T03:45:00.000Z","workshopTime":"2026-11-19T09:00:00","timeZone":"Asia/Dhaka","available":true}]}
```

Create booking using serviceId and slotId from live availability, optionally vehicleId belonging to the authenticated user. No price, owner, bay or status field is accepted:

```json
{"serviceId":"22222222-2222-4222-8222-222222222222","slotId":"55555555-5555-4555-8555-555555555555"}
```

Appointment response example:

```json
{
  "id":"66666666-6666-4666-8666-666666666666","serviceId":"22222222-2222-4222-8222-222222222222",
  "serviceName":"Exterior wash","status":"pending",
  "slot":{"id":"55555555-5555-4555-8555-555555555555","startsAt":"2026-11-19T03:00:00.000Z","endsAt":"2026-11-19T03:45:00.000Z","workshopTime":"2026-11-19T09:00:00","timeZone":"Asia/Dhaka","available":false},
  "vehicleId":null,"originalPrice":650,"price":650,"currency":"BDT","durationMinutes":45,
  "appliedOfferId":null,"canCancel":true,"paymentStatus":"unpaid","paymentMethod":null,"canPayOnline":true,
  "createdAt":"2026-11-18T08:00:00.000Z","cancelledAt":null
}
```

`GET /appointments` optional filters `status=pending|confirmed|cancelled|completed`, `period=upcoming|previous`. Upcoming is future pending/confirmed; previous includes past or cancelled/completed. Detail and cancellation enforce ownership; non-owned records return 404. Cancel with `{}` or no body. Only pending without applied/unresolved payments can cancel. Conflicts return 409; refresh availability and choose another slot. Historical slot.available is false, not a current capacity claim.

## AI assistant

POST `/assistant/chat`:

```json
{"messages":[{"role":"user","content":"Suggest a car wash service."}]}
```

Roles user/assistant; final role user; 1–12 messages; each trimmed content 1–2000 characters, 12000 total. Optional bearer must be valid if supplied. Example response:

```json
{"id":"77777777-7777-4777-8777-777777777777","role":"assistant","text":"An exterior wash may suit your needs.\n\nExterior wash: BDT 650.00; 45 minutes.","actions":[{"type":"serviceDetails","serviceId":"22222222-2222-4222-8222-222222222222"}]}
```

Actions: `serviceDetails` with active service UUID; `browseServices` with optional active categoryId. At most four distinct actions, no arbitrary route/URL. No personal records or mutations; exact price lines generated by server. Sensitive input rejected. Configurable quota, timeout and concurrency. Common errors: 400 sensitive/validation; 401 invalid token; 422 blocked; 429 busy/rate/quota/daily limit; 502 provider/invalid or empty response; 503 disabled/configuration/context; 504 timeout.

## Payment contracts

Public capabilities example: `{"onlinePaymentEnabled":true,"provider":"sslcommerz","sandbox":true,"payAtWorkshopEnabled":true}`. Actual capabilities depend on backend configuration.

POST `/appointments/:id/pay` body:

```json
{"phone":"01700000000","address":"Demo address","city":"Dhaka","postcode":"1200"}
```

Phone 7–19 digits with optional leading +, max 20 chars; address/city 1–50, postcode 1–30. Existing profile name/email must each fit 50 chars for gateway checkout. Future pending/confirmed appointments with BDT 10–500000 are eligible, subject to payment state. Amount/owner/status cannot be submitted. Existing pending checkout is reused; unresolved attempt conflicts.

Payment DTO example:

```json
{"paymentId":"88888888-8888-4888-8888-888888888888","appointmentId":"66666666-6666-4666-8666-666666666666","provider":"sslcommerz","status":"pending","amount":650,"currency":"BDT","checkoutUrl":"https://sandbox.sslcommerz.com/EasyCheckOut/example","paidAt":null,"applied":false,"reasonCode":null,"createdAt":"2026-11-18T08:00:00Z","updatedAt":"2026-11-18T08:00:01Z"}
```

Attempt statuses: initiating, pending, paid, failed, cancelled, expired, review_required. Checkout URL only while pending. `POST /payments/:id/reconcile` accepts `{}` or no body; minimum five-second spacing. Only verified paid API status establishes payment, never the browser redirect. Payment summary is unpaid/pending/paid/review_required; review takes precedence. Applied or unresolved attempts block cancellation. No automatic refunds. The four gateway callbacks accept provider data (including transaction reference `tran_id`, optional validation reference `val_id`) and independently validate/query; IPN success returns `{"acknowledged":true}`. Do not invoke callbacks as a customer to simulate payment. Browser responses are HTML instructing return to app; invalid/forged data can return 400. Unavailable verification or throttling leaves payment unresolved.

## Admin contracts

All admin routes require active ADMIN bearer. Admin lists include inactive resources; no delete API. POST creates; PATCH requires a nonempty subset of fields and preserves omitted values. UUID route IDs are mandatory. Category and service slugs are generated when omitted and unique.

### Categories

Create body: `{"name":"Cleaning","description":"Car cleaning","isActive":true,"sortOrder":0}`. Fields: name required 1–200, optional slug (lowercase ASCII hyphenated, max 200), description nullable/max 10000, imageUrl nullable absolute HTTP(S), isActive default true, sortOrder default 0. Response: id/name/slug/description/imageUrl/isActive/sortOrder/createdAt/updatedAt. Deactivate with `{"isActive":false}`.

### Services and packages

```json
{"categoryId":"33333333-3333-4333-8333-333333333333","type":"INDIVIDUAL","name":"Demo wash","description":"Exterior wash","price":"650.00","durationMinutes":45,"inclusions":["Exterior wash"],"isFeatured":true}
```

Required categoryId, type, name, description, price, durationMinutes, inclusions; name max 200; description max 10000; price 0–9999999999.99 max two decimals; currency BDT; duration 1–1440; inclusions max 100 strings each 1–1000. Optional slug, imageUrl, isActive (true), isFeatured (false), sortOrder (0). For PACKAGE supply nonempty `packageItems:[{"serviceId":"<individual UUID>","quantity":1}]`; max 100 items, quantity 1–1000. No duplicate, nested or self references. INDIVIDUAL has no package items. Admin response uses the service DTO plus isActive/sortOrder/createdAt/updatedAt; price is base price, effectivePrice is discounted. Admin available is not capacity. PATCH type/composition changes are subject to database constraints.

### Offers

```json
{"serviceId":"22222222-2222-4222-8222-222222222222","title":"Example offer","description":"Seasonal discount","discountType":"PERCENTAGE","discountValue":"10.00","startsAt":"2026-11-18T00:00:00Z","endsAt":"2026-12-18T00:00:00Z","isActive":true}
```

All except isActive required; title 1–200, description max 10000, positive amount max two decimals, percentage ≤100, ISO timestamps with offset and end after start. Response is public Offer DTO plus isActive/createdAt/updatedAt. PATCH validates merged fields.

### Images

```sh
curl -H "Authorization: Bearer $ACCESS_TOKEN" -F "file=@photo.png" "$API_BASE/admin/media/images"
```

One JPEG/PNG/WebP file, <=2 MiB, validated by signature. Response: `{"id":"99999999-9999-4999-8999-999999999999","imageUrl":"https://res.cloudinary.com/example/image/upload/example.png"}`. Save imageUrl on service/category. Legacy GET returns binary bytes, not JSON; new uploads use direct Cloudinary delivery URL. Disabled provider returns 503; malformed/oversized images rejected.

### Appointments and dashboard

`GET /admin/appointments` filters `status` (lowercase appointment status) and `date=YYYY-MM-DD` (Asia/Dhaka). Response includes id, userId, serviceId, slotId, vehicleId, bayId, status, startsAt, endsAt, serviceName, basePrice, price, currency, durationMinutes, appliedOfferId, createdAt, updatedAt, cancelledAt, safe user `{id,name,email}`, nullable vehicle details, and paymentStatus/paymentMethod/canPayOnline/canCancel. Status PATCH body `{"status":"confirmed"}` (or cancelled/completed as allowed). Pending→confirmed/cancelled; confirmed→cancelled/completed; completion only after end time. Applied/unresolved payment blocks cancellation; review_required blocks confirmation/completion. Invalid transition 409.

Dashboard response example:

```json
{"totalCategories":5,"totalServices":9,"activeServices":9,"totalPackages":3,"activeOffers":2,"pendingAppointments":1,"confirmedAppointments":0,"completedAppointments":0}
```

### Admin payments

List optional `status=initiating|pending|paid|failed|cancelled|expired|review_required`, `from` and `to` ISO timestamps with offset, ordered range. Admin DTO is customer payment DTO without checkoutUrl, plus merchantTransactionId, nullable validationId/bankTransactionId, customer `{name,email}`, serviceName, nullable lastReconciledAt, gatewayIncidents (filtered validationId/bankTransactionId/reasonCode entries). Reconcile POST `{}` uses same server verification. No override/refund endpoint.

## Error handling

| HTTP | Meaning |
|---|---|
| 400 | Invalid request, UUID, date, query or gateway notification |
| 401 | Missing/invalid token, credentials or session |
| 403 | Insufficient role, origin or CSRF failure |
| 404 | Missing, non-owned or inactive resource |
| 409 | Unique/capacity conflict, invalid transition or unresolved payment |
| 413 | Body/upload too large, where applicable |
| 422 | Unsupported payment profile / blocked assistant |
| 429 | Rate, quota or reconciliation spacing |
| 502 | Provider/response error |
| 503 | Optional feature disabled or verification unavailable |
| 504 | Assistant timeout |
| 500 | Unexpected server error |

Validation example:

```json
{"statusCode":400,"error":"Bad Request","code":"VALIDATION_ERROR","message":"Invalid request.","violations":[{"path":"serviceId","message":"Invalid UUID"}]}
```

Specific provider/domain errors may include their own safe codes. No raw provider credentials or submitted passwords should be logged or returned. Source controllers and Zod schemas are authoritative; the illustrative examples are not recorded live responses.
