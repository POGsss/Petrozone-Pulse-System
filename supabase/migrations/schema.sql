SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."customer_status" AS ENUM (
    'active',
    'inactive'
);


ALTER TYPE "public"."customer_status" OWNER TO "postgres";


CREATE TYPE "public"."customer_type" AS ENUM (
    'individual',
    'company'
);


ALTER TYPE "public"."customer_type" OWNER TO "postgres";


CREATE TYPE "public"."inventory_item_status" AS ENUM (
    'draft',
    'active',
    'inactive'
);


ALTER TYPE "public"."inventory_item_status" OWNER TO "postgres";


CREATE TYPE "public"."job_order_status" AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'in_progress',
    'ready_for_release',
    'pending_payment',
    'completed',
    'rejected',
    'cancelled',
    'deactivated'
);


ALTER TYPE "public"."job_order_status" OWNER TO "postgres";


CREATE TYPE "public"."labor_vehicle_type" AS ENUM (
    'light',
    'heavy',
    'extra_heavy'
);


ALTER TYPE "public"."labor_vehicle_type" OWNER TO "postgres";


CREATE TYPE "public"."pricing_matrix_status" AS ENUM (
    'active',
    'inactive'
);


ALTER TYPE "public"."pricing_matrix_status" OWNER TO "postgres";


CREATE TYPE "public"."pricing_type" AS ENUM (
    'labor',
    'packaging'
);


ALTER TYPE "public"."pricing_type" OWNER TO "postgres";


CREATE TYPE "public"."purchase_order_status" AS ENUM (
    'draft',
    'submitted',
    'approved',
    'received',
    'cancelled',
    'deactivated'
);


ALTER TYPE "public"."purchase_order_status" OWNER TO "postgres";


CREATE TYPE "public"."report_type" AS ENUM (
    'sales',
    'inventory',
    'job_order',
    'staff_performance'
);


ALTER TYPE "public"."report_type" OWNER TO "postgres";


CREATE TYPE "public"."staff_metric_type" AS ENUM (
    'jobs_completed',
    'avg_completion_time',
    'revenue_generated',
    'on_time_completion_rate'
);


ALTER TYPE "public"."staff_metric_type" OWNER TO "postgres";


CREATE TYPE "public"."stock_movement_type" AS ENUM (
    'stock_in',
    'stock_out',
    'adjustment'
);


ALTER TYPE "public"."stock_movement_type" OWNER TO "postgres";


CREATE TYPE "public"."stock_reference_type" AS ENUM (
    'purchase_order',
    'job_order',
    'adjustment'
);


ALTER TYPE "public"."stock_reference_type" OWNER TO "postgres";


CREATE TYPE "public"."supplier_product_status" AS ENUM (
    'active',
    'inactive'
);


ALTER TYPE "public"."supplier_product_status" OWNER TO "postgres";


CREATE TYPE "public"."supplier_status" AS ENUM (
    'active',
    'inactive'
);


ALTER TYPE "public"."supplier_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'HM',
    'POC',
    'JS',
    'R',
    'T',
    'ADMIN'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."vehicle_status" AS ENUM (
    'active',
    'inactive'
);


ALTER TYPE "public"."vehicle_status" OWNER TO "postgres";


CREATE TYPE "public"."vehicle_type" AS ENUM (
    'sedan',
    'suv',
    'truck',
    'van',
    'motorcycle',
    'hatchback',
    'coupe',
    'wagon',
    'bus',
    'other'
);


