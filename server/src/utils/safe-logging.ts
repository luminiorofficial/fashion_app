export function safeOperationalError(label: string, error: unknown, context: Record<string, string | number | boolean | null | undefined> = {}): void {
  const candidate = error as {name?: unknown; code?: unknown; status?: unknown};
  console.error(label, {
    ...context,
    errorName: typeof candidate?.name === "string" ? candidate.name.slice(0, 80) : "Error",
    errorCode: typeof candidate?.code === "string" || typeof candidate?.code === "number" ? String(candidate.code).slice(0, 80) : undefined,
    status: typeof candidate?.status === "number" ? candidate.status : undefined,
  });
}
