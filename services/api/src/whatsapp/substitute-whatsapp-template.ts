const COMBINED_RE = /\{\{([a-zA-Z0-9_]+)\}\}|\{([a-zA-Z0-9_]+)\}/g;

export type WhatsappSubstitutionMap = Record<string, string>;

/**
 * Replaces `{key}` and `{{key}}` placeholders using `values`.
 * Unknown keys are left unchanged.
 */
export function substituteWhatsappTemplate(
  content: string,
  values: WhatsappSubstitutionMap,
): string {
  return content.replace(COMBINED_RE, (full, doubleKey: string, singleKey: string) => {
    const key = (doubleKey ?? singleKey) as string;
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return values[key] ?? '';
    }
    return full;
  });
}
