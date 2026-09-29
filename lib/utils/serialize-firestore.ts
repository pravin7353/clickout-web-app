/**
 * Recursively converts Firestore Timestamp instances, Dates, and nested objects/arrays
 * into plain JSON-serializable primitives/objects safe to pass across Server Action boundaries.
 */
export function serializeFirestoreDoc<T = any>(val: any): T {
  if (val === null || val === undefined) {
    return val as T;
  }

  // Firestore Timestamp instance (toMillis)
  if (typeof val?.toMillis === "function") {
    return val.toMillis() as unknown as T;
  }

  // Firestore Timestamp or object with toDate()
  if (typeof val?.toDate === "function") {
    const d = val.toDate();
    return (d instanceof Date ? d.getTime() : d) as unknown as T;
  }

  // Native Date instance
  if (val instanceof Date) {
    return val.getTime() as unknown as T;
  }

  // Array traversal
  if (Array.isArray(val)) {
    return val.map((item) => serializeFirestoreDoc(item)) as unknown as T;
  }

  // Plain object or class instance traversal
  if (typeof val === "object") {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = serializeFirestoreDoc(v);
    }
    return res as unknown as T;
  }

  return val as T;
}
