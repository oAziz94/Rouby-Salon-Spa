const PLACEHOLDER_RE = /\{([a-zA-Z0-9_]+)\}/g;

export type WhatsappSubstitutionMap = Record<string, string>;

/**
 * Replaces `{key}` placeholders in template content using `values`.
 * Unknown keys are left unchanged.
 */
export function substituteWhatsappTemplate(
  content: string,
  values: WhatsappSubstitutionMap,
): string {
  return content.replace(PLACEHOLDER_RE, (full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return values[key] ?? '';
    }
    return full;
  });
}
