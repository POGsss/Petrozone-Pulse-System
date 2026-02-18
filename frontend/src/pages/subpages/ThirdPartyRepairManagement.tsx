import { useState, useEffect, useMemo } from "react";
import {
    LuPlus,
    LuCircleAlert,
    LuRefreshCw,
    LuTrash2,
    LuPencil,
    LuChevronLeft,
    LuChevronRight,
    LuSearch,
    LuWrench,
    LuEye,
} from "react-icons/lu";
import { thirdPartyRepairsApi, jobOrdersApi } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { useAuth } from "../../auth";
import {
    Modal,
    ModalSection,
    ModalInput,
    ModalSelect,
    ModalButtons,
    ModalError,
} from "../../components";
import type { ThirdPartyRepair, JobOrder } from "../../types";

const ITEMS_PER_PAGE = 10;

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function formatPrice(price: number): string {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
    }).format(price);
}

export function ThirdPartyRepairManagement() {
    const { user } = useAuth();
    const userRoles = user?.roles || [];

    // All listed roles can CRUD third-party repairs
    const canCreate = userRoles.some((r) =>
        ["HM", "POC", "JS", "R", "T"].includes(r)
    );
    const canUpdate = canCreate;
    const canDelete = canCreate;

    // Data state
    const [allRepairs, setAllRepairs] = useState<ThirdPartyRepair[]>([]);
    const [jobOrders, setJobOrders] = useState<JobOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Search & pagination
    const [searchQuery, setSearchQuery] = useState("");
    const [currentPage, setCurrentPage] = useState(1);

    // View modal
    const [showViewModal, setShowViewModal] = useState(false);
    const [viewRepair, setViewRepair] = useState<ThirdPartyRepair | null>(null);

    // Add modal
    const [showAddModal, setShowAddModal] = useState(false);
    const [addingRepair, setAddingRepair] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [addForm, setAddForm] = useState({
        job_order_id: "",
        provider_name: "",
        description: "",
        cost: "",
        repair_date: new Date().toISOString().split("T")[0],
        notes: "",
    });

    // Edit modal
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingRepair, setEditingRepair] = useState(false);
    const [editRepair, setEditRepair] = useState<ThirdPartyRepair | null>(null);
    const [editForm, setEditForm] = useState({
        provider_name: "",
        description: "",
        cost: "",
        repair_date: "",
        notes: "",
    });
    const [editError, setEditError] = useState<string | null>(null);

    // Delete modal
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deletingRepair, setDeletingRepair] = useState(false);
    const [repairToDelete, setRepairToDelete] = useState<ThirdPartyRepair | null>(
        null
    );

    // Computed stats
    const stats = useMemo(() => {
        const total = allRepairs.length;
        const totalCost = allRepairs.reduce((sum, r) => sum + r.cost, 0);
        return { total, totalCost };
    }, [allRepairs]);

    // Filtered and paginated
    const { filteredRepairs, paginatedRepairs, totalPages } = useMemo(() => {
        const q = searchQuery.toLowerCase();
        const filtered = allRepairs.filter((repair) => {
            return (
                !q ||
                repair.provider_name.toLowerCase().includes(q) ||
                repair.description.toLowerCase().includes(q) ||
                repair.job_orders?.order_number?.toLowerCase().includes(q) ||
                repair.job_orders?.customers?.full_name?.toLowerCase().includes(q) ||
                repair.notes?.toLowerCase().includes(q)
            );
        });
        const total = Math.ceil(filtered.length / ITEMS_PER_PAGE);
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return {
            filteredRepairs: filtered,
            paginatedRepairs: filtered.slice(start, start + ITEMS_PER_PAGE),
            totalPages: total,
        };
    }, [allRepairs, searchQuery, currentPage]);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    async function fetchData() {
        try {
            setLoading(true);
            setError(null);
            const [repairsRes, jobOrdersRes] = await Promise.all([
                thirdPartyRepairsApi.getAll({ limit: 1000 }),
                jobOrdersApi.getAll({ limit: 1000 }),
            ]);
            setAllRepairs(repairsRes.data);
            setJobOrders(jobOrdersRes.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch data");
        } finally {
            setLoading(false);
        }
    }

    // Job order options for the add form
    const jobOrderOptions = useMemo(() => {
        return jobOrders.map((jo) => ({
            value: jo.id,
            label: `${jo.order_number} — ${jo.customers?.full_name || "Unknown"}`,
        }));
    }, [jobOrders]);

    // --- Add ---
    function openAddModal() {
        setAddForm({
            job_order_id: "",
            provider_name: "",
            description: "",
            cost: "",
            repair_date: new Date().toISOString().split("T")[0],
            notes: "",
        });
        setAddError(null);
        setShowAddModal(true);
    }

    async function handleCreateRepair(e: React.FormEvent) {
        e.preventDefault();
        setAddError(null);

        if (!addForm.job_order_id) {
            setAddError("Job order is required");
            return;
        }
        if (!addForm.provider_name.trim()) {
            setAddError("Provider name is required");
            return;
        }
        if (!addForm.description.trim()) {
            setAddError("Description is required");
            return;
        }
        if (
            !addForm.cost ||
            isNaN(Number(addForm.cost)) ||
            Number(addForm.cost) < 0
        ) {
            setAddError("Valid cost is required");
            return;
        }
        if (!addForm.repair_date) {
            setAddError("Repair date is required");
            return;
        }

        try {
            setAddingRepair(true);
            await thirdPartyRepairsApi.create({
                job_order_id: addForm.job_order_id,
                provider_name: addForm.provider_name.trim(),
                description: addForm.description.trim(),
                cost: Number(addForm.cost),
                repair_date: addForm.repair_date,
                notes: addForm.notes.trim() || undefined,
            });
            setShowAddModal(false);
            showToast.success("Third-party repair created successfully");
            fetchData();
        } catch (err) {
            setAddError(
                err instanceof Error ? err.message : "Failed to create repair"
            );
            showToast.error(
                err instanceof Error ? err.message : "Failed to create repair"
            );
        } finally {
            setAddingRepair(false);
        }
    }

    // --- View ---
    function openViewModal(repair: ThirdPartyRepair) {
        setViewRepair(repair);
        setShowViewModal(true);
    }

    // --- Edit ---
    function openEditModal(repair: ThirdPartyRepair) {
        setEditRepair(repair);
        setEditForm({
            provider_name: repair.provider_name,
            description: repair.description,
            cost: String(repair.cost),
            repair_date: repair.repair_date,
            notes: repair.notes || "",
        });
        setEditError(null);
        setShowEditModal(true);
    }

    async function handleEditRepair(e: React.FormEvent) {
        e.preventDefault();
        if (!editRepair) return;
        setEditError(null);

        if (!editForm.provider_name.trim()) {
            setEditError("Provider name is required");
            return;
        }
        if (!editForm.description.trim()) {
            setEditError("Description is required");
            return;
        }
        if (
            !editForm.cost ||
            isNaN(Number(editForm.cost)) ||
            Number(editForm.cost) < 0
        ) {
            setEditError("Valid cost is required");
            return;
        }
        if (!editForm.repair_date) {
            setEditError("Repair date is required");
            return;
        }

        try {
            setEditingRepair(true);
            await thirdPartyRepairsApi.update(editRepair.id, {
                provider_name: editForm.provider_name.trim(),
                description: editForm.description.trim(),
                cost: Number(editForm.cost),
                repair_date: editForm.repair_date,
                notes: editForm.notes.trim() || null,
            });
            setShowEditModal(false);
            setEditRepair(null);
            showToast.success("Third-party repair updated successfully");
            fetchData();
        } catch (err) {
            setEditError(
                err instanceof Error ? err.message : "Failed to update repair"
            );
            showToast.error(
                err instanceof Error ? err.message : "Failed to update repair"
            );
        } finally {
            setEditingRepair(false);
        }
    }

    // --- Delete ---
    function openDeleteModal(repair: ThirdPartyRepair) {
        setRepairToDelete(repair);
        setShowDeleteModal(true);
    }

    async function handleDeleteRepair() {
        if (!repairToDelete) return;
        try {
            setDeletingRepair(true);
            await thirdPartyRepairsApi.delete(repairToDelete.id);
            setShowDeleteModal(false);
            setRepairToDelete(null);
            showToast.success("Third-party repair deleted successfully");
            fetchData();
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to delete repair"
            );
            showToast.error(
                err instanceof Error ? err.message : "Failed to delete repair"
            );
        } finally {
            setDeletingRepair(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <LuRefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    if (error && allRepairs.length === 0) {
        return (
            <div className="bg-negative-200 border border-negative rounded-lg p-4 flex items-center gap-3">
                <LuCircleAlert className="w-5 h-5 text-negative-950 flex-shrink-0" />
                <div>
                    <p className="text-sm text-negative-950">{error}</p>
                    <button
                        onClick={fetchData}
                        className="text-sm text-negative-900 hover:underline mt-1"
                    >
                        Try again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header with title and add button */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between bg-white rounded-xl p-4 border border-neutral-200">
                <div>
                    <h3 className="text-lg font-semibold text-neutral-950">
                        Third-Party Repairs
                    </h3>
                    <p className="text-sm text-neutral-900">
                        Summary of outsourced repairs
                    </p>
                </div>
                {canCreate && (
                    <button
                        onClick={openAddModal}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-950 transition-colors"
                    >
                        <LuPlus className="w-4 h-4" />
                        Add Repair
                    </button>
                )}
            </div>

            {/* Summary Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white border border-neutral-200 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary-100 rounded-lg">
                            <LuWrench className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm text-neutral-900">Total Repairs</p>
                            <p className="text-2xl font-bold text-neutral-950">
                                {stats.total}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="bg-white border border-neutral-200 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-secondary-100 rounded-lg">
                            <LuWrench className="w-5 h-5 text-secondary-950" />
                        </div>
                        <div>
                            <p className="text-sm text-neutral-900">Total Cost</p>
                            <p className="text-2xl font-bold text-neutral-950">
                                {formatPrice(stats.totalCost)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Table Section */}
            <div className="bg-white border border-neutral-200 rounded-xl">
                {/* Table Header with Search */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border-b border-neutral-200">
                    <div className="relative">
                        <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                        <input
                            type="text"
                            placeholder="Search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-4 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-primary w-full sm:w-64"
                        />
                    </div>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden p-4">
                    <div className="grid grid-cols-1 gap-4">
                        {paginatedRepairs.map((repair) => (
                            <div
                                key={repair.id}
                                onClick={() => openViewModal(repair)}
                                className="bg-white rounded-xl border border-neutral-200 p-4 cursor-pointer hover:bg-neutral-50 transition-colors"
                            >
                                {/* Card header */}
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-secondary-100 rounded-lg">
                                            <LuWrench className="w-5 h-5 text-secondary-950" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-neutral-950">
                                                {repair.provider_name}
                                            </h4>
                                            {repair.job_orders && (
                                                <span className="text-xs font-mono bg-neutral-100 text-primary px-2 py-0.5 rounded">
                                                    {repair.job_orders.order_number}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className="px-2 py-1 rounded text-xs font-medium bg-primary-100 text-primary whitespace-nowrap">
                                        {formatPrice(repair.cost)}
                                    </span>
                                </div>

                                {/* Details */}
                                <div className="space-y-1 text-sm text-neutral-900 mb-3">
                                    <p className="text-neutral-900 line-clamp-2">
                                        {repair.description}
                                    </p>
                                    <p className="text-neutral-900">
                                        {repair.job_orders?.customers?.full_name || "—"}
                                    </p>
                                    <p className="text-neutral-900">
                                        {formatDate(repair.repair_date)}
                                    </p>
                                </div>

                                {/* Actions */}
                                <div
                                    className={`flex items-center justify-end ${canUpdate || canDelete ? "gap-4 pt-3 border-t border-neutral-200" : ""}`}
                                >
                                    {canUpdate && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openEditModal(repair);
                                            }}
                                            className="flex items-center gap-1 text-sm text-primary hover:text-primary-900"
                                        >
                                            <LuPencil className="w-4 h-4" />
                                            Edit
                                        </button>
                                    )}
                                    {canDelete && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openDeleteModal(repair);
                                            }}
                                            className="flex items-center gap-1 text-sm text-negative hover:text-negative-900"
                                        >
                                            <LuTrash2 className="w-4 h-4" />
                                            Delete
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {paginatedRepairs.length === 0 && (
                            <div className="col-span-full text-center py-12 text-neutral-900">
                                {searchQuery
                                    ? "No repairs match your search."
                                    : 'No third-party repairs found. Click "Add Repair" to create one.'}
                            </div>
                        )}
                    </div>
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-neutral-200 bg-neutral-100">
                                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">
                                    Provider
                                </th>
                                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">
                                    Customer
                                </th>
                                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">
                                    Job Order
                                </th>
                                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">
                                    Cost
                                </th>
                                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">
                                    Repair Date
                                </th>
                                <th className="text-left py-3 px-4 text-sm font-medium text-neutral-950 whitespace-nowrap">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRepairs.map((repair) => (
                                <tr
                                    key={repair.id}
                                    onClick={() => openViewModal(repair)}
                                    className="border-b border-neutral-200 hover:bg-neutral-100 transition-colors cursor-pointer"
                                >
                                    <td className="py-3 px-4 whitespace-nowrap">
                                        <span className="font-medium text-neutral-900">
                                            {repair.provider_name}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 whitespace-nowrap text-sm text-neutral-900">
                                        {repair.job_orders?.customers?.full_name || "—"}
                                    </td>
                                    <td className="py-3 px-4 whitespace-nowrap">
                                        <span className="px-2 py-0.5 bg-neutral-100 text-primary rounded text-xs font-mono">
                                            {repair.job_orders?.order_number || "—"}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 whitespace-nowrap text-sm text-neutral-900">
                                        {formatPrice(repair.cost)}
                                    </td>
                                    <td className="py-3 px-4 whitespace-nowrap text-sm text-neutral-900">
                                        {formatDate(repair.repair_date)}
                                    </td>
                                    <td className="py-3 px-4 whitespace-nowrap">
                                        <div className="flex items-center justify-center gap-2">
                                            {canUpdate && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openEditModal(repair);
                                                    }}
                                                    className="p-2 text-primary-950 hover:text-primary-900 hover:bg-primary-50 rounded-lg transition-colors"
                                                    title="Edit repair"
                                                >
                                                    <LuPencil className="w-4 h-4" />
                                                </button>
                                            )}
                                            {canDelete && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openDeleteModal(repair);
                                                    }}
                                                    className="p-2 text-negative-950 hover:text-negative-900 hover:bg-negative-50 rounded-lg transition-colors"
                                                    title="Delete repair"
                                                >
                                                    <LuTrash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                            {!canUpdate && !canDelete && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openViewModal(repair);
                                                    }}
                                                    className="p-2 text-positive-950 hover:text-positive-900 rounded-lg transition-colors"
                                                    title="View repair"
                                                >
                                                    <LuEye className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {paginatedRepairs.length === 0 && (
                        <div className="text-center py-12 text-neutral-900">
                            {searchQuery
                                ? "No repairs match your search."
                                : 'No third-party repairs found. Click "Add Repair" to create one.'}
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {filteredRepairs.length > ITEMS_PER_PAGE && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4">
                        <p className="text-sm text-neutral-900">
                            {(currentPage - 1) * ITEMS_PER_PAGE + 1}-
                            {Math.min(
                                currentPage * ITEMS_PER_PAGE,
                                filteredRepairs.length
                            )}{" "}
                            of {filteredRepairs.length} repairs
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-2 border border-neutral-200 rounded-lg text-neutral-900 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <LuChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-sm text-neutral-900 px-2">
                                {currentPage} of {totalPages}
                            </span>
                            <button
                                onClick={() =>
                                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                                }
                                disabled={currentPage === totalPages}
                                className="p-2 border border-neutral-200 rounded-lg text-neutral-900 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <LuChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ========== View Repair Modal ========== */}
            <Modal
                isOpen={showViewModal && !!viewRepair}
                onClose={() => setShowViewModal(false)}
                title="Repair Details"
                maxWidth="lg"
            >
                {viewRepair && (
                    <div>
                        <ModalSection title="Repair Information">
                            <ModalInput
                                type="text"
                                value={viewRepair.provider_name}
                                onChange={() => { }}
                                placeholder="Provider Name"
                                disabled
                            />
                            <ModalInput
                                type="text"
                                value={viewRepair.description}
                                onChange={() => { }}
                                placeholder="Description"
                                disabled
                            />
                            <ModalInput
                                type="text"
                                value={formatPrice(viewRepair.cost)}
                                onChange={() => { }}
                                placeholder="Cost"
                                disabled
                            />
                            <ModalInput
                                type="text"
                                value={formatDate(viewRepair.repair_date)}
                                onChange={() => { }}
                                placeholder="Repair Date"
                                disabled
                            />
                        </ModalSection>

                        <ModalSection title="Job Order">
                            <ModalInput
                                type="text"
                                value={viewRepair.job_orders?.order_number || "—"}
                                onChange={() => { }}
                                placeholder="Order Number"
                                disabled
                            />
                            <ModalInput
                                type="text"
                                value={viewRepair.job_orders?.customers?.full_name || "—"}
                                onChange={() => { }}
                                placeholder="Customer"
                                disabled
                            />
                            {viewRepair.job_orders?.vehicles && (
                                <ModalInput
                                    type="text"
                                    value={`${viewRepair.job_orders.vehicles.plate_number} ${viewRepair.job_orders.vehicles.model}`}
                                    onChange={() => { }}
                                    placeholder="Vehicle"
                                    disabled
                                />
                            )}
                        </ModalSection>

                        {viewRepair.notes && (
                            <ModalSection title="Notes">
                                <div className="px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 text-sm whitespace-pre-wrap">
                                    {viewRepair.notes}
                                </div>
                            </ModalSection>
                        )}

                        <ModalSection title="Timestamps">
                            <div className="grid grid-cols-2 gap-4">
                                <ModalInput
                                    type="text"
                                    value={formatDate(viewRepair.created_at)}
                                    onChange={() => { }}
                                    placeholder="Created"
                                    disabled
                                />
                                <ModalInput
                                    type="text"
                                    value={formatDate(viewRepair.updated_at)}
                                    onChange={() => { }}
                                    placeholder="Updated"
                                    disabled
                                />
                            </div>
                        </ModalSection>
                    </div>
                )}
            </Modal>

            {/* ========== Add Repair Modal ========== */}
            <Modal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                title="Add Third-Party Repair"
                maxWidth="lg"
            >
                <form onSubmit={handleCreateRepair}>
                    <ModalSection title="Repair Information">
                        <ModalSelect
                            value={addForm.job_order_id}
                            onChange={(v) => setAddForm((f) => ({ ...f, job_order_id: v }))}
                            placeholder="Select Job Order *"
                            options={jobOrderOptions}
                        />
                        <ModalInput
                            type="text"
                            value={addForm.provider_name}
                            onChange={(v) =>
                                setAddForm((f) => ({ ...f, provider_name: v }))
                            }
                            placeholder="Provider Name *"
                            required
                        />
                        <textarea
                            value={addForm.description}
                            onChange={(e) =>
                                setAddForm((f) => ({ ...f, description: e.target.value }))
                            }
                            placeholder="Description *"
                            rows={3}
                            className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
                        />
                        <ModalInput
                            type="number"
                            value={addForm.cost}
                            onChange={(v) => setAddForm((f) => ({ ...f, cost: v }))}
                            placeholder="Cost (PHP) *"
                            required
                        />
                        <input
                            type="date"
                            value={addForm.repair_date}
                            onChange={(e) =>
                                setAddForm((f) => ({ ...f, repair_date: e.target.value }))
                            }
                            placeholder="Repair Date *"
                            required
                            className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                        />
                    </ModalSection>

                    <ModalSection title="Additional Notes">
                        <textarea
                            value={addForm.notes}
                            onChange={(e) =>
                                setAddForm((f) => ({ ...f, notes: e.target.value }))
                            }
                            placeholder="Notes (optional)"
                            rows={2}
                            className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
                        />
                    </ModalSection>

                    <ModalError message={addError} />
                    <ModalButtons
                        onCancel={() => setShowAddModal(false)}
                        submitText={addingRepair ? "Adding..." : "Add Repair"}
                        loading={addingRepair}
                    />
                </form>
            </Modal>

            {/* ========== Edit Repair Modal ========== */}
            <Modal
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                title="Edit Third-Party Repair"
                maxWidth="lg"
            >
                <form onSubmit={handleEditRepair}>
                    <ModalSection title="Repair Information">
                        {/* Job order is read-only on edit */}
                        <ModalInput
                            type="text"
                            value={
                                editRepair?.job_orders?.order_number ||
                                editRepair?.job_order_id ||
                                "—"
                            }
                            onChange={() => { }}
                            placeholder="Job Order"
                            disabled
                        />
                        <ModalInput
                            type="text"
                            value={editForm.provider_name}
                            onChange={(v) =>
                                setEditForm((f) => ({ ...f, provider_name: v }))
                            }
                            placeholder="Provider Name *"
                            required
                        />
                        <textarea
                            value={editForm.description}
                            onChange={(e) =>
                                setEditForm((f) => ({ ...f, description: e.target.value }))
                            }
                            placeholder="Description *"
                            rows={3}
                            className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
                        />
                        <ModalInput
                            type="number"
                            value={editForm.cost}
                            onChange={(v) => setEditForm((f) => ({ ...f, cost: v }))}
                            placeholder="Cost (PHP) *"
                            required
                        />
                        <input
                            type="date"
                            value={editForm.repair_date}
                            onChange={(e) =>
                                setEditForm((f) => ({ ...f, repair_date: e.target.value }))
                            }
                            placeholder="Repair Date *"
                            required
                            className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                        />
                    </ModalSection>

                    <ModalSection title="Additional Notes">
                        <textarea
                            value={editForm.notes}
                            onChange={(e) =>
                                setEditForm((f) => ({ ...f, notes: e.target.value }))
                            }
                            placeholder="Notes (optional)"
                            rows={2}
                            className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
                        />
                    </ModalSection>

                    <ModalError message={editError} />
                    <ModalButtons
                        onCancel={() => setShowEditModal(false)}
                        submitText={editingRepair ? "Saving..." : "Save Changes"}
                        loading={editingRepair}
                    />
                </form>
            </Modal>

            {/* ========== Delete Confirmation Modal ========== */}
            <Modal
                isOpen={showDeleteModal && !!repairToDelete}
                onClose={() => setShowDeleteModal(false)}
                title="Delete Third-Party Repair"
                maxWidth="sm"
            >
                {repairToDelete && (
                    <div>
                        <div className="bg-neutral-100 rounded-xl p-4 my-4">
                            <p className="text-neutral-900">
                                Are you sure you want to delete the repair from{" "}
                                <strong className="text-neutral-950">
                                    {repairToDelete.provider_name}
                                </strong>
                                ?
                            </p>
                        </div>
                        <p className="text-sm text-neutral-900 mb-2">
                            This action cannot be undone. The repair record will be
                            permanently removed.
                        </p>

                        <div className="flex gap-3 mt-6">
                            <button
                                type="button"
                                onClick={() => setShowDeleteModal(false)}
                                className="flex-1 px-4 py-3.5 border-2 border-negative text-negative rounded-xl font-semibold hover:bg-negative-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteRepair}
                                disabled={deletingRepair}
                                className="flex-1 px-4 py-3.5 bg-negative text-white rounded-xl font-semibold hover:bg-negative-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {deletingRepair ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
