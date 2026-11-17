# Flutter integration

Inspected the adjacent frontend's current service/appointment/availability models, auth repository, request payloads, cookie transports, route destinations and demo catalog. The prerequisite phase did not modify it; the subsequent Gemini task authorizes minimum catalog/assistant integration.

Set `API_BASE_URL` to include `/api/v1`: Android emulator `http://10.0.2.2:3000/api/v1`, browser `http://localhost:3000/api/v1`. Endpoint constants start with `/auth`; native refresh restoration appends `/auth/refresh`. Never append `/api/v1` twice. Add the browser's exact origin/port to CORS_ORIGINS.

Native Dio uses a persistent cookie jar backed by secure storage; local HTTP requires the non-Secure development refresh cookie. Web Dio already sets `withCredentials:true`; HttpOnly cookies remain browser-managed. Browser restoration additionally requires `/auth/csrf` and `X-CSRF-Token` for refresh/logout; current prerequisite auth transport needs that frontend enhancement. Native transport works without Origin/CSRF headers. Serialize refresh through the existing coordinator; replay detection is strict.

Catalog responses are arrays; live IDs are UUIDs, while demo IDs are slugs. Service `price` is effective price. Add `type` and `originalPrice` to display packages and discounts. Package details use existing AppRoutes.serviceDetails and booking still submits `{serviceId,slotId}`. Categories derive from catalog category IDs/names.

AppointmentModel accepts lowercase pending/confirmed/cancelled/completed and nested slot fields supplied by this API. Non-demo booking and availability adapters were originally demo-only; replace their BackendContractException branches with the endpoints in [API docs](api.md) before claiming an end-to-end live booking UI. Vehicle selection is optional. Profile changes use PATCH `/users/me` and the `{user}` envelope.

Assistant actions are `serviceDetails` with a real service/package UUID and `browseServices` with optional real category UUID. The frontend owns widgets/navigation; never execute arbitrary URLs from model text. Preserve session-identity reset, stale-response generations, retry and explicit demo mode.
