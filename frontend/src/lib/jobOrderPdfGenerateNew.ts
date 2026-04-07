import { jsPDF } from "jspdf";
import type { JobOrder } from "../types";

const BLACK: [number, number, number] = [0, 0, 0];
const YELLOW: [number, number, number] = [255, 242, 0];
const LIGHT_GRAY: [number, number, number] = [230, 230, 230];
const NOTE_RED: [number, number, number] = [180, 0, 0];

const headerLogoModules = import.meta.glob("../assets/joLogo.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
const HEADER_LOGO_URL: string | null = Object.values(headerLogoModules)[0] || null;

interface PrintableLine {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

function toUpper(value?: string | null): string {
  return (value || "-").toUpperCase();
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US");
}

function formatTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  const safeText = text || "-";
  if (doc.getTextWidth(safeText) <= maxWidth) return safeText;

  let trimmed = safeText;
  while (trimmed.length > 0 && doc.getTextWidth(`${trimmed}...`) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.length > 0 ? `${trimmed}...` : "-";
}

function drawLabeledCell(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  labelHeight = 4,
  valueHeight = 6
): number {
  doc.setDrawColor(...BLACK);
  doc.rect(x, y, width, labelHeight + valueHeight);

  doc.setFont("times", "bold");
  doc.setFontSize(6);
  doc.text(label, x + 1.2, y + 2.8);

  doc.setFont("times", "bold");
  doc.setFontSize(7);
  doc.text(fitText(doc, value, width - 2.4), x + 1.2, y + labelHeight + 3.8);

  return labelHeight + valueHeight;
}

function getLineItems(order: JobOrder): PrintableLine[] {
  if (order.job_order_lines && order.job_order_lines.length > 0) {
    return order.job_order_lines.map((line) => ({
      description: line.name || line.line_type,
      quantity: Number(line.quantity || 0),
      unitPrice: Number(line.unit_price || 0),
      total: Number(line.total || 0),
    }));
  }

  return (order.job_order_items || []).map((item) => {
    const unitPrice = Number(item.labor_price || 0) + Number(item.inventory_cost || 0);
    return {
      description: item.package_item_name || "Line Item",
      quantity: Number(item.quantity || 0),
      unitPrice,
      total: Number(item.line_total || 0),
    };
  });
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();

    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function createJobOrderPDFNewDocument(order: JobOrder): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageX = 10;
  const pageY = 10;
  const pageW = 190;

  let y = pageY + 3;

  doc.setFont("times", "bold");
  doc.setTextColor(...BLACK);
  doc.setFontSize(10);
  doc.text("JOB ESTIMATE", pageX + 2, y + 2);

  doc.setFontSize(6);
  doc.text("PETRON CAR CARE CENTER CALOOCAN", pageX + 2, y + 5.8);
  doc.text("100 TULLAHAN ROAD BRGY 162 STA. QUITERIA CALOOCAN CITY", pageX + 2, y + 9.2);
  doc.text("CONTACT NO: 09919385065/0956724221", pageX + 2, y + 12.6);

  const headerLogoDataUrl = HEADER_LOGO_URL ? await toDataUrl(HEADER_LOGO_URL) : null;
  if (headerLogoDataUrl) {
    const format = headerLogoDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
    doc.addImage(headerLogoDataUrl, format, pageX + pageW - 54, pageY + 0.8, 54, 22);
  }

  const refColumnX = pageX + 108 + 32;
  doc.setFontSize(6.5);
  doc.text("JE NO:", refColumnX + 1.2, y + 24.6);

  y += 24;

  const c1 = 108;
  const c2 = 32;
  const c3 = pageW - c1 - c2;

  y += 1;
  const formStartY = y;
  drawLabeledCell(doc, pageX, y, c1, "NAME OF CUSTOMER (LAST, FIRST, MI)", toUpper(order.customers?.full_name));
  drawLabeledCell(doc, pageX + c1, y, c2, "DATE PREPARED", formatDate(order.created_at));
  drawLabeledCell(doc, pageX + c1 + c2, y, c3, "REF (JOB ESTIMATE NO)", toUpper(order.order_number));

  y += 10;
  drawLabeledCell(doc, pageX, y, c1 + c2, "POSITIVE VOLTAGE ELECTRICAL SUPPLY", toUpper(order.job_type.replace("_", " ")));
  drawLabeledCell(doc, pageX + c1 + c2, y, c3, "CELLPHONE NO:", toUpper(order.customers?.contact_number));

  y += 10;
  drawLabeledCell(doc, pageX, y, c1 + c2, "ADDRESS:", toUpper(order.branches?.address || "-"));
  drawLabeledCell(doc, pageX + c1 + c2, y, c3, "", "");

  y += 10;

  doc.setFont("times", "bold");
  doc.setFontSize(6);
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(pageX, y, pageW, 5.2, "FD");
  doc.text("VEHICLE INFORMATION", pageX + pageW / 2, y + 3.5, { align: "center" });

  y += 5.2;
  const vehicleHeaders = ["YEAR", "MAKE", "MODEL", "PLATE NUMBER", "KM READING", "TIME IN", "TIME OUT"];
  const vehicleValues = [
    "-",
    toUpper(order.vehicles?.vehicle_type),
    toUpper(order.vehicles?.model),
    toUpper(order.vehicles?.plate_number),
    order.odometer_reading ? String(order.odometer_reading) : "-",
    formatTime(order.start_time),
    formatTime(order.completion_time),
  ];
  const vehicleWidths = [16, 25, 39, 33, 25, 26, 26];

  let vx = pageX;
  for (let i = 0; i < vehicleHeaders.length; i += 1) {
    doc.rect(vx, y, vehicleWidths[i], 4.8);
    doc.setFont("times", "bold");
    doc.setFontSize(6);
    doc.text(vehicleHeaders[i], vx + vehicleWidths[i] / 2, y + 3.1, { align: "center" });
    vx += vehicleWidths[i];
  }

  y += 4.8;
  vx = pageX;
  for (let i = 0; i < vehicleValues.length; i += 1) {
    doc.rect(vx, y, vehicleWidths[i], 5.2);
    doc.setFont("times", "bold");
    doc.setFontSize(7);
    doc.text(fitText(doc, vehicleValues[i], vehicleWidths[i] - 2), vx + vehicleWidths[i] / 2, y + 3.6, { align: "center" });
    vx += vehicleWidths[i];
  }

  y += 5.2;
  doc.rect(pageX, y, pageW, 6);
  doc.setFont("times", "bold");
  doc.setFontSize(6);
  doc.text("CUSTOMER INSTRUCTION", pageX + 1.2, y + 3.8);
  doc.setFontSize(7);
  doc.text(fitText(doc, toUpper(order.notes || "-"), pageW - 46), pageX + 45, y + 3.8);

  y += 6;
  const lineItems = getLineItems(order);
  const titleFromLine = lineItems[0]?.description ? toUpper(lineItems[0].description) : "JOB ORDER DETAILS";

  doc.setFillColor(...YELLOW);
  doc.rect(pageX, y, pageW, 5, "FD");
  doc.setFont("times", "bold");
  doc.setFontSize(7);
  doc.text(fitText(doc, titleFromLine, pageW - 4), pageX + pageW / 2, y + 3.4, { align: "center" });

  y += 5;
  doc.rect(pageX, y, pageW, 4.2);
  doc.setFontSize(6);
  doc.text("DETAILS", pageX + pageW / 2, y + 2.9, { align: "center" });

  y += 4.2;
  const d1 = 150;
  const d2 = 16;
  const d3 = pageW - d1 - d2;

  doc.setFillColor(...YELLOW);
  doc.rect(pageX, y, d1, 5.2, "FD");
  doc.rect(pageX + d1, y, d2, 5.2, "FD");
  doc.rect(pageX + d1 + d2, y, d3, 5.2, "FD");

  doc.setFont("times", "bold");
  doc.setFontSize(7);
  doc.text("DESCRIPTION", pageX + 1.2, y + 3.5);
  doc.text("QTY", pageX + d1 + d2 / 2, y + 3.5, { align: "center" });
  doc.text("SRP", pageX + d1 + d2 + d3 / 2, y + 3.5, { align: "center" });

  y += 5.2;
  const maxRows = 14;
  const printableRows = lineItems.slice(0, maxRows);
  const rowHeight = 6;

  let totalQty = 0;
  let computedTotal = 0;

  for (let i = 0; i < maxRows; i += 1) {
    const row = printableRows[i];

    doc.rect(pageX, y, d1, rowHeight);
    doc.rect(pageX + d1, y, d2, rowHeight);
    doc.rect(pageX + d1 + d2, y, d3, rowHeight);

    if (row) {
      totalQty += row.quantity;
      computedTotal += row.total;

      doc.setFont("times", "bold");
      doc.setFontSize(7);
      doc.text(fitText(doc, toUpper(row.description), d1 - 2), pageX + 1.2, y + 4.1);

      doc.text(String(row.quantity), pageX + d1 + d2 / 2, y + 4.1, { align: "center" });
      doc.text(formatMoney(row.total), pageX + d1 + d2 + d3 - 1.2, y + 4.1, { align: "right" });
    }

    y += rowHeight;
  }

  if (lineItems.length > maxRows) {
    doc.setFont("times", "italic");
    doc.setFontSize(6);
    doc.text(`... ${lineItems.length - maxRows} more line item(s) not shown`, pageX + 1.2, y - 1.4);
  }

  const grandTotal = Number(order.total_amount || computedTotal);

  doc.setFillColor(...YELLOW);
  doc.rect(pageX, y, d1, 5.2, "FD");
  doc.rect(pageX + d1, y, d2, 5.2, "FD");
  doc.rect(pageX + d1 + d2, y, d3, 5.2, "FD");

  doc.setFont("times", "bold");
  doc.setFontSize(7);
  doc.text("TOTAL", pageX + 1.2, y + 3.5);
  doc.text(String(totalQty), pageX + d1 + d2 / 2, y + 3.5, { align: "center" });
  doc.text(formatMoney(grandTotal), pageX + d1 + d2 + d3 - 1.2, y + 3.5, { align: "right" });

  y += 5.2;
  doc.rect(pageX, y, pageW, 19.5);

  doc.setTextColor(...NOTE_RED);
  doc.setFont("times", "bold");
  doc.setFontSize(6.5);
  doc.text("Note: Price may change anytime", pageX + 1.2, y + 3.7);

  doc.setTextColor(...BLACK);
  doc.setFontSize(5.5);
  doc.text("TERMS AND CONDITIONS", pageX + 1.2, y + 7);
  doc.setFont("times", "normal");
  const termsText = [
    "I hereby authorize the above repair work to be done and all necessary materials to be supplied by Petron Car Care Center under the conditions printed herein.",
    "Where estimates on costs of repairs are required, it is agreed that they are only estimates and are not binding. Price to be charged will be those ruling at time of invoicing.",
    "It is further agreed that this car is left in Petron Car Care Center for necessary work including testing to be carried out entirely at my risk and no responsibility will be borne by your workshop for loss or damage incurred while it is left in their charge.",
  ].join(" ");
  doc.setFontSize(5.2);
  const termsLines = doc.splitTextToSize(termsText, pageW - 2.4);
  doc.text(termsLines.slice(0, 5), pageX + 1.2, y + 9.8);

  y += 19.5;
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(pageX, y, pageW, 4.8, "FD");
  doc.setFont("times", "bold");
  doc.setFontSize(6);
  doc.text("PRINT NAME & SIGN/INDICATE DATE SIGNED", pageX + pageW / 2, y + 3.2, { align: "center" });

  y += 4.8;
  const s1 = 58;
  const s2 = 64;
  const s3 = pageW - s1 - s2;
  doc.rect(pageX, y, s1, 12.5);
  doc.rect(pageX + s1, y, s2, 12.5);
  doc.rect(pageX + s1 + s2, y, s3, 12.5);

  doc.setFont("times", "bold");
  doc.setFontSize(6);
  doc.text("PREPARED BY (SERVICE ADVISOR)", pageX + 1.2, y + 3.5);
  doc.text("TECHNICIAN", pageX + s1 + 1.2, y + 3.5);
  doc.text("CONFORME (CUSTOMER OR AUTHORIZED REPRESENTATIVE)", pageX + s1 + s2 + 1.2, y + 3.5);

  doc.setFontSize(7);
  doc.text(toUpper(order.branches?.code || "-"), pageX + 1.2, y + 9.2);
  doc.text(toUpper(order.assigned_technician?.full_name || "-"), pageX + s1 + 1.2, y + 9.2);
  doc.text(toUpper(order.customers?.full_name || "-"), pageX + s1 + s2 + 1.2, y + 9.2);

  const formEndY = y + 12.5;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.3);
  doc.rect(pageX, formStartY, pageW, formEndY - formStartY);

  return doc;
}

export async function generateJobOrderPDFNew(order: JobOrder): Promise<void> {
  const doc = await createJobOrderPDFNewDocument(order);
  doc.save(`${order.order_number}_estimate.pdf`);
}

export async function generateJobOrderPDFNewBlob(order: JobOrder): Promise<Blob> {
  const doc = await createJobOrderPDFNewDocument(order);
  return doc.output("blob") as Blob;
}
