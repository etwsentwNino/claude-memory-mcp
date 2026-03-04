import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { listTopics, readEntry, writeEntry, getMemoryRoot, ensureDir } from "../memory/store.js";

export function registerMaintenanceTools(server: McpServer): void {

  // --- memory_stats ---
  server.registerTool(
    "memory_stats",
    {
      title: "Speicherstatistiken",
      description:
        "Zeigt Statistiken über den Memory-Store: Anzahl Einträge, Gesamtgröße in Zeichen, " +
        "am häufigsten genutzte Topics, zuletzt geänderte Topics.",
      inputSchema: z.object({}),
    },
    async () => {
      const topics = await listTopics();
      if (topics.length === 0) {
        return { content: [{ type: "text" as const, text: "Keine Memory-Einträge vorhanden." }] };
      }

      let totalChars = 0;
      const entries: { topic: string; accessCount: number; updated: string; chars: number }[] = [];

      for (const topic of topics) {
        const entry = await readEntry(topic);
        if (!entry) continue;
        const chars = entry.content.length;
        totalChars += chars;
        entries.push({ topic, accessCount: entry.meta.accessCount, updated: entry.meta.updated, chars });
      }

      const top5ByAccess = [...entries].sort((a, b) => b.accessCount - a.accessCount).slice(0, 5);
      const top5ByRecent = [...entries].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 5);

      let text = `# Memory-Statistiken\n\n`;
      text += `- **Einträge:** ${entries.length}\n`;
      text += `- **Gesamtgröße:** ${totalChars.toLocaleString()} Zeichen\n\n`;

      text += `## Top 5 nach Zugriffshäufigkeit\n\n`;
      for (const e of top5ByAccess) {
        text += `- \`${e.topic}\` — ${e.accessCount} Zugriffe (${e.chars} Zeichen)\n`;
      }

      text += `\n## Top 5 zuletzt geändert\n\n`;
      for (const e of top5ByRecent) {
        text += `- \`${e.topic}\` — ${e.updated}\n`;
      }

      return { content: [{ type: "text" as const, text }] };
    }
  );

  // --- memory_compress ---
  server.registerTool(
    "memory_compress",
    {
      title: "Sessions komprimieren",
      description:
        "Komprimiert Session-Archive die älter als N Tage sind zu einer einzigen Zusammenfassung. " +
        "Spart Speicher und hält den Index übersichtlich.",
      inputSchema: z.object({
        olderThanDays: z.number().optional().default(7).describe("Sessions älter als N Tage komprimieren (Standard: 7)"),
      }),
    },
    async ({ olderThanDays }) => {
      const topics = await listTopics();
      const sessionTopics = topics.filter((t) => t.startsWith("sessions/"));

      if (sessionTopics.length === 0) {
        return { content: [{ type: "text" as const, text: "Keine Session-Einträge vorhanden." }] };
      }

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - olderThanDays);

      const oldSessions: { topic: string; content: string; updated: string }[] = [];

      for (const topic of sessionTopics) {
        const entry = await readEntry(topic);
        if (!entry) continue;
        const updatedDate = new Date(entry.meta.updated);
        if (updatedDate < cutoff) {
          oldSessions.push({ topic, content: entry.content, updated: entry.meta.updated });
        }
      }

      if (oldSessions.length === 0) {
        return {
          content: [{ type: "text" as const, text: `Keine Sessions älter als ${olderThanDays} Tage gefunden.` }],
        };
      }

      // Zusammenführen
      oldSessions.sort((a, b) => a.updated.localeCompare(b.updated));
      const archiveContent = oldSessions
        .map((s) => `## ${s.updated.slice(0, 10)} — ${s.topic}\n\n${s.content}`)
        .join("\n\n---\n\n");

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const archiveKey = `sessions/archive-${timestamp}`;
      await writeEntry(archiveKey, archiveContent, ["archive", "compressed"]);

      // Alte Sessions löschen
      const root = getMemoryRoot();
      const indexFile = path.join(root, "index.json");
      let index: Record<string, string[]> = {};
      try {
        const raw = await fs.readFile(indexFile, "utf-8");
        index = JSON.parse(raw);
      } catch {
        // index nicht vorhanden
      }

      for (const s of oldSessions) {
        const parts = s.topic.split("/");
        const filePath = path.join(root, ...parts) + ".md";
        try {
          await fs.unlink(filePath);
        } catch {
          // Datei existiert nicht
        }
        delete index[s.topic];
      }

      await fs.writeFile(indexFile, JSON.stringify(index, null, 2), "utf-8");

      return {
        content: [
          {
            type: "text" as const,
            text:
              `${oldSessions.length} Session(s) komprimiert und archiviert unter \`${archiveKey}\`.\n\n` +
              `Gelöschte Topics:\n${oldSessions.map((s) => `- ${s.topic}`).join("\n")}`,
          },
        ],
      };
    }
  );
}
