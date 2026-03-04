import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  readEntry, writeEntry, touchEntry, listTopics,
  getMemoryRoot, ensureDir, appendEntry, deleteEntry,
  memoryExists,
} from "../memory/store.js";
import { initMemory } from "../memory/initializer.js";

export function registerMemoryTools(server: McpServer): void {

  server.registerTool(
    "memory_load",
    {
      title: "Memory laden",
      description:
        "Lädt den gespeicherten Wissensstand zu einem Thema. " +
        "Rufe dies am Anfang einer Session oder vor einer neuen Aufgabe auf. " +
        "topic-Beispiele: 'architecture', 'decisions', 'current-task', 'entities/auth'",
      inputSchema: z.object({
        topic: z.string().describe("Thema / Pfad des Memory-Eintrags. Leer lassen für Übersicht aller Topics + Stats").default(""),
      }),
    },
    async ({ topic }) => {
      await ensureDir(getMemoryRoot());

      // Ohne Topic: Liste + Stats
      if (!topic) {
        const topics = await listTopics();
        if (topics.length === 0) {
          return { content: [{ type: "text" as const, text: "Noch keine Memory-Einträge vorhanden." }] };
        }

        let totalChars = 0;
        const results = await Promise.all(
          topics.map(async (t) => ({ topic: t, entry: await readEntry(t) }))
        );
        const entries: { topic: string; accessCount: number; updated: string; chars: number }[] = [];

        for (const { topic: t, entry } of results) {
          if (!entry) continue;
          const chars = entry.content.length;
          totalChars += chars;
          entries.push({ topic: t, accessCount: entry.meta.accessCount, updated: entry.meta.updated, chars });
        }

        const top5ByAccess = [...entries].sort((a, b) => b.accessCount - a.accessCount).slice(0, 5);
        const top5ByRecent = [...entries].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 5);

        // Recent changes (last 24h)
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentChanges = entries
          .filter(e => new Date(e.updated) >= since24h)
          .sort((a, b) => b.updated.localeCompare(a.updated));

        let text = `# Memory-Übersicht\n\n`;
        text += `- **Einträge:** ${entries.length}\n`;
        text += `- **Gesamtgröße:** ${totalChars.toLocaleString()} Zeichen\n\n`;

        text += `## Alle Topics\n\n`;
        text += entries.map(e => `- ${e.topic}`).join("\n");

        text += `\n\n## Top 5 nach Zugriffshäufigkeit\n\n`;
        for (const e of top5ByAccess) {
          text += `- \`${e.topic}\` — ${e.accessCount} Zugriffe (${e.chars} Zeichen)\n`;
        }

        text += `\n## Top 5 zuletzt geändert\n\n`;
        for (const e of top5ByRecent) {
          text += `- \`${e.topic}\` — ${e.updated}\n`;
        }

        if (recentChanges.length > 0) {
          text += `\n## Änderungen letzte 24h\n\n`;
          for (const c of recentChanges) {
            text += `- **${c.topic}** — ${c.updated}\n`;
          }
        }

        return { content: [{ type: "text" as const, text }] };
      }

      // Mit Topic: Entry laden
      const entry = await readEntry(topic);
      if (!entry) {
        return {
          content: [{ type: "text" as const, text: `Kein Memory-Eintrag für '${topic}' gefunden.` }],
        };
      }
      await touchEntry(topic);
      return {
        content: [
          {
            type: "text" as const,
            text: `# Memory: ${topic}\n\nZuletzt aktualisiert: ${entry.meta.updated}\nAbrufe: ${entry.meta.accessCount + 1}\n\n---\n\n${entry.content}`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "memory_save",
    {
      title: "Memory speichern",
      description:
        "Speichert oder überschreibt Wissen zu einem Thema. " +
        "Nutze dies nach Entscheidungen, Architekturänderungen oder wichtigen Erkenntnissen.",
      inputSchema: z.object({
        topic: z.string().describe("Thema / Pfad, z.B. 'decisions', 'architecture', 'entities/UserService'"),
        content: z.string().default("").describe("Der zu speichernde Markdown-Inhalt (nicht nötig bei mode='delete')"),
        tags: z.array(z.string()).default([]).describe("Optionale Schlagwörter zur Kategorisierung"),
        mode: z.enum(["write", "append", "delete"]).default("write").describe("write: überschreiben, append: anhängen, delete: löschen"),
      }),
    },
    async ({ topic, content, tags, mode }) => {
      // Auto-Init: Beim ersten Schreiben automatisch initialisieren
      const exists = await memoryExists();
      if (!exists) {
        await initMemory();
      }

      await ensureDir(getMemoryRoot());

      if (mode === "delete") {
        const existing = await readEntry(topic);
        if (!existing) {
          return { content: [{ type: "text" as const, text: `Memory '${topic}' nicht gefunden.` }] };
        }
        await deleteEntry(topic);
        return { content: [{ type: "text" as const, text: `Memory '${topic}' gelöscht.` }] };
      }

      if (mode === "append") {
        await appendEntry(topic, content, tags ?? []);
        return { content: [{ type: "text" as const, text: `Inhalt an '${topic}' angehängt.` }] };
      }

      // mode === "write" (default)
      await writeEntry(topic, content, tags ?? []);
      return { content: [{ type: "text" as const, text: `Memory '${topic}' erfolgreich gespeichert.` }] };
    }
  );
}
