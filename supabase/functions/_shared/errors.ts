/**
 * Turn any caught value into a message worth showing a user.
 *
 * A `catch` binding is `unknown`, and not everything thrown is an `Error`.
 * The Supabase client rejects with a plain object carrying `message`, `fetch`
 * rejects with a `TypeError`, and a malformed request body rejects with a
 * `SyntaxError`.
 *
 * Reading `error.message` directly is the bug this exists to prevent. It
 * returns `undefined` for the first case, and because `JSON.stringify` drops
 * keys whose value is `undefined`, a 500 response built that way serialises to
 * `{}` -- the status says something failed and the body says nothing about
 * what. On an authentication endpoint that is the worst place to lose the
 * reason.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }

  return String(error);
}
