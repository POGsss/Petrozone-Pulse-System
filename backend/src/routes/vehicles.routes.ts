import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction, fixAuditLogUser, filterUnchangedFields } from "../lib/auditLogger.js";

const router = Router();

// All vehicle routes require authentication
router.use(requireAuth);

const VALID_VEHICLE_TYPES = [
  "sedan",
  "suv",
  "truck",
  "van",
  "motorcycle",
  "hatchback",
  "coupe",
  "wagon",
  "bus",
  "other",
];

const VALID_VEHICLE_CLASSES = ["light", "heavy", "extra_heavy"];
const PLATE_NUMBER_PATTERN = /^[A-Z]{3}-\d{3,4}$/;
const supabaseAny = supabaseAdmin as any;

type VehicleRepairHistoryItem = {
  id: string;
  history_type: "internal" | "external";
  occurred_at: string;
  title: string;
  subtitle: string;
  internal?: {
    job_order_id: string;
    order_number: string;
    status: string;
    total_amount: number;
  };
  external?: {
    repair_name: string;
    provider_name: string;
    description: string;
    notes: string | null;
  };
};

/**
 * GET /api/vehicles
 * Get vehicles with filtering and pagination
 * HM sees all, others see only their branch-scoped vehicles
 */
router.get(
  "/",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        branch_id,
        status,
        vehicle_type,
        customer_id,
        search,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = supabaseAdmin
        .from("vehicles")
        .select(
          `
          *,
          branches(id, name, code),
          customers(id, full_name, contact_number, email)
        `,
          { count: "exact" }
        )
        .order("created_at", { ascending: false });

      // Branch scoping: HM sees all, others see their branches only
      if (!req.user!.roles.includes("HM")) {
        query = query.in("branch_id", req.user!.branchIds);
      }

      // Apply filters
      if (branch_id) {
        query = query.eq("branch_id", branch_id as string);
      }
      if (status) {
        query = query.eq("status", status as "active" | "inactive");
      }
      if (vehicle_type) {
        query = query.eq("vehicle_type", vehicle_type as "sedan" | "suv" | "truck" | "van" | "motorcycle" | "hatchback" | "coupe" | "wagon" | "bus" | "other");
      }
      if (customer_id) {
        query = query.eq("customer_id", customer_id as string);
      }
      if (search) {
        const searchTerm = `%${search}%`;
        query = query.or(
          `plate_number.ilike.${searchTerm},make.ilike.${searchTerm},model.ilike.${searchTerm},color.ilike.${searchTerm},orcr.ilike.${searchTerm}`
        );
      }

      // Apply pagination
      query = query.range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

      const { data: vehicles, error, count } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({
        data: vehicles,
        pagination: {
          total: count,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error("Get vehicles error:", error);
      res.status(500).json({ error: "Failed to fetch vehicles" });
    }
  }
);

/**
 * GET /api/vehicles/:vehicleId
 * Get a single vehicle by ID
 */
router.get(
  "/:vehicleId",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const vehicleId = req.params.vehicleId as string;

      const { data: vehicle, error } = await supabaseAdmin
        .from("vehicles")
        .select(
          `
          *,
          branches(id, name, code),
          customers(id, full_name, contact_number, email)
        `
        )
        .eq("id", vehicleId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Vehicle not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Branch access check for non-HM users
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(vehicle.branch_id)
      ) {
        res.status(403).json({ error: "No access to this vehicle's branch" });
        return;
      }

      res.json(vehicle);
    } catch (error) {
      console.error("Get vehicle error:", error);
      res.status(500).json({ error: "Failed to fetch vehicle" });
    }
  }
);

/**
 * GET /api/vehicles/:vehicleId/external-repairs
 * List external repairs for a vehicle (newest first)
 */
