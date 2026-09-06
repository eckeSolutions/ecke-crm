// generate-pdf — renders and stores the PDF for an invoice, per
// docs/API_CONTRACTS.md §2 and issue #1.
//
// Live-tested end to end through Kong against both the Supabase CLI's local
// stack and the self-hosted infrastructure/supabase/docker-compose.yml stack
// (6 Sep 2026): rendered a real invoice, stored it in the invoice-pdfs
// bucket, and read the resulting object back through storage RLS — a valid
// PDF 1.7 document.
//
// Long line-item descriptions wrap (word-wrapped against the description
// column's width) and invoices that overflow one A4 page continue onto
// further pages, each repeating the table header and the footer — see
// wrapText() / beginNewPage() below.
//
// Fonts are the design system's own — see "-- Fonts --" below for why
// body.woff2 needed a build-time step first, not a runtime embed
// (regenerate via scripts/build-fonts.py after that file changes).
//
// Error envelope matches docs/API_CONTRACTS.md: non-2xx status with
// { "error": { "code": "...", "message": "..." } }.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, PDFFont, PDFPage, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import {
  BODY_BOLD_B64,
  BODY_REGULAR_B64,
  WORDMARK_DOT_B64,
  WORDMARK_ECKE_B64,
  WORDMARK_SOLUTIONS_B64,
} from "./assets/fonts.generated.ts";

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// -- DE-locale formatting, mirroring apps/ecke_crm/lib/core/presentation/formatters.dart --

function formatEuro(amount: number): string {
  const fixed = amount.toFixed(2);
  const [wholeRaw, decimalPart] = fixed.split(".");
  const wholePart = wholeRaw.replace("-", "");

  let grouped = "";
  for (let i = 0; i < wholePart.length; i++) {
    if (i > 0 && (wholePart.length - i) % 3 === 0) grouped += ".";
    grouped += wholePart[i];
  }

  const sign = amount < 0 ? "-" : "";
  return `${sign}${grouped},${decimalPart} €`;
}

function formatDateDe(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
}

// Greedy word-wrap: fills each line up to maxWidth, breaking on whitespace.
// A single word wider than maxWidth is left to overflow rather than being
// split mid-word — line-item descriptions are natural-language text, not
// unbroken tokens, so this is assumed not to occur in practice.
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

// -- Brand colors, matching InvoicePdfBuilder's PdfColor constants --

const COLOR_ECKE_BLUE = rgb(0x00 / 255, 0x9d / 255, 0xe0 / 255);
const COLOR_NAVY = rgb(0x03 / 255, 0x1a / 255, 0x6b / 255);
const COLOR_DOT = rgb(0x00 / 255, 0xf5 / 255, 0x93 / 255);
const COLOR_INK = rgb(0x06 / 255, 0x1b / 255, 0x2b / 255);
const COLOR_MUTED = rgb(0x3c / 255, 0x4e / 255, 0x5c / 255);
const COLOR_FOOTER_GRAY = rgb(0x6e / 255, 0x7d / 255, 0x89 / 255);
const COLOR_HAIRLINE = rgb(0xd7 / 255, 0xe1 / 255, 0xe8 / 255);
const COLOR_ROW_DIVIDER = rgb(0xee / 255, 0xf3 / 255, 0xf6 / 255);

