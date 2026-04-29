export type ClassValue =
  | string
  | false
  | null
  | undefined
  | ClassValue[]
  | { [key: string]: boolean | null | undefined }

/**
 * Join class name fragments into a single space-separated string.
 *
 * Accepts strings, nested arrays, and `{ [className]: boolean }` objects.
 * Falsy values (`false`, `null`, `undefined`, `''`) are dropped. When the
 * same class name appears multiple times across arguments, the last
 * value wins — a later `{ x: false }` removes a prior `'x'`. Class names
 * are deduplicated; first occurrence determines order.
 *
 * @example
 *   joinClassNames(styles.button, isActive && styles.active, className)
 *   joinClassNames('base', { active: isActive, hidden: isHidden })
 */
export function joinClassNames(...inputs: ClassValue[]): string {
  const parts = new Map<string, boolean>()
  collect(inputs, parts)
  const out: string[] = []
  for (const [name, on] of parts) {
    if (on) out.push(name)
  }
  return out.join(' ')
}

function collect(inputs: ClassValue[], parts: Map<string, boolean>): void {
  for (const input of inputs) {
    if (!input) continue
    if (typeof input === 'string') {
      parts.set(input, true)
    } else if (Array.isArray(input)) {
      collect(input, parts)
    } else {
      for (const key of Object.keys(input)) {
        if (key !== '') parts.set(key, input[key] === true)
      }
    }
  }
}
