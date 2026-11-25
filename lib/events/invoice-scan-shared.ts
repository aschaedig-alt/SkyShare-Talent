// Scan a supplier invoice into the stock room - the client-safe half.
// Aimee's feedback cmwwjnqfj (Nov 25 2026): "i have an invoice from our swag
// supplier on items. i want to be able to upload the pdf (or any other file type)
// and have the system scan the document and add the info about it and the
// picture." Her samples: a TRUWEAR (Printavo) invoice plus one mock-up PDF per item.
//
// HER RULES (Nov 25 2026):
//   - An item's NAME is the invoice line's description - e.g. "Javalina Metallic
//     Stylus Pen" - which is also how she names each mock-up file. That is the name
//     used when ordering more. Never the heading printed inside a mock-up page.
//   - Invoice numbers do not matter; this is to get the item itself.
// What the samples showed (side-session note invoice-scan-samples.md): a mock-up's
// own title can differ from the invoice ("CUSTOM PEN - RED") and one even carried
// another item's title, so a picture is matched to its line by what it SHOWS.

/** One item the scan found, as the review list shows it. */
export type ScannedItem = {
  /** The invoice line's description, word for word. */
  name: string;
  itemNumber: string | null;
  color: string | null;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  /** A one-time setup fee billed for this item, if any. */
  setupFee: number | null;
  /** Imprint and other details from the mock-up ("Front, 4in wide, embroidery"). */
  details: string | null;
  /** SWAG | PRINT | BOOTH | APPAREL | OTHER. */
  category: string;
  /** Which uploaded file holds its picture (index into the files sent), or null. */
  pictureFile: number | null;
  /** Where the picture is on that file's first page, as fractions 0-1 of the page. */
  pictureBox: { x: number; y: number; w: number; h: number } | null;
  /** A stock-room item that already has this name: the scan adds to it instead. */
  existingId: string | null;
  existingName: string | null;
};

export type ScanResult = {
  supplier: { name: string | null; website: string | null; email: string | null; phone: string | null };
  invoiceDate: string | null;
  items: ScannedItem[];
  /** Anything the reader wants HR to know (a mock-up it could not place, a line with no price). */
  notes: string[];
};

/** What HR confirms for one item. */
export type ApplyItem = {
  include: boolean;
  name: string;
  category: string;
  /** Added to on hand (a new item starts at this). */
  quantity: number;
  unitCost: number | null;
  itemNumber: string | null;
  color: string | null;
  details: string | null;
  setupFee: number | null;
  /** Add to this existing item instead of making a new one. */
  existingId: string | null;
  /** The form field holding this item's picture, if one is sent. */
  photoField: string | null;
};

export const SCAN_FILE_TYPES = ".pdf,.png,.jpg,.jpeg,.webp";
/** Vercel refuses a request body over 4.5 MB; leave room for the form overhead. */
export const SCAN_MAX_TOTAL_BYTES = 4 * 1024 * 1024;
