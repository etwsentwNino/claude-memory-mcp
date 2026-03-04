import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scoreTopicsForTask } from "../memory/relevance.js";
import { initMemory } from "../memory/initializer.js";
import { listTopics, getMemoryRoot, ensureDir } from "../memory/store.js";

export function registerSmartTools(server: McpServer): void {
  server.registerTool(
    "context_suggest",
    {
      title: "Relevanten Kontext vorschlagen",
      description:
        "Analysiert eine Aufgabenbeschreibung und gibt die relevantesten Memory-Topics zurück, " +
        "die geladen werden sollten. Rufe dies zu Beginn einer Aufgabe auf statt alles blind zu laden. " +
        "Gibt eine priorisierte Liste mit Begründung zurück.",
      inputSchema: z.object({
        task: z.string().describe("Beschreibung der aktuellen Aufgabe oder des Vorhabens"),
        maxTopics: z.number().optional().default(5).describe("Maximale Anzahl Topics"),
      }),
    },
    async ({ task, maxTopics }) => {
      await ensureDir(getMemoryRoot());
      const allTopics = await listTopics();

      if (allTopics.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Noch keine Memory-Einträge vorhanden. Rufe memory_init auf um zu starten.",
            },
          ],
        };
      }

      const scored = await scoreTopicsForTask(task);
      const top = scored.slice(0, maxTopics);

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
        `## Empfohlene Topics für: "${task}"`,
        "",
        "Lade diese Topics mit memory_load in dieser Reihenfolge:",
        "",
        ...top.map((s, i) => `${i + 1}. **${s.topic}** (Score: ${s.score.toFixed(1)}) — ${s.reason}`),
      ];

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );

  server.registerTool(
    "memory_init",
    {
      title: "Memory initialisieren",
      description:
        "Initialisiert die Memory-Struktur für das aktuelle Projekt. " +
        "Erkennt automatisch den Projekttyp (Node, Rust, Go, Python...) und legt sinnvolle " +
        "Standard-Einträge an (architecture, decisions, current-task). " +
        "Nur einmal pro Projekt aufrufen.",
      inputSchema: z.object({}),
    },
    async () => {
      const allTopics = await listTopics();
      if (allTopics.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory bereits initialisiert (${allTopics.length} Einträge vorhanden). Nutze memory_list für einen Überblick.`,
            },
          ],
        };
      }

      const created = await initMemory();

      return {
        content: [
          {
            type: "text" as const,
            text: `Memory initialisiert! Folgende Einträge wurden angelegt:\n\n${created.map(t => `- ${t}`).join("\n")}\n\nNächster Schritt: Fülle architecture.md mit deiner Projektstruktur via memory_save.`,
          },
        ],
      };
    }
  );
}
