import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";

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
          `plate_number.ilike.${searchTerm},model.ilike.${searchTerm},color.ilike.${searchTerm},orcr.ilike.${searchTerm}`
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
        orcr,
        model,
        customer_id,
        branch_id,
        status,
        color,
        year,
        engine_number,
        chassis_number,
        notes,
      } = req.body;

      // Validation: plate_number required
      if (!plate_number || !plate_number.trim()) {
        res.status(400).json({ error: "Plate number is required" });
        return;
      }

      // Validation: vehicle_type
      if (!vehicle_type || !VALID_VEHICLE_TYPES.includes(vehicle_type)) {
        res.status(400).json({
          error: `Vehicle type must be one of: ${VALID_VEHICLE_TYPES.join(", ")}`,
        });
        return;
      }

      // Validation: orcr required
      if (!orcr || !orcr.trim()) {
        res.status(400).json({ error: "OR/CR is required" });
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
        .eq("plate_number", plate_number.trim().toUpperCase())
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
          plate_number: plate_number.trim().toUpperCase(),
          vehicle_type,
          orcr: orcr.trim(),
          model: model.trim(),
          customer_id,
          branch_id,
          status: status || "active",
          color: color?.trim() || null,
          year: year ? parseInt(year) : null,
          engine_number: engine_number?.trim() || null,
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

      // Update audit log with user_id
      await supabaseAdmin
        .from("audit_logs")
        .update({ user_id: req.user!.id })
        .eq("entity_type", "VEHICLE")
        .eq("entity_id", vehicle.id)
        .eq("action", "CREATE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

      res.status(201).json(vehicle);
    } catch (error) {
      console.error("Create vehicle error:", error);
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
        orcr,
        model,
        customer_id,
        status,
        color,
        year,
        engine_number,
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

      if (orcr !== undefined) {
        if (!orcr.trim()) {
          res.status(400).json({ error: "OR/CR cannot be empty" });
          return;
        }
        updateData.orcr = orcr.trim();
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

        if (customer.branch_id !== existing.branch_id) {
          res.status(400).json({
            error: "Vehicle must belong to the same branch as the customer",
          });
          return;
        }
        updateData.customer_id = customer_id;
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

      if (engine_number !== undefined) {
        updateData.engine_number = engine_number?.trim() || null;
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

      const { data: vehicle, error } = await supabaseAdmin
        .from("vehicles")
        .update(updateData)
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

      // Update audit log with user_id
      await supabaseAdmin
        .from("audit_logs")
        .update({ user_id: req.user!.id })
        .eq("entity_type", "VEHICLE")
        .eq("entity_id", vehicleId)
        .eq("action", "UPDATE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

      res.json(vehicle);
    } catch (error) {
      console.error("Update vehicle error:", error);
      res.status(500).json({ error: "Failed to update vehicle" });
    }
  }
);

/**
 * DELETE /api/vehicles/:vehicleId
 * Soft-delete a vehicle (set status to inactive)
 * HM, POC, JS, R can soft-delete
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

      // Soft delete: set status to inactive
      const { error } = await supabaseAdmin
        .from("vehicles")
        .update({ status: "inactive" as "active" | "inactive" })
        .eq("id", vehicleId);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Update audit log with user_id
      await supabaseAdmin
        .from("audit_logs")
        .update({ user_id: req.user!.id })
        .eq("entity_type", "VEHICLE")
        .eq("entity_id", vehicleId)
        .eq("action", "UPDATE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

      res.json({ message: "Vehicle deactivated successfully" });
    } catch (error) {
      console.error("Delete vehicle error:", error);
      res.status(500).json({ error: "Failed to deactivate vehicle" });
    }
  }
);

export default router;
