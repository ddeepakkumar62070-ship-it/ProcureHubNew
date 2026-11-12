CREATE TABLE IF NOT EXISTS return_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purchase_order_id BIGINT UNSIGNED NOT NULL,
  requested_by BIGINT UNSIGNED NOT NULL,
  status ENUM('RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_COMPLETED')
    NOT NULL DEFAULT 'RETURN_REQUESTED',
  reason VARCHAR(120) NOT NULL,
  description TEXT NULL,
  decision_by BIGINT UNSIGNED NULL,
  decision_explanation VARCHAR(2000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_return_requests_order_status (purchase_order_id, status),
  KEY idx_return_requests_requester_created (requested_by, created_at),
  CONSTRAINT fk_return_requests_order FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_return_requests_requester FOREIGN KEY (requested_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_return_requests_decision_by FOREIGN KEY (decision_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS return_request_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  return_request_id BIGINT UNSIGNED NOT NULL,
  order_item_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_return_request_item (return_request_id, order_item_id),
  KEY idx_return_item_order_item (order_item_id),
  CONSTRAINT chk_return_item_quantity CHECK (quantity > 0),
  CONSTRAINT fk_return_items_request FOREIGN KEY (return_request_id) REFERENCES return_requests (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_return_items_order_item FOREIGN KEY (order_item_id) REFERENCES order_items (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS return_request_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  return_request_id BIGINT UNSIGNED NOT NULL,
  previous_status VARCHAR(40) NULL,
  new_status VARCHAR(40) NOT NULL,
  changed_by BIGINT UNSIGNED NOT NULL,
  note VARCHAR(2000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_return_history_request_created (return_request_id, created_at),
  CONSTRAINT fk_return_history_request FOREIGN KEY (return_request_id) REFERENCES return_requests (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_return_history_user FOREIGN KEY (changed_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS complaints (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  complainant_id BIGINT UNSIGNED NOT NULL,
  respondent_id BIGINT UNSIGNED NULL,
  purchase_order_id BIGINT UNSIGNED NULL,
  category VARCHAR(60) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  status ENUM('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_complaints_complainant_created (complainant_id, created_at),
  KEY idx_complaints_respondent_status (respondent_id, status),
  KEY idx_complaints_order (purchase_order_id),
  CONSTRAINT fk_complaints_complainant FOREIGN KEY (complainant_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_complaints_respondent FOREIGN KEY (respondent_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_complaints_order FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS complaint_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  complaint_id BIGINT UNSIGNED NOT NULL,
  action ENUM('STATUS', 'RESPONSE') NOT NULL,
  status VARCHAR(40) NOT NULL,
  response TEXT NULL,
  action_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_complaint_history_complaint_created (complaint_id, created_at),
  CONSTRAINT fk_complaint_history_complaint FOREIGN KEY (complaint_id) REFERENCES complaints (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_complaint_history_user FOREIGN KEY (action_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