interface InvoiceItemRow {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface BuildPdfArgs {
  invoice: {
    invoice_number: number;
    date_issued: string;
    date_due: string | null;
    total_amount: number;
  };
  client: {
    name: string;
    client_number: string;
    street: string | null;
    zip_code: string | null;
    city: string | null;
  };
  items: InvoiceItemRow[];
  letterhead: {
    company_name: string | null;
    street: string | null;
    zip_code: string | null;
    city: string | null;
    tax_number: string | null;
    iban: string | null;
  };
}

function formattedAddress(entity: { street: string | null; zip_code: string | null; city: string | null }): string {
  const parts: string[] = [];
  if (entity.street) parts.push(entity.street);
  const cityLine = [entity.zip_code, entity.city].filter(Boolean).join(" ");
  if (cityLine) parts.push(cityLine);
  return parts.join(", ");
}

function senderAddressLine(letterhead: BuildPdfArgs["letterhead"]): string {
  const cityLine = [letterhead.zip_code, letterhead.city].filter(Boolean).join(" ");
  return [letterhead.street, cityLine].filter((p) => p && p.length > 0).join(" · ");
}

const PAGE_WIDTH = 595.28; // A4, points
const PAGE_HEIGHT = 841.89;
const ITEM_LINE_HEIGHT = 14;
// Lowest y a table row (or the total block) may start at before the page
// break kicks in -- leaves clearance above the footer's hairline (drawn at
// footerY + 12, footerY = 64) plus a small buffer.
const CONTENT_BOTTOM_Y = 100;
// Rough worst-case height of the "total + § 19 notice" block that must
// follow the last item row: top-border gap (10) + gap (10) + total line
// (16) + notice gap+2 lines (16 + 13) = 65, rounded up for headroom.
const TOTAL_BLOCK_HEIGHT = 75;

// -- Fonts --
//
// The design system's body face (assets/fonts/body.woff2, "Source Sans 3")
// is a *variable* font whose wght axis defaults to 200 (ExtraLight) — fine
// for CSS, which dials in a real weight per element, but pdf-lib/fontkit has
// no public hook to pick a specific instance out of a variable font: embed
// the file as-is and every glyph renders at its default instance, i.e. every
// invoice in ExtraLight. So body-regular.ttf / body-bold.ttf here are NOT
// copies of the design system's file — they're static wght=400 / wght=700
// instances, produced once at build time with fontTools' varLib.instancer
// (`pip install fonttools brotli`, then
// `instantiateVariableFont(TTFont("body.woff2"), {"wght": 400|700})`,
// `tt.flavor = None`, `tt.save(...)`) and committed here, since Deno's edge
// runtime has no fonttools/harfbuzz to do that at request time. Regenerate
// both if vendor/design-system's body.woff2 changes.
//
// The three wordmark faces need no instancing: tokens/fonts.css's
// @font-face rules show they're each already a single static instance
// (wght 420/660/580, one per wordmark part) — pre-instantiated the same way
// upstream in the design system, not still-variable files. They still go
// through the same build step as body-regular/body-bold, though, because
// pdf-lib has a separate problem with .woff2 specifically: embedding one
// as-is writes its raw WOFF2-*compressed* bytes into the PDF's font-program
// stream instead of the decompressed sfnt that stream is specified to hold.
// Chrome/Adobe tolerate it; MuPDF/FreeType don't ("FT_New_Memory_Face:
// unknown file format", confirmed live 6 Sep 2026 rasterizing the output
// with PyMuPDF). So every font here — instanced or not — is repacked to
// plain sfnt (.ttf) by scripts/build-fonts.py before it ever reaches pdf-lib.
//
// All five are base64-inlined TypeScript constants (assets/fonts.generated.ts),
// not sibling files read at request time — supabase/edge-runtime bundles a
// function's module graph before running it and does not carry along
// non-module files, so a plain Deno.readFile("./assets/...") 404s at request
// time ("path not found: /var/tmp/sb-compile-edge-runtime/..."), confirmed
// live 6 Sep 2026 against the self-hosted stack.
const decodeBase64Font = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function buildInvoicePdf(args: BuildPdfArgs): Promise<Uint8Array> {
  const { invoice, client, items, letterhead } = args;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const font = await doc.embedFont(decodeBase64Font(BODY_REGULAR_B64));
  const fontBold = await doc.embedFont(decodeBase64Font(BODY_BOLD_B64));
  const wordmarkEcke = await doc.embedFont(decodeBase64Font(WORDMARK_ECKE_B64)); // italic, wght 420
  const wordmarkDot = await doc.embedFont(decodeBase64Font(WORDMARK_DOT_B64)); // wght 660
  const wordmarkSolutions = await doc.embedFont(decodeBase64Font(WORDMARK_SOLUTIONS_B64)); // wght 580

  const marginLeft = 48;
  const marginRight = 48;
  const contentLeft = marginLeft;
  const contentRight = PAGE_WIDTH - marginRight;

  const colPos = contentLeft;
  const colDesc = colPos + 24;
  const colQtyRight = contentRight - 76 - 70;
  const colPriceRight = contentRight - 76;
  const colTotalRight = contentRight;
  const descMaxWidth = colQtyRight - colDesc - 12;
  const companyName = letterhead.company_name ?? "ecke.Solutions";

  // `page` and `y` are reassigned by beginNewPage() -- the draw* helpers
  // below close over these `let` bindings so every call draws onto
  // whichever page is current, not the page that existed when the helper
  // was defined.
  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 44;

  const drawText = (
    text: string,
    x: number,
    baselineY: number,
    f: PDFFont,
    size: number,
    color = COLOR_INK,
  ) => page.drawText(text, { x, y: baselineY, size, font: f, color });

  const drawRight = (text: string, rightX: number, baselineY: number, f: PDFFont, size: number, color = COLOR_INK) => {
    const w = f.widthOfTextAtSize(text, size);
    drawText(text, rightX - w, baselineY, f, size, color);
  };

  const drawHLine = (x1: number, x2: number, lineY: number, color = COLOR_HAIRLINE, thickness = 1) =>
    page.drawLine({ start: { x: x1, y: lineY }, end: { x: x2, y: lineY }, thickness, color });

  // Footer is redrawn on every page (not just the last) so a page that
  // gets separated from the rest still identifies the sender -- drawn
  // against an explicit page argument, since it must finalize the *outgoing*
  // page from inside beginNewPage(), before `page` is reassigned.
  const drawFooterOn = (targetPage: PDFPage) => {
    const footerY = 44 + 20;
    targetPage.drawLine({
      start: { x: contentLeft, y: footerY + 12 },
      end: { x: contentRight, y: footerY + 12 },
      thickness: 1,
      color: COLOR_HAIRLINE,
    });
    const footerLeft = letterhead.tax_number
      ? `${companyName}\nSteuernummer: ${letterhead.tax_number}`
      : companyName;
    footerLeft.split("\n").forEach((line, i) => {
      targetPage.drawText(line, { x: contentLeft, y: footerY - i * 11, size: 9, font, color: COLOR_FOOTER_GRAY });
    });
    if (letterhead.iban) {
      const label = `IBAN: ${letterhead.iban}`;
      const w = font.widthOfTextAtSize(label, 9);
      targetPage.drawText(label, { x: contentRight - w, y: footerY, size: 9, font, color: COLOR_FOOTER_GRAY });
    }
  };

  // Column header row -- drawn once on page 1 and again at the top of every
  // continuation page, so a reader can tell what each column means without
  // flipping back to page 1.
  const drawTableHeader = () => {
    drawHLine(contentLeft, contentRight, y + 7, COLOR_INK, 1.5);
    drawText("Pos.", colPos, y - 7, fontBold, 11, COLOR_INK);
    drawText("Beschreibung", colDesc, y - 7, fontBold, 11, COLOR_INK);
    drawRight("Menge", colQtyRight, y - 7, fontBold, 11, COLOR_INK);
    drawRight("Preis", colPriceRight, y - 7, fontBold, 11, COLOR_INK);
    drawRight("Gesamt", colTotalRight, y - 7, fontBold, 11, COLOR_INK);
    y -= 25;
    drawHLine(contentLeft, contentRight, y + 7, COLOR_HAIRLINE);
  };

  // Finalizes the current page (footer) and starts a fresh one with a
  // lightweight "Rechnung Nr. X — Fortsetzung" header, optionally
  // repeating the table's column header row.
  const beginNewPage = (withTableHeader: boolean) => {
    drawFooterOn(page);
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - 44;
    drawText(`Rechnung Nr. ${invoice.invoice_number}`, contentLeft, y, fontBold, 14, COLOR_INK);
    drawRight("Fortsetzung", contentRight, y, font, 11, COLOR_MUTED);
    y -= 30;
    if (withTableHeader) drawTableHeader();
  };

  // -- Header: wordmark left, company name + address right --
  const senderAddr = senderAddressLine(letterhead);

  // Matches components/components.css .wordmark: three parts, three
  // dedicated static faces (see "-- Fonts --" above), not one face reused.
  drawText("ecke", contentLeft, y, wordmarkEcke, 20, COLOR_ECKE_BLUE);
  const eckeWidth = wordmarkEcke.widthOfTextAtSize("ecke", 20);
  // --wm-dot-space: 0.05em of tracking after the dot, same token the CSS
  // wordmark uses.
  const dotSpace = 20 * 0.05;
  drawText(".", contentLeft + eckeWidth, y, wordmarkDot, 20, COLOR_DOT);
  const dotWidth = wordmarkDot.widthOfTextAtSize(".", 20) + dotSpace;
  drawText("Solutions", contentLeft + eckeWidth + dotWidth, y, wordmarkSolutions, 20, COLOR_NAVY);

  drawRight(companyName, contentRight, y + 4, font, 10.5, COLOR_MUTED);
  if (senderAddr) drawRight(senderAddr, contentRight, y - 9, font, 10.5, COLOR_MUTED);

  y -= 36;

  const underlineLabel = senderAddr ? `${companyName} · ${senderAddr}` : companyName;
  drawText(underlineLabel, contentLeft, y, font, 9, COLOR_FOOTER_GRAY);
  drawHLine(
    contentLeft,
    contentLeft + font.widthOfTextAtSize(underlineLabel, 9),
    y - 1.5,
    COLOR_FOOTER_GRAY,
    0.5,
  );
  y -= 6 + 11;

  drawText(client.name, contentLeft, y, font, 11, COLOR_INK);
  const clientAddress = formattedAddress(client);
  if (clientAddress) {
    y -= 14;
    drawText(clientAddress, contentLeft, y, font, 11, COLOR_INK);
  }

  y -= 32;

  drawText(`Rechnung Nr. ${invoice.invoice_number}`, contentLeft, y, fontBold, 18, COLOR_INK);
  const dueSuffix = invoice.date_due ? ` · Fällig ${formatDateDe(invoice.date_due)}` : "";
  drawRight(
    `Datum: ${formatDateDe(invoice.date_issued)} · Kundennr. ${client.client_number}${dueSuffix}`,
    contentRight,
    y + 4,
    font,
    11,
    COLOR_MUTED,
  );

  y -= 18 + 18; // gap + header row height

  // -- Item table --
  drawTableHeader();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const descLines = wrapText(item.description, font, 11.5, descMaxWidth);
    // 7 top padding + one 14pt line per wrapped line + 4 bottom padding --
    // for a single-line description this is 25, matching the fixed
    // rowHeight the unwrapped layout used before.
    const rowHeightNeeded = 11 + descLines.length * ITEM_LINE_HEIGHT;

    if (y - rowHeightNeeded < CONTENT_BOTTOM_Y) {
      beginNewPage(true);
    }

    const rowY = y - 7;
    drawText(`${i + 1}`, colPos, rowY, font, 11.5, COLOR_INK);
    descLines.forEach((line, li) => drawText(line, colDesc, rowY - li * ITEM_LINE_HEIGHT, font, 11.5, COLOR_INK));
    drawRight(formatQuantity(item.quantity), colQtyRight, rowY, font, 11.5, COLOR_INK);
    drawRight(formatEuro(item.unit_price), colPriceRight, rowY, font, 11.5, COLOR_INK);
    drawRight(formatEuro(item.line_total), colTotalRight, rowY, font, 11.5, COLOR_INK);
    y -= rowHeightNeeded;
    drawHLine(contentLeft, contentRight, y + 7, COLOR_ROW_DIVIDER);
  }