router.get(
  "/:vehicleId/external-repairs",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const vehicleId = req.params.vehicleId as string;

      const { data: vehicle, error: vehicleError } = await supabaseAdmin
        .from("vehicles")
        .select("id, branch_id")
        .eq("id", vehicleId)
        .single();

      if (vehicleError || !vehicle) {
        if (vehicleError?.code === "PGRST116") {
          res.status(404).json({ error: "Vehicle not found" });
          return;
        }
        res.status(500).json({ error: vehicleError?.message || "Failed to fetch vehicle" });
        return;
      }

      if (!req.user!.roles.includes("HM") && !req.user!.branchIds.includes(vehicle.branch_id)) {
        res.status(403).json({ error: "No access to this vehicle's branch" });
        return;
      }

      const { data, error } = await supabaseAny
        .from("vehicle_external_repairs")
        .select("*")
        .eq("vehicle_id", vehicleId)
        .order("service_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(data || []);
    } catch (error) {
      console.error("Get vehicle external repairs error:", error);
      res.status(500).json({ error: "Failed to fetch vehicle external repairs" });
    }
  }
);

/**
 * POST /api/vehicles/:vehicleId/external-repairs
 * Record an external repair for a vehicle
 */
router.post(
  "/:vehicleId/external-repairs",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const vehicleId = req.params.vehicleId as string;
      const { repair_name, provider_name, description, service_date, notes } = req.body;

      if (!repair_name || !String(repair_name).trim()) {
        res.status(400).json({ error: "External repair name is required" });
        return;
      }
      if (!provider_name || !String(provider_name).trim()) {
        res.status(400).json({ error: "Provider name is required" });
        return;
      }
      if (!description || !String(description).trim()) {
        res.status(400).json({ error: "Description is required" });
        return;
      }
      if (!service_date || Number.isNaN(new Date(service_date).getTime())) {
        res.status(400).json({ error: "Valid service date is required" });
        return;
      }

      const { data: vehicle, error: vehicleError } = await supabaseAdmin
        .from("vehicles")
        .select("id, branch_id")
        .eq("id", vehicleId)
        .single();

      if (vehicleError || !vehicle) {
        if (vehicleError?.code === "PGRST116") {
          res.status(404).json({ error: "Vehicle not found" });
          return;
        }
        res.status(500).json({ error: vehicleError?.message || "Failed to fetch vehicle" });
        return;
      }

      if (!req.user!.roles.includes("HM") && !req.user!.branchIds.includes(vehicle.branch_id)) {
        res.status(403).json({ error: "No access to this vehicle's branch" });
        return;
      }

      const { data, error } = await supabaseAny
        .from("vehicle_external_repairs")
        .insert({
          vehicle_id: vehicleId,
          repair_name: String(repair_name).trim(),
          provider_name: String(provider_name).trim(),
          description: String(description).trim(),
          service_date: new Date(service_date).toISOString(),
          notes: notes?.trim() || null,
          created_by: req.user!.id,
        })
        .select("*")
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "CREATE",
          p_entity_type: "VEHICLE_EXTERNAL_REPAIR",
          p_entity_id: data.id,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            vehicle_id: vehicleId,
            repair_name: data.repair_name,
            provider_name: data.provider_name,
            service_date: data.service_date,
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.status(201).json(data);
    } catch (error) {
      console.error("Create vehicle external repair error:", error);
      await logFailedAction(req, "CREATE", "VEHICLE_EXTERNAL_REPAIR", null, error instanceof Error ? error.message : "Failed to create vehicle external repair");
      res.status(500).json({ error: "Failed to create vehicle external repair" });
    }
  }
);

/**
 * PUT /api/vehicles/:vehicleId/external-repairs/:repairId
 * Update an external repair record for a vehicle
 */
