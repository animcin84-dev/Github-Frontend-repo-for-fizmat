type LogValue = string | number | boolean | null | undefined;

const forbiddenKey = /(token|secret|password|authorization|oauth.?code|body|content|encryption.?key)/i;

export function serverLog(event: string, fields: Record<string, LogValue> = {}) {
  const safe: Record<string, Exclude<LogValue, undefined>> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || forbiddenKey.test(key)) continue;
    safe[key] = value;
  }
  console.info(JSON.stringify({
    level: "info",
    event,
    at: new Date().toISOString(),
    ...safe,
  }));
}

export function serverErrorLog(event: string, fields: Record<string, LogValue> = {}) {
  const safe: Record<string, Exclude<LogValue, undefined>> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || forbiddenKey.test(key)) continue;
    safe[key] = value;
  }
  console.error(JSON.stringify({
    level: "error",
    event,
    at: new Date().toISOString(),
    ...safe,
  }));
}