  if (y - TOTAL_BLOCK_HEIGHT < CONTENT_BOTTOM_Y) {
    beginNewPage(false);
  }

  y -= 10; // gap before the total row's top border
  drawHLine(contentRight - 200, contentRight, y + 3, COLOR_INK, 1.5);
  y -= 10;
  drawRight(`Gesamtbetrag  ${formatEuro(invoice.total_amount)}`, contentRight, y, fontBold, 13, COLOR_INK);

  y -= 16 + 13;
  const noticeLine2 = invoice.date_due
    ? `Bitte überweisen Sie den Betrag bis zum ${formatDateDe(invoice.date_due)} auf das unten genannte Konto.`
    : "Bitte überweisen Sie den Betrag auf das unten genannte Konto.";
  drawText("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.", contentLeft, y, font, 10.5, COLOR_MUTED);
  drawText(noticeLine2, contentLeft, y - 13, font, 10.5, COLOR_MUTED);

  drawFooterOn(page);

  return doc.save();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "Only POST is supported.");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse(401, "missing_authorization", "Missing Authorization header.");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Caller-scoped client: every read below (invoice, client, items,
  // letterhead) goes through this, so the caller's own RLS is what
  // actually decides whether they may see this invoice at all — the same
  // pattern as set-jmap-secret. service_role is only used afterwards, for
  // the storage write and the pdf_storage_path update.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser();
  if (userError || !user) {
    return errorResponse(401, "invalid_session", "Could not resolve the caller's session.");
  }

  let body: { invoice_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "invalid_body", "Expected a JSON body with an `invoice_id` field.");
  }
  const invoiceId = body.invoice_id?.trim();
  if (!invoiceId) {
    return errorResponse(400, "invalid_body", "`invoice_id` must be a non-empty string.");
  }

  const { data: profile, error: profileError } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) {
    return errorResponse(403, "profile_not_found", "Could not resolve the caller's profile.");
  }

  // RLS on `invoices` (own row, or admin) is what actually enforces "invoice
  // owner or admin" here — a caller without access simply gets no row back,
  // which we report as 404 rather than distinguishing "doesn't exist" from
  // "not yours," so this endpoint never confirms another user's invoice ids.
  const { data: invoice, error: invoiceError } = await callerClient
    .from("invoices")
    .select("id, invoice_number, date_issued, date_due, status, total_amount, client_id")
    .eq("id", invoiceId)
    .single();
  if (invoiceError || !invoice) {
    return errorResponse(404, "invoice_not_found", `Invoice ${invoiceId} was not found.`);
  }

  if (profile.role !== "admin" && invoice.status !== "draft") {
    return errorResponse(
      403,
      "invoice_not_draft",
      `Invoice ${invoice.invoice_number} is not a draft and cannot be regenerated.`,
    );
  }

  const { data: client, error: clientError } = await callerClient
    .from("clients")
    .select("name, client_number, street, zip_code, city")
    .eq("id", invoice.client_id)
    .single();
  if (clientError || !client) {
    return errorResponse(500, "client_not_found", "Could not load the invoice's client.");
  }

  const { data: items, error: itemsError } = await callerClient
    .from("invoice_items")
    .select("description, quantity, unit_price, line_total")
    .eq("invoice_id", invoiceId)
    .order("sort_order");
  if (itemsError) {
    return errorResponse(500, "items_load_failed", itemsError.message);
  }

  const { data: letterheadRows, error: letterheadError } = await callerClient.rpc(
    "get_company_letterhead",
  );
  const letterhead = letterheadRows?.[0];
  if (letterheadError || !letterhead) {
    return errorResponse(500, "letterhead_load_failed", letterheadError?.message ?? "no letterhead row returned");
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildInvoicePdf({
      invoice,
      client,
      items: items ?? [],
      letterhead,
    });
  } catch (err) {
    return errorResponse(500, "pdf_render_failed", err instanceof Error ? err.message : String(err));
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const objectPath = `${invoiceId}.pdf`;

  const { error: uploadError } = await adminClient.storage
    .from("invoice-pdfs")
    .upload(objectPath, pdfBytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    return errorResponse(500, "storage_upload_failed", uploadError.message);
  }

  const storagePath = `invoice-pdfs/${objectPath}`;
  const { error: updateError } = await adminClient
    .from("invoices")
    .update({ pdf_storage_path: storagePath })
    .eq("id", invoiceId);
  if (updateError) {
    return errorResponse(500, "invoice_update_failed", updateError.message);
  }

  return new Response(JSON.stringify({ storage_path: storagePath }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
