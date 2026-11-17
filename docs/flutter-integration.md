# Flutter integration

Inspected the adjacent frontend's current service/appointment/availability models, auth repository, request payloads, cookie transports, route destinations and demo catalog. The prerequisite phase did not modify it; the subsequent Gemini task authorizes minimum catalog/assistant integration.

Set `API_BASE_URL` to include `/api/v1`: Android emulator `http://10.0.2.2:3000/api/v1`, browser `http://localhost:3000/api/v1`. Endpoint constants start with `/auth`; native refresh restoration appends `/auth/refresh`. Never append `/api/v1` twice. Add the browser's exact origin/port to CORS_ORIGINS.

Native Dio uses a persistent cookie jar backed by secure storage; local HTTP requires the non-Secure development refresh cookie. Web Dio sets `withCredentials:true`; HttpOnly cookies remain browser-managed. The Gemini phase adds browser `/auth/csrf` acquisition and `X-CSRF-Token` for refresh/logout. Native transport works without Origin/CSRF headers. Refresh remains serialized by the coordinator; replay detection is strict.

Catalog responses are arrays; live IDs are UUIDs, while demo IDs are slugs. Service `price` is effective price. Add `type` and `originalPrice` to display packages and discounts. Package details use existing AppRoutes.serviceDetails and booking still submits `{serviceId,slotId}`. Categories derive from catalog category IDs/names.

AppointmentModel accepts lowercase pending/confirmed/cancelled/completed and nested slot fields supplied by this API. Non-demo booking and availability adapters were originally demo-only; replace their BackendContractException branches with the endpoints in [API docs](api.md) before claiming an end-to-end live booking UI. Vehicle selection is optional. Profile changes use PATCH `/users/me` and the `{user}` envelope.

Assistant actions are `serviceDetails` with a real service/package UUID and `browseServices` with optional real category UUID. The frontend owns widgets/navigation; never execute arbitrary URLs from model text. Preserve session-identity reset, stale-response generations, retry and explicit demo mode.

The Gemini phase completes the non-demo catalog and assistant HTTP adapters, strict response parsing and optional guest/authenticated transport. Service models add package type and original price. Cards show images when available, current effective/original prices and duration, with View service/View package labels. Catalog is refreshed after generation before resolving cards. Existing retry/clear, shell navigation and account-isolation behavior remain. Normal entry uses live APIs; opt into DEMO_DATA=true or the explicit demo target for sample data. A privacy notice explains Google processing and excludes personal information. Remaining live booking/profile business adapters are outside this assistant integration.

## Final backend handover

The backend contracts for services, service details, date availability, appointment creation/list/detail/cancel, GET /auth/me and PATCH /users/me are regression-tested. Collections remain arrays, appointment statuses lowercase, IDs UUIDs and slots nested. Monetary values are JSON numbers computed centrally and persisted as appointment snapshots. Capacity conflicts remain HTTP 409. Owner scoping and Asia/Dhaka timezone remain unchanged. The final backend task does not edit Flutter adapters; wire the demo-only branches using [API contracts](api.md).

Read GET /platform `booking.horizonDays` (default 30, includes today), `slotStepMinutes` and `timeZone` instead of a hardcoded 365-day window. Select dates from today through today+horizonDays−1 in Asia/Dhaka. Use returned availability slot IDs and handle 409 by refreshing availability.

Appointment models add top-level paymentStatus (unpaid|pending|paid|review_required), paymentMethod (sslcommerz|null) and canPayOnline; existing canCancel now considers payments. Preserve all original fields. Book first and show the acknowledgement, then offer Pay online only if gateway config/appointment allow it, and Pay at workshop without creating a payment record. Refresh before acting on stale state.

Read GET /payments/config. POST /appointments/:id/pay requires real phone/address/city/postcode; send no amount/currency/owner/status. Open checkoutUrl externally, refresh on app resume and provide a manual status refresh using POST /payments/:id/reconcile. Wait at least five seconds between refreshes. After uncertain initiation, list /appointments/:id/payments and reconcile the existing attempt before any retry. Never infer success from a redirect or completion HTML. Review/paid cancellation requires manual support; online refunds are out of scope. Exact DTOs, errors and testable JSON examples: [payment API](payment-api.md).

Admin uploads remain multipart field file and response {id,imageUrl}. Save imageUrl as returned; do not derive a local /media/images URL for a new Cloudinary image. Legacy and seeded URLs continue to work. ADMIN payment screens can use the protected list/detail/reconcile routes documented in [admin API](admin-api.md).
