# Features and implementation

## Authentication and profile

Registration validates name, normalized unique email and password (10–256 characters); registration always creates CUSTOMER. Login verifies the salted scrypt hash and creates an independent session. Access JWTs are short-lived; refresh cookies rotate, and consumed-token replay revokes the session. Logout revokes the session and clears its cookie. `/auth/me` and `/users/me` expose/update safe profile fields. There is no public admin registration/promotion or password-change endpoint.

## Catalog and pricing

Active categories, individual services, packages, featured services and eligible offers are exposed publicly. Search and filters support category, type, price range and featured status. Packages reference individual services and have their own configured price. Central Decimal pricing selects the best currently valid offer, never stacks offers, floors fixed discounts at zero, and rounds to two decimals. Public `price` means effective price; admin `price` means base price. Deactivating categories or package components affects visibility. Historical booking prices remain unchanged.

## Scheduling and appointments

Workshop timezone is Asia/Dhaka. Business hours, bays, duration and rolling horizon determine persisted availability. The default horizon is 30 days (including today), step 15 minutes. Different bays can provide separate capacity at the same time. Slot IDs are stable; expired/past slots are not bookable. Customers submit a service UUID and slot UUID; the backend derives owner, bay, times, status, price and duration. Optional vehicle IDs must belong to the user.

Reservation uses a transaction and shared service lock. A PostgreSQL GiST exclusion constraint prevents overlapping active bookings on one bay, even across different services; a partial unique index prevents reuse of an active slot. Conflicting requests return 409. Historical name, duration, price and interval are snapshots. Customer lists/details are ownership-scoped; only pending appointments without applied/unresolved payment can be cancelled. Cancellation releases capacity. Admin transitions are pending→confirmed/cancelled, confirmed→completed/cancelled; completion requires elapsed end time. Terminal statuses cannot be reopened.

## AI service assistant

Gemini receives a bounded conversation and authoritative public context. The prompt restricts responses to AutoCare and permits natural greetings and service comparisons. No personal records or authentication secrets are provided. Zod validates messages and structured responses; actions must reference real active service/category UUIDs, and at most four distinct actions are returned. The server rereads catalog context and appends exact price/duration lines. A conservative filter replaces detected numeric, commercial, link or time claims in model text; it can also replace harmless wording. No booking actions or private appointment queries are performed. Sensitive input screening, timeouts, bounded concurrency, per-user/IP rate limiting and a persisted UTC daily request cap protect the integration. No chat history is persisted server-side. Missing Gemini key disables only chat.

## Administration

ADMIN sessions can manage categories, services/packages, offers, featured/active flags, images, appointment statuses, dashboard counts and payment records. Strict payload validation, constraints and transactions preserve package composition and historical appointments. Duration edits update future slots; booking locks service rows against concurrent edits. Catalog entries are deactivated, not deleted. Admin accounts are provisioned explicitly via `npm run admin:create`.

## Media storage

An authenticated admin submits one multipart `file` (JPEG, PNG or WebP, max 2 MiB). Signature validation inspects bytes rather than trusting the filename. New uploads use Cloudinary and store metadata in PostgreSQL; legacy database binary images remain accessible. The returned HTTPS image URL can be saved on a service/category. Missing credentials disable new uploads only. No client Cloudinary secret or asset deletion endpoint is provided.

## Payments

Booking and payment are independent. Pay-at-workshop is always available as a booking option; optional SSLCommerz checkout is initialized from a saved eligible appointment. The backend uses the appointment's persisted amount and currency; customer supplies contact fields only. An attempt is saved before the gateway request. Row locks and partial unique indexes prevent multiple active/applied payments. External network calls occur outside transactions.

The gateway's callbacks are untrusted. The backend independently verifies merchant transaction ID, amount, currency, validation/bank references and risk before applying a payment. Duplicate/late/risky or uncertain results are recorded for review, not silently marked successful. Reconciliation spacing is persisted (five seconds). Browser success/fail/cancel redirects do not establish payment state; terminal failures need authoritative provider confirmation. Payment never automatically confirms the appointment. Paid or unresolved payments prevent ordinary cancellation; no refund or manual approval override is implemented. Use sandbox credentials for assessment, never real-money payments.