router.put(
  "/:vehicleId/external-repairs/:repairId",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const vehicleId = req.params.vehicleId as string;
      const repairId = req.params.repairId as string;
      const { repair_name, provider_name, description, service_date, notes } = req.body;

      const { data: vehicle, error: vehicleError } = await supabaseAdmin
        .from("vehicles")
        .select("id, branch_id")
        .eq("id", vehicleId)
        .single();

      if (vehicleError || !vehicle) {
        if (vehicleError?.code === "PGRST116") {
          res.status(404).json({ error: "Vehicle not found" });
          return;
        }
        res.status(500).json({ error: vehicleError?.message || "Failed to fetch vehicle" });
        return;
      }

      if (!req.user!.roles.includes("HM") && !req.user!.branchIds.includes(vehicle.branch_id)) {
        res.status(403).json({ error: "No access to this vehicle's branch" });
        return;
      }

      const { data: existing, error: existingError } = await supabaseAny
        .from("vehicle_external_repairs")
        .select("id, vehicle_id, repair_name, provider_name, description, service_date, notes")
        .eq("id", repairId)
        .eq("vehicle_id", vehicleId)
        .single();

      if (existingError || !existing) {
        if (existingError?.code === "PGRST116") {
          res.status(404).json({ error: "External repair not found" });
          return;
        }
        res.status(500).json({ error: existingError?.message || "Failed to fetch external repair" });
        return;
      }

      const updateData: Record<string, unknown> = {};

      if (repair_name !== undefined) {
        if (!String(repair_name).trim()) {
          res.status(400).json({ error: "External repair name is required" });
          return;
        }
        updateData.repair_name = String(repair_name).trim();
      }

      if (provider_name !== undefined) {
        if (!String(provider_name).trim()) {
          res.status(400).json({ error: "Provider name is required" });
          return;
        }
        updateData.provider_name = String(provider_name).trim();
      }

      if (description !== undefined) {
        if (!String(description).trim()) {
          res.status(400).json({ error: "Description is required" });
          return;
        }
        updateData.description = String(description).trim();
      }

      if (service_date !== undefined) {
        if (!service_date || Number.isNaN(new Date(service_date).getTime())) {
          res.status(400).json({ error: "Valid service date is required" });
          return;
        }
        updateData.service_date = new Date(service_date).toISOString();
      }

      if (notes !== undefined) {
        updateData.notes = notes?.trim() || null;
      }

      if (Object.keys(updateData).length === 0) {
        res.json(existing);
        return;
      }

      const { data, error } = await supabaseAny
        .from("vehicle_external_repairs")
        .update(updateData)
        .eq("id", repairId)
        .eq("vehicle_id", vehicleId)
        .select("*")
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "UPDATE",
          p_entity_type: "VEHICLE_EXTERNAL_REPAIR",
          p_entity_id: repairId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            vehicle_id: vehicleId,
            ...updateData,
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json(data);
    } catch (error) {
      console.error("Update vehicle external repair error:", error);
      await logFailedAction(req, "UPDATE", "VEHICLE_EXTERNAL_REPAIR", req.params.repairId as string || null, error instanceof Error ? error.message : "Failed to update vehicle external repair");
      res.status(500).json({ error: "Failed to update vehicle external repair" });
    }
  }
);

/**
 * DELETE /api/vehicles/:vehicleId/external-repairs/:repairId
 * Delete an external repair record for a vehicle
 */
router.delete(
  "/:vehicleId/external-repairs/:repairId",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const vehicleId = req.params.vehicleId as string;
      const repairId = req.params.repairId as string;

      const { data: vehicle, error: vehicleError } = await supabaseAdmin
        .from("vehicles")
        .select("id, branch_id")
        .eq("id", vehicleId)
        .single();

      if (vehicleError || !vehicle) {
        if (vehicleError?.code === "PGRST116") {
          res.status(404).json({ error: "Vehicle not found" });
          return;
        }
        res.status(500).json({ error: vehicleError?.message || "Failed to fetch vehicle" });
        return;
      }

      if (!req.user!.roles.includes("HM") && !req.user!.branchIds.includes(vehicle.branch_id)) {
        res.status(403).json({ error: "No access to this vehicle's branch" });
        return;
      }

      const { data: existing, error: existingError } = await supabaseAny
        .from("vehicle_external_repairs")
        .select("id, vehicle_id")
        .eq("id", repairId)
        .eq("vehicle_id", vehicleId)
        .single();

      if (existingError || !existing) {
        if (existingError?.code === "PGRST116") {
          res.status(404).json({ error: "External repair not found" });
          return;
        }
        res.status(500).json({ error: existingError?.message || "Failed to fetch external repair" });
        return;
      }

      const { error } = await supabaseAny
        .from("vehicle_external_repairs")
        .delete()
        .eq("id", repairId)
        .eq("vehicle_id", vehicleId);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "DELETE",
          p_entity_type: "VEHICLE_EXTERNAL_REPAIR",
          p_entity_id: repairId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            vehicle_id: vehicleId,
            deleted: true,
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json({ message: "External repair deleted successfully" });
    } catch (error) {
      console.error("Delete vehicle external repair error:", error);
      await logFailedAction(req, "DELETE", "VEHICLE_EXTERNAL_REPAIR", req.params.repairId as string || null, error instanceof Error ? error.message : "Failed to delete vehicle external repair");
      res.status(500).json({ error: "Failed to delete vehicle external repair" });
    }
  }
);

