import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { InvoiceStatus } from "@/lib/invoiceStatus";

export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type InvoiceInsert = Database["public"]["Tables"]["invoices"]["Insert"];
export type InvoiceUpdate = Database["public"]["Tables"]["invoices"]["Update"];
export type InvoiceItemRow = Database["public"]["Tables"]["invoice_items"]["Row"];
export type InvoiceItemInsert = Database["public"]["Tables"]["invoice_items"]["Insert"];
export type UninvoicedTimeEntry = Database["public"]["Functions"]["get_uninvoiced_time_entries"]["Returns"][number];
export type Letterhead = Database["public"]["Functions"]["get_company_letterhead"]["Returns"][number];

/** `invoices` joined with the client's display name — same embedded-resource-select shape as Zeiterfassung's `TimeEntryWithClient`, and for the same reason (`supabase-js` doesn't type embedded resources from `Database` on its own). */
export type InvoiceWithClient = Invoice & { clients: { name: string } | null };

/** Full detail for the editor: the invoice, its client's name and full address (for the preview panel), and its items in display order. */
export interface InvoiceDetail {
  invoice: Invoice;
  client: { name: string; client_number: string; street: string | null; zip_code: string | null; city: string | null };
  items: InvoiceItemRow[];
}

/** The client's letterhead-relevant fields, for the live preview of a not-yet-saved draft — once an invoice exists, `fetchInvoiceDetail`'s own join covers this instead. */
export async function fetchClientAddress(
  clientId: string,
): Promise<{ name: string; client_number: string; street: string | null; zip_code: string | null; city: string | null }> {
  const { data, error } = await supabase.from("clients").select("name, client_number, street, zip_code, city").eq("id", clientId).single();
  if (error) throw error;
  return data;
}

export async function fetchInvoices(): Promise<InvoiceWithClient[]> {
  const { data, error } = await supabase.from("invoices").select("*, clients(name)").order("invoice_number", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchInvoiceDetail(id: string): Promise<InvoiceDetail> {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("*, clients(name, client_number, street, zip_code, city)")
    .eq("id", id)
    .single();
  if (invoiceError) throw invoiceError;

  const { data: items, error: itemsError } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("sort_order");
  if (itemsError) throw itemsError;

  const { clients, ...invoiceRow } = invoice;
  return { invoice: invoiceRow, client: clients!, items };
}

/** Preview only — does NOT consume `invoice_number_seq` (docs/DATABASE_SCHEMA.md §5). Never sent back to the server as the real number; the real one comes from the column DEFAULT on INSERT. */
export async function fetchNextInvoiceNumberPreview(): Promise<number> {
  const { data, error } = await supabase.rpc("generate_next_invoice_number");
  if (error) throw error;
  return data;
}

/** Not `SECURITY DEFINER` (docs/DATABASE_SCHEMA.md §7) — the caller's own RLS on `time_entries` still applies, so this only ever returns entries the caller could see anyway. */
export async function fetchUninvoicedTimeEntries(clientId: string): Promise<UninvoicedTimeEntry[]> {
  const { data, error } = await supabase.rpc("get_uninvoiced_time_entries", { client_uuid: clientId });
  if (error) throw error;
  return data;
}

/** Never exposes `jmap_*` — see docs/DATABASE_SCHEMA.md §7. Used for the HTML/CSS invoice preview, not for the actual PDF (generate-pdf renders server-side from the same RPC). */
export async function fetchLetterhead(): Promise<Letterhead> {
  const { data, error } = await supabase.rpc("get_company_letterhead");
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("get_company_letterhead returned no row");
  return row;
}

export async function createDraftInvoice(data: InvoiceInsert): Promise<Invoice> {
  const { data: row, error } = await supabase.from("invoices").insert(data).select().single();
  if (error) throw error;
  return row;
}

/**
 * Delete-all-then-reinsert, matching the old app's `replaceInvoiceItems` —
 * simpler than diffing an edited item list against its previous rows, and
 * the `sync_time_entry_invoiced()` trigger (docs/DATABASE_SCHEMA.md §4)
 * reacts correctly to the DELETE (un-invoicing) and the following INSERT
 * (re-invoicing) either way. Only ever called while the invoice is still
 * `draft` — `enforce_invoice_items_immutability()` would reject both
 * halves otherwise.
 */
export async function replaceInvoiceItems(invoiceId: string, items: readonly Omit<InvoiceItemInsert, "invoice_id" | "sort_order">[]): Promise<InvoiceItemRow[]> {
  const { error: deleteError } = await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
  if (deleteError) throw deleteError;

  if (items.length === 0) return [];
  const payload: InvoiceItemInsert[] = items.map((item, index) => ({ ...item, invoice_id: invoiceId, sort_order: index }));
  const { data, error: insertError } = await supabase.from("invoice_items").insert(payload).select();
  if (insertError) throw insertError;
  return data;
}

export async function updateInvoiceTotal(invoiceId: string, totalAmount: number): Promise<Invoice> {
  const { data, error } = await supabase.from("invoices").update({ total_amount: totalAmount }).eq("id", invoiceId).select().single();
  if (error) throw error;
  return data;
}

export async function updateInvoiceMeta(invoiceId: string, data: Pick<InvoiceUpdate, "date_due" | "notes">): Promise<Invoice> {
  const { data: row, error } = await supabase.from("invoices").update(data).eq("id", invoiceId).select().single();
  if (error) throw error;
  return row;
}

/** Admin-only in practice: `invoices_update`'s `WITH CHECK` requires the RESULTING row to still be `own AND status = 'draft'`, unless `is_admin()` — so only an admin can move an invoice's status anywhere but the one direction that leaves it draft (i.e. nowhere). See ROADMAP.md's Rechnungen entry. */
export async function updateInvoiceStatus(invoiceId: string, status: InvoiceStatus): Promise<Invoice> {
  const { data, error } = await supabase.from("invoices").update({ status }).eq("id", invoiceId).select().single();
  if (error) throw error;
  return data;
}

/** Only reachable while `draft` (RLS) — items cascade, and the `time_entries` they were linked to revert via the same trigger that invoiced them. */
export async function deleteInvoice(invoiceId: string): Promise<void> {
  const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
  if (error) throw error;
}

export async function generateInvoicePdf(invoiceId: string): Promise<{ storage_path: string }> {
  const { data, error } = await supabase.functions.invoke<{ storage_path: string }>("generate-pdf", {
    body: { invoice_id: invoiceId },
  });
  if (error) throw error;
  if (!data) throw new Error("generate-pdf returned no body");
  return data;
}

/** Objects are named `<invoice id>.pdf`, flat in the bucket root (docs/DATABASE_SCHEMA.md §9) — not `invoice.pdf_storage_path` verbatim, which is the FULL `invoice-pdfs/<id>.pdf` path (a prefix `.storage.from("invoice-pdfs")` already supplies). */
export async function downloadInvoicePdf(invoiceId: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from("invoice-pdfs").download(`${invoiceId}.pdf`);
  if (error) throw error;
  return data;
}
