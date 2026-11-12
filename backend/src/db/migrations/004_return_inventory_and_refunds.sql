CREATE TABLE IF NOT EXISTS return_inventory_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  return_request_item_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  supplier_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_return_inventory_movement_item (return_request_item_id),
  KEY idx_return_inventory_supplier_created (supplier_id, created_at),
  CONSTRAINT chk_return_inventory_movement_quantity CHECK (quantity > 0),
  CONSTRAINT fk_return_inventory_movement_item FOREIGN KEY (return_request_item_id)
    REFERENCES return_request_items (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_return_inventory_movement_product FOREIGN KEY (product_id)
    REFERENCES products (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_return_inventory_movement_supplier FOREIGN KEY (supplier_id)
    REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS refunds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  return_request_id BIGINT UNSIGNED NOT NULL,
  invoice_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  status ENUM('REFUND_PENDING', 'REFUND_PROCESSED', 'REFUND_FAILED', 'NOT_APPLICABLE')
    NOT NULL DEFAULT 'REFUND_PENDING',
  transaction_reference VARCHAR(120) NULL,
  processed_at DATETIME NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refunds_return_request (return_request_id),
  KEY idx_refunds_invoice_status (invoice_id, status),
  KEY idx_refunds_status_created (status, created_at),
  CONSTRAINT chk_refunds_amount_nonnegative CHECK (amount >= 0),
  CONSTRAINT fk_refunds_return FOREIGN KEY (return_request_id) REFERENCES return_requests (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_refunds_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_refunds_created_by FOREIGN KEY (created_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_refunds_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS refund_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  refund_id BIGINT UNSIGNED NOT NULL,
  previous_status VARCHAR(40) NULL,
  new_status VARCHAR(40) NOT NULL,
  transaction_reference VARCHAR(120) NULL,
  note VARCHAR(2000) NULL,
  changed_by BIGINT UNSIGNED NOT NULL,
  processed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_refund_history_refund_created (refund_id, created_at),
  CONSTRAINT fk_refund_history_refund FOREIGN KEY (refund_id) REFERENCES refunds (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_refund_history_user FOREIGN KEY (changed_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