/**
 * GET /api/vehicles/:vehicleId/repair-history
 * Combined repair history: internal JO records + external repairs
 */
router.get(
  "/:vehicleId/repair-history",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const vehicleId = req.params.vehicleId as string;

      const { data: vehicle, error: vehicleError } = await supabaseAdmin
        .from("vehicles")
        .select("id, branch_id")
        .eq("id", vehicleId)
        .single();

      if (vehicleError || !vehicle) {
        if (vehicleError?.code === "PGRST116") {
          res.status(404).json({ error: "Vehicle not found" });
          return;
        }
        res.status(500).json({ error: vehicleError?.message || "Failed to fetch vehicle" });
        return;
      }

      if (!req.user!.roles.includes("HM") && !req.user!.branchIds.includes(vehicle.branch_id)) {
        res.status(403).json({ error: "No access to this vehicle's branch" });
        return;
      }

      const [{ data: internalRows, error: internalError }, { data: externalRows, error: externalError }] = await Promise.all([
        supabaseAdmin
          .from("job_orders")
          .select("id, order_number, status, total_amount, created_at, approved_at, start_time, completion_time")
          .eq("vehicle_id", vehicleId),
        supabaseAny
          .from("vehicle_external_repairs")
          .select("id, repair_name, provider_name, description, notes, service_date, created_at")
          .eq("vehicle_id", vehicleId),
      ]);

      if (internalError) {
        res.status(500).json({ error: internalError.message });
        return;
      }
      if (externalError) {
        res.status(500).json({ error: externalError.message });
        return;
      }

      const internalHistory: VehicleRepairHistoryItem[] = (internalRows || []).map((row: any) => {
        const occurredAt = row.completion_time || row.start_time || row.approved_at || row.created_at;
        return {
          id: row.id,
          history_type: "internal",
          occurred_at: occurredAt,
          title: row.order_number,
          subtitle: String(row.status || "internal"),
          internal: {
            job_order_id: row.id,
            order_number: row.order_number,
            status: row.status,
            total_amount: Number(row.total_amount || 0),
          },
        };
      });

      const externalHistory: VehicleRepairHistoryItem[] = (externalRows || []).map((row: any) => ({
        id: row.id,
        history_type: "external",
        occurred_at: row.service_date || row.created_at,
        title: row.repair_name,
        subtitle: row.provider_name,
        external: {
          repair_name: row.repair_name,
          provider_name: row.provider_name,
          description: row.description,
          notes: row.notes,
        },
      }));

      const merged = [...internalHistory, ...externalHistory].sort((a, b) => {
        const aTs = new Date(a.occurred_at).getTime();
        const bTs = new Date(b.occurred_at).getTime();
        return bTs - aTs;
      });

      res.json(merged);
    } catch (error) {
      console.error("Get vehicle repair history error:", error);
      res.status(500).json({ error: "Failed to fetch vehicle repair history" });
    }
  }
);

/**
 * POST /api/vehicles
 * Create a new vehicle
 * HM, POC, JS, R can create
 */
