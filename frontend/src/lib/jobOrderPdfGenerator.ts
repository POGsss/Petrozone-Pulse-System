import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { JobOrder } from "../types";

const PRIMARY_COLOR: [number, number, number] = [85, 112, 241];
const NEUTRAL_950: [number, number, number] = [10, 10, 10];
const NEUTRAL_600: [number, number, number] = [115, 115, 115];
const NEUTRAL_200: [number, number, number] = [229, 229, 229];

function formatDate(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatPrice(value: number): string {
  return `PHP ${new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)}`;
}

function createJobOrderPDFDocument(order: JobOrder): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  let y = margin;

  const customerName = order.customers?.full_name || "-";
  const vehicleLabel = order.vehicles
    ? `${order.vehicles.plate_number} ${order.vehicles.model || ""}`.trim()
    : "-";

  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, pageWidth, 36, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(`Job Order Estimate`, margin, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(220, 230, 255);
  doc.text(
    `${order.order_number}  |  ${order.branches?.name || "Unknown Branch"}  |  ${formatDate(order.created_at)}`,
    margin,
    26
  );

  y = 44;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NEUTRAL_950);
  doc.text("Estimate Details", margin, y);
  y += 6;

  const details: [string, string][] = [
    ["Order Number", order.order_number],
    ["Status", order.status.replace(/_/g, " ")],
    ["Customer", customerName],
    ["Vehicle", vehicleLabel],
    ["Branch", order.branches?.name || "-"],
    ["Vehicle Class", order.vehicle_class || "-"],
    ["Created", formatDate(order.created_at)],
    ["Approved", formatDate(order.approved_at)],
  ];

  doc.setFontSize(9);
  for (const [label, value] of details) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...NEUTRAL_600);
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NEUTRAL_950);
    const valueLines = doc.splitTextToSize(value, pageWidth - (margin + 40) - margin);
    doc.text(valueLines, margin + 40, y);
    y += Math.max(5, valueLines.length * 4.2);
  }

  y += 6;

  const lineItems = (order.job_order_lines || []).map((line) => {
    const itemName = line.name || line.line_type.replace(/_/g, " ");
    return [
      itemName,
      String(line.quantity || 0),
      formatPrice(line.unit_price || 0),
      formatPrice(line.total || 0),
    ];
  });

  const legacyItems = (order.job_order_items || []).map((item) => [
    item.package_item_name || "Line Item",
    String(item.quantity || 0),
    formatPrice((item.labor_price || 0) + (item.inventory_cost || 0)),
    formatPrice(item.line_total || 0),
  ]);

  const bodyRows = lineItems.length > 0 ? lineItems : legacyItems;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Description", "Qty", "Unit Price", "Amount"]],
    body: bodyRows.length > 0 ? bodyRows : [["No line items", "-", "-", "-"]],
    styles: {
      fontSize: 7,
      textColor: NEUTRAL_950,
      lineColor: NEUTRAL_200,
      lineWidth: 0.1,
      cellPadding: 2.5,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: PRIMARY_COLOR,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles: {
      0: { cellWidth: 95 },
      1: { halign: "right", cellWidth: 18 },
      2: { halign: "right", cellWidth: 30 },
      3: { halign: "right", cellWidth: 35 },
    },
    didDrawPage: (hookData) => {
      const pageCount = doc.getNumberOfPages();
      const currentPage = hookData.pageNumber;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...NEUTRAL_600);
      doc.text(
        `Page ${currentPage} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: "center" }
      );
      doc.text(
        order.order_number,
        margin,
        doc.internal.pageSize.getHeight() - 8
      );
    },
  });

  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y;
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NEUTRAL_950);
  doc.text(`Estimated Total: ${formatPrice(order.total_amount || 0)}`, pageWidth - margin, y, { align: "right" });

  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...NEUTRAL_600);
  const notesLines = doc.splitTextToSize(`Notes: ${order.notes || "-"}`, pageWidth - margin * 2);
  doc.text(notesLines, margin, y);

  return doc;
}

export function generateJobOrderPDF(order: JobOrder): void {
  const doc = createJobOrderPDFDocument(order);
  doc.save(`${order.order_number}_estimate.pdf`);
}

export function generateJobOrderPDFBlob(order: JobOrder): Blob {
  const doc = createJobOrderPDFDocument(order);
  return doc.output("blob") as Blob;
}
