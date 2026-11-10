ALTER TABLE businesses
  ADD COLUMN description VARCHAR(1000) NULL,
  ADD COLUMN website VARCHAR(255) NULL,
  ADD COLUMN tax_identifier VARCHAR(100) NULL;

ALTER TABLE purchase_requests
  ADD COLUMN delivery_address VARCHAR(500) NULL,
  ADD COLUMN delivery_deadline DATETIME NULL,
  ADD COLUMN notes TEXT NULL,
  ADD COLUMN expires_at DATETIME NULL;

ALTER TABLE quotations
  ADD COLUMN delivery_days SMALLINT UNSIGNED NULL,
  ADD COLUMN terms TEXT NULL,
  ADD COLUMN valid_until DATETIME NULL;

UPDATE purchase_orders SET status = 'SHIPPED' WHERE status = 'IN_TRANSIT';

ALTER TABLE purchase_orders
  MODIFY COLUMN status ENUM(
    'PO_CREATED',
    'CONFIRMED',
    'REJECTED',
    'PROCESSING',
    'SHIPPED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'INVOICE_GENERATED',
    'PAYMENT_PENDING',
    'PAID',
    'COMPLETED',
    'CANCELLED'
  ) NOT NULL DEFAULT 'PO_CREATED';

CREATE TABLE IF NOT EXISTS order_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purchase_order_id BIGINT UNSIGNED NOT NULL,
  previous_status VARCHAR(40) NULL,
  new_status VARCHAR(40) NOT NULL,
  changed_by BIGINT UNSIGNED NOT NULL,
  note VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_order_history_order_created (purchase_order_id, created_at),
  CONSTRAINT fk_order_history_order FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_order_history_user FOREIGN KEY (changed_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purchase_order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  status ENUM('RESERVED', 'RELEASED', 'COMMITTED') NOT NULL DEFAULT 'RESERVED',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inventory_reservation_order_product (purchase_order_id, product_id),
  KEY idx_inventory_reservations_product_status (product_id, status),
  CONSTRAINT chk_inventory_reservation_quantity CHECK (quantity > 0),
  CONSTRAINT fk_inventory_reservation_order FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_inventory_reservation_product FOREIGN KEY (product_id) REFERENCES products (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS invoice_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  order_item_id BIGINT UNSIGNED NULL,
  name VARCHAR(200) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit VARCHAR(40) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_invoice_items_invoice (invoice_id),
  CONSTRAINT chk_invoice_items_values CHECK (quantity > 0 AND unit_price >= 0 AND line_total >= 0),
  CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_invoice_items_order_item FOREIGN KEY (order_item_id) REFERENCES order_items (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE payments
  ADD COLUMN idempotency_key VARCHAR(100) NULL,
  MODIFY COLUMN status ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
  ADD UNIQUE KEY uq_payments_idempotency_key (idempotency_key);

CREATE INDEX idx_products_search_active ON products (is_active, name);
CREATE INDEX idx_purchase_requests_status_created ON purchase_requests (status, created_at);

ALTER TABLE reviews
  ADD INDEX idx_reviews_supplier_buyer (supplier_id, buyer_id);
