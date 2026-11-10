# ProcureHub API reference

The API is mounted at `/api`, returns JSON, and accepts JSON bodies for writes. Protected endpoints require `Authorization: Bearer <JWT>`. JWTs currently expire after seven days. The backend enforces authorization and ownership; frontend visibility is not an access-control boundary.

Roles: **Public** means no JWT; **Buyer**, **Supplier**, and **Admin** name permitted authenticated roles. Where a route allows multiple roles, the controller also applies record ownership or workflow-state checks.

## Health and authentication

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | API process health |
| `GET` | `/health/db` | Public | MySQL connection health; returns 503 when unavailable |
| `POST` | `/auth/register` | Public, rate-limited | Create a buyer or supplier account and business profile |
| `POST` | `/auth/login` | Public, rate-limited | Authenticate and issue a JWT |
| `GET` | `/auth/me` | Any authenticated user | Return the current account |

Login allows 10 requests per IP per 15 minutes; registration allows 5 per IP per hour. The default limiter store is in-process.

## Businesses and categories

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/businesses/suppliers/:supplierId/public` | Public | Supplier public profile and aggregate review information |
| `GET` | `/businesses/me` | Buyer, Supplier, Admin | Read current user's business profile |
| `PATCH` | `/businesses/me` | Buyer, Supplier, Admin | Update current user's business profile |
| `GET` | `/businesses` | Admin | List business profiles |
| `GET` | `/businesses/:id` | Buyer, Supplier, Admin | Read a profile subject to controller ownership/access checks |
| `GET` | `/categories` | Public | List active categories |
| `GET` | `/categories?includeInactive=true` | Admin | Include inactive categories |
| `POST` | `/categories` | Admin | Create a category |
| `PATCH` | `/categories/:id` | Admin | Update category state/details |

## Products and inventory

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/products` | Public | Browse/search active products |
| `GET` | `/products/:id` | Public | Read a product |
| `GET` | `/products/mine` | Supplier | List the supplier's products |
| `GET` | `/products/inventory` | Supplier | List own inventory |
| `GET` | `/products/:id/inventory` | Supplier | Read inventory subject to ownership |
| `PUT` | `/products/:id/inventory` | Supplier | Update own product inventory |
| `POST` | `/products` | Supplier | Create a product and inventory entry |
| `PUT` | `/products/:id` | Supplier, Admin | Update a product; supplier ownership is checked |
| `DELETE` | `/products/:id` | Supplier, Admin | Deactivate a product; supplier ownership is checked |

## Procurement workflow

| Method | Path | Access | Purpose |
|---|---|---|---|
| `POST` | `/purchase-requests` | Buyer | Create a multi-item purchase request |
| `GET` | `/purchase-requests` | Authenticated roles | List requests visible to the caller |
| `GET` | `/purchase-requests/:id` | Buyer, Supplier, Admin | Read an eligible request |
| `POST` | `/quotations` | Supplier | Submit a quotation for an open request |
| `GET` | `/quotations` | Authenticated roles | List quotations visible to the caller |
| `PATCH` | `/quotations/:id` | Authenticated; ownership/workflow checked | Accept/reject as the buyer or update permitted quote state |
| `POST` | `/orders` | Buyer | Create an order from an accepted quotation |
| `GET` | `/orders` | Authenticated roles | List orders visible to the caller |
| `GET` | `/orders/:id` | Buyer, Supplier, Admin | Read order, items, and status history subject to ownership |
| `PATCH` | `/orders/:id` | Supplier, Admin by controller policy | Advance a permitted order state; supplier must own the order |

## Invoices, payments, notifications, and reviews

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/invoices` | Buyer, Supplier, Admin | List invoices visible to the caller |
| `GET` | `/invoices/:id` | Buyer, Supplier, Admin | Read invoice, line items, and payment records subject to ownership |
| `POST` | `/invoices/:id/payments` | Buyer, Admin | Record a payment; buyer/invoice relationship and payment state are checked |
| `GET` | `/notifications` | Buyer, Supplier, Admin | List the caller's notifications |
| `PATCH` | `/notifications/:id/read` | Buyer, Supplier, Admin | Mark the caller's notification as read |
| `POST` | `/reviews` | Buyer | Review a supplier for a completed order |
| `GET` | `/reviews` | Authenticated roles | List reviews scoped to the caller's role |

## Dashboards and administration

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/dashboard/buyer` | Buyer | Buyer metrics and recent procurement activity |
| `GET` | `/dashboard/supplier` | Supplier | Supplier metrics and recent activity |
| `GET` | `/dashboard/admin` | Admin | Platform metrics and management data |
| `GET` | `/admin/users` | Admin | List user accounts |
| `PATCH` | `/admin/users/:id/status` | Admin | Activate/deactivate an account, with last-admin protections |
| `GET` | `/admin/categories` | Admin, Buyer, Supplier | Authenticated category list used by application surfaces |

## Order states and transitions

1. A buyer accepts a quotation and creates an order in `PO_CREATED`.
2. The supplier may confirm (`CONFIRMED`) or reject (`REJECTED`) it.
3. Confirmed orders advance through `PROCESSING`, `SHIPPED`, `OUT_FOR_DELIVERY`, and `DELIVERED`.
4. Delivery commits reserved catalogue stock and transactionally creates invoice and invoice-item records; the order moves through `INVOICE_GENERATED` to `PAYMENT_PENDING`.
5. A full recorded payment advances the order through `PAID` to `COMPLETED`.
6. An administrator may cancel in the allowed pre-delivery states. Rejection/cancellation releases active reservations.

Invalid states/transitions are rejected by the backend. The payment endpoint is for recording a development confirmation, not charging a payment method.
