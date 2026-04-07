ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS quantity_received integer DEFAULT 0 NOT NULL;

UPDATE public.purchase_orders po
SET quantity_received = totals.total_received
FROM (
  SELECT
    purchase_order_id,
    COALESCE(SUM(quantity_received), 0)::integer AS total_received
  FROM public.purchase_order_items
  GROUP BY purchase_order_id
) AS totals
WHERE po.id = totals.purchase_order_id;

UPDATE public.purchase_orders
SET quantity_received = 0
WHERE quantity_received IS NULL;

ALTER TABLE public.purchase_orders
  ALTER COLUMN quantity_received SET DEFAULT 0,
  ALTER COLUMN quantity_received SET NOT NULL;

ALTER TABLE public.purchase_orders
  DROP COLUMN IF EXISTS amount_received,
  DROP COLUMN IF EXISTS is_partial_receipt;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_orders_quantity_received_check'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_quantity_received_check
      CHECK (quantity_received >= 0);
  END IF;
END $$;

WITH po_totals AS (
  SELECT
    po.id AS purchase_order_id,
    COALESCE(SUM(poi.quantity_ordered), 0)::integer AS total_ordered,
    COALESCE(SUM(poi.quantity_received), 0)::integer AS total_received
  FROM public.purchase_orders po
  LEFT JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
  GROUP BY po.id
)
UPDATE public.purchase_orders po
SET
  quantity_received = LEAST(GREATEST(po_totals.total_received, 0), GREATEST(po_totals.total_ordered, 0)),
  status = CASE
    WHEN po_totals.total_ordered <= 0 OR po_totals.total_received <= 0 THEN 'approved'::public.purchase_order_status
    WHEN po_totals.total_received >= po_totals.total_ordered THEN 'received'::public.purchase_order_status
    ELSE 'partially_received'::public.purchase_order_status
  END
FROM po_totals
WHERE po.id = po_totals.purchase_order_id
  AND po.status IN ('approved', 'partially_received', 'received');
