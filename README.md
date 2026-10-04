# backend_busineskal

Run `npm ci`, configure `.env` using `.env.example`, then run `npm run dev`.
MongoDB must be available before the HTTP server begins accepting requests.
Existing payment, email, storage, and Firebase integrations require their own
credentials. Do not commit `.env` or service-account files.

Account flow:
- `POST /api/v1/auth/register`: `name`, `email`, `password`, and `role` (`user` or
  `seller`). Seller signup also accepts required `storeName`, `country`, `phone`,
  and optional `storeDescription`. Passwords require at least 8 characters and
  at most 72 UTF-8 bytes. Seller accounts start with `vendorStatus: pending`.
- `POST /api/v1/auth/login`: email/password. Sellers must be approved; pending
  and rejected sellers cannot login or use protected routes.
- `POST /api/v1/user/become-seller`: authenticated buyer submits the same business
  fields. The account changes to a pending seller and refresh sessions are revoked.
- Seller listing, approval, rejection, and deletion routes under `/user/sellers`
  and admin dashboard routes require an administrator. Approval creates the shop
  using the submitted business name and description.
- `/auth/forget` and `/auth/reset-password` provide the existing email OTP reset
  flow. Configure `EMAIL_USER` and `EMAIL_PASS` for email delivery.

The landing page uses these account routes with cookie-based sessions; the legacy
seller-interest endpoint below remains for existing API clients.

`GET /health` returns 200 when MongoDB is connected, otherwise 503.
`GET /api/v1/landing/catalogue` publicly returns the latest 100 verified products
and 100 verified services, with their categories and supplier summaries. Inactive
categories, missing vendors, and unapproved sellers are excluded. Legacy verified
listings whose categories were deleted appear as Uncategorized. Supplier details
are explicitly selected and mapped; email, phone, credentials, verification
documents, and other private profile fields are not exposed. Existing authenticated
product/service routes retain their access requirements.
`POST /api/v1/landing/seller-interest` accepts `name`, `email`, `business`, and
`offering` (`Products`, `Services`, or `Products & services`) without requiring
an account. Details are stored in the `sellerinterests` collection; repeated
email submissions update the existing entry. The endpoint does not expose
submitted details. Limits are 10 attempts per IP/email per 15 minutes per
process; use a shared edge rate limiter for multiple backend instances.

Set `CORS_ORIGINS` to a comma-separated list of allowed website origins in
production. Set `TRUST_PROXY_HOPS` only for the actual trusted proxy topology.
`npm test` exercises the landing endpoint and error/authentication behavior
using a mock store without connecting to MongoDB.
