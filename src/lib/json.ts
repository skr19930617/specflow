export function parseJson<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
}

export function tryParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function extractJsonFromMarkdown<T>(raw: string): T | null {
  const direct = tryParseJson<T>(raw);
  if (direct !== null) {
    return direct;
  }
  const match = raw.match(/```json\s*([\s\S]*?)```/);
  if (!match) {
    return null;
  }
  return tryParseJson<T>(match[1].trim());
}
