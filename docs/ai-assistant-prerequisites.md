# Assistant application contracts

Database models: User, AuthSession, AuthRefreshToken, Vehicle, ServiceCategory, Service, PackageItem, Offer, ServiceBay, BusinessHours, AppointmentSlot, Appointment, PlatformSetting. See [relationships and constraints](database.md) and [complete DBML](schema.dbml).

## Reusable services

| Exported Nest module / service | Methods |
|---|---|
| `CatalogModule` / `CatalogService` | `listServices(filters?)`, `getService(id)`, `listCategories()`, `listOffers()`, `getOffer(id)` |
| `CatalogModule` / `PricingService` | `calculate(basePrice, offers, now?)`, `eligible(offer, now)`, `offerDto(offer)` |
| `PlatformModule` / `PlatformService` | `getPublicKnowledge()` |
| `SchedulingModule` / `AvailabilityService` | `getAvailability(serviceId, date)` |
| `AppointmentsModule` / `AppointmentService` | `create(userId,input)`, `listForUser(userId,filters?)`, `getOwned(userId,id)`, `cancel(userId,id)` |
| `AuthModule` / `SessionService` | `authenticateAccessToken(claims)`, `revokeForUser(userId)` and session lifecycle infrastructure |

Public context should use CatalogService and PlatformService. Pricing is already included in catalog DTOs; never ask an AI to recalculate discounts. AvailabilityService is authoritative for slots. Private appointment methods must receive a user ID from verified request authentication, never a prompt, tool argument or client-supplied owner ID. The current assistant is restricted to public information and must not inject appointment records into provider context.

## Public data contract

`PlatformSetting` stores JSON values under allowlisted keys: `platformName`, `description`, `currency`, `timeZone`, `bookingPolicy`, `cancellationPolicy`, `bookingStatuses`, `packageRules`, `offerRules`, `faqs`. Public knowledge returns `{settings,businessHours}`. Settings contain policy descriptions, not catalog duplicates; authoritative hours remain in BusinessHours. [Generated platform JSON](examples/platform.json) shows the exact seeded structure.

ServiceDto retains Flutter's fields and adds `type`, `originalPrice`, `effectivePrice`, `isFeatured`, `activeOffer`, `packageItems`. `price` is the effective customer price as a JSON number. PACKAGE is a Service with its own UUID and official price; composition joins individual Service IDs with quantities. Offers attach to either type. Only active categories/services/components and currently valid offers are public. [Generated catalog](examples/catalog.json) contains all nine seeded items and offer/composition examples.

Pricing uses Decimal, valid offer dates, no stacking, a zero floor, two-decimal half-up rounding and lexicographic ID tie-breaking. Historical Appointment prices are snapshots, not recalculated catalog values. [Generated appointment](examples/appointment.json) was produced by the actual service with a temporary fixture user, then the fixture was removed. [Generated availability](examples/availability.json) uses real persisted slots. IDs/times describe that verification database only.

Entity IDs are UUID strings; refresh-history IDs are SHA-256 hex digests, package composition uses a UUID pair, setting keys are text. Refresh digests and session IDs are private and have no navigation purpose. Flutter demo slug IDs must never be substituted for actual UUIDs.

## Navigation and privacy

Flutter destinations: `/home` (Explore via browse intent/category filter), `/services/:serviceId`, `/services/:serviceId/book`, `/bookings`, `/bookings/:bookingId`, `/bookings/:bookingId/confirmation`, `/profile`, `/profile/edit`, `/assistant`, `/login`, `/register`. Resolve actions through AppRoutes/GoRouter. Package details use the normal service-details destination. There is no separate package route or generic arbitrary-URL navigation contract.

Useful provider context: service/category UUIDs and names, descriptions, inclusions, effective/original prices, currency, durations, active offers, package contents, public policies and business hours. Omit image URLs and internal persistence fields when unnecessary.

Never send password hashes, raw passwords, access/refresh tokens, refresh digests, secrets, database URLs, cookies, IP/user-agent metadata, private user profiles/emails, vehicle registrations or other users' appointments to an external provider. Client history is untrusted and may contain sensitive text; bound and screen it and disclose third-party processing. No chat-history database is required.

Regenerate public examples against a seeded development database: `npx ts-node scripts/export-examples.ts`. This creates and removes one temporary fixture user/appointment; it does not reset a database.
