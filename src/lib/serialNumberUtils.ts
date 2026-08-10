/**
 * Serial Number Utility Functions
 * Enforces the strict standard format: [ST/SG]-[5 Karakter Abjad/Angka]-[3 Digit Angka]
 * Examples: ST-HECTG-001, ST-BEDAH-001, SG-GUNTI-001
 */

export const SERIAL_NUMBER_REGEX = /^((ST|SG)-[A-Z0-9]{5}-\d{3}|(ST|SG)-[A-Z0-9]{5}\d{2,3}-[A-Z0-9]+)$/;

export function validateSerialNumber(sn: string): boolean {
  if (!sn) return false;
  return SERIAL_NUMBER_REGEX.test(sn.trim().toUpperCase());
}

/**
 * Extracts clean 5-character abbreviation from item/group name or raw ID
 */
export function generate5CharAbbr(nameOrId: string): string {
  // Remove non-alphanumeric, convert to uppercase
  let clean = nameOrId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

  // Remove common prefix words like "SET" or "KIT" if followed by more text
  if (clean.startsWith("SET") && clean.length > 3) {
    clean = clean.substring(3);
  } else if (clean.startsWith("KIT") && clean.length > 3) {
    clean = clean.substring(3);
  }

  let abbr = clean.substring(0, 5);
  while (abbr.length < 5) {
    abbr += "X"; // Pad with 'X' to ensure exactly 5 characters
  }
  return abbr;
}

/**
 * Helper to get clean Kode Instalasi from origin unit
 */
export function getKodeInstalasi(unit: string): string {
  if (!unit) return "GEN1";
  const clean = unit.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  // If it already ends with a digit, use it, otherwise add '1'
  if (/\d$/.test(clean)) return clean;
  // Fallback limits to 4 chars + '1'
  return `${clean.substring(0, 4)}1`;
}

/**
 * Normalizes any raw ID or uploaded serial number into standard ST/SG-[5 Karakter]-[3 Digit]
 */
export function formatToStandardSerialNumber(
  rawId: string,
  name: string,
  type: "set" | "single",
  sequenceNumber: number = 1
): string {
  if (!rawId) rawId = "";
  const trimmedRaw = rawId.trim().toUpperCase();

  // If already perfectly matching standard format, return it
  if (SERIAL_NUMBER_REGEX.test(trimmedRaw)) {
    return trimmedRaw;
  }

  // Determine prefix: ST for set, SG for single
  let prefix = type === "set" ? "ST" : "SG";
  if (trimmedRaw.startsWith("ST-") || trimmedRaw.startsWith("ST_") || trimmedRaw.startsWith("ST")) {
    prefix = "ST";
  } else if (trimmedRaw.startsWith("SG-") || trimmedRaw.startsWith("SG_") || trimmedRaw.startsWith("SG")) {
    prefix = "SG";
  }

  // Extract trailing digits if present in rawId (e.g. st-bedah-minor1/ibs -> 1)
  let extractedSeq = sequenceNumber;
  const trailingDigitsMatch = trimmedRaw.match(/(\d+)(?:\/[A-Za-z0-9_]+)?$/);
  if (trailingDigitsMatch && trailingDigitsMatch[1]) {
    const parsed = parseInt(trailingDigitsMatch[1], 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 1000) {
      extractedSeq = parsed;
    }
  }

  // Generate 5-character abbreviation from name or rawId
  let nameForAbbr = name && name.trim() ? name : rawId;
  if (!name || !name.trim()) {
    nameForAbbr = rawId.replace(/[\/\\_]/g, " ");
  }

  const abbr = generate5CharAbbr(nameForAbbr);
  const seqStr = extractedSeq.toString().padStart(3, "0");

  return `${prefix}-${abbr}-${seqStr}`;
}
