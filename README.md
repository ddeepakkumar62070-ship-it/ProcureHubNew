# ProcureHub

ProcureHub is a business-to-business procurement application for organizations that buy goods from suppliers. It replaces scattered request, quotation, order, and payment-record processes with a role-based workflow backed by MySQL.

## Features and roles

- **Buyers** maintain a business profile, browse the catalogue, create multi-item purchase requests, compare and accept quotations, track orders, view invoices, record development payment confirmations, and review suppliers after completion.
- **Suppliers** maintain their business profile, manage products and inventory, quote on open requests, confirm and advance orders, and view notifications and reviews.
- **Administrators** view platform summaries, manage users and categories, and moderate catalogue availability.
- All procurement records and workflow data are persisted in MySQL. The backend does not switch to in-memory demo data if MySQL is unavailable.

## Technology

- Frontend: React 18, JavaScript, Vite, React Router, Axios
- Backend: Node.js, Express, JavaScript, REST-style JSON API
- Database: MySQL 8.0.16 or newer, `mysql2` promise pool, SQL migrations
- Authentication: JWT bearer tokens; passwords hashed with `bcryptjs`

Use Node.js **20.19 or newer in the 20.x line**, or **22.12 or newer in the 22.x line**, for the complete frontend toolchain. The frontend build dependencies require these minimum versions after security updates.

## Architecture

The React application calls the Express API over HTTP. Express mounts route modules, authenticates JWTs, applies role and ownership checks, and delegates database work to repositories that use parameterized SQL. MySQL stores users, businesses, catalogue and inventory, procurement workflow, financial records, reviews, and notifications.

The frontend entry point is `frontend/src/main.jsx`; routes are in `frontend/src/App.jsx`. The backend entry point is `backend/src/server.js`. Database configuration and connection-pool creation are in `backend/src/config/db.js`; SQL migrations are in `backend/src/db/migrations/`.

See [docs/architecture.md](docs/architecture.md) for Mermaid architecture and entity-relationship diagrams, and [docs/api.md](docs/api.md) for the route reference and order lifecycle.

## Setup

### 1. Create a local MySQL database and application user

Install/start MySQL using your preferred macOS installation method. Then connect as a local MySQL administrator and create a dedicated application account. Example:

```sql
CREATE DATABASE procurehub CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'procurehub_app'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-strong-local-password';
GRANT ALL PRIVILEGES ON procurehub.* TO 'procurehub_app'@'127.0.0.1';
```

Choose a unique local password and use the same value in the backend environment file. Do not use the MySQL administrator account for the application.

### 2. Configure and initialize the backend

```bash
cd backend
npm ci
cp .env.example .env
```

Edit `backend/.env` locally. Set the database connection values, a newly generated `JWT_SECRET` of at least 32 characters, and the three demo-account passwords. For example, generate a JWT secret locally with:

```bash
openssl rand -hex 32
```

Do not paste secrets into source files, commit `.env`, or share real secret values. See [backend/.env.example](backend/.env.example) for the variable names and safe placeholders.

Configure `FRONTEND_ORIGINS` as a comma-separated list of exact frontend origins when needed. Development defaults allow `http://localhost:5173` and `http://127.0.0.1:5173`. In production, set `NODE_ENV=production` and specify at least one exact HTTPS frontend origin. Wildcards, URL paths, and non-HTTPS production origins are rejected.

Apply migrations, optionally seed the initial categories/demo accounts, and start the API:

```bash
npm run db:migrate
npm run db:seed
npm start
```

Migrations are ordered SQL files recorded in `schema_migrations`; the command skips files already recorded as applied. The seed script is idempotent for categories, demo users, and their business profiles. It requires the demo passwords from the environment, hashes new passwords with bcrypt, and does not overwrite existing demo account passwords.

Health checks:

- `GET http://localhost:5000/api/health` checks the API process.
- `GET http://localhost:5000/api/health/db` checks the configured MySQL connection.

### 3. Start the frontend

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. The API URL defaults to `http://localhost:5000/api`; set `VITE_API_URL` in the frontend environment if the backend uses another port or host. The Vite development server may need to be restarted after changing frontend environment variables.

## Demo accounts

The seed script creates:

| Role | Email |
|---|---|
| Admin | `admin@procurehub.com` |
| Buyer | `buyer@procurehub.com` |
| Supplier | `supplier@procurehub.com` |

Set `DEMO_ADMIN_PASSWORD`, `DEMO_BUYER_PASSWORD`, and `DEMO_SUPPLIER_PASSWORD` locally before seeding. Password values are intentionally not included in this repository. For a public deployment, do not use shared demo credentials; use non-production test accounts and rotate or disable them.

## API overview

All API routes use the `/api` prefix and JSON request/response bodies. Private routes require `Authorization: Bearer <JWT>` and enforce role and record ownership in the backend. The main resources are:

| Resource | Route groups |
|---|---|
| Health and authentication | `/health`, `/health/db`, `/auth` |
| Business profiles and categories | `/businesses`, `/categories` |
| Products and inventory | `/products` |
| Dashboards and administration | `/dashboard`, `/admin` |
| Purchase requests, quotations, and orders | `/purchase-requests`, `/quotations`, `/orders` |
| Invoices and payment records | `/invoices` |
| Notifications and reviews | `/notifications`, `/reviews` |

The endpoint-by-endpoint methods and authorization notes are documented in [docs/api.md](docs/api.md).

## Testing and verification

Run the backend integration and middleware tests from `backend/`:

```bash
npm test
find src test -type f -name '*.js' -print0 | xargs -0 -n1 node --check
```

The procurement workflow test uses the configured MySQL database and seeded buyer, supplier, and administrator accounts. It creates unique temporary data and cleans up only its own records. Do not run these tests against production data.

Build the frontend from `frontend/`:

```bash
npm run build
```

Audit installed dependencies from each package directory:

```bash
npm audit
```

## Known limitations

- Payment actions record a manually confirmed development payment; no payment gateway, bank transfer, or reconciliation integration is connected.
- Notifications are persisted in-app; email and SMS delivery are not implemented.
- Rate limiting uses an in-process store. A multi-instance deployment needs a shared store and carefully configured proxy IP trust.
- The project has backend automated tests but no dedicated frontend automated test suite.
- Production hosting, a production HTTPS frontend origin, operational monitoring, backup/restore procedures, and deployment configuration must be established before production use.
