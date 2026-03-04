import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getMemoryRoot, readEntry, listTopics, ensureDir } from "../memory/store.js";
import { scoreTopicsForTask } from "../memory/relevance.js";

export function registerSearchTools(server: McpServer): void {

  server.registerTool(
    "memory_search",
    {
      title: "Memory durchsuchen",
      description:
        "Durchsucht alle Memory-Einträge nach einem Begriff. " +
        "Gibt passende Einträge mit Kontext-Ausschnitt zurück.",
      inputSchema: z.object({
        query: z.string().describe("Suchbegriff (case-insensitive)"),
        maxResults: z.number().int().min(1).max(50).default(5).describe("Maximale Anzahl Ergebnisse"),
        mode: z.enum(["search", "suggest"]).default("search").describe("search: Volltextsuche, suggest: Relevanz-basierte Vorschläge für eine Aufgabe"),
      }),
    },
    async ({ query, maxResults, mode }) => {
      if (!query.trim()) {
        return { content: [{ type: "text" as const, text: "Bitte einen Suchbegriff angeben." }] };
      }

      await ensureDir(getMemoryRoot());

      // Suggest-Modus: Relevanz-Ranking
      if (mode === "suggest") {
        const allTopics = await listTopics();
        if (allTopics.length === 0) {
          return { content: [{ type: "text" as const, text: "Noch keine Memory-Einträge vorhanden." }] };
        }

        const scored = await scoreTopicsForTask(query);
        const top = scored.slice(0, maxResults);

        if (top.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Keine relevanten Memory-Einträge für diese Aufgabe gefunden.\n\nVerfügbare Topics:\n${allTopics.map(t => `- ${t}`).join("\n")}`,
              },
            ],
          };
        }

        const lines = [
          `## Empfohlene Topics für: "${query}"`,
          "",
          "Lade diese Topics mit memory_load in dieser Reihenfolge:",
          "",
          ...top.map((s, i) => `${i + 1}. **${s.topic}** (Score: ${s.score.toFixed(1)}) — ${s.reason}`),
        ];

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      }

      // Search-Modus: Volltextsuche
      const topics = await listTopics();
      if (topics.length === 0) {
        return { content: [{ type: "text" as const, text: "Keine Memory-Einträge vorhanden." }] };
      }

      const lowerQuery = query.toLowerCase();
      const escapedQuery = lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const results: { topic: string; excerpt: string; score: number }[] = [];

      const allEntries = await Promise.all(
        topics.map(async (topic) => ({ topic, entry: await readEntry(topic) }))
      );

      for (const { topic, entry } of allEntries) {
        if (!entry) continue;

        const lowerContent = entry.content.toLowerCase();
        if (!lowerContent.includes(lowerQuery) && !topic.toLowerCase().includes(lowerQuery)) continue;

        const occurrences = (lowerContent.match(new RegExp(escapedQuery, "g")) ?? []).length;
        const topicBonus = topic.toLowerCase().includes(lowerQuery) ? 3 : 0;

        // Kontext-Ausschnitt
        const idx = lowerContent.indexOf(lowerQuery);
        let excerpt = "";
        if (idx >= 0) {
          const start = Math.max(0, idx - 80);
          const end = Math.min(entry.content.length, idx + query.length + 80);
          excerpt = (start > 0 ? "\u2026" : "") + entry.content.slice(start, end) + (end < entry.content.length ? "\u2026" : "");
        } else {
          excerpt = entry.content.slice(0, 160) + (entry.content.length > 160 ? "\u2026" : "");
        }

        results.push({ topic, excerpt, score: occurrences + topicBonus + entry.meta.accessCount * 0.1 });
      }

      if (results.length === 0) {
        return { content: [{ type: "text" as const, text: `Keine Ergebnisse für '${query}' gefunden.` }] };
      }

      results.sort((a, b) => b.score - a.score);
      const top = results.slice(0, maxResults);

      const output = top
        .map((r) => `### ${r.topic}\n\`\`\`\n${r.excerpt}\n\`\`\``)
        .join("\n\n");

      return {
        content: [{ type: "text" as const, text: `Suchergebnisse für '${query}':\n\n${output}` }],
      };
    }
  );
}