ALTER TYPE "public"."vehicle_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_branches_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_audit_log(
      'CREATE',
      'branch',
      NEW.id,
      NULL,
      to_jsonb(NEW),
      NEW.id
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.create_audit_log(
      'UPDATE',
      'branch',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      NEW.id
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Skip trigger logging for DELETE; backend handles audit via rpc('log_admin_action')
    -- This prevents duplicate audit entries
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."audit_branches_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_customer_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_action varchar;
  v_old_values jsonb;
  v_new_values jsonb;
  v_branch_id uuid;
  v_entity_id uuid;
  v_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_new_values := to_jsonb(NEW);
    v_branch_id := NEW.branch_id;
    v_entity_id := NEW.id;
    v_user_id := NEW.created_by;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
    v_branch_id := NEW.branch_id;
    v_entity_id := NEW.id;
    v_user_id := NEW.created_by;
  ELSIF TG_OP = 'DELETE' THEN
    -- Skip trigger logging for DELETE; backend handles audit via rpc('log_admin_action')
    -- This prevents wrong user_id (created_by vs actual deleting user)
    RETURN OLD;
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, old_values, new_values, branch_id, user_id)
  VALUES (v_action, 'CUSTOMER', v_entity_id, v_old_values, v_new_values, v_branch_id, v_user_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_customer_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_job_order_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_action varchar;
  v_old_values jsonb;
  v_new_values jsonb;
  v_branch_id uuid;
  v_entity_id uuid;
  v_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_new_values := to_jsonb(NEW);
    v_branch_id := NEW.branch_id;
    v_entity_id := NEW.id;
    v_user_id := NEW.created_by;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Skip trigger logging for UPDATE; backend handles audit via rpc('log_admin_action')
    -- This prevents duplicate entries for request-approval, approve, reject, cancel, soft-delete
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Skip trigger logging for DELETE; backend handles audit via rpc('log_admin_action')
    RETURN OLD;
  END IF;

  INSERT INTO public.audit_logs (
    action, entity_type, entity_id, old_values, new_values, branch_id, user_id
  ) VALUES (
    v_action, 'JOB_ORDER', v_entity_id, v_old_values, v_new_values, v_branch_id, v_user_id
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_job_order_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_package_item_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_action varchar;
  v_old_values jsonb;
  v_new_values jsonb;
  v_entity_id uuid;
  v_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_new_values := to_jsonb(NEW);
    v_entity_id := NEW.id;
    v_user_id := NEW.created_by;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
    v_entity_id := NEW.id;
    v_user_id := NEW.created_by;
  ELSIF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, old_values, new_values, user_id)
  VALUES (v_action, 'PACKAGE_ITEM', v_entity_id, v_old_values, v_new_values, v_user_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_package_item_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_pricing_matrix_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_action varchar;
  v_old_values jsonb;
  v_new_values jsonb;
  v_entity_id uuid;
  v_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_new_values := to_jsonb(NEW);
    v_entity_id := NEW.id;
    v_user_id := NEW.created_by;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
    v_entity_id := NEW.id;
    v_user_id := NEW.created_by;
  ELSIF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, old_values, new_values, user_id)
  VALUES (v_action, 'PRICING_MATRIX', v_entity_id, v_old_values, v_new_values, v_user_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_pricing_matrix_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_purchase_order_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, branch_id, new_values, status)
    VALUES ('CREATE', 'PURCHASE_ORDER', NEW.id, NEW.branch_id,
            jsonb_build_object('po_number', NEW.po_number, 'status', NEW.status, 'total_amount', NEW.total_amount),
            'SUCCESS');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Skip trigger logging for UPDATE; backend handles audit via rpc('log_admin_action')
    -- This prevents duplicate audit entries for submit, receive, cancel, and soft-delete operations
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."audit_purchase_order_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_supplier_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_action varchar;
  v_old_values jsonb;
  v_new_values jsonb;
  v_branch_id uuid;
  v_entity_id uuid;
  v_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_new_values := to_jsonb(NEW);
    v_branch_id := NEW.branch_id;
    v_entity_id := NEW.id;
    v_user_id := NEW.created_by;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
    v_branch_id := NEW.branch_id;
    v_entity_id := NEW.id;
    v_user_id := NEW.created_by;
  ELSIF TG_OP = 'DELETE' THEN
    -- Skip trigger logging for DELETE; backend handles audit via rpc('log_admin_action')
    RETURN OLD;
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, old_values, new_values, branch_id, user_id)
  VALUES (v_action, 'SUPPLIER', v_entity_id, v_old_values, v_new_values, v_branch_id, v_user_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_supplier_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_third_party_repair_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_action varchar;
  v_old_values jsonb;
  v_new_values jsonb;
  v_branch_id uuid;
  v_entity_id uuid;
  v_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_new_values := to_jsonb(NEW);
    v_entity_id := NEW.id;
    v_user_id := NEW.created_by;
    SELECT branch_id INTO v_branch_id FROM public.job_orders WHERE id = NEW.job_order_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Skip trigger logging for UPDATE; backend handles audit via rpc('log_admin_action')
    -- This prevents duplicate entries for edits and soft-deletes
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Skip trigger logging for DELETE; backend handles audit via rpc('log_admin_action')
    RETURN OLD;
  END IF;

  INSERT INTO public.audit_logs (
    action, entity_type, entity_id, old_values, new_values, branch_id, user_id
  ) VALUES (
    v_action, 'THIRD_PARTY_REPAIR', v_entity_id, v_old_values, v_new_values, v_branch_id, v_user_id
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_third_party_repair_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_user_branch_assignments_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_audit_log(
      'ASSIGN_BRANCH',
      'user_branch_assignment',
      NEW.id,
      NULL,
      to_jsonb(NEW),
      NEW.branch_id
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.create_audit_log(
      'UPDATE_BRANCH_ASSIGNMENT',
      'user_branch_assignment',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      NEW.branch_id
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.create_audit_log(
      'REMOVE_BRANCH',
      'user_branch_assignment',
      OLD.id,
      to_jsonb(OLD),
      NULL,
      OLD.branch_id
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."audit_user_branch_assignments_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_user_profiles_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_branch_id UUID;
  v_user_id UUID;
BEGIN
  -- Get the user being operated on
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.id;
  ELSE
    v_user_id := NEW.id;
  END IF;
  
  -- Get the primary branch for this user
  SELECT branch_id INTO v_branch_id
  FROM public.user_branch_assignments
  WHERE user_id = v_user_id AND is_primary = true
  LIMIT 1;
  
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, branch_id)
    VALUES (COALESCE(auth.uid(), NEW.id), 'CREATE', 'user_profile', NEW.id, NULL, to_jsonb(NEW), v_branch_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, branch_id)
    VALUES (COALESCE(auth.uid(), NEW.id), 'UPDATE', 'user_profile', NEW.id, to_jsonb(OLD), to_jsonb(NEW), v_branch_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, branch_id)
    VALUES (COALESCE(auth.uid(), OLD.id), 'DELETE', 'user_profile', OLD.id, to_jsonb(OLD), NULL, v_branch_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."audit_user_profiles_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_user_roles_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_audit_log(
      'ASSIGN_ROLE',
      'user_role',
      NEW.id,
      NULL,
      to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.create_audit_log(
      'REMOVE_ROLE',
      'user_role',
      OLD.id,
      to_jsonb(OLD),
      NULL
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."audit_user_roles_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_vehicle_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_action varchar;
  v_old_values jsonb;
  v_new_values jsonb;
  v_branch_id uuid;
  v_entity_id uuid;
  v_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_new_values := to_jsonb(NEW);
    v_branch_id := NEW.branch_id;
    v_entity_id := NEW.id;
    v_user_id := NEW.created_by;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
    v_branch_id := NEW.branch_id;
    v_entity_id := NEW.id;
    v_user_id := NEW.created_by;
  ELSIF TG_OP = 'DELETE' THEN
    -- Skip trigger logging for DELETE; backend handles audit via rpc('log_admin_action')
    RETURN OLD;
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, old_values, new_values, branch_id, user_id)
  VALUES (v_action, 'VEHICLE', v_entity_id, v_old_values, v_new_values, v_branch_id, v_user_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_vehicle_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_audit_log"("p_action" character varying, "p_entity_type" character varying, "p_entity_id" "uuid", "p_old_values" "jsonb" DEFAULT NULL::"jsonb", "p_new_values" "jsonb" DEFAULT NULL::"jsonb", "p_branch_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  new_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, branch_id)
  VALUES (v_user_id, p_action, p_entity_type, p_entity_id, p_old_values, p_new_values, p_branch_id)
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$;


ALTER FUNCTION "public"."create_audit_log"("p_action" character varying, "p_entity_type" character varying, "p_entity_id" "uuid", "p_old_values" "jsonb", "p_new_values" "jsonb", "p_branch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_has_role"("check_role" "public"."user_role") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN public.user_has_role(auth.uid(), check_role);
END;
$$;


ALTER FUNCTION "public"."current_user_has_role"("check_role" "public"."user_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_order_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  new_num text;
  attempts integer := 0;
BEGIN
  LOOP
    -- Generate random 6-char uppercase hex (000000–FFFFFF)
    new_num := upper(lpad(to_hex(floor(random() * 16777216)::int), 6, '0'));
    
    -- Check uniqueness
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.job_orders WHERE order_number = new_num
    );
    
    attempts := attempts + 1;
    IF attempts > 100 THEN
      RAISE EXCEPTION 'Could not generate unique order number after 100 attempts';
    END IF;
  END LOOP;
  
  NEW.order_number := new_num;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_order_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_po_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  branch_code text;
  generated_suffix text;
  candidate_po text;
  attempts integer := 0;
  exists_po boolean;
begin
  if new.po_number is not null and btrim(new.po_number) <> '' then
    return new;
  end if;

  select code into branch_code
  from public.branches
  where id = new.branch_id;

  branch_code := regexp_replace(upper(coalesce(branch_code, 'XX')), '[^A-Z0-9]', '', 'g');
  if branch_code = '' then
    branch_code := 'XX';
  end if;

  loop
    attempts := attempts + 1;
    generated_suffix := lpad(floor(random() * 1000000)::bigint::text, 6, '0');
    candidate_po := 'PO-' || branch_code || '-' || generated_suffix;

    select exists (
      select 1
      from public.purchase_orders
      where branch_id = new.branch_id
        and po_number = candidate_po
        and is_deleted = false
    ) into exists_po;

    exit when not exists_po;

    if attempts >= 25 then
      candidate_po := 'PO-' || branch_code || '-' || lpad((extract(epoch from clock_timestamp())::bigint % 1000000)::text, 6, '0');
      exit;
    end if;
  end loop;

  new.po_number := candidate_po;
  return new;
end;
$$;


ALTER FUNCTION "public"."generate_po_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN auth.uid();
END;
$$;


ALTER FUNCTION "public"."get_current_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_role_level"("role" "public"."user_role") RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
  CASE role
    WHEN 'HM' THEN RETURN 5;
    WHEN 'POC' THEN RETURN 4;
    WHEN 'JS' THEN RETURN 3;
    WHEN 'R' THEN RETURN 2;
    WHEN 'T' THEN RETURN 1;
    ELSE RETURN 0;
  END CASE;
END;
$$;


ALTER FUNCTION "public"."get_role_level"("role" "public"."user_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_branch_ids"("check_user_id" "uuid") RETURNS "uuid"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  branch_ids UUID[];
BEGIN
  -- Admins and HM get all branch IDs
  IF public.user_has_role(check_user_id, 'ADMIN') OR public.user_has_role(check_user_id, 'HM') THEN
    SELECT ARRAY_AGG(id) INTO branch_ids FROM public.branches WHERE is_active = true;
  ELSE
    SELECT ARRAY_AGG(branch_id) INTO branch_ids 
    FROM public.user_branch_assignments 
    WHERE user_id = check_user_id;
  END IF;
  
  RETURN COALESCE(branch_ids, ARRAY[]::UUID[]);
END;
$$;


ALTER FUNCTION "public"."get_user_branch_ids"("check_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_full_data"("p_user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    result json;
BEGIN
    SELECT json_build_object(
        'profile', (
            SELECT row_to_json(up.*)
            FROM user_profiles up
            WHERE up.id = p_user_id
        ),
        'roles', COALESCE(
            (SELECT json_agg(ur.role)
             FROM user_roles ur
             WHERE ur.user_id = p_user_id),
            '[]'::json
        ),
        'branches', COALESCE(
            (SELECT json_agg(json_build_object(
                'branch_id', uba.branch_id,
                'is_primary', uba.is_primary,
                'branches', row_to_json(b.*)
             ))
             FROM user_branch_assignments uba
             JOIN branches b ON b.id = uba.branch_id
             WHERE uba.user_id = p_user_id),
            '[]'::json
        )
    ) INTO result;
    
    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_user_full_data"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_max_role_level"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  max_level INTEGER;
BEGIN
  SELECT COALESCE(MAX(get_role_level(role)), 0)
  INTO max_level
  FROM user_roles
  WHERE user_id = p_user_id;
  
  RETURN max_level;
END;
$$;


ALTER FUNCTION "public"."get_user_max_role_level"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_roles"("user_uuid" "uuid") RETURNS "text"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(
    array_agg(role::text),
    ARRAY[]::text[]
  )
  FROM public.user_roles
  WHERE user_id = user_uuid;
$$;


ALTER FUNCTION "public"."get_user_roles"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_initial_stock_movement_for_inventory"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_status public.inventory_item_status;
BEGIN
  IF NEW.reason ILIKE 'Initial stock%' THEN
    SELECT status INTO v_status
    FROM public.inventory_items
    WHERE id = NEW.inventory_item_id;

    IF v_status IS NULL THEN
      RAISE EXCEPTION 'Inventory item not found for initial stock movement';
    END IF;

    IF v_status <> 'active' THEN
      RAISE EXCEPTION 'Initial stock movement is only allowed when inventory item is active';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_initial_stock_movement_for_inventory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_or_hm"("check_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN public.user_has_role(check_user_id, 'ADMIN') OR public.user_has_role(check_user_id, 'HM');
END;
$$;


ALTER FUNCTION "public"."is_admin_or_hm"("check_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_audit_viewer"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = is_audit_viewer.user_id 
    AND role IN ('HM', 'POC', 'ADMIN')
  );
END;
$$;


ALTER FUNCTION "public"."is_audit_viewer"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_branch_manager"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = is_branch_manager.user_id 
    AND role IN ('HM', 'POC', 'JS', 'R', 'ADMIN')
  );
END;
$$;


ALTER FUNCTION "public"."is_branch_manager"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_manager"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = is_user_manager.user_id 
    AND role IN ('HM', 'POC', 'JS', 'ADMIN')
  );
END;
$$;


ALTER FUNCTION "public"."is_user_manager"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_vehicle_manager"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = is_vehicle_manager.user_id
    AND role IN ('HM', 'POC', 'JS', 'R')
  );
END;
$$;


ALTER FUNCTION "public"."is_vehicle_manager"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_admin_action"("p_action" character varying, "p_entity_type" character varying, "p_entity_id" "uuid", "p_performed_by_user_id" "uuid", "p_performed_by_branch_id" "uuid", "p_old_values" "jsonb" DEFAULT NULL::"jsonb", "p_new_values" "jsonb" DEFAULT NULL::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, branch_id, old_values, new_values)
  VALUES (p_performed_by_user_id, p_action, p_entity_type, p_entity_id, p_performed_by_branch_id, p_old_values, p_new_values)
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$;


ALTER FUNCTION "public"."log_admin_action"("p_action" character varying, "p_entity_type" character varying, "p_entity_id" "uuid", "p_performed_by_user_id" "uuid", "p_performed_by_branch_id" "uuid", "p_old_values" "jsonb", "p_new_values" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_auth_event"("p_user_id" "uuid", "p_event_type" "text", "p_branch_id" "uuid" DEFAULT NULL::"uuid", "p_status" "text" DEFAULT 'SUCCESS'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  new_id UUID;
  v_branch_id UUID;
BEGIN
  IF p_branch_id IS NULL THEN
    SELECT branch_id INTO v_branch_id
    FROM public.user_branch_assignments
    WHERE user_id = p_user_id AND is_primary = true
    LIMIT 1;
  ELSE
    v_branch_id := p_branch_id;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, branch_id, status)
  VALUES (COALESCE(p_user_id, auth.uid()), p_event_type, 'AUTH', COALESCE(p_user_id, auth.uid()), v_branch_id, p_status)
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$;


ALTER FUNCTION "public"."log_auth_event"("p_user_id" "uuid", "p_event_type" "text", "p_branch_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_inventory_item_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, branch_id, new_values)
    VALUES ('CREATE', 'INVENTORY_ITEM', NEW.id, NEW.branch_id,
      jsonb_build_object(
        'item_name', NEW.item_name,
        'sku_code', NEW.sku_code,
        'category', NEW.category,
        'branch_id', NEW.branch_id
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, branch_id, old_values, new_values)
    VALUES ('UPDATE', 'INVENTORY_ITEM', NEW.id, NEW.branch_id,
      jsonb_build_object(
        'item_name', OLD.item_name,
        'sku_code', OLD.sku_code,
        'status', OLD.status::TEXT
      ),
      jsonb_build_object(
        'item_name', NEW.item_name,
        'sku_code', NEW.sku_code,
        'status', NEW.status::TEXT
      )
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."log_inventory_item_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_audit_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, user_id, branch_id, new_values, status)
    VALUES ('CREATE', 'NOTIFICATION', NEW.id, NEW.created_by, NEW.branch_id,
      jsonb_build_object('title', NEW.title, 'target_type', NEW.target_type, 'target_value', NEW.target_value, 'status', NEW.status),
      'SUCCESS');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, user_id, branch_id, old_values, new_values, status)
    VALUES ('UPDATE', 'NOTIFICATION', NEW.id, NEW.created_by, NEW.branch_id,
      jsonb_build_object('title', OLD.title, 'message', OLD.message, 'status', OLD.status),
      jsonb_build_object('title', NEW.title, 'message', NEW.message, 'status', NEW.status),
      'SUCCESS');
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."trg_audit_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_audit_service_reminders"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, user_id, branch_id, new_values, status)
    VALUES ('CREATE', 'SERVICE_REMINDER', NEW.id, NEW.created_by, NEW.branch_id,
      jsonb_build_object('service_type', NEW.service_type, 'customer_id', NEW.customer_id, 'vehicle_id', NEW.vehicle_id, 'status', NEW.status),
      'SUCCESS');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, user_id, branch_id, old_values, new_values, status)
    VALUES ('UPDATE', 'SERVICE_REMINDER', NEW.id, NEW.created_by, NEW.branch_id,
      jsonb_build_object('status', OLD.status, 'service_type', OLD.service_type),
      jsonb_build_object('status', NEW.status, 'service_type', NEW.service_type),
      'SUCCESS');
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."trg_audit_service_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_customers_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_customers_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_inventory_items_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_inventory_items_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_notifications_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_notifications_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_staff_performance_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_staff_performance_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_supplier_products_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_supplier_products_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_branches"("p_user_id" "uuid", "p_branch_ids" "uuid"[], "p_primary_branch_id" "uuid" DEFAULT NULL::"uuid", "p_calling_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_calling_user_id UUID;
  v_has_permission BOOLEAN;
  v_branch_id UUID;
  v_idx INT;
BEGIN
  -- Get the calling user's ID
  v_calling_user_id := COALESCE(p_calling_user_id, auth.uid());
  
  -- Check if calling user has permission (HM, POC, or JS) BEFORE making any changes
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = v_calling_user_id 
    AND role IN ('HM', 'ADMIN', 'POC', 'JS')
  ) INTO v_has_permission;
  
  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Insufficient permissions: Only HM, POC, or JS can update branch assignments';
  END IF;
  
  -- Delete existing branch assignments
  DELETE FROM user_branch_assignments WHERE user_id = p_user_id;
  
  -- Insert new branch assignments
  IF p_branch_ids IS NOT NULL AND array_length(p_branch_ids, 1) > 0 THEN
    FOR v_idx IN 1..array_length(p_branch_ids, 1) LOOP
      v_branch_id := p_branch_ids[v_idx];
      INSERT INTO user_branch_assignments (user_id, branch_id, is_primary)
      VALUES (
        p_user_id, 
        v_branch_id, 
        CASE 
          WHEN p_primary_branch_id IS NOT NULL THEN v_branch_id = p_primary_branch_id
          ELSE v_idx = 1
        END
      );
    END LOOP;
  END IF;
  
  RETURN jsonb_build_object('success', true, 'branch_ids', to_jsonb(p_branch_ids));
END;
$$;


ALTER FUNCTION "public"."update_user_branches"("p_user_id" "uuid", "p_branch_ids" "uuid"[], "p_primary_branch_id" "uuid", "p_calling_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_roles"("p_user_id" "uuid", "p_roles" "public"."user_role"[], "p_calling_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_calling_user_id UUID;
  v_caller_level INTEGER;
  v_target_current_level INTEGER;
  v_target_new_level INTEGER;
  v_requested_role user_role;
  v_other_hm_count INT;
  v_target_has_hm BOOLEAN;
  v_new_roles_has_hm BOOLEAN;
BEGIN
  -- Get the calling user's ID
  v_calling_user_id := COALESCE(p_calling_user_id, auth.uid());
  
  -- Get caller's highest role level
  v_caller_level := get_user_max_role_level(v_calling_user_id);
  
  -- Must be at least JS (level 3) to update roles
  IF v_caller_level < 3 THEN
    RAISE EXCEPTION 'Insufficient permissions: Only HM, POC, or JS can update roles';
  END IF;
  
  -- Validate at least one role
  IF array_length(p_roles, 1) IS NULL OR array_length(p_roles, 1) = 0 THEN
    RAISE EXCEPTION 'User must have at least one role';
  END IF;
  
  -- Get target user's current highest role level
  v_target_current_level := get_user_max_role_level(p_user_id);
  
  -- Can only modify users at same level or below
  IF v_target_current_level > v_caller_level THEN
    RAISE EXCEPTION 'Cannot modify a user with a higher role than yours';
  END IF;
  
  -- Calculate new maximum role level from requested roles
  SELECT COALESCE(MAX(get_role_level(r)), 0)
  INTO v_target_new_level
  FROM unnest(p_roles) AS r;
  
  -- Cannot assign roles higher than your own level
  IF v_target_new_level > v_caller_level THEN
    RAISE EXCEPTION 'Cannot assign a role higher than your own';
  END IF;
  
  -- Check each role being assigned doesn't exceed caller's level
  FOREACH v_requested_role IN ARRAY p_roles LOOP
    IF get_role_level(v_requested_role) > v_caller_level THEN
      RAISE EXCEPTION 'Cannot assign role % - it is higher than your permission level', v_requested_role;
    END IF;
  END LOOP;
  
  -- Check if target user currently has HM role
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = p_user_id 
    AND role = 'HM'
  ) INTO v_target_has_hm;
  
  -- Check if new roles include HM
  v_new_roles_has_hm := 'HM' = ANY(p_roles);
  
  -- If removing HM role from a user, check there's at least one other HM
  IF v_target_has_hm AND NOT v_new_roles_has_hm THEN
    SELECT COUNT(*) INTO v_other_hm_count
    FROM user_roles 
    WHERE role = 'HM' 
    AND user_id != p_user_id;
    
    IF v_other_hm_count = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last HM role. The system must have at least one Higher Management user.';
    END IF;
  END IF;
  
  -- Perform the update atomically
  DELETE FROM user_roles WHERE user_id = p_user_id;
  
  INSERT INTO user_roles (user_id, role)
  SELECT p_user_id, unnest(p_roles);
  
  RETURN jsonb_build_object('success', true, 'roles', to_jsonb(p_roles));
END;
$$;


ALTER FUNCTION "public"."update_user_roles"("p_user_id" "uuid", "p_roles" "public"."user_role"[], "p_calling_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_branch_access"("check_user_id" "uuid", "check_branch_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Admins and HM have access to all branches
  IF public.user_has_role(check_user_id, 'ADMIN') OR public.user_has_role(check_user_id, 'HM') THEN
    RETURN TRUE;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM public.user_branch_assignments
    WHERE user_id = check_user_id AND branch_id = check_branch_id
  );
END;
$$;


ALTER FUNCTION "public"."user_has_branch_access"("check_user_id" "uuid", "check_branch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_role"("check_user_id" "uuid", "check_role" "public"."user_role") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = check_user_id AND role = check_role
  );
END;
$$;


ALTER FUNCTION "public"."user_has_role"("check_user_id" "uuid", "check_role" "public"."user_role") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "action" character varying(100) NOT NULL,
    "entity_type" character varying(100) NOT NULL,
    "entity_id" "uuid",
    "old_values" "jsonb",
    "new_values" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "branch_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" character varying(20) DEFAULT 'SUCCESS'::character varying
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."branches" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "code" character varying(50) NOT NULL,
    "address" "text",
    "phone" character varying(50),
    "email" character varying(255),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."branches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "full_name" character varying(255) NOT NULL,
    "contact_number" character varying(20),
    "email" character varying(255),
    "customer_type" "public"."customer_type" DEFAULT 'individual'::"public"."customer_type" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "status" "public"."customer_status" DEFAULT 'active'::"public"."customer_status" NOT NULL,
    "address" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customers_contact_required" CHECK (((("contact_number" IS NOT NULL) AND (("contact_number")::"text" <> ''::"text")) OR (("email" IS NOT NULL) AND (("email")::"text" <> ''::"text"))))
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_name" "text" NOT NULL,
    "sku_code" "text" NOT NULL,
    "category" "text" NOT NULL,
    "unit_of_measure" "text" NOT NULL,
    "cost_price" numeric(12,2) NOT NULL,
    "reorder_threshold" integer DEFAULT 0 NOT NULL,
    "status" "public"."inventory_item_status" DEFAULT 'draft'::"public"."inventory_item_status" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approval_status" "text" DEFAULT 'DRAFT'::"text",
    "approval_requested_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "initial_stock_pending" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "inventory_items_cost_price_check" CHECK (("cost_price" >= (0)::numeric)),
    CONSTRAINT "inventory_items_reorder_threshold_check" CHECK (("reorder_threshold" >= 0))
);


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."inventory_on_hand" AS
SELECT
    NULL::"uuid" AS "inventory_item_id",
    NULL::"text" AS "item_name",
    NULL::"text" AS "sku_code",
    NULL::"text" AS "category",
    NULL::"text" AS "unit_of_measure",
    NULL::numeric(12,2) AS "cost_price",
    NULL::integer AS "reorder_threshold",
    NULL::"public"."inventory_item_status" AS "status",
    NULL::"uuid" AS "branch_id",
    NULL::"uuid" AS "created_by",
    NULL::timestamp with time zone AS "created_at",
    NULL::timestamp with time zone AS "updated_at",
    NULL::bigint AS "current_quantity";


ALTER VIEW "public"."inventory_on_hand" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_order_item_inventories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_order_item_id" "uuid" NOT NULL,
    "inventory_item_id" "uuid" NOT NULL,
    "inventory_item_name" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "unit_cost" numeric NOT NULL,
    "line_total" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "job_order_item_inventories_line_total_check" CHECK (("line_total" >= (0)::numeric)),
    CONSTRAINT "job_order_item_inventories_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "job_order_item_inventories_unit_cost_check" CHECK (("unit_cost" >= (0)::numeric))
);


ALTER TABLE "public"."job_order_item_inventories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_order_id" "uuid" NOT NULL,
    "package_item_id" "uuid" NOT NULL,
    "package_item_name" "text" NOT NULL,
    "package_item_type" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "labor_price" numeric(12,2),
    "line_total" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inventory_cost" numeric DEFAULT 0,
    "labor_item_id" "uuid",
    CONSTRAINT "job_order_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."job_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_order_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_order_id" "uuid" NOT NULL,
    "line_type" "text" NOT NULL,
    "reference_id" "uuid",
    "name" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "total" numeric(12,2) DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "job_order_lines_line_type_check" CHECK (("line_type" = ANY (ARRAY['labor'::"text", 'package'::"text", 'inventory'::"text"]))),
    CONSTRAINT "job_order_lines_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "job_order_lines_total_check" CHECK (("total" >= (0)::numeric)),
    CONSTRAINT "job_order_lines_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."job_order_lines" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."job_order_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."job_order_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" "text" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "status" "public"."job_order_status" DEFAULT 'draft'::"public"."job_order_status" NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "approval_notes" "text",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "vehicle_class" "text" DEFAULT 'light'::"text" NOT NULL,
    "start_time" timestamp with time zone,
    "completion_time" timestamp with time zone,
    "approval_requested_at" timestamp with time zone,
    "assigned_technician_id" "uuid",
    "cancellation_reason" "text",
    "rejection_reason" "text",
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "approval_status" "text",
    "approval_method" "text",
    "payment_recorded_at" timestamp with time zone,
    "payment_recorded_by" "uuid",
    "odometer_reading" integer,
    "vehicle_bay" "text",
    "invoice_number" "text",
    "payment_reference" "text",
    "payment_mode" "text",
    "job_type" "text" DEFAULT 'normal'::"text" NOT NULL,
    "reference_job_order_id" "uuid",
    "rework_reason" "text",
    "is_free_rework" boolean DEFAULT true NOT NULL,
    "delivered_by" "text" NOT NULL,
    "picked_up_by" "text",
    CONSTRAINT "job_orders_job_type_check" CHECK (("job_type" = ANY (ARRAY['normal'::"text", 'backorder'::"text"]))),
    CONSTRAINT "job_orders_payment_mode_check" CHECK ((("payment_mode" IS NULL) OR ("payment_mode" = ANY (ARRAY['cash'::"text", 'gcash'::"text", 'other'::"text"])))),
    CONSTRAINT "job_orders_vehicle_class_check" CHECK (("vehicle_class" = ANY (ARRAY['light'::"text", 'heavy'::"text", 'extra_heavy'::"text"])))
);


ALTER TABLE "public"."job_orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."job_orders"."payment_recorded_at" IS 'Timestamp when payment was recorded';



COMMENT ON COLUMN "public"."job_orders"."payment_recorded_by" IS 'User who recorded the payment';



CREATE TABLE IF NOT EXISTS "public"."labor_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "status" "public"."pricing_matrix_status" DEFAULT 'active'::"public"."pricing_matrix_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "light_price" numeric DEFAULT 0 NOT NULL,
    "heavy_price" numeric DEFAULT 0 NOT NULL,
    "extra_heavy_price" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."labor_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notification_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "read_at" timestamp with time zone,
    "delivered_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_value" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notification_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "reference_type" "text",
    "reference_id" "uuid",
    "branch_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scheduled_at" timestamp with time zone,
    CONSTRAINT "notifications_notification_type_check" CHECK (("notification_type" = ANY (ARRAY['manual'::"text", 'system'::"text"]))),
    CONSTRAINT "notifications_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'scheduled'::"text", 'active'::"text", 'inactive'::"text"]))),
    CONSTRAINT "notifications_target_type_check" CHECK (("target_type" = ANY (ARRAY['role'::"text", 'user'::"text", 'branch'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON COLUMN "public"."notifications"."scheduled_at" IS 'When the notification should be sent. NULL means send immediately.';



CREATE TABLE IF NOT EXISTS "public"."package_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "price" numeric(12,2) NOT NULL,
    CONSTRAINT "package_items_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."package_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."package_labor_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "package_id" "uuid" NOT NULL,
    "labor_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "package_labor_items_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."package_labor_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_order_id" "uuid" NOT NULL,
    "inventory_item_id" "uuid" NOT NULL,
    "quantity_ordered" integer NOT NULL,
    "unit_cost" numeric(12,2) NOT NULL,
    "quantity_received" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "purchase_order_items_quantity_ordered_check" CHECK (("quantity_ordered" > 0)),
    CONSTRAINT "purchase_order_items_quantity_received_check" CHECK (("quantity_received" >= 0)),
    CONSTRAINT "purchase_order_items_unit_cost_check" CHECK (("unit_cost" >= (0)::numeric))
);


ALTER TABLE "public"."purchase_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "po_number" "text" NOT NULL,
    "supplier_name" "text",
    "status" "public"."purchase_order_status" DEFAULT 'draft'::"public"."purchase_order_status" NOT NULL,
    "order_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "expected_delivery_date" "date",
    "branch_id" "uuid" NOT NULL,
    "notes" "text",
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "received_at" timestamp with time zone,
    "received_by" "uuid",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "supplier_id" "uuid",
    "receipt_attachment" "text",
    "receipt_uploaded_by" "uuid",
    "receipt_uploaded_at" timestamp with time zone
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_name" "text" NOT NULL,
    "report_type" "public"."report_type" NOT NULL,
    "filters" "jsonb" DEFAULT '{}'::"jsonb",
    "generated_by" "uuid" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "branch_id" "uuid",
    "is_template" boolean DEFAULT false,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "service_type" "text" NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "delivery_method" "text" DEFAULT 'email'::"text" NOT NULL,
    "message_template" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "failure_reason" "text",
    "branch_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_reminders_delivery_method_check" CHECK (("delivery_method" = ANY (ARRAY['email'::"text", 'sms'::"text"]))),
    CONSTRAINT "service_reminders_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'scheduled'::"text", 'sent'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."service_reminders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_performance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "metric_type" "public"."staff_metric_type" NOT NULL,
    "metric_value" numeric DEFAULT 0 NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "period_valid" CHECK (("period_end" >= "period_start"))
);


ALTER TABLE "public"."staff_performance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inventory_item_id" "uuid" NOT NULL,
    "movement_type" "public"."stock_movement_type" NOT NULL,
    "quantity" integer NOT NULL,
    "reference_type" "public"."stock_reference_type" NOT NULL,
    "reference_id" "uuid",
    "reason" "text",
    "branch_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_movements_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_branch_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."supplier_branch_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "inventory_item_id" "uuid",
    "product_name" "text" NOT NULL,
    "unit_cost" numeric NOT NULL,
    "lead_time_days" integer,
    "status" "public"."supplier_product_status" DEFAULT 'active'::"public"."supplier_product_status" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "supplier_products_lead_time_days_check" CHECK ((("lead_time_days" IS NULL) OR ("lead_time_days" >= 0))),
    CONSTRAINT "supplier_products_unit_cost_check" CHECK (("unit_cost" >= (0)::numeric))
);


ALTER TABLE "public"."supplier_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_name" "text" NOT NULL,
    "contact_person" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "address" "text" NOT NULL,
    "status" "public"."supplier_status" DEFAULT 'active'::"public"."supplier_status" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dark_mode" boolean DEFAULT false NOT NULL,
    "primary_color" "text" DEFAULT '#5570F1'::"text" NOT NULL,
    "sidebar_collapsed" boolean DEFAULT false NOT NULL,
    "font_size" "text" DEFAULT 'medium'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "table_density" "text" DEFAULT 'comfortable'::"text" NOT NULL,
    "login_lockout_enabled" boolean DEFAULT true NOT NULL,
    CONSTRAINT "system_settings_font_size_check" CHECK (("font_size" = ANY (ARRAY['small'::"text", 'medium'::"text", 'large'::"text"]))),
    CONSTRAINT "system_settings_table_density_check" CHECK (("table_density" = ANY (ARRAY['comfortable'::"text", 'compact'::"text"])))
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."third_party_repairs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_order_id" "uuid" NOT NULL,
    "provider_name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "repair_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."third_party_repairs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_branch_assignments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_branch_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "email" character varying(255) NOT NULL,
    "full_name" character varying(255) NOT NULL,
    "phone" character varying(50),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "failed_login_attempts" integer DEFAULT 0,
    "locked_until" timestamp with time zone,
    "must_change_password" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "no_admin_role" CHECK (("role" <> 'ADMIN'::"public"."user_role"))
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_external_repairs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "service_date" timestamp with time zone NOT NULL,
    "repair_name" "text" NOT NULL,
    "provider_name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vehicle_external_repairs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "plate_number" character varying(20) NOT NULL,
    "vehicle_type" "public"."vehicle_type" DEFAULT 'sedan'::"public"."vehicle_type" NOT NULL,
    "orcr" character varying(100) NOT NULL,
    "model" character varying(150) NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "status" "public"."vehicle_status" DEFAULT 'active'::"public"."vehicle_status" NOT NULL,
    "color" character varying(50),
    "year" integer,
    "conduction_sticker" character varying(100),
    "chassis_number" character varying(100),
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vehicle_class" "text" DEFAULT 'light'::"text" NOT NULL,
    "make" character varying DEFAULT 'Unknown'::character varying NOT NULL,
    CONSTRAINT "vehicles_vehicle_class_check" CHECK (("vehicle_class" = ANY (ARRAY['light'::"text", 'heavy'::"text", 'extra_heavy'::"text"])))
);


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


COMMENT ON TABLE "public"."vehicles" IS 'Vehicle profiles linked to customers, branch-scoped';



COMMENT ON COLUMN "public"."vehicles"."vehicle_class" IS 'Weight classification for pricing: light, heavy, or extra_heavy';



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_order_item_inventories"
    ADD CONSTRAINT "job_order_item_inventories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_order_items"
    ADD CONSTRAINT "job_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_order_lines"
    ADD CONSTRAINT "job_order_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_orders"
    ADD CONSTRAINT "job_orders_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."job_orders"
    ADD CONSTRAINT "job_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."labor_items"
    ADD CONSTRAINT "labor_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_receipts"
    ADD CONSTRAINT "notification_receipts_notification_id_user_id_key" UNIQUE ("notification_id", "user_id");



ALTER TABLE ONLY "public"."notification_receipts"
    ADD CONSTRAINT "notification_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."package_items"
    ADD CONSTRAINT "package_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."package_labor_items"
    ADD CONSTRAINT "package_labor_items_package_id_labor_id_key" UNIQUE ("package_id", "labor_id");



ALTER TABLE ONLY "public"."package_labor_items"
    ADD CONSTRAINT "package_labor_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_reminders"
    ADD CONSTRAINT "service_reminders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_performance"
    ADD CONSTRAINT "staff_performance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_branch_assignments"
    ADD CONSTRAINT "supplier_branch_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_branch_assignments"
    ADD CONSTRAINT "supplier_branch_assignments_supplier_id_branch_id_key" UNIQUE ("supplier_id", "branch_id");



ALTER TABLE ONLY "public"."supplier_products"
    ADD CONSTRAINT "supplier_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."third_party_repairs"
    ADD CONSTRAINT "third_party_repairs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "uq_sku_per_branch" UNIQUE ("sku_code", "branch_id");



ALTER TABLE ONLY "public"."user_branch_assignments"
    ADD CONSTRAINT "user_branch_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_branch_assignments"
    ADD CONSTRAINT "user_branch_assignments_user_id_branch_id_key" UNIQUE ("user_id", "branch_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."vehicle_external_repairs"
    ADD CONSTRAINT "vehicle_external_repairs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_plate_number_unique" UNIQUE ("plate_number");



CREATE INDEX "idx_audit_logs_action" ON "public"."audit_logs" USING "btree" ("action");



CREATE INDEX "idx_audit_logs_branch_id" ON "public"."audit_logs" USING "btree" ("branch_id");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_entity_id" ON "public"."audit_logs" USING "btree" ("entity_id");



CREATE INDEX "idx_audit_logs_entity_type" ON "public"."audit_logs" USING "btree" ("entity_type");



CREATE INDEX "idx_audit_logs_user_id" ON "public"."audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_branches_code" ON "public"."branches" USING "btree" ("code");



CREATE INDEX "idx_branches_is_active" ON "public"."branches" USING "btree" ("is_active");



CREATE INDEX "idx_customers_branch_id" ON "public"."customers" USING "btree" ("branch_id");



CREATE INDEX "idx_customers_created_at" ON "public"."customers" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_customers_full_name" ON "public"."customers" USING "btree" ("full_name");



CREATE INDEX "idx_customers_status" ON "public"."customers" USING "btree" ("status");



CREATE INDEX "idx_inventory_items_branch" ON "public"."inventory_items" USING "btree" ("branch_id");



CREATE INDEX "idx_inventory_items_sku" ON "public"."inventory_items" USING "btree" ("sku_code");



CREATE INDEX "idx_inventory_items_status" ON "public"."inventory_items" USING "btree" ("status");



CREATE INDEX "idx_job_order_item_inventories_inv" ON "public"."job_order_item_inventories" USING "btree" ("inventory_item_id");



CREATE INDEX "idx_job_order_item_inventories_joi" ON "public"."job_order_item_inventories" USING "btree" ("job_order_item_id");



CREATE INDEX "idx_job_order_items_labor_item_id" ON "public"."job_order_items" USING "btree" ("labor_item_id");



CREATE INDEX "idx_job_order_items_order" ON "public"."job_order_items" USING "btree" ("job_order_id");



CREATE INDEX "idx_job_order_lines_job_order_id" ON "public"."job_order_lines" USING "btree" ("job_order_id");



CREATE INDEX "idx_job_order_lines_line_type" ON "public"."job_order_lines" USING "btree" ("line_type");



CREATE INDEX "idx_job_order_lines_reference_id" ON "public"."job_order_lines" USING "btree" ("reference_id");



CREATE INDEX "idx_job_orders_approved_by" ON "public"."job_orders" USING "btree" ("approved_by");



CREATE INDEX "idx_job_orders_branch" ON "public"."job_orders" USING "btree" ("branch_id");



CREATE INDEX "idx_job_orders_created" ON "public"."job_orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_job_orders_customer" ON "public"."job_orders" USING "btree" ("customer_id");



CREATE INDEX "idx_job_orders_job_type" ON "public"."job_orders" USING "btree" ("job_type");



CREATE INDEX "idx_job_orders_reference_job_order_id" ON "public"."job_orders" USING "btree" ("reference_job_order_id");



CREATE INDEX "idx_job_orders_status" ON "public"."job_orders" USING "btree" ("status");



CREATE INDEX "idx_job_orders_vehicle" ON "public"."job_orders" USING "btree" ("vehicle_id");



CREATE INDEX "idx_notification_receipts_notification" ON "public"."notification_receipts" USING "btree" ("notification_id");



CREATE INDEX "idx_notification_receipts_unread" ON "public"."notification_receipts" USING "btree" ("user_id", "is_read") WHERE ("is_read" = false);



CREATE INDEX "idx_notification_receipts_user" ON "public"."notification_receipts" USING "btree" ("user_id");



CREATE INDEX "idx_notifications_branch_id" ON "public"."notifications" USING "btree" ("branch_id");



CREATE INDEX "idx_notifications_created_by" ON "public"."notifications" USING "btree" ("created_by");



CREATE INDEX "idx_notifications_reference" ON "public"."notifications" USING "btree" ("reference_type", "reference_id");



CREATE INDEX "idx_notifications_status" ON "public"."notifications" USING "btree" ("status");



CREATE INDEX "idx_notifications_target" ON "public"."notifications" USING "btree" ("target_type", "target_value");



CREATE INDEX "idx_package_items_status" ON "public"."package_items" USING "btree" ("status");



CREATE INDEX "idx_po_branch" ON "public"."purchase_orders" USING "btree" ("branch_id");



CREATE INDEX "idx_po_deleted" ON "public"."purchase_orders" USING "btree" ("is_deleted");



CREATE INDEX "idx_po_status" ON "public"."purchase_orders" USING "btree" ("status");



CREATE INDEX "idx_poi_item" ON "public"."purchase_order_items" USING "btree" ("inventory_item_id");



CREATE INDEX "idx_poi_po" ON "public"."purchase_order_items" USING "btree" ("purchase_order_id");



CREATE INDEX "idx_purchase_orders_supplier_id" ON "public"."purchase_orders" USING "btree" ("supplier_id");



CREATE INDEX "idx_reports_branch_id" ON "public"."reports" USING "btree" ("branch_id");



CREATE INDEX "idx_reports_generated_at" ON "public"."reports" USING "btree" ("generated_at" DESC);



CREATE INDEX "idx_reports_generated_by" ON "public"."reports" USING "btree" ("generated_by");



CREATE INDEX "idx_reports_is_deleted" ON "public"."reports" USING "btree" ("is_deleted");



CREATE INDEX "idx_reports_is_template" ON "public"."reports" USING "btree" ("is_template");



CREATE INDEX "idx_reports_report_type" ON "public"."reports" USING "btree" ("report_type");



CREATE INDEX "idx_service_reminders_branch_id" ON "public"."service_reminders" USING "btree" ("branch_id");



CREATE INDEX "idx_service_reminders_created_by" ON "public"."service_reminders" USING "btree" ("created_by");



CREATE INDEX "idx_service_reminders_customer_id" ON "public"."service_reminders" USING "btree" ("customer_id");



CREATE INDEX "idx_service_reminders_scheduled" ON "public"."service_reminders" USING "btree" ("scheduled_at") WHERE ("status" = 'scheduled'::"text");



CREATE INDEX "idx_service_reminders_status" ON "public"."service_reminders" USING "btree" ("status");



CREATE INDEX "idx_service_reminders_vehicle_id" ON "public"."service_reminders" USING "btree" ("vehicle_id");



CREATE INDEX "idx_staff_performance_branch_id" ON "public"."staff_performance" USING "btree" ("branch_id");



CREATE INDEX "idx_staff_performance_metric_type" ON "public"."staff_performance" USING "btree" ("metric_type");



CREATE INDEX "idx_staff_performance_not_deleted" ON "public"."staff_performance" USING "btree" ("is_deleted") WHERE ("is_deleted" = false);



CREATE INDEX "idx_staff_performance_period" ON "public"."staff_performance" USING "btree" ("period_start", "period_end");



CREATE INDEX "idx_staff_performance_staff_id" ON "public"."staff_performance" USING "btree" ("staff_id");



CREATE INDEX "idx_stock_movements_branch" ON "public"."stock_movements" USING "btree" ("branch_id");



CREATE INDEX "idx_stock_movements_item" ON "public"."stock_movements" USING "btree" ("inventory_item_id");



CREATE INDEX "idx_stock_movements_ref" ON "public"."stock_movements" USING "btree" ("reference_type", "reference_id");



CREATE INDEX "idx_supplier_products_branch_id" ON "public"."supplier_products" USING "btree" ("branch_id");



CREATE INDEX "idx_supplier_products_supplier_id" ON "public"."supplier_products" USING "btree" ("supplier_id");



CREATE INDEX "idx_suppliers_branch_id" ON "public"."suppliers" USING "btree" ("branch_id");



CREATE INDEX "idx_suppliers_status" ON "public"."suppliers" USING "btree" ("status");



CREATE INDEX "idx_third_party_repairs_job_order" ON "public"."third_party_repairs" USING "btree" ("job_order_id");



CREATE INDEX "idx_user_branch_assignments_branch_id" ON "public"."user_branch_assignments" USING "btree" ("branch_id");



CREATE INDEX "idx_user_branch_assignments_user_id" ON "public"."user_branch_assignments" USING "btree" ("user_id");



CREATE INDEX "idx_user_profiles_email" ON "public"."user_profiles" USING "btree" ("email");



CREATE INDEX "idx_user_profiles_is_active" ON "public"."user_profiles" USING "btree" ("is_active");



CREATE INDEX "idx_user_roles_role" ON "public"."user_roles" USING "btree" ("role");



CREATE INDEX "idx_user_roles_user_id" ON "public"."user_roles" USING "btree" ("user_id");



CREATE INDEX "idx_vehicle_external_repairs_service_date" ON "public"."vehicle_external_repairs" USING "btree" ("service_date" DESC);



CREATE INDEX "idx_vehicle_external_repairs_vehicle_id" ON "public"."vehicle_external_repairs" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicles_branch_id" ON "public"."vehicles" USING "btree" ("branch_id");



CREATE INDEX "idx_vehicles_customer_id" ON "public"."vehicles" USING "btree" ("customer_id");



CREATE INDEX "idx_vehicles_plate_number" ON "public"."vehicles" USING "btree" ("plate_number");



CREATE INDEX "idx_vehicles_status" ON "public"."vehicles" USING "btree" ("status");



CREATE INDEX "supplier_branch_assignments_branch_id_idx" ON "public"."supplier_branch_assignments" USING "btree" ("branch_id");



CREATE INDEX "supplier_branch_assignments_supplier_id_idx" ON "public"."supplier_branch_assignments" USING "btree" ("supplier_id");



CREATE UNIQUE INDEX "system_settings_singleton" ON "public"."system_settings" USING "btree" ((true));



CREATE UNIQUE INDEX "uq_job_orders_single_active_rework" ON "public"."job_orders" USING "btree" ("reference_job_order_id") WHERE (("job_type" = 'backorder'::"text") AND ("reference_job_order_id" IS NOT NULL) AND ("is_deleted" = false));



CREATE UNIQUE INDEX "uq_po_number_branch" ON "public"."purchase_orders" USING "btree" ("po_number", "branch_id") WHERE ("is_deleted" = false);



CREATE UNIQUE INDEX "uq_supplier_products_inventory_item_active" ON "public"."supplier_products" USING "btree" ("inventory_item_id") WHERE (("inventory_item_id" IS NOT NULL) AND ("status" = 'active'::"public"."supplier_product_status"));



CREATE OR REPLACE VIEW "public"."inventory_on_hand" AS
 SELECT "i"."id" AS "inventory_item_id",
    "i"."item_name",
    "i"."sku_code",
    "i"."category",
    "i"."unit_of_measure",
    "i"."cost_price",
    "i"."reorder_threshold",
    "i"."status",
    "i"."branch_id",
    "i"."created_by",
    "i"."created_at",
    "i"."updated_at",
    COALESCE("sum"(
        CASE
            WHEN ("sm"."movement_type" = 'stock_in'::"public"."stock_movement_type") THEN "sm"."quantity"
            WHEN ("sm"."movement_type" = 'stock_out'::"public"."stock_movement_type") THEN (- "sm"."quantity")
            WHEN ("sm"."movement_type" = 'adjustment'::"public"."stock_movement_type") THEN
            CASE
                WHEN ("sm"."reason" ~~* '%increase%'::"text") THEN "sm"."quantity"
                ELSE (- "sm"."quantity")
            END
            ELSE 0
        END), (0)::bigint) AS "current_quantity"
   FROM ("public"."inventory_items" "i"
     LEFT JOIN "public"."stock_movements" "sm" ON (("sm"."inventory_item_id" = "i"."id")))
  GROUP BY "i"."id";



CREATE OR REPLACE TRIGGER "audit_customers" AFTER INSERT OR DELETE OR UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."audit_customer_changes"();



CREATE OR REPLACE TRIGGER "audit_job_orders" AFTER INSERT OR DELETE OR UPDATE ON "public"."job_orders" FOR EACH ROW EXECUTE FUNCTION "public"."audit_job_order_changes"();



CREATE OR REPLACE TRIGGER "audit_package_items_changes" AFTER INSERT OR DELETE OR UPDATE ON "public"."package_items" FOR EACH ROW EXECUTE FUNCTION "public"."audit_package_item_changes"();



CREATE OR REPLACE TRIGGER "audit_suppliers" AFTER INSERT OR DELETE OR UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."audit_supplier_changes"();



CREATE OR REPLACE TRIGGER "audit_third_party_repairs" AFTER INSERT OR DELETE OR UPDATE ON "public"."third_party_repairs" FOR EACH ROW EXECUTE FUNCTION "public"."audit_third_party_repair_changes"();



CREATE OR REPLACE TRIGGER "audit_vehicles" AFTER INSERT OR DELETE OR UPDATE ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."audit_vehicle_changes"();



CREATE OR REPLACE TRIGGER "customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_customers_updated_at"();



CREATE OR REPLACE TRIGGER "set_job_orders_updated_at" BEFORE UPDATE ON "public"."job_orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_suppliers_updated_at" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_third_party_repairs_updated_at" BEFORE UPDATE ON "public"."third_party_repairs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_audit_inventory_items" AFTER INSERT OR UPDATE ON "public"."inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."log_inventory_item_change"();



CREATE OR REPLACE TRIGGER "trg_audit_purchase_orders" AFTER INSERT OR UPDATE ON "public"."purchase_orders" FOR EACH ROW EXECUTE FUNCTION "public"."audit_purchase_order_changes"();



CREATE OR REPLACE TRIGGER "trg_generate_order_number" BEFORE INSERT ON "public"."job_orders" FOR EACH ROW WHEN ((("new"."order_number" IS NULL) OR ("new"."order_number" = ''::"text"))) EXECUTE FUNCTION "public"."generate_order_number"();



CREATE OR REPLACE TRIGGER "trg_guard_initial_stock_movement" BEFORE INSERT ON "public"."stock_movements" FOR EACH ROW EXECUTE FUNCTION "public"."guard_initial_stock_movement_for_inventory"();



CREATE OR REPLACE TRIGGER "trg_inventory_items_updated_at" BEFORE UPDATE ON "public"."inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_inventory_items_updated_at"();



CREATE OR REPLACE TRIGGER "trg_notifications_audit" AFTER INSERT OR UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."trg_audit_notifications"();



CREATE OR REPLACE TRIGGER "trg_notifications_updated_at" BEFORE UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."update_notifications_updated_at"();



CREATE OR REPLACE TRIGGER "trg_purchase_order_items_updated_at" BEFORE UPDATE ON "public"."purchase_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_purchase_orders_po_number" BEFORE INSERT ON "public"."purchase_orders" FOR EACH ROW EXECUTE FUNCTION "public"."generate_po_number"();



CREATE OR REPLACE TRIGGER "trg_purchase_orders_updated_at" BEFORE UPDATE ON "public"."purchase_orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_service_reminders_audit" AFTER INSERT OR UPDATE ON "public"."service_reminders" FOR EACH ROW EXECUTE FUNCTION "public"."trg_audit_service_reminders"();



CREATE OR REPLACE TRIGGER "trg_service_reminders_updated_at" BEFORE UPDATE ON "public"."service_reminders" FOR EACH ROW EXECUTE FUNCTION "public"."update_notifications_updated_at"();



CREATE OR REPLACE TRIGGER "trg_staff_performance_updated_at" BEFORE UPDATE ON "public"."staff_performance" FOR EACH ROW EXECUTE FUNCTION "public"."update_staff_performance_updated_at"();



CREATE OR REPLACE TRIGGER "trg_supplier_products_updated_at" BEFORE UPDATE ON "public"."supplier_products" FOR EACH ROW EXECUTE FUNCTION "public"."update_supplier_products_updated_at"();



CREATE OR REPLACE TRIGGER "update_branches_updated_at" BEFORE UPDATE ON "public"."branches" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_package_items_updated_at" BEFORE UPDATE ON "public"."package_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_profiles_updated_at" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_vehicles_updated_at" BEFORE UPDATE ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."job_order_item_inventories"
    ADD CONSTRAINT "job_order_item_inventories_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id");



ALTER TABLE ONLY "public"."job_order_item_inventories"
    ADD CONSTRAINT "job_order_item_inventories_job_order_item_id_fkey" FOREIGN KEY ("job_order_item_id") REFERENCES "public"."job_order_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_order_items"
    ADD CONSTRAINT "job_order_items_job_order_id_fkey" FOREIGN KEY ("job_order_id") REFERENCES "public"."job_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_order_items"
    ADD CONSTRAINT "job_order_items_labor_item_id_fkey" FOREIGN KEY ("labor_item_id") REFERENCES "public"."labor_items"("id");



ALTER TABLE ONLY "public"."job_order_items"
    ADD CONSTRAINT "job_order_items_package_item_id_fkey" FOREIGN KEY ("package_item_id") REFERENCES "public"."package_items"("id");



ALTER TABLE ONLY "public"."job_order_lines"
    ADD CONSTRAINT "job_order_lines_job_order_id_fkey" FOREIGN KEY ("job_order_id") REFERENCES "public"."job_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_orders"
    ADD CONSTRAINT "job_orders_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."job_orders"
    ADD CONSTRAINT "job_orders_assigned_technician_id_fkey" FOREIGN KEY ("assigned_technician_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."job_orders"
    ADD CONSTRAINT "job_orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."job_orders"
    ADD CONSTRAINT "job_orders_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."job_orders"
    ADD CONSTRAINT "job_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."job_orders"
    ADD CONSTRAINT "job_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."job_orders"
    ADD CONSTRAINT "job_orders_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."job_orders"
    ADD CONSTRAINT "job_orders_payment_recorded_by_fkey" FOREIGN KEY ("payment_recorded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."job_orders"
    ADD CONSTRAINT "job_orders_reference_job_order_id_fkey" FOREIGN KEY ("reference_job_order_id") REFERENCES "public"."job_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_orders"
    ADD CONSTRAINT "job_orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."notification_receipts"
    ADD CONSTRAINT "notification_receipts_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_receipts"
    ADD CONSTRAINT "notification_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."package_items"
    ADD CONSTRAINT "package_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."package_labor_items"
    ADD CONSTRAINT "package_labor_items_labor_id_fkey" FOREIGN KEY ("labor_id") REFERENCES "public"."labor_items"("id");



ALTER TABLE ONLY "public"."package_labor_items"
    ADD CONSTRAINT "package_labor_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."package_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_receipt_uploaded_by_fkey" FOREIGN KEY ("receipt_uploaded_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."service_reminders"
    ADD CONSTRAINT "service_reminders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."service_reminders"
    ADD CONSTRAINT "service_reminders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."service_reminders"
    ADD CONSTRAINT "service_reminders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."service_reminders"
    ADD CONSTRAINT "service_reminders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."staff_performance"
    ADD CONSTRAINT "staff_performance_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."staff_performance"
    ADD CONSTRAINT "staff_performance_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."staff_performance"
    ADD CONSTRAINT "staff_performance_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_branch_assignments"
    ADD CONSTRAINT "supplier_branch_assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_branch_assignments"
    ADD CONSTRAINT "supplier_branch_assignments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_products"
    ADD CONSTRAINT "supplier_products_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."supplier_products"
    ADD CONSTRAINT "supplier_products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."supplier_products"
    ADD CONSTRAINT "supplier_products_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_products"
    ADD CONSTRAINT "supplier_products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."third_party_repairs"
    ADD CONSTRAINT "third_party_repairs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."third_party_repairs"
    ADD CONSTRAINT "third_party_repairs_job_order_id_fkey" FOREIGN KEY ("job_order_id") REFERENCES "public"."job_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_branch_assignments"
    ADD CONSTRAINT "user_branch_assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_branch_assignments"
    ADD CONSTRAINT "user_branch_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_external_repairs"
    ADD CONSTRAINT "vehicle_external_repairs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicle_external_repairs"
    ADD CONSTRAINT "vehicle_external_repairs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



CREATE POLICY "Allow audit log creation via function" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow audit log update for cascade" ON "public"."audit_logs" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_hm"("auth"."uid"())) WITH CHECK ("public"."is_admin_or_hm"("auth"."uid"()));



CREATE POLICY "Audit viewers can view all audit logs" ON "public"."audit_logs" FOR SELECT USING ("public"."is_audit_viewer"("auth"."uid"()));



CREATE POLICY "Authenticated users can read system settings" ON "public"."system_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Branch managers can create branches" ON "public"."branches" FOR INSERT WITH CHECK ("public"."is_branch_manager"("auth"."uid"()));



CREATE POLICY "Branch managers can delete branches" ON "public"."branches" FOR DELETE USING ("public"."is_branch_manager"("auth"."uid"()));



CREATE POLICY "Branch managers can update branches" ON "public"."branches" FOR UPDATE USING ("public"."is_branch_manager"("auth"."uid"())) WITH CHECK ("public"."is_branch_manager"("auth"."uid"()));



CREATE POLICY "Branch managers can view all branches" ON "public"."branches" FOR SELECT USING ("public"."is_branch_manager"("auth"."uid"()));



CREATE POLICY "Service role and authenticated users can update system settings" ON "public"."system_settings" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Service role can update audit_logs" ON "public"."audit_logs" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Supervisors can create package items" ON "public"."package_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['HM'::"public"."user_role", 'POC'::"public"."user_role", 'JS'::"public"."user_role"]))))));



CREATE POLICY "Supervisors can delete package items" ON "public"."package_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['HM'::"public"."user_role", 'POC'::"public"."user_role", 'JS'::"public"."user_role"]))))));



CREATE POLICY "Supervisors can update package items" ON "public"."package_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['HM'::"public"."user_role", 'POC'::"public"."user_role", 'JS'::"public"."user_role"]))))));



CREATE POLICY "User managers can create profiles" ON "public"."user_profiles" FOR INSERT WITH CHECK ("public"."is_user_manager"("auth"."uid"()));



CREATE POLICY "User managers can delete profiles" ON "public"."user_profiles" FOR DELETE USING ("public"."is_user_manager"("auth"."uid"()));



CREATE POLICY "User managers can manage branch assignments" ON "public"."user_branch_assignments" USING ("public"."is_user_manager"("auth"."uid"())) WITH CHECK ("public"."is_user_manager"("auth"."uid"()));



CREATE POLICY "User managers can manage roles" ON "public"."user_roles" USING ("public"."is_user_manager"("auth"."uid"())) WITH CHECK ("public"."is_user_manager"("auth"."uid"()));



CREATE POLICY "User managers can update profiles" ON "public"."user_profiles" FOR UPDATE USING (("public"."is_user_manager"("auth"."uid"()) OR ("id" = "auth"."uid"()))) WITH CHECK (("public"."is_user_manager"("auth"."uid"()) OR ("id" = "auth"."uid"())));



CREATE POLICY "User managers can view all branch assignments" ON "public"."user_branch_assignments" FOR SELECT USING ("public"."is_user_manager"("auth"."uid"()));



CREATE POLICY "User managers can view all profiles" ON "public"."user_profiles" FOR SELECT USING ("public"."is_user_manager"("auth"."uid"()));



CREATE POLICY "User managers can view all roles" ON "public"."user_roles" FOR SELECT USING ("public"."is_user_manager"("auth"."uid"()));



CREATE POLICY "Users can delete job order items" ON "public"."job_order_items" FOR DELETE TO "authenticated" USING (("job_order_id" IN ( SELECT "job_orders"."id"
   FROM "public"."job_orders")));



CREATE POLICY "Users can delete job orders in their branches" ON "public"."job_orders" FOR DELETE TO "authenticated" USING (("public"."is_admin_or_hm"("auth"."uid"()) OR ("branch_id" IN ( SELECT "unnest"("public"."get_user_branch_ids"("auth"."uid"())) AS "unnest"))));



CREATE POLICY "Users can delete supplier products in their branch" ON "public"."supplier_products" FOR DELETE USING (true);



CREATE POLICY "Users can delete third party repairs in their branches" ON "public"."third_party_repairs" FOR DELETE USING (("public"."is_admin_or_hm"("auth"."uid"()) OR ("job_order_id" IN ( SELECT "job_orders"."id"
   FROM "public"."job_orders"
  WHERE ("job_orders"."branch_id" IN ( SELECT "unnest"("public"."get_user_branch_ids"("auth"."uid"())) AS "unnest"))))));



CREATE POLICY "Users can insert job order items" ON "public"."job_order_items" FOR INSERT TO "authenticated" WITH CHECK (("job_order_id" IN ( SELECT "job_orders"."id"
   FROM "public"."job_orders")));



CREATE POLICY "Users can insert job orders in their branches" ON "public"."job_orders" FOR INSERT TO "authenticated" WITH CHECK (("branch_id" IN ( SELECT "unnest"("public"."get_user_branch_ids"("auth"."uid"())) AS "unnest")));



CREATE POLICY "Users can insert reports" ON "public"."reports" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can insert supplier products in their branch" ON "public"."supplier_products" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can insert third party repairs in their branches" ON "public"."third_party_repairs" FOR INSERT WITH CHECK (("job_order_id" IN ( SELECT "job_orders"."id"
   FROM "public"."job_orders"
  WHERE ("job_orders"."branch_id" IN ( SELECT "unnest"("public"."get_user_branch_ids"("auth"."uid"())) AS "unnest")))));



CREATE POLICY "Users can update job orders in their branches" ON "public"."job_orders" FOR UPDATE TO "authenticated" USING (("public"."is_admin_or_hm"("auth"."uid"()) OR ("branch_id" IN ( SELECT "unnest"("public"."get_user_branch_ids"("auth"."uid"())) AS "unnest"))));



CREATE POLICY "Users can update own profile" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "Users can update reports" ON "public"."reports" FOR UPDATE USING (true);



CREATE POLICY "Users can update supplier products in their branch" ON "public"."supplier_products" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Users can update third party repairs in their branches" ON "public"."third_party_repairs" FOR UPDATE USING (("public"."is_admin_or_hm"("auth"."uid"()) OR ("job_order_id" IN ( SELECT "job_orders"."id"
   FROM "public"."job_orders"
  WHERE ("job_orders"."branch_id" IN ( SELECT "unnest"("public"."get_user_branch_ids"("auth"."uid"())) AS "unnest"))))));



CREATE POLICY "Users can view all package items" ON "public"."package_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE ("user_roles"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view assigned branches" ON "public"."branches" FOR SELECT USING (("id" = ANY ("public"."get_user_branch_ids"("auth"."uid"()))));



CREATE POLICY "Users can view job order items" ON "public"."job_order_items" FOR SELECT TO "authenticated" USING (("job_order_id" IN ( SELECT "job_orders"."id"
   FROM "public"."job_orders")));



CREATE POLICY "Users can view job orders in their branches" ON "public"."job_orders" FOR SELECT TO "authenticated" USING (("public"."is_admin_or_hm"("auth"."uid"()) OR ("branch_id" IN ( SELECT "unnest"("public"."get_user_branch_ids"("auth"."uid"())) AS "unnest"))));



CREATE POLICY "Users can view own branch assignments" ON "public"."user_branch_assignments" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own profile" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "Users can view own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view reports" ON "public"."reports" FOR SELECT USING ((NOT "is_deleted"));



CREATE POLICY "Users can view supplier products in their branch" ON "public"."supplier_products" FOR SELECT USING (true);



CREATE POLICY "Users can view third party repairs in their branches" ON "public"."third_party_repairs" FOR SELECT USING (("public"."is_admin_or_hm"("auth"."uid"()) OR ("job_order_id" IN ( SELECT "job_orders"."id"
   FROM "public"."job_orders"
  WHERE ("job_orders"."branch_id" IN ( SELECT "unnest"("public"."get_user_branch_ids"("auth"."uid"())) AS "unnest"))))));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."branches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_delete_policy" ON "public"."customers" FOR DELETE USING ((("public"."current_user_has_role"('POC'::"public"."user_role") OR "public"."current_user_has_role"('JS'::"public"."user_role") OR "public"."current_user_has_role"('R'::"public"."user_role")) AND ("branch_id" IN ( SELECT "uba"."branch_id"
   FROM "public"."user_branch_assignments" "uba"
  WHERE ("uba"."user_id" = "public"."get_current_user_id"())))));



CREATE POLICY "customers_insert_policy" ON "public"."customers" FOR INSERT WITH CHECK ((("public"."current_user_has_role"('HM'::"public"."user_role") OR "public"."current_user_has_role"('POC'::"public"."user_role") OR "public"."current_user_has_role"('JS'::"public"."user_role") OR "public"."current_user_has_role"('R'::"public"."user_role")) AND ("public"."current_user_has_role"('HM'::"public"."user_role") OR ("branch_id" IN ( SELECT "uba"."branch_id"
   FROM "public"."user_branch_assignments" "uba"
  WHERE ("uba"."user_id" = "public"."get_current_user_id"()))))));



CREATE POLICY "customers_select_policy" ON "public"."customers" FOR SELECT USING (("public"."current_user_has_role"('HM'::"public"."user_role") OR (("public"."current_user_has_role"('POC'::"public"."user_role") OR "public"."current_user_has_role"('JS'::"public"."user_role") OR "public"."current_user_has_role"('R'::"public"."user_role") OR "public"."current_user_has_role"('T'::"public"."user_role")) AND ("branch_id" IN ( SELECT "uba"."branch_id"
   FROM "public"."user_branch_assignments" "uba"
  WHERE ("uba"."user_id" = "public"."get_current_user_id"()))))));



CREATE POLICY "customers_service_role_all" ON "public"."customers" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "customers_update_policy" ON "public"."customers" FOR UPDATE USING ((("public"."current_user_has_role"('POC'::"public"."user_role") OR "public"."current_user_has_role"('JS'::"public"."user_role") OR "public"."current_user_has_role"('R'::"public"."user_role") OR "public"."current_user_has_role"('T'::"public"."user_role")) AND ("branch_id" IN ( SELECT "uba"."branch_id"
   FROM "public"."user_branch_assignments" "uba"
  WHERE ("uba"."user_id" = "public"."get_current_user_id"())))));



ALTER TABLE "public"."inventory_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_items_branch_isolation" ON "public"."inventory_items" USING ((("branch_id" IN ( SELECT "user_branch_assignments"."branch_id"
   FROM "public"."user_branch_assignments"
  WHERE ("user_branch_assignments"."user_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'HM'::"public"."user_role"))))));



ALTER TABLE "public"."job_order_item_inventories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_receipts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_receipts_service_role" ON "public"."notification_receipts" USING (true) WITH CHECK (true);



CREATE POLICY "notification_receipts_user_isolation" ON "public"."notification_receipts" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_branch_isolation" ON "public"."notifications" USING ((("branch_id" IN ( SELECT "uba"."branch_id"
   FROM "public"."user_branch_assignments" "uba"
  WHERE ("uba"."user_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'HM'::"public"."user_role"))))));



CREATE POLICY "notifications_service_role" ON "public"."notifications" USING (true) WITH CHECK (true);



ALTER TABLE "public"."package_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_reminders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_reminders_branch_isolation" ON "public"."service_reminders" USING ((("branch_id" IN ( SELECT "uba"."branch_id"
   FROM "public"."user_branch_assignments" "uba"
  WHERE ("uba"."user_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = 'HM'::"public"."user_role"))))));



CREATE POLICY "service_reminders_service_role" ON "public"."service_reminders" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_all_job_order_item_inventories" ON "public"."job_order_item_inventories" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_all_po" ON "public"."purchase_orders" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_all_poi" ON "public"."purchase_order_items" USING (true) WITH CHECK (true);



ALTER TABLE "public"."staff_performance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_performance_insert" ON "public"."staff_performance" FOR INSERT WITH CHECK (true);



CREATE POLICY "staff_performance_select" ON "public"."staff_performance" FOR SELECT USING ((NOT "is_deleted"));



CREATE POLICY "staff_performance_update" ON "public"."staff_performance" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_movements_branch_isolation" ON "public"."stock_movements" USING ((("branch_id" IN ( SELECT "user_branch_assignments"."branch_id"
   FROM "public"."user_branch_assignments"
  WHERE ("user_branch_assignments"."user_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'HM'::"public"."user_role"))))));



ALTER TABLE "public"."supplier_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers_delete" ON "public"."suppliers" FOR DELETE USING (("public"."is_admin_or_hm"("auth"."uid"()) OR ("public"."user_has_role"("auth"."uid"(), 'POC'::"public"."user_role") AND ("branch_id" IN ( SELECT "unnest"("public"."get_user_branch_ids"("auth"."uid"())) AS "unnest"))) OR ("public"."user_has_role"("auth"."uid"(), 'JS'::"public"."user_role") AND ("branch_id" IN ( SELECT "unnest"("public"."get_user_branch_ids"("auth"."uid"())) AS "unnest")))));



CREATE POLICY "suppliers_insert" ON "public"."suppliers" FOR INSERT WITH CHECK (("public"."is_admin_or_hm"("auth"."uid"()) OR ("public"."user_has_role"("auth"."uid"(), 'POC'::"public"."user_role") AND ("branch_id" IN ( SELECT "unnest"("public"."get_user_branch_ids"("auth"."uid"())) AS "unnest"))) OR ("public"."user_has_role"("auth"."uid"(), 'JS'::"public"."user_role") AND ("branch_id" IN ( SELECT "unnest"("public"."get_user_branch_ids"("auth"."uid"())) AS "unnest")))));



CREATE POLICY "suppliers_select_branch" ON "public"."suppliers" FOR SELECT USING (("branch_id" IN ( SELECT "unnest"("public"."get_user_branch_ids"("auth"."uid"())) AS "unnest")));



CREATE POLICY "suppliers_select_hm" ON "public"."suppliers" FOR SELECT USING ("public"."is_admin_or_hm"("auth"."uid"()));



CREATE POLICY "suppliers_update" ON "public"."suppliers" FOR UPDATE USING (("public"."is_admin_or_hm"("auth"."uid"()) OR ("public"."user_has_role"("auth"."uid"(), 'POC'::"public"."user_role") AND ("branch_id" IN ( SELECT "unnest"("public"."get_user_branch_ids"("auth"."uid"())) AS "unnest"))) OR ("public"."user_has_role"("auth"."uid"(), 'JS'::"public"."user_role") AND ("branch_id" IN ( SELECT "unnest"("public"."get_user_branch_ids"("auth"."uid"())) AS "unnest")))));



ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."third_party_repairs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_branch_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicles_delete" ON "public"."vehicles" FOR DELETE TO "authenticated" USING (("public"."is_vehicle_manager"("auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'HM'::"public"."user_role")))) OR ("branch_id" IN ( SELECT "uba"."branch_id"
   FROM "public"."user_branch_assignments" "uba"
  WHERE ("uba"."user_id" = "auth"."uid"()))))));



CREATE POLICY "vehicles_insert" ON "public"."vehicles" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_vehicle_manager"("auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'HM'::"public"."user_role")))) OR ("branch_id" IN ( SELECT "uba"."branch_id"
   FROM "public"."user_branch_assignments" "uba"
  WHERE ("uba"."user_id" = "auth"."uid"()))))));



CREATE POLICY "vehicles_select" ON "public"."vehicles" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['HM'::"public"."user_role", 'POC'::"public"."user_role", 'JS'::"public"."user_role", 'R'::"public"."user_role", 'T'::"public"."user_role"]))))) AND ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'HM'::"public"."user_role")))) OR ("branch_id" IN ( SELECT "uba"."branch_id"
   FROM "public"."user_branch_assignments" "uba"
  WHERE ("uba"."user_id" = "auth"."uid"()))))));



