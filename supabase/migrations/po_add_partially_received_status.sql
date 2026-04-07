DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'purchase_order_status'
      AND e.enumlabel = 'partially_received'
  ) THEN
    ALTER TYPE public.purchase_order_status ADD VALUE 'partially_received' AFTER 'approved';
  END IF;
END $$;