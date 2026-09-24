export function expectedAmount(body: any): {
  guarded: boolean;
  value: number | null;
} {
  if (!Object.prototype.hasOwnProperty.call(body || {}, "expected"))
    return { guarded: false, value: null };
  if (body.expected === null) return { guarded: true, value: null };
  if (
    typeof body.expected !== "number" ||
    !Number.isFinite(body.expected) ||
    body.expected < 0
  )
    throw new Error("bad_expected");
  return { guarded: true, value: body.expected };
}

export function onceSchema(run: () => Promise<void>) {
  let pending: Promise<void> | null = null;
  return () =>
    (pending ??= run().catch((error) => {
      pending = null;
      throw error;
    }));
}
