# Cloudinary image storage

Supply all three server-side variables: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET. CLOUDINARY_FOLDER defaults to `autocare` and accepts safe slash-separated path segments. Never put credentials in Flutter, logs or source control. Credentials can be entirely blank; startup still succeeds and new uploads return 503 `MEDIA_DISABLED`. Partial configuration fails startup. PUBLIC_API_BASE_URL is not required for Cloudinary uploads.

The official `cloudinary` Node SDK uses authenticated `v2.uploader.upload_stream`. The only client input is one image in multipart field `file`; ADMIN/session guards run before multipart parsing. Route: `POST /api/v1/admin/media/images`, bearer ADMIN, HTTP 201:

```json
{
  "id": "f945b6a5-42d7-4396-98e7-8c3b2ab6ed12",
  "imageUrl": "https://res.cloudinary.com/your-cloud/image/upload/f_auto,q_auto:good/autocare/f945b6a5-42d7-4396-98e7-8c3b2ab6ed12.png"
}
```

The response keys remain exactly `id` and `imageUrl`. The file has a 2 MiB limit and must have a JPEG, PNG or WebP signature. Client MIME labels/filenames do not select storage behavior. SVG and other formats are rejected. The provider receives image-only resource type, an allowlist of formats, a server UUID public ID, overwrite=false and a 20-second SDK timeout. Delivery uses HTTPS and automatic format/perceptual quality optimization; the original upload remains available in Cloudinary. Clients cannot supply transformations or provider options.

New rows store CLOUDINARY, public ID, secure delivery URL, verified MIME, original byte length and creation timestamp. They contain no binary data. The additive migration defaults existing rows to POSTGRESQL and retains their bytes. `GET /api/v1/media/images/:id` remains public and returns legacy bytes with MIME, immutable cache and nosniff headers. New upload URLs point directly to Cloudinary. Service/category image URLs are unchanged; seeded external URLs continue working.

Database checks enforce provider-specific fields, allowed MIME and file size. Normal API JSON never includes binary data. When metadata persistence fails after upload, only that just-created public ID is passed to best-effort Cloudinary destruction. Cleanup failure can leave an orphan requiring operator inspection; no existing/replaced service image is automatically deleted. There is no media library, deletion endpoint or bulk migration.

| HTTP | Meaning / code |
|---|---|
| 400 | Missing file, unsupported signature or multipart fields |
| 401 / 403 | Missing/invalid session / customer role |
| 413 | Image exceeds 2097152 bytes |
| 503 MEDIA_DISABLED | Credentials absent |
| 503 MEDIA_PROVIDER_UNAVAILABLE | Provider failure, timeout or invalid provider result |
| 503 MEDIA_PERSISTENCE_FAILED | Metadata failed; compensating cleanup attempted |
| 404 | Legacy image ID missing or row has no legacy bytes |

No raw Cloudinary responses/errors/secrets are returned or logged. Automated tests mock uploads; they do not establish live account availability. To verify manually, explicitly configure a test Cloudinary account, provision an ADMIN through `npm run admin:create`, upload a small image through the route, inspect the returned HTTPS URL and metadata, and account for the provider's storage/transformation usage.

Official reference: [Node image upload](https://cloudinary.com/documentation/node_image_and_video_upload).
