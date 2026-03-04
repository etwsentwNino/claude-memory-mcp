import fs from "fs/promises";
import path from "path";

export interface MemoryMeta {
  created: string;
  updated: string;
  accessCount: number;
  tags: string[];
}

export interface MemoryEntry {
  meta: MemoryMeta;
  content: string;
}

// Gibt den .claude-memory Ordner relativ zum cwd zurück
export function getMemoryRoot(): string {
  return path.join(process.cwd(), ".claude-memory");
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readEntry(topic: string): Promise<MemoryEntry | null> {
  const file = topicToPath(topic);
  try {
    const raw = await fs.readFile(file, "utf-8");
    return parseEntry(raw);
  } catch {
    return null;
  }
}

export async function writeEntry(topic: string, content: string, tags: string[] = []): Promise<void> {
  const file = topicToPath(topic);
  await ensureDir(path.dirname(file));

  const existing = await readEntry(topic);
  const now = new Date().toISOString();

  const meta: MemoryMeta = {
    created: existing?.meta.created ?? now,
    updated: now,
    accessCount: (existing?.meta.accessCount ?? 0),
    tags,
  };

  const serialized = serializeEntry({ meta, content });
  await fs.writeFile(file, serialized, "utf-8");
  await updateIndex(topic, tags);
}

export async function touchEntry(topic: string): Promise<void> {
  const entry = await readEntry(topic);
  if (!entry) return;
  entry.meta.accessCount += 1;
  const file = topicToPath(topic);
  await fs.writeFile(file, serializeEntry(entry), "utf-8");
  await updateIndex(topic, entry.meta.tags);
}

export async function listTopics(): Promise<string[]> {
  const indexFile = path.join(getMemoryRoot(), "index.json");
  try {
    const raw = await fs.readFile(indexFile, "utf-8");
    const index = JSON.parse(raw) as Record<string, string[]>;
    // Ungültige Topics filtern (z.B. Path-Traversal-Versuche)
    const valid = Object.keys(index).filter(t => isValidTopic(t));
    // Index bereinigen wenn ungültige Keys gefunden
    if (valid.length < Object.keys(index).length) {
      const cleaned: Record<string, string[]> = {};
      for (const key of valid) cleaned[key] = index[key];
      await fs.writeFile(indexFile, JSON.stringify(cleaned, null, 2), "utf-8");
    }
    return valid;
  } catch {
    return [];
  }
}

export async function appendEntry(topic: string, content: string, tags: string[] = []): Promise<void> {
  const root = getMemoryRoot();
  await ensureDir(root);
  const existing = await readEntry(topic);
  const now = new Date().toISOString();

  if (existing) {
    const appended = `${existing.content}\n\n---\n_Angehängt: ${now}_\n\n${content}`;
    const mergedTags = tags.length > 0
      ? [...new Set([...existing.meta.tags, ...tags])]
      : existing.meta.tags;
    const meta: MemoryMeta = {
      ...existing.meta,
      tags: mergedTags,
      updated: now,
    };
    const file = topicToPath(topic);
    await fs.writeFile(file, serializeEntry({ meta, content: appended }), "utf-8");
    await updateIndex(topic, mergedTags);
  } else {
    await writeEntry(topic, content, tags);
  }
}

export async function deleteEntry(topic: string): Promise<void> {
  const file = topicToPath(topic);
  try {
    await fs.unlink(file);
  } catch {
    // Datei existiert nicht — kein Fehler
  }
  // Aus index.json entfernen
  const indexFile = path.join(getMemoryRoot(), "index.json");
  try {
    const raw = await fs.readFile(indexFile, "utf-8");
    const index = JSON.parse(raw) as Record<string, string[]>;
    delete index[topic];
    await fs.writeFile(indexFile, JSON.stringify(index, null, 2), "utf-8");
  } catch {
    // index.json existiert nicht — kein Fehler
  }
}

// --- Internes ---

function isValidTopic(topic: string): boolean {
  try {
    topicToPath(topic);
    return true;
  } catch {
    return false;
  }
}

function topicToPath(topic: string): string {
  // "architecture/decisions" -> .claude-memory/architecture/decisions.md
  const root = getMemoryRoot();
  const rootResolved = path.resolve(root);
  const parts = topic.split("/");
  const resolved = path.resolve(root, ...parts) + ".md";
  // Path-Traversal-Schutz: Pfad muss innerhalb von .claude-memory/ bleiben
  if (!resolved.startsWith(rootResolved + path.sep)) {
    throw new Error(`Ungültiger Topic-Pfad: '${topic}' führt außerhalb des Memory-Verzeichnisses.`);
  }
  // MAX_PATH-Schutz (Windows-Limit ~260 Zeichen)
  if (resolved.length > 240) {
    throw new Error(`Topic-Pfad zu lang (${resolved.length} Zeichen). Bitte kürzeren Topic-Namen verwenden.`);
  }
  return resolved;
}

function serializeEntry(entry: MemoryEntry): string {
  const metaJson = JSON.stringify(entry.meta);
  return `<!-- META:${metaJson} -->\n\n${entry.content}`;
}

function parseEntry(raw: string): MemoryEntry {
  const metaMatch = raw.match(/^<!-- META:(.+?) -->/);
  if (!metaMatch) {
    return {
      meta: { created: new Date().toISOString(), updated: new Date().toISOString(), accessCount: 0, tags: [] },
      content: raw,
    };
  }
  try {
    const meta: MemoryMeta = JSON.parse(metaMatch[1]);
    const content = raw.slice(metaMatch[0].length).trimStart();
    return { meta, content };
  } catch {
    // Korrupter Meta-Header — content trotzdem retten
    return {
      meta: { created: new Date().toISOString(), updated: new Date().toISOString(), accessCount: 0, tags: ["recovered"] },
      content: raw.slice(metaMatch[0].length).trimStart(),
    };
  }
}

async function updateIndex(topic: string, tags: string[]): Promise<void> {
  // Validierung: nur gültige Topics in den Index schreiben
  if (!isValidTopic(topic)) return;
  const indexFile = path.join(getMemoryRoot(), "index.json");
  let index: Record<string, string[]> = {};
  try {
    const raw = await fs.readFile(indexFile, "utf-8");
    index = JSON.parse(raw);
  } catch {}
  index[topic] = tags;
  await fs.writeFile(indexFile, JSON.stringify(index, null, 2), "utf-8");
}

export async function memoryExists(): Promise<boolean> {
  const indexFile = path.join(getMemoryRoot(), "index.json");
  try {
    await fs.access(indexFile);
    return true;
  } catch {
    return false;
  }
}
