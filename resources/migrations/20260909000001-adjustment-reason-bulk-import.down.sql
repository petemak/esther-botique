-- Reverse: restore the original four inventory-adjustment reasons.
alter table inventory_adjustments drop constraint inventory_adjustments_reason_check;
--;;
alter table inventory_adjustments add constraint inventory_adjustments_reason_check
  check (reason in ('restock','correction','damage','return_to_stock'));