router.post(
  "/",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        plate_number,
        vehicle_type,
        vehicle_class,
        make,
        orcr,
        model,
        customer_id,
        branch_id,
        status,
        color,
        year,
        conduction_sticker,
        chassis_number,
        notes,
      } = req.body;

      // Validation: plate_number required
      if (!plate_number || !plate_number.trim()) {
        res.status(400).json({ error: "Plate number is required" });
        return;
      }

      const normalizedPlate = plate_number.trim().toUpperCase();
      if (!PLATE_NUMBER_PATTERN.test(normalizedPlate)) {
        res.status(400).json({ error: "Plate number must follow AAA-000 or AAA-0000 format" });
        return;
      }

      // Validation: vehicle_type
      if (!vehicle_type || !VALID_VEHICLE_TYPES.includes(vehicle_type)) {
        res.status(400).json({
          error: `Vehicle type must be one of: ${VALID_VEHICLE_TYPES.join(", ")}`,
        });
        return;
      }

      // Validation: vehicle_class (optional, defaults to 'light')
      if (vehicle_class && !VALID_VEHICLE_CLASSES.includes(vehicle_class)) {
        res.status(400).json({
          error: `Vehicle class must be one of: ${VALID_VEHICLE_CLASSES.join(", ")}`,
        });
        return;
      }

      // Validation: model required
      if (!model || !model.trim()) {
        res.status(400).json({ error: "Model is required" });
        return;
      }

      // Validation: customer_id required
      if (!customer_id) {
        res.status(400).json({ error: "Customer is required" });
        return;
      }

      // Validation: branch_id required
      if (!branch_id) {
        res.status(400).json({ error: "Branch is required" });
        return;
      }

      // Branch access check for non-HM users
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      // Verify customer exists and belongs to the same branch
      const { data: customer, error: customerError } = await supabaseAdmin
        .from("customers")
        .select("id, branch_id, full_name")
        .eq("id", customer_id)
        .single();

      if (customerError || !customer) {
        res.status(400).json({ error: "Customer not found" });
        return;
      }

      if (customer.branch_id !== branch_id) {
        res.status(400).json({
          error: "Vehicle must belong to the same branch as the customer",
        });
        return;
      }

      // Check plate_number uniqueness
      const { data: existingPlate } = await supabaseAdmin
        .from("vehicles")
        .select("id")
        .eq("plate_number", normalizedPlate)
        .maybeSingle();

      if (existingPlate) {
        res.status(409).json({ error: "A vehicle with this plate number already exists" });
        return;
      }

      // Validate year if provided
      if (year !== undefined && year !== null) {
        const yearNum = parseInt(year);
        if (isNaN(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear() + 1) {
          res.status(400).json({ error: "Invalid year" });
          return;
        }
      }

      const { data: vehicle, error } = await supabaseAdmin
        .from("vehicles")
        .insert({
          plate_number: normalizedPlate,
          vehicle_type,
          vehicle_class: vehicle_class || "light",
          make: make?.trim() || "Unknown",
          orcr: orcr?.trim() || "",
          model: model.trim(),
          customer_id,
          branch_id,
          status: status || "active",
          color: color?.trim() || null,
          year: year ? parseInt(year) : null,
          conduction_sticker: conduction_sticker?.trim() || null,
          chassis_number: chassis_number?.trim() || null,
          notes: notes?.trim() || null,
          created_by: req.user!.id,
        })
        .select(
          `
          *,
          branches(id, name, code),
          customers(id, full_name, contact_number, email)
        `
        )
        .single();

      if (error) {
        if (error.code === "23505") {
          res.status(409).json({ error: "A vehicle with this plate number already exists" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Fix audit log user_id (trigger may set it from created_by)
      await fixAuditLogUser("VEHICLE", vehicle.id, "CREATE", req.user!.id, req.user!.branchIds[0] || null);

      res.status(201).json(vehicle);
    } catch (error) {
      console.error("Create vehicle error:", error);
      await logFailedAction(req, "CREATE", "VEHICLE", null, error instanceof Error ? error.message : "Failed to create vehicle");
      res.status(500).json({ error: "Failed to create vehicle" });
    }
  }
);

/**
 * PUT /api/vehicles/:vehicleId
 * Update a vehicle
 * HM, POC, JS, R can update
 */
router.put(
  "/:vehicleId",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const vehicleId = req.params.vehicleId as string;
      const {
        plate_number,
        vehicle_type,
        vehicle_class,
        make,
        orcr,
        model,
        customer_id,
        branch_id,
        status,
        color,
        year,
        conduction_sticker,
        chassis_number,
        notes,
      } = req.body;

      // Get existing vehicle
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("vehicles")
        .select("*")
        .eq("id", vehicleId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Vehicle not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access check for non-HM users
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this vehicle's branch" });
        return;
      }

      // Build update payload
      const updateData: Record<string, unknown> = {};

      if (plate_number !== undefined) {
        if (!plate_number.trim()) {
          res.status(400).json({ error: "Plate number cannot be empty" });
          return;
        }
        const newPlate = plate_number.trim().toUpperCase();
        if (!PLATE_NUMBER_PATTERN.test(newPlate)) {
          res.status(400).json({ error: "Plate number must follow AAA-000 or AAA-0000 format" });
          return;
        }
        // Check uniqueness if plate changed
        if (newPlate !== existing.plate_number) {
          const { data: existingPlate } = await supabaseAdmin
            .from("vehicles")
            .select("id")
            .eq("plate_number", newPlate)
            .neq("id", vehicleId)
            .maybeSingle();

          if (existingPlate) {
            res.status(409).json({ error: "A vehicle with this plate number already exists" });
            return;
          }
        }
        updateData.plate_number = newPlate;
      }

      if (vehicle_type !== undefined) {
        if (!VALID_VEHICLE_TYPES.includes(vehicle_type)) {
          res.status(400).json({
            error: `Vehicle type must be one of: ${VALID_VEHICLE_TYPES.join(", ")}`,
          });
          return;
        }
        updateData.vehicle_type = vehicle_type;
      }

      if (vehicle_class !== undefined) {
        if (!VALID_VEHICLE_CLASSES.includes(vehicle_class)) {
          res.status(400).json({
            error: `Vehicle class must be one of: ${VALID_VEHICLE_CLASSES.join(", ")}`,
          });
          return;
        }
        updateData.vehicle_class = vehicle_class;
      }

      if (make !== undefined) {
        updateData.make = make?.trim() || "Unknown";
      }

      if (orcr !== undefined) {
        updateData.orcr = orcr?.trim() || "";
      }

      if (model !== undefined) {
        if (!model.trim()) {
          res.status(400).json({ error: "Model cannot be empty" });
          return;
        }
        updateData.model = model.trim();
      }

      if (customer_id !== undefined) {
        // Verify new customer exists and same branch
        const { data: customer, error: customerError } = await supabaseAdmin
          .from("customers")
          .select("id, branch_id")
          .eq("id", customer_id)
          .single();

        if (customerError || !customer) {
          res.status(400).json({ error: "Customer not found" });
          return;
        }

        const targetBranchId = (branch_id !== undefined ? branch_id : existing.branch_id) as string;
        if (customer.branch_id !== targetBranchId) {
          res.status(400).json({
            error: "Vehicle must belong to the same branch as the customer",
          });
          return;
        }
        updateData.customer_id = customer_id;
      }

      if (branch_id !== undefined) {
        if (!req.user!.roles.includes("HM") && !req.user!.branchIds.includes(branch_id)) {
          res.status(403).json({ error: "No access to this branch" });
          return;
        }

        const targetCustomerId = (customer_id !== undefined ? customer_id : existing.customer_id) as string;
        const { data: customerForBranch, error: customerForBranchError } = await supabaseAdmin
          .from("customers")
          .select("id, branch_id")
          .eq("id", targetCustomerId)
          .single();

        if (customerForBranchError || !customerForBranch) {
          res.status(400).json({ error: "Customer not found" });
          return;
        }

        if (customerForBranch.branch_id !== branch_id) {
          res.status(400).json({
            error: "Vehicle must belong to the same branch as the customer",
          });
          return;
        }

        updateData.branch_id = branch_id;
      }

      if (status !== undefined) {
        if (!["active", "inactive"].includes(status)) {
          res.status(400).json({ error: "Status must be 'active' or 'inactive'" });
          return;
        }
        updateData.status = status;
      }

      if (color !== undefined) {
        updateData.color = color?.trim() || null;
      }

      if (year !== undefined) {
        if (year !== null) {
          const yearNum = parseInt(year);
          if (isNaN(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear() + 1) {
            res.status(400).json({ error: "Invalid year" });
            return;
          }
          updateData.year = yearNum;
        } else {
          updateData.year = null;
        }
      }

      if (conduction_sticker !== undefined) {
        updateData.conduction_sticker = conduction_sticker?.trim() || null;
      }
      if (chassis_number !== undefined) {
        updateData.chassis_number = chassis_number?.trim() || null;
      }
      if (notes !== undefined) {
        updateData.notes = notes?.trim() || null;
      }

      if (Object.keys(updateData).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      // Filter out fields that haven't actually changed
      const actualChanges = filterUnchangedFields(updateData, existing);
      if (Object.keys(actualChanges).length === 0) {
        // No real changes — return existing data without triggering an update
        const { data: current } = await supabaseAdmin
          .from("vehicles")
          .select(`*, branches(id, name, code), customers(id, full_name, contact_number, email)`)
          .eq("id", vehicleId)
          .single();
        res.json(current);
        return;
      }

      const { data: vehicle, error } = await supabaseAdmin
        .from("vehicles")
        .update(actualChanges)
        .eq("id", vehicleId)
        .select(
          `
          *,
          branches(id, name, code),
          customers(id, full_name, contact_number, email)
        `
        )
        .single();

      if (error) {
        if (error.code === "23505") {
          res.status(409).json({ error: "A vehicle with this plate number already exists" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Fix audit log user_id (trigger may set it from created_by)
      await fixAuditLogUser("VEHICLE", vehicleId, "UPDATE", req.user!.id, req.user!.branchIds[0] || null);

      res.json(vehicle);
    } catch (error) {
      console.error("Update vehicle error:", error);
      await logFailedAction(req, "UPDATE", "VEHICLE", (req.params.vehicleId as string) || null, error instanceof Error ? error.message : "Failed to update vehicle");
      res.status(500).json({ error: "Failed to update vehicle" });
    }
  }
);

/**
 * GET /api/vehicles/:vehicleId/references
 * Check if a vehicle has any references (job orders)
 */
router.get(
  "/:vehicleId/references",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const vehicleId = req.params.vehicleId as string;

      const { count, error } = await supabaseAdmin
        .from("job_orders")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", vehicleId);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({ hasReferences: (count ?? 0) > 0, count: count ?? 0 });
    } catch (error) {
      console.error("Check vehicle references error:", error);
      res.status(500).json({ error: "Failed to check references" });
    }
  }
);

/**
 * DELETE /api/vehicles/:vehicleId
 * Smart delete: hard-delete if no references exist, soft-delete otherwise
 * HM, POC, JS, R can delete
 */
router.delete(
  "/:vehicleId",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const vehicleId = req.params.vehicleId as string;

      // Get existing vehicle
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("vehicles")
        .select("*")
        .eq("id", vehicleId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Vehicle not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access check for non-HM users
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this vehicle's branch" });
        return;
      }

      // Check if vehicle has any references in job_orders
      const { count: joCount } = await supabaseAdmin
        .from("job_orders")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", vehicleId);

      if (joCount && joCount > 0) {
        // Has references — soft delete (set status to inactive)
        const { error } = await supabaseAdmin
          .from("vehicles")
          .update({ status: "inactive" as "active" | "inactive" })
          .eq("id", vehicleId);

        if (error) {
          res.status(500).json({ error: error.message });
          return;
        }

        // Log soft delete with correct user
        try {
          await supabaseAdmin.rpc("log_admin_action", {
            p_action: "UPDATE",
            p_entity_type: "VEHICLE",
            p_entity_id: vehicleId,
            p_performed_by_user_id: req.user!.id,
            p_performed_by_branch_id: req.user!.branchIds[0] || null,
            p_new_values: { status: "inactive", reason: "soft_delete" },
          });
        } catch (auditErr) {
          console.error("Audit log error:", auditErr);
        }

        res.json({ message: "Vehicle deactivated (has existing job orders)" });
      } else {
        // No references — hard delete

        // Remove audit logs for this vehicle first
        await supabaseAdmin
          .from("audit_logs")
          .delete()
          .eq("entity_type", "VEHICLE")
          .eq("entity_id", vehicleId);

        const { error } = await supabaseAdmin
          .from("vehicles")
          .delete()
          .eq("id", vehicleId);

        if (error) {
          res.status(500).json({ error: error.message });
          return;
        }

        // Log hard delete with correct user
        try {
          await supabaseAdmin.rpc("log_admin_action", {
            p_action: "DELETE",
            p_entity_type: "VEHICLE",
            p_entity_id: vehicleId,
            p_performed_by_user_id: req.user!.id,
            p_performed_by_branch_id: req.user!.branchIds[0] || null,
            p_new_values: { plate_number: existing.plate_number, deleted: true },
          });
        } catch (auditErr) {
          console.error("Audit log error:", auditErr);
        }

        res.json({ message: "Vehicle deleted successfully" });
      }
    } catch (error) {
      console.error("Delete vehicle error:", error);
      await logFailedAction(req, "DELETE", "VEHICLE", (req.params.vehicleId as string) || null, error instanceof Error ? error.message : "Failed to deactivate vehicle");
      res.status(500).json({ error: "Failed to deactivate vehicle" });
    }
  }
);

export default router;