CREATE POLICY "vehicles_service_role" ON "public"."vehicles" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "vehicles_update" ON "public"."vehicles" FOR UPDATE TO "authenticated" USING (("public"."is_vehicle_manager"("auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'HM'::"public"."user_role")))) OR ("branch_id" IN ( SELECT "uba"."branch_id"
   FROM "public"."user_branch_assignments" "uba"
  WHERE ("uba"."user_id" = "auth"."uid"())))))) WITH CHECK (("public"."is_vehicle_manager"("auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'HM'::"public"."user_role")))) OR ("branch_id" IN ( SELECT "uba"."branch_id"
   FROM "public"."user_branch_assignments" "uba"
  WHERE ("uba"."user_id" = "auth"."uid"()))))));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_branches_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_branches_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_branches_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_customer_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_customer_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_customer_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_job_order_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_job_order_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_job_order_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_package_item_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_package_item_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_package_item_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_pricing_matrix_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_pricing_matrix_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_pricing_matrix_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_purchase_order_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_purchase_order_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_purchase_order_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_supplier_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_supplier_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_supplier_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_third_party_repair_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_third_party_repair_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_third_party_repair_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_user_branch_assignments_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_user_branch_assignments_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_user_branch_assignments_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_user_profiles_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_user_profiles_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_user_profiles_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_user_roles_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_user_roles_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_user_roles_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_vehicle_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_vehicle_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_vehicle_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_audit_log"("p_action" character varying, "p_entity_type" character varying, "p_entity_id" "uuid", "p_old_values" "jsonb", "p_new_values" "jsonb", "p_branch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_audit_log"("p_action" character varying, "p_entity_type" character varying, "p_entity_id" "uuid", "p_old_values" "jsonb", "p_new_values" "jsonb", "p_branch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_audit_log"("p_action" character varying, "p_entity_type" character varying, "p_entity_id" "uuid", "p_old_values" "jsonb", "p_new_values" "jsonb", "p_branch_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_has_role"("check_role" "public"."user_role") TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_has_role"("check_role" "public"."user_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_has_role"("check_role" "public"."user_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_po_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_po_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_po_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_role_level"("role" "public"."user_role") TO "anon";
GRANT ALL ON FUNCTION "public"."get_role_level"("role" "public"."user_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_role_level"("role" "public"."user_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_branch_ids"("check_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_branch_ids"("check_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_branch_ids"("check_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_full_data"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_full_data"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_full_data"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_max_role_level"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_max_role_level"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_max_role_level"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_roles"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_roles"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_roles"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_initial_stock_movement_for_inventory"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_initial_stock_movement_for_inventory"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_initial_stock_movement_for_inventory"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_or_hm"("check_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_or_hm"("check_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_or_hm"("check_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_audit_viewer"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_audit_viewer"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_audit_viewer"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_branch_manager"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_branch_manager"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_branch_manager"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_user_manager"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_manager"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_manager"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_vehicle_manager"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_vehicle_manager"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_vehicle_manager"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_admin_action"("p_action" character varying, "p_entity_type" character varying, "p_entity_id" "uuid", "p_performed_by_user_id" "uuid", "p_performed_by_branch_id" "uuid", "p_old_values" "jsonb", "p_new_values" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_admin_action"("p_action" character varying, "p_entity_type" character varying, "p_entity_id" "uuid", "p_performed_by_user_id" "uuid", "p_performed_by_branch_id" "uuid", "p_old_values" "jsonb", "p_new_values" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_admin_action"("p_action" character varying, "p_entity_type" character varying, "p_entity_id" "uuid", "p_performed_by_user_id" "uuid", "p_performed_by_branch_id" "uuid", "p_old_values" "jsonb", "p_new_values" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_auth_event"("p_user_id" "uuid", "p_event_type" "text", "p_branch_id" "uuid", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_auth_event"("p_user_id" "uuid", "p_event_type" "text", "p_branch_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_auth_event"("p_user_id" "uuid", "p_event_type" "text", "p_branch_id" "uuid", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_inventory_item_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_inventory_item_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_inventory_item_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_audit_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_audit_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_audit_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_audit_service_reminders"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_audit_service_reminders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_audit_service_reminders"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_customers_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_customers_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_customers_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_inventory_items_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_inventory_items_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_inventory_items_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_notifications_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_notifications_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_notifications_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_staff_performance_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_staff_performance_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_staff_performance_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_supplier_products_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_supplier_products_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_supplier_products_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_branches"("p_user_id" "uuid", "p_branch_ids" "uuid"[], "p_primary_branch_id" "uuid", "p_calling_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_branches"("p_user_id" "uuid", "p_branch_ids" "uuid"[], "p_primary_branch_id" "uuid", "p_calling_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_branches"("p_user_id" "uuid", "p_branch_ids" "uuid"[], "p_primary_branch_id" "uuid", "p_calling_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_roles"("p_user_id" "uuid", "p_roles" "public"."user_role"[], "p_calling_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_roles"("p_user_id" "uuid", "p_roles" "public"."user_role"[], "p_calling_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_roles"("p_user_id" "uuid", "p_roles" "public"."user_role"[], "p_calling_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_branch_access"("check_user_id" "uuid", "check_branch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_branch_access"("check_user_id" "uuid", "check_branch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_branch_access"("check_user_id" "uuid", "check_branch_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_role"("check_user_id" "uuid", "check_role" "public"."user_role") TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_role"("check_user_id" "uuid", "check_role" "public"."user_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_role"("check_user_id" "uuid", "check_role" "public"."user_role") TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."branches" TO "anon";
GRANT ALL ON TABLE "public"."branches" TO "authenticated";
GRANT ALL ON TABLE "public"."branches" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_on_hand" TO "anon";
GRANT ALL ON TABLE "public"."inventory_on_hand" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_on_hand" TO "service_role";



GRANT ALL ON TABLE "public"."job_order_item_inventories" TO "anon";
GRANT ALL ON TABLE "public"."job_order_item_inventories" TO "authenticated";
GRANT ALL ON TABLE "public"."job_order_item_inventories" TO "service_role";



GRANT ALL ON TABLE "public"."job_order_items" TO "anon";
GRANT ALL ON TABLE "public"."job_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."job_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."job_order_lines" TO "anon";
GRANT ALL ON TABLE "public"."job_order_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."job_order_lines" TO "service_role";



GRANT ALL ON SEQUENCE "public"."job_order_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."job_order_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."job_order_seq" TO "service_role";



GRANT ALL ON TABLE "public"."job_orders" TO "anon";
GRANT ALL ON TABLE "public"."job_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."job_orders" TO "service_role";



GRANT ALL ON TABLE "public"."labor_items" TO "anon";
GRANT ALL ON TABLE "public"."labor_items" TO "authenticated";
GRANT ALL ON TABLE "public"."labor_items" TO "service_role";



GRANT ALL ON TABLE "public"."notification_receipts" TO "anon";
GRANT ALL ON TABLE "public"."notification_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."package_items" TO "anon";
GRANT ALL ON TABLE "public"."package_items" TO "authenticated";
GRANT ALL ON TABLE "public"."package_items" TO "service_role";



GRANT ALL ON TABLE "public"."package_labor_items" TO "anon";
GRANT ALL ON TABLE "public"."package_labor_items" TO "authenticated";
GRANT ALL ON TABLE "public"."package_labor_items" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."service_reminders" TO "anon";
GRANT ALL ON TABLE "public"."service_reminders" TO "authenticated";
GRANT ALL ON TABLE "public"."service_reminders" TO "service_role";



GRANT ALL ON TABLE "public"."staff_performance" TO "anon";
GRANT ALL ON TABLE "public"."staff_performance" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_performance" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movements" TO "anon";
GRANT ALL ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_branch_assignments" TO "anon";
GRANT ALL ON TABLE "public"."supplier_branch_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_branch_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_products" TO "anon";
GRANT ALL ON TABLE "public"."supplier_products" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_products" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."third_party_repairs" TO "anon";
GRANT ALL ON TABLE "public"."third_party_repairs" TO "authenticated";
GRANT ALL ON TABLE "public"."third_party_repairs" TO "service_role";



GRANT ALL ON TABLE "public"."user_branch_assignments" TO "anon";
GRANT ALL ON TABLE "public"."user_branch_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."user_branch_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_external_repairs" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_external_repairs" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_external_repairs" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";