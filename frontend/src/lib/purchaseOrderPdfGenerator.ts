import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { PurchaseOrder } from "../types";

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

export function generatePurchaseOrderPDF(order: PurchaseOrder): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  let y = margin;

  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, pageWidth, 36, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("Purchase Order", margin, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(220, 230, 255);
  doc.text(
    `${order.po_number}  |  ${order.branches?.name || "Unknown Branch"}  |  ${formatDate(order.order_date)}`,
    margin,
    26
  );

  y = 44;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NEUTRAL_950);
  doc.text("PO Details", margin, y);
  y += 6;

  const details: [string, string][] = [
    ["PO Number", order.po_number],
    ["Status", order.status.toUpperCase()],
    ["Supplier", order.supplier_name || order.suppliers?.supplier_name || "-"],
    ["Branch", order.branches?.name || "-"],
    ["Order Date", formatDate(order.order_date)],
    ["Expected Delivery", formatDate(order.expected_delivery_date)],
    ["Received At", formatDate(order.received_at)],
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

  const itemRows = (order.purchase_order_items || []).map((item) => [
    item.inventory_items?.item_name || "Item",
    item.inventory_items?.sku_code || "-",
    String(item.quantity_ordered || 0),
    formatPrice(item.unit_cost || 0),
    formatPrice((item.quantity_ordered || 0) * (item.unit_cost || 0)),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Item", "SKU", "Qty", "Unit Cost", "Amount"]],
    body: itemRows.length > 0 ? itemRows : [["No items", "-", "-", "-", "-"]],
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
      0: { cellWidth: 66 },
      1: { cellWidth: 30 },
      2: { halign: "right", cellWidth: 18 },
      3: { halign: "right", cellWidth: 32 },
      4: { halign: "right", cellWidth: 32 },
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
        order.po_number,
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
  doc.text(`Total Amount: ${formatPrice(order.total_amount || 0)}`, pageWidth - margin, y, { align: "right" });

  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...NEUTRAL_600);
  const notesLines = doc.splitTextToSize(`Notes: ${order.notes || "-"}`, pageWidth - margin * 2);
  doc.text(notesLines, margin, y);

  doc.save(`${order.po_number}.pdf`);
}
