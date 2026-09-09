-- A17 product bulk import: allow 'bulk_import' as an inventory-adjustment reason.
-- Only the import-commit path (POST /api/admin/products/import/commit) writes this
-- reason; POST /api/admin/inventory/adjustments still rejects it (malli enum
-- unchanged). migratus runs one statement per --;; block.
alter table inventory_adjustments drop constraint inventory_adjustments_reason_check;
--;;
alter table inventory_adjustments add constraint inventory_adjustments_reason_check
  check (reason in ('restock','correction','damage','return_to_stock','bulk_import'));
