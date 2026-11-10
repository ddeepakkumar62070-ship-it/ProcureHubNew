# ProcureHub architecture and data model

## Application architecture

```mermaid
flowchart LR
    Browser["Browser"]
    React["React 18 + Vite UI<br/>pages, routes, auth context"]
    API["Express REST API<br/>CORS, JSON, health checks"]
    Auth["JWT authentication<br/>role and ownership checks"]
    Controllers["Route controllers"]
    Repositories["MySQL repositories<br/>parameterized SQL"]
    MySQL[("MySQL / InnoDB")]
    Migrations["SQL migration runner"]
    Seed["Seed script<br/>bcrypt password hashes"]

    Browser --> React
    React -->|"JSON + Bearer JWT"| API
    API --> Auth
    API --> Controllers
    Auth --> Repositories
    Controllers --> Repositories
    Repositories --> MySQL
    Migrations --> MySQL
    Seed --> MySQL
```

The browser UI is in `frontend/src/`. The backend starts in `backend/src/server.js`, mounts Express route modules, authenticates protected requests, and delegates persistence to repositories under `backend/src/repositories/`. Database settings and the MySQL connection pool are in `backend/src/config/db.js`. Ordered schema changes live under `backend/src/db/migrations/`; the migration runner tracks applied file names in `schema_migrations`.

The backend rejects browser origins outside its configured allow-list. Development permits `localhost:5173` and `127.0.0.1:5173`; production requires explicit HTTPS origins. Authentication uses signed JWT bearer tokens. Role checks and row ownership checks are enforced on the API rather than relying on frontend navigation.

## Database entity relationships

This diagram summarizes the two SQL migrations. Foreign keys and unique constraints are defined in the migrations; nullable relationships reflect optional product links and optional invoice/order-item links.

