-- =========================================================================
-- EM Budget: CRITICAL Security Fix — Restrict vault table access
-- The vault table stores the session_secret used by HMAC verification.
-- anon and authenticated roles must NOT have access to this table.
-- Applied: 2026-09-04 via security audit
-- =========================================================================

-- Revoke all privileges from anon and authenticated on vault
REVOKE ALL ON TABLE public.vault FROM anon;
REVOKE ALL ON TABLE public.vault FROM authenticated;

-- Drop the permissive policy that allowed full access to {public}
DROP POLICY IF EXISTS "vault_service_role_all" ON public.vault;

-- Verify: only postgres and service_role should have access
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'vault'
ORDER BY grantee, privilege_type;
