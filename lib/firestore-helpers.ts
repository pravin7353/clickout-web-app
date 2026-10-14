/**
 * Universal Firestore document serializer for Next.js App Router boundaries.
 * Recursively converts Firestore Timestamps (_seconds/_nanoseconds, toDate, toMillis)
 * and JavaScript Date instances into ISO date strings.
 */
export function serializeTimestamps<T>(doc: T): T {
  if (!doc || typeof doc !== "object") return doc;

  if (doc instanceof Date) {
    return doc.toISOString() as unknown as T;
  }

  if (Array.isArray(doc)) {
    return doc.map(serializeTimestamps) as unknown as T;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(doc as Record<string, unknown>)) {
    if (value && typeof value === "object" && "_seconds" in value && typeof (value as any)._seconds === "number") {
      result[key] = new Date((value as { _seconds: number })._seconds * 1000).toISOString();
    } else if (value && typeof value === "object" && "toDate" in value && typeof (value as any).toDate === "function") {
      result[key] = (value as { toDate: () => Date }).toDate().toISOString();
    } else if (value && typeof value === "object" && "toMillis" in value && typeof (value as any).toMillis === "function") {
      result[key] = new Date((value as { toMillis: () => number }).toMillis()).toISOString();
    } else if (value instanceof Date) {
      result[key] = value.toISOString();
    } else if (Array.isArray(value)) {
      result[key] = value.map(serializeTimestamps);
    } else if (value && typeof value === "object") {
      result[key] = serializeTimestamps(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
