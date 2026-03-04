import { listTopics, readEntry } from "./store.js";

export interface ScoredTopic {
  topic: string;
  score: number;
  reason: string;
}

export async function scoreTopicsForTask(task: string): Promise<ScoredTopic[]> {
  const topics = await listTopics();
  const taskWords = task.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  const scored: ScoredTopic[] = [];

  for (const topic of topics) {
    const entry = await readEntry(topic);
    if (!entry) continue;

    let score = 0;
    const reasons: string[] = [];

    // Topic-Name enthält Schlüsselwörter der Aufgabe
    for (const word of taskWords) {
      if (topic.toLowerCase().includes(word)) {
        score += 3;
        reasons.push(`topic name matches "${word}"`);
      }
    }

    // Content enthält Schlüsselwörter
    const lowerContent = entry.content.toLowerCase();
    for (const word of taskWords) {
      const count = (lowerContent.match(new RegExp(word, "g")) ?? []).length;
      if (count > 0) {
        score += Math.min(count, 5);
        reasons.push(`content contains "${word}" (${count}x)`);
      }
    }

    // Tags matchen
    for (const tag of entry.meta.tags) {
      if (taskWords.some(w => tag.toLowerCase().includes(w))) {
        score += 2;
        reasons.push(`tag match: ${tag}`);
      }
    }

    // Access-Frequenz als Tiebreaker
    score += entry.meta.accessCount * 0.05;

    // current-task immer relevant
    if (topic === "current-task") score += 10;

    if (score > 0) {
      scored.push({ topic, score, reason: reasons.slice(0, 3).join(", ") });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}
