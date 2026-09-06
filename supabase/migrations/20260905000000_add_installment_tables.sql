-- =========================================================================
-- EM Budget: Add credit card installment plan tables (2026-09-05)
--
-- Adds support for Sampath Bank Extended Settlement Plan (ESP) installments.
-- Users can convert new credit card purchases into fixed monthly payment
-- plans with Sampath Bank's fee structure:
--   6 months  -> 0% fee (FREE)
--   12 months -> 7.5% fee
--   24 months -> 15% fee
--   48 months -> 30% fee
-- =========================================================================

-- 1. Installment plans table
CREATE TABLE IF NOT EXISTS public.credit_card_installments (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES public.auth_accounts(email) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  purchase_id TEXT NOT NULL,
  original_amount NUMERIC NOT NULL,
  tenure_months INTEGER NOT NULL CHECK (tenure_months IN (6, 12, 24, 48)),
  processing_fee NUMERIC NOT NULL DEFAULT 0,
  monthly_payment NUMERIC NOT NULL,
  start_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  next_payment_date DATE,
  payments_made INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Installment payment schedule table
CREATE TABLE IF NOT EXISTS public.credit_card_installment_payments (
  id TEXT PRIMARY KEY,
  installment_id TEXT NOT NULL REFERENCES public.credit_card_installments(id) ON DELETE CASCADE,
  payment_number INTEGER NOT NULL,
  amount_due NUMERIC NOT NULL,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  paid_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_cc_installments_user_email ON public.credit_card_installments(user_email);
CREATE INDEX IF NOT EXISTS idx_cc_installments_card_id ON public.credit_card_installments(card_id);
CREATE INDEX IF NOT EXISTS idx_cc_installment_payments_installment_id ON public.credit_card_installment_payments(installment_id);
CREATE INDEX IF NOT EXISTS idx_cc_installment_payments_due_date ON public.credit_card_installment_payments(due_date);

-- 4. Enable RLS
ALTER TABLE public.credit_card_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_installment_payments ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies for credit_card_installments (matching bank_cards pattern)
CREATE POLICY "Secure select on cc_installments" ON public.credit_card_installments FOR SELECT
  USING (
    (user_email = verify_user_token((NULLIF(current_setting('request.headers', true), ''))::json))
    OR verify_system_signature((NULLIF(current_setting('request.headers', true), ''))::json)
  );

CREATE POLICY "Secure insert on cc_installments" ON public.credit_card_installments FOR INSERT
  WITH CHECK (
    (user_email = verify_user_token((NULLIF(current_setting('request.headers', true), ''))::json))
    OR verify_system_signature((NULLIF(current_setting('request.headers', true), ''))::json)
  );

CREATE POLICY "Secure update on cc_installments" ON public.credit_card_installments FOR UPDATE
  USING (
    (user_email = verify_user_token((NULLIF(current_setting('request.headers', true), ''))::json))
    OR verify_system_signature((NULLIF(current_setting('request.headers', true), ''))::json)
  );

CREATE POLICY "Secure delete on cc_installments" ON public.credit_card_installments FOR DELETE
  USING (
    (user_email = verify_user_token((NULLIF(current_setting('request.headers', true), ''))::json))
    OR verify_system_signature((NULLIF(current_setting('request.headers', true), ''))::json)
  );

-- 6. RLS policies for credit_card_installment_payments (via parent installments join)
CREATE POLICY "Secure select on cc_installment_payments" ON public.credit_card_installment_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.credit_card_installments ci
      WHERE ci.id = installment_id
        AND (
          (ci.user_email = verify_user_token((NULLIF(current_setting('request.headers', true), ''))::json))
          OR verify_system_signature((NULLIF(current_setting('request.headers', true), ''))::json)
        )
    )
  );

CREATE POLICY "Secure insert on cc_installment_payments" ON public.credit_card_installment_payments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.credit_card_installments ci
      WHERE ci.id = installment_id
        AND (
          (ci.user_email = verify_user_token((NULLIF(current_setting('request.headers', true), ''))::json))
          OR verify_system_signature((NULLIF(current_setting('request.headers', true), ''))::json)
        )
    )
  );

CREATE POLICY "Secure update on cc_installment_payments" ON public.credit_card_installment_payments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.credit_card_installments ci
      WHERE ci.id = installment_id
        AND (
          (ci.user_email = verify_user_token((NULLIF(current_setting('request.headers', true), ''))::json))
          OR verify_system_signature((NULLIF(current_setting('request.headers', true), ''))::json)
        )
    )
  );

CREATE POLICY "Secure delete on cc_installment_payments" ON public.credit_card_installment_payments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.credit_card_installments ci
      WHERE ci.id = installment_id
        AND (
          (ci.user_email = verify_user_token((NULLIF(current_setting('request.headers', true), ''))::json))
          OR verify_system_signature((NULLIF(current_setting('request.headers', true), ''))::json)
        )
    )
  );
