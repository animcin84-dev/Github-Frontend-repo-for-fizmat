export function isDatabaseConversationId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function resolveInboxConversationId(
  items: ReadonlyArray<{ id: string }>,
  requestedId: string | undefined,
  mode: "mock" | "database",
) {
  if (mode === "database") {
    // A valid deep link may refer to an older conversation outside the list's limit.
    if (requestedId && isDatabaseConversationId(requestedId)) return requestedId;
    return items.find((item) => isDatabaseConversationId(item.id))?.id;
  }
  return items.find((item) => item.id === requestedId)?.id ?? items[0]?.id;
}
