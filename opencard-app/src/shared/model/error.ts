/** Formats a caught value as the message a reader or log line should show. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
