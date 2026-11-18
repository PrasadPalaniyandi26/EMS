-- Indexes on foreign keys that the billing, approval-chain, recurring and costing queries filter on
-- CreateIndex
CREATE INDEX "bom_operations_operation_type_id_idx" ON "bom_operations"("operation_type_id");

-- CreateIndex
CREATE INDEX "client_pos_project_id_idx" ON "client_pos"("project_id");

-- CreateIndex
CREATE INDEX "client_pos_build_order_id_idx" ON "client_pos"("build_order_id");

-- CreateIndex
CREATE INDEX "invoices_po_id_idx" ON "invoices"("po_id");

-- CreateIndex
CREATE INDEX "invoices_project_id_idx" ON "invoices"("project_id");

-- CreateIndex
CREATE INDEX "invoices_build_order_id_idx" ON "invoices"("build_order_id");

-- CreateIndex
CREATE INDEX "part_replacements_successor_id_idx" ON "part_replacements"("successor_id");

-- CreateIndex
CREATE INDEX "transaction_splits_project_id_idx" ON "transaction_splits"("project_id");

-- CreateIndex
CREATE INDEX "transaction_splits_product_id_idx" ON "transaction_splits"("product_id");

-- CreateIndex
CREATE INDEX "transactions_recurring_transaction_id_idx" ON "transactions"("recurring_transaction_id");

-- CreateIndex
CREATE INDEX "users_manager_id_idx" ON "users"("manager_id");

