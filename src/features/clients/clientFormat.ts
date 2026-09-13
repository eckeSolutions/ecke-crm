import type { Client } from "./api";

/** "Straße Hausnr, PLZ Ort" — ported from the old app's `Client.formattedAddress`. */
export function formatClientAddress(client: Pick<Client, "street" | "zip_code" | "city">): string {
  const parts: string[] = [];
  if (client.street) parts.push(client.street);
  const cityLine = [client.zip_code, client.city].filter(Boolean).join(" ");
  if (cityLine) parts.push(cityLine);
  return parts.join(", ");
}