```mermaid
erDiagram
    USERS {
        bigint id PK
        varchar name
        varchar email UK
        varchar password_hash
        enum role
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }
    BUSINESSES {
        bigint id PK
        bigint owner_user_id FK,UK
        varchar name
        varchar business_type
        varchar phone
        varchar address
        varchar description
        varchar website
        varchar tax_identifier
    }
    CATEGORIES {
        bigint id PK
        varchar name UK
        varchar description
        boolean is_active
    }
    PRODUCTS {
        bigint id PK
        bigint supplier_id FK
        bigint category_id FK
        varchar name
        varchar unit
        decimal price
        boolean is_active
    }
    INVENTORY {
        bigint id PK
        bigint product_id FK,UK
        decimal quantity
        decimal reserved_quantity
    }
    PURCHASE_REQUESTS {
        bigint id PK
        bigint buyer_id FK
        bigint business_id FK
        bigint category_id FK
        varchar title
        enum status
        varchar delivery_address
        datetime delivery_deadline
        datetime expires_at
    }
    PURCHASE_REQUEST_ITEMS {
        bigint id PK
        bigint purchase_request_id FK
        bigint product_id FK
        varchar name
        decimal quantity
        varchar unit
    }
    QUOTATIONS {
        bigint id PK
        bigint purchase_request_id FK
        bigint supplier_id FK
        decimal amount
        char currency
        enum status
        smallint delivery_days
    }
    QUOTATION_ITEMS {
        bigint id PK
        bigint quotation_id FK
        bigint purchase_request_item_id FK
        varchar name
        decimal quantity
        decimal unit_price
    }
    PURCHASE_ORDERS {
        bigint id PK
        bigint quotation_id FK,UK
        bigint purchase_request_id FK
        bigint buyer_id FK
        bigint supplier_id FK
        decimal total_amount
        enum status
    }
    ORDER_ITEMS {
        bigint id PK
        bigint purchase_order_id FK
        bigint product_id FK
        varchar name
        decimal quantity
        decimal unit_price
    }
    ORDER_STATUS_HISTORY {
        bigint id PK
        bigint purchase_order_id FK
        bigint changed_by FK
        varchar previous_status
        varchar new_status
        timestamp created_at
    }
    INVENTORY_RESERVATIONS {
        bigint id PK
        bigint purchase_order_id FK
        bigint product_id FK
        decimal quantity
        enum status
    }
    INVOICES {
        bigint id PK
        bigint purchase_order_id FK,UK
        varchar invoice_number UK
        decimal amount
        char currency
        enum status
    }
    INVOICE_ITEMS {
        bigint id PK
        bigint invoice_id FK
        bigint order_item_id FK
        varchar name
        decimal quantity
        decimal unit_price
        decimal line_total
    }
    PAYMENTS {
        bigint id PK
        bigint invoice_id FK
        decimal amount
        enum status
        varchar idempotency_key UK
        varchar reference UK
    }
    REVIEWS {
        bigint id PK
        bigint purchase_order_id FK
        bigint buyer_id FK
        bigint supplier_id FK
        tinyint rating
        text comment
    }
    NOTIFICATIONS {
        bigint id PK
        bigint user_id FK
        varchar type
        varchar message
        datetime read_at
    }

    USERS ||--o| BUSINESSES : owns
    USERS ||--o{ PRODUCTS : supplies
    CATEGORIES ||--o{ PRODUCTS : classifies
    PRODUCTS ||--o| INVENTORY : stocked_as
    USERS ||--o{ PURCHASE_REQUESTS : creates
    BUSINESSES o|--o{ PURCHASE_REQUESTS : represents
    CATEGORIES o|--o{ PURCHASE_REQUESTS : categorizes
    PURCHASE_REQUESTS ||--|{ PURCHASE_REQUEST_ITEMS : contains
    PRODUCTS o|--o{ PURCHASE_REQUEST_ITEMS : requested_product
    PURCHASE_REQUESTS ||--o{ QUOTATIONS : receives
    USERS ||--o{ QUOTATIONS : submits
    QUOTATIONS ||--|{ QUOTATION_ITEMS : prices
    PURCHASE_REQUEST_ITEMS o|--o{ QUOTATION_ITEMS : quoted_item
    QUOTATIONS ||--o| PURCHASE_ORDERS : may_create
    PURCHASE_REQUESTS ||--o{ PURCHASE_ORDERS : awarded_as
    USERS ||--o{ PURCHASE_ORDERS : buys
    USERS ||--o{ PURCHASE_ORDERS : fulfills
    PURCHASE_ORDERS ||--|{ ORDER_ITEMS : contains
    PRODUCTS o|--o{ ORDER_ITEMS : references
    PURCHASE_ORDERS ||--o{ ORDER_STATUS_HISTORY : records
    USERS ||--o{ ORDER_STATUS_HISTORY : changes
    PURCHASE_ORDERS ||--o{ INVENTORY_RESERVATIONS : reserves
    PRODUCTS ||--o{ INVENTORY_RESERVATIONS : reserved
    PURCHASE_ORDERS ||--o| INVOICES : billed_by
    INVOICES ||--|{ INVOICE_ITEMS : itemizes
    ORDER_ITEMS o|--o{ INVOICE_ITEMS : billed_item
    INVOICES ||--o{ PAYMENTS : paid_by
    PURCHASE_ORDERS ||--o| REVIEWS : reviewed
    USERS ||--o{ REVIEWS : writes
    USERS ||--o{ REVIEWS : receives
    USERS ||--o{ NOTIFICATIONS : receives
```

`schema_migrations` is created and maintained by the migration runner; it is operational metadata rather than a procurement entity. With both migrations applied, the database contains 19 tables including that migration ledger.

## Purchase-order lifecycle

```mermaid
stateDiagram-v2
    [*] --> PO_CREATED: Buyer creates order from accepted quotation
    PO_CREATED --> CONFIRMED: Supplier confirms
    PO_CREATED --> REJECTED: Supplier rejects
    PO_CREATED --> CANCELLED: Admin cancels
    CONFIRMED --> PROCESSING: Supplier starts fulfilment
    CONFIRMED --> CANCELLED: Admin cancels
    PROCESSING --> SHIPPED: Supplier ships
    PROCESSING --> CANCELLED: Admin cancels
    SHIPPED --> OUT_FOR_DELIVERY: Supplier updates delivery
    OUT_FOR_DELIVERY --> DELIVERED: Supplier confirms delivery
    DELIVERED --> INVOICE_GENERATED: Invoice/items generated transactionally
    INVOICE_GENERATED --> PAYMENT_PENDING: Invoice awaits payment
    PAYMENT_PENDING --> PAID: Full payment recorded
    PAID --> COMPLETED: Workflow marks order complete
    REJECTED --> [*]
    CANCELLED --> [*]
    COMPLETED --> [*]
```

On order creation, inventory represented by catalogue products is reserved within the order transaction. Rejection or permitted cancellation releases reservations; delivery commits them by reducing stock and creates the invoice. The payment action records a manually confirmed development payment; it is not connected to a payment processor.
