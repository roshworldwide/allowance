// Redaction for anything that leaves the server process as a file: replays, MSW fixtures, lab logs.
// Allow-list based: only known-safe keys survive; personal data (payer email, name, address, phone,
// payer_id) never does; vault token / customer / setup-token ids are masked to `tok_…a1b2`.

/** `tok_…a1b2` style mask: keeps the last 4 characters so two ids can still be told apart. */
export function maskId(id: string | undefined | null): string {
  if (!id) return '';
  return `tok_…${id.slice(-4)}`;
}

// Keys whose values are kept (recursively for objects/arrays).
const SAFE_KEYS = new Set([
  'id', 'status', 'intent', 'links', 'rel', 'href', 'method', 'encType',
  'amount', 'currency_code', 'value', 'breakdown', 'item_total', 'tax_total', 'shipping', 'discount',
  'purchase_units', 'reference_id', 'custom_id', 'invoice_id', 'soft_descriptor', 'description',
  'items', 'name', 'sku', 'quantity', 'unit_amount', 'category',
  'payments', 'captures', 'refunds', 'authorizations', 'final_capture', 'disbursement_mode',
  'seller_protection', 'dispute_categories', 'seller_receivable_breakdown', 'gross_amount', 'paypal_fee',
  'net_amount', 'total_refunded_amount', 'status_details', 'reason',
  'create_time', 'update_time', 'expiration_time',
  'payment_source', 'paypal', 'token', 'type', 'attributes', 'vault', 'usage_type', 'customer_type',
  'usage_pattern', 'permit_multiple_payment_tokens', 'experience_context', 'brand_name', 'user_action',
  'shipping_preference', 'return_url', 'cancel_url', 'locale',
  'customer', 'vault_id', 'debug_id', 'details', 'issue', 'message', 'field', 'location',
  'verification_status', 'event_type', 'event_version', 'resource_type', 'resource_version', 'summary', 'resource',
  'note_to_payer',
]);

// Values under these keys are ids that must be masked.
const MASK_KEYS = new Set(['vault_id']);
// Objects under these parents whose `id` must be masked.
const MASK_ID_PARENTS = new Set(['customer', 'token']);
// `name` is safe for items (a string) but not for people (an object with given_name/surname).
const PERSON_KEYS = new Set(['payer', 'email_address', 'payer_id', 'account_id', 'phone', 'address', 'birth_date', 'tax_info', 'shipping_address']);

export type RedactOptions = {
  /** Extra sensitive literal values to mask wherever they appear (e.g. the vault token id inside an href). */
  maskValues?: string[];
};

export function redact<T>(input: T, options: RedactOptions = {}): T {
  const walk = (value: unknown, key: string | null, parent: string | null): unknown => {
    if (Array.isArray(value)) return value.map((v) => walk(v, key, parent));
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (PERSON_KEYS.has(k)) continue;
        if (!SAFE_KEYS.has(k)) continue;
        if (k === 'name' && v && typeof v === 'object') continue; // a person's name object
        if (k === 'shipping' && v && typeof v === 'object' && ('address' in v || 'name' in v)) continue;
        if (MASK_KEYS.has(k) && typeof v === 'string') {
          out[k] = maskId(v);
          continue;
        }
        // `key` is the key this object sits under, e.g. customer: { id } or token: { id }.
        if (k === 'id' && typeof v === 'string' && key !== null && MASK_ID_PARENTS.has(key)) {
          out[k] = maskId(v);
          continue;
        }
        out[k] = walk(v, k, key);
      }
      return out;
    }
    return value;
  };
  let json = JSON.stringify(walk(input, null, null));
  for (const literal of options.maskValues ?? []) {
    if (literal && literal.length >= 4) json = json.split(literal).join(maskId(literal));
  }
  return JSON.parse(json) as T;
}
