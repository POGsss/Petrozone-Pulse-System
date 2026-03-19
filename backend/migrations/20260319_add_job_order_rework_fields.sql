-- Add rework/backorder support on job_orders.
-- Rework jobs are separate job orders linked to a completed original.

ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS job_type text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS reference_job_order_id uuid NULL,
  ADD COLUMN IF NOT EXISTS rework_reason text NULL,
  ADD COLUMN IF NOT EXISTS is_free_rework boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_orders_reference_job_order_id_fkey'
      AND conrelid = 'public.job_orders'::regclass
  ) THEN
    ALTER TABLE public.job_orders
      ADD CONSTRAINT job_orders_reference_job_order_id_fkey
      FOREIGN KEY (reference_job_order_id)
      REFERENCES public.job_orders(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_orders_job_type_check'
      AND conrelid = 'public.job_orders'::regclass
  ) THEN
    ALTER TABLE public.job_orders
      ADD CONSTRAINT job_orders_job_type_check
      CHECK (job_type IN ('normal', 'backorder'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_orders_reference_job_order_id
  ON public.job_orders(reference_job_order_id);

CREATE INDEX IF NOT EXISTS idx_job_orders_job_type
  ON public.job_orders(job_type);
