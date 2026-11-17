# Payment API handover

All paths below are relative to `/api/v1`. Collections are direct JSON arrays. IDs are UUIDs. Send the existing access bearer token for private routes. All payment responses use Cache-Control: no-store. No second authentication system is introduced.

## Enable sandbox checkout

Set SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD together using your sandbox merchant account. Set PUBLIC_API_BASE_URL to the externally reachable HTTPS API root, e.g. `https://autocare-backend.example.com/api/v1`. SSLCOMMERZ_IS_LIVE defaults to `false`; changing it to `true` explicitly selects live endpoints and requires live credentials. SSLCOMMERZ_TIMEOUT_MS defaults to 20000, range 1000–60000. Missing credentials disable online payment only. Partial credentials fail configuration validation. Secrets remain server-side and are never returned or logged.

Callback configuration is checked structurally before checkout: HTTPS, API suffix, no credentials/query/fragment, bounded callback URL length, and no obvious local/private/test host. The operator must ensure actual public DNS, a valid TLS certificate and ingress reachability; syntactic configuration checks cannot prove reachability from SSLCOMMERZ. Do not change environments/merchant credentials while unresolved attempts exist; reconcile in the original merchant environment first.

In the SSLCOMMERZ sandbox merchant portal, enable/register the IPN listener `https://YOUR_API/api/v1/payments/sslcommerz/ipn` and allow gateway POSTs through ingress without JWT, browser session or CSRF challenges on the four callbacks only. Success/fail/cancel/IPN URLs are also sent during session creation from trusted configuration. Keep TLS verification enabled (TLS 1.2+). For live onboarding, verify merchant activation and the provider's outbound public-IP registration requirements with SSLCOMMERZ. Configure the hosting ingress with exact trusted proxy addresses and request/rate limits.

The provider uses POST form data to `/gwprocess/v4/api.php`, GET `/validator/api/validationserverAPI.php` and GET `/validator/api/merchantTransIDvalidationAPI.php`. Sandbox host is `https://sandbox.sslcommerz.com`; live host is `https://securepay.sslcommerz.com`. Session creation is never automatically retried. Provider redirects are not followed by the API client.

Official references checked for this implementation: [sandbox V4 documentation](https://sandbox-gw.sslcommerz.com/docs), [developer documentation](https://developer.sslcommerz.com/docs.html), [integration document](https://sslcommerz.com/integration-document/). Amounts are BDT 10.00 through 500000.00; merchant IDs are server-generated 30-character alphanumeric strings. VALID and VALIDATED indicate successful gateway validation; risk_level=0 is required for ordinary application of payment. Risk or missing risk results require review.

## Routes

| Method | Route | Access / result |
|---|---|---|
| GET | `/payments/config` | Public capabilities, 200 |
| POST | `/appointments/:id/pay` | Appointment owner, 200 Payment DTO |
| GET | `/appointments/:id/payments` | Appointment owner, 200 Payment DTO array |
| GET | `/payments/:id` | Owner or ADMIN, 200 Payment DTO |
| POST | `/payments/:id/reconcile` | Owner or ADMIN, 200 refreshed DTO (admin receives Admin Payment DTO) |
| GET | `/admin/payments` | ADMIN, 200 Admin Payment DTO array |
| GET | `/admin/payments/:id` | ADMIN, 200 Admin Payment DTO |
| POST | `/admin/payments/:id/reconcile` | ADMIN, 200 Admin Payment DTO |
| POST | `/payments/sslcommerz/success` | Public verified callback, HTML completion page |
| POST | `/payments/sslcommerz/fail` | Public callback reconciled server-side, HTML completion page |
| POST | `/payments/sslcommerz/cancel` | Public callback reconciled server-side, HTML completion page |
| POST | `/payments/sslcommerz/ipn` | Public verified callback, 200 `{"acknowledged":true}` |

Admin list filters: optional lowercase `status`, ISO timestamps `from` and `to` inclusive, e.g. `/admin/payments?status=review_required&from=2026-11-01T00:00:00Z&to=2026-12-01T00:00:00Z`. Invalid/reversed ranges and unknown fields return 400. Order is creation descending then ID; collections are unpaginated for the assessment. Reconcile accepts no body or `{}`; unknown fields are rejected.

`GET /payments/config`:

```json
{"onlinePaymentEnabled":true,"provider":"sslcommerz","sandbox":true,"payAtWorkshopEnabled":true}
```

False onlinePaymentEnabled means the application should offer pay at workshop and omit checkout. No credentials or internal counters are exposed.

## Book first, then optionally pay

`POST /appointments` is unchanged: `{serviceId,slotId,vehicleId?}` creates a PENDING appointment with its effective price snapshot. Unpaid bookings reserve capacity under the existing policy. They do not expire because a checkout expires. Pay at workshop creates no successful online payment record. Verified online payment leaves appointment status unchanged; ADMIN confirms it separately.

`POST /appointments/:id/pay` requires exactly these checkout contact fields:

```json
{"phone":"01700000000","address":"Dhaka","city":"Dhaka","postcode":"1200"}
```

Phone: optional leading `+`, 7–19 digits, maximum 20 characters. Trimmed address/city: 1–50 characters each; postcode: 1–30. All four are required. The existing authenticated user's name/email are loaded from the database. The gateway limits each to 50 characters; longer profiles return 422 with instructions to update the profile or pay at workshop. Contact values are not fabricated or retained in payment records. Bangladesh, BDT, shipping_method=NO, product_profile=non-physical-goods, item count=1 and product/category are set by the backend. No shipping address or card information is requested.

Amount, currency, user/owner, transaction ID and status cannot be submitted by Flutter. Price always comes from Appointment.price, even after catalog/offer edits. Cancelled/completed or started appointments, already-applied payments, amounts outside BDT 10–500000, and review cases reject checkout. An existing pending checkout is returned on repeat requests. An initiating/unresolved attempt returns 409. No client idempotency header is needed: appointment locking and the database's active-attempt unique index implement this contract. Failed/terminal attempts are kept as history.

Example pending Payment DTO:

```json
{
  "paymentId":"68c251b4-8a49-493d-8152-6a460878014e",
  "appointmentId":"6ee62c08-089f-496f-a429-6f1a2ba17ee2",
  "provider":"sslcommerz",
  "status":"pending",
  "amount":1400,
  "currency":"BDT",
  "checkoutUrl":"https://sandbox.sslcommerz.com/EasyCheckOut/example",
  "paidAt":null,
  "applied":false,
  "reasonCode":null,
  "createdAt":"2026-11-17T12:00:00.000Z",
  "updatedAt":"2026-11-17T12:00:01.000Z"
}
```

All fields shown are present. checkoutUrl is nullable and returned only while PENDING; it is not a secret to share with other users. It is restricted to HTTPS gateway hosts. paidAt is the backend verification timestamp and can be non-null for a verified charge requiring review. applied means the single charge accepted against the appointment. It remains true if a later incident changes the attempt to review_required. Public DTOs omit session keys, gateway credentials, customer contact details and raw responses.

## Status, retry and reconciliation

Attempt statuses (API lowercase, Prisma uppercase):

| Value | Meaning / retry rule |
|---|---|
| initiating | Attempt saved before the external call; blocks new attempts and cancellation |
| pending | Hosted checkout saved; reuse checkout or reconcile |
| paid | Independently validated, exact amount/currency and safe risk; applied once |
| failed | Saved session query reports FAILED; a new attempt is permitted if appointment remains eligible |
| cancelled | Saved session query reports CANCELLED; same eligibility rule |
| expired | Saved session query reports EXPIRED; appointment remains a valid booking |
| review_required | Uncertain initiation, risk, mismatched verified data, late/duplicate charge or reference collision; no new checkout/cancellation |

The published V4 session-query contract documents VALID, VALIDATED, PENDING and FAILED. CANCELLED/EXPIRED are supported only when explicitly returned by an authoritative session query; the backend never invents either status from a browser callback name or a local timer. A cancelled checkout can therefore remain pending until the gateway reports a terminal outcome.

`POST /payments/:id/reconcile` queries the saved session key, or merchant transaction ID if session creation was uncertain. Every successful query result is independently order-validated. Amount comparison uses Decimal, never floating-point tolerance. BDT, merchant ID, validation ID, bank reference, risk and available store/session/custom identity fields must match. Extra successful charges are retained as incidents and require support; at most one charge can be applied to an appointment.

Per-payment reconciliation spacing is five seconds, enforced in PostgreSQL across instances. Initiation and reconciliation each allow 30 requests per authenticated user per 15 minutes using the existing bounded per-process limiter; use shared ingress limiting for multiple replicas. Repeated already-verified notifications with the same validation ID are acknowledged idempotently without another provider call. Other callbacks use the same per-payment spacing. IPN returns 429 on spacing conflicts so a sender can retry; unavailable verification returns 503 and retains unresolved state. Browser completion returns safe HTML for unavailable/throttled verification and asks the user to refresh in AutoCare. Malformed/forged notifications return 400.

Failure/cancel browser fields alone never release a checkout. Only an official terminal query for the saved session can release it. Merchant-ID query results that list failed individual card attempts, empty results, pending statuses or unavailable responses keep the attempt unresolved. If an ambiguous initiation has no recoverable session and no verified successful transaction, manual merchant-portal investigation is required; time alone does not make another charge safe. INITIATION_UNCERTAIN can resolve automatically to PAID after a matching successful validation. Other review incidents remain sticky and require operator investigation outside the app; this MVP has no administrative override or fake refund workflow.

After a network error, Flutter should list `/appointments/:id/payments`, select the unresolved attempt and call reconcile. Never immediately start another payment after an uncertain error. Open the returned checkout URL externally, then refresh GET payment/appointment on resume. Provide a manual Refresh payment status button that calls reconcile with the five-second spacing. A redirect/HTML page does not establish success. Only a refreshed verified API status does. There are no required deep links or app links.

## Appointment summary and cancellation

Customer and admin Appointment DTOs retain all existing fields and add three top-level fields:

```json
{"paymentStatus":"unpaid","paymentMethod":null,"canPayOnline":true}
```

```json
{"paymentStatus":"paid","paymentMethod":"sslcommerz","canPayOnline":false}
```

paymentStatus is one of `unpaid`, `pending`, `paid`, `review_required` (summary, not attempt status). Review takes precedence, then applied paid, then active initiating/pending; otherwise unpaid, including no attempts or only failed/cancelled/expired attempts. paymentMethod is sslcommerz only when an applied online charge exists, otherwise null. canPayOnline also considers gateway configuration, appointment state/start/amount/currency and unresolved attempts. Always use the pay endpoint as the final authoritative eligibility check.

Customer canCancel still requires PENDING; now it also requires no applied or unresolved payment. Admin canCancel allows PENDING/CONFIRMED under the same payment restriction. Cancellation, payment initiation/validation and admin transitions serialize on the appointment row. REVIEW_REQUIRED blocks admin confirmation/completion as well as cancellation. Paid appointments can follow normal confirmation/completion, but cannot use normal cancellation. Resolve paid cancellation/refund requests through manual support and merchant reconciliation; refunds are out of scope. Do not silently change a paid transaction to cancelled or reopen a cancelled appointment for a late charge.

## Admin DTO and incidents

Admin Payment DTO contains all customer Payment DTO fields except checkoutUrl, plus merchantTransactionId, nullable validationId/bankTransactionId, customer `{name,email}`, snapshot serviceName, nullable ISO lastReconciledAt and gatewayIncidents. Each incident contains only validationId, bankTransactionId and a safe reasonCode. There are no session keys, checkout secrets, card fields or raw gateway payloads.

```json
{
  "paymentId":"68c251b4-8a49-493d-8152-6a460878014e",
  "appointmentId":"6ee62c08-089f-496f-a429-6f1a2ba17ee2",
  "provider":"sslcommerz","status":"paid","amount":1400,"currency":"BDT",
  "paidAt":"2026-11-17T12:03:00.000Z","applied":true,"reasonCode":null,
  "createdAt":"2026-11-17T12:00:00.000Z","updatedAt":"2026-11-17T12:03:00.000Z",
  "merchantTransactionId":"AC0123456789abcdef0123456789ab",
  "validationId":"provider-validation-reference","bankTransactionId":"provider-bank-reference",
  "customer":{"name":"Customer","email":"customer@example.com"},
  "serviceName":"Express Car Care","lastReconciledAt":"2026-11-17T12:03:00.000Z","gatewayIncidents":[]
}
```

Safe reason codes include INITIATION_UNCERTAIN, GATEWAY_FAILED, GATEWAY_CANCELLED, GATEWAY_EXPIRED, AMOUNT_MISMATCH, CURRENCY_MISMATCH, MISSING_REFERENCE, GATEWAY_IDENTITY_MISMATCH, GATEWAY_RISK_REVIEW, LATE_PAYMENT, DUPLICATE_APPOINTMENT_CHARGE, ADDITIONAL_CHARGE and GATEWAY_REFERENCE_COLLISION. Incidents preserve verified references even when they cannot be applied. No endpoint resolves manual-review incidents in this assessment.

## Errors

Payment errors use `{statusCode,code,message}`; standard authentication/UUID errors use existing Nest envelopes, and strict body/query failures use VALIDATION_ERROR with safe violations.

| HTTP | Code | Handling |
|---|---|---|
| 400 | VALIDATION_ERROR / PAYMENT_INVALID_NOTIFICATION | Correct input; unverified notification has no payment effect |
| 401 / 403 | Existing auth errors | Restore session / ADMIN required |
| 404 | APPOINTMENT_NOT_FOUND / PAYMENT_NOT_FOUND | Missing or non-owned resource |
| 409 | PAYMENT_NOT_ELIGIBLE | Invalid state/start, currency or amount; workshop option for eligible bookings |
| 409 | APPOINTMENT_ALREADY_PAID | Do not start another checkout |
| 409 | PAYMENT_UNRESOLVED | Retrieve/reconcile existing attempt |
| 409 | PAYMENT_REVIEW_REQUIRED | Manual support |
| 409 | PAYMENT_CANCELLATION_BLOCKED | Reconcile uncertain payment or contact support for paid cancellation |
| 422 | PAYMENT_CONTACT_UNSUPPORTED | Update name/email length or use workshop option |
| 429 | PAYMENT_RATE_LIMITED / PAYMENT_RECONCILE_THROTTLED | Wait before retrying |
| 503 | PAYMENTS_DISABLED | Online gateway configuration unavailable; workshop remains available |
| 503 | PAYMENT_INITIATION_UNCERTAIN | Saved attempt must be reconciled before another charge |
| 503 | PAYMENT_GATEWAY_UNAVAILABLE / PAYMENT_VERIFICATION_UNAVAILABLE | No trustworthy outcome yet; retry reconciliation later |

## Sandbox acceptance procedure

Automated tests mock providers and use a new isolated PostgreSQL database with migrations applied. Never point TEST_DATABASE_URL at the application database. No automated test contacts a real payment or image provider.

For explicit manual sandbox verification, configure your sandbox credentials and public HTTPS callback origin, register IPN in the portal, provision an admin with `npm run admin:create`, book a future nonzero service as a customer and initiate checkout with actual test contact details. Use the sandbox portal's current test payment instructions on the hosted page; AutoCare must never collect card numbers, CVVs, PINs or OTPs. Check callback delivery, owner reconciliation, exact PAID summary, unchanged PENDING appointment, admin visibility and blocked cancellation. Exercise failure/cancel and refresh before retry. Do not enable live mode for assessment testing. These steps are an operator runbook, not a claim that live provider verification has occurred.
