import { listTopics, readEntry } from "./store.js";

const STOP_WORDS = new Set([
  "the", "and", "or", "is", "a", "an", "to", "in", "of", "it", "for", "on", "at", "by",
  "der", "die", "das", "und", "oder", "ist", "ein", "eine", "zu", "in", "von", "es", "für", "auf", "an", "bei", "mit",
  "que", "de", "la", "le", "les", "et", "en", "un", "une",
]);

export interface ScoredTopic {
  topic: string;
  score: number;
  reason: string;
}

function generateTrigrams(text: string): Set<string> {
  const trigrams = new Set<string>();
  const lower = text.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
  for (let i = 0; i <= lower.length - 3; i++) {
    trigrams.add(lower.slice(i, i + 3));
  }
  return trigrams;
}

function trigramSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return intersection / union; // Jaccard-Index
}

export async function scoreTopicsForTask(task: string): Promise<ScoredTopic[]> {
  const topics = await listTopics();
  const taskWords = task.toLowerCase().split(/\s+/).filter(w => w.length >= 2 && !STOP_WORDS.has(w));
  const taskTrigrams = generateTrigrams(task);

  // Alle Entries parallel laden
  const entries = await Promise.all(
    topics.map(async (topic) => ({ topic, entry: await readEntry(topic) }))
  );

  const scored: ScoredTopic[] = [];

  for (const { topic, entry } of entries) {
    if (!entry) continue;

    let score = 0;
    const reasons: string[] = [];
    const lowerTopic = topic.toLowerCase();
    const lowerContent = entry.content.toLowerCase();

    // Topic-Name enthält Task-Wort als Substring
    for (const word of taskWords) {
      if (lowerTopic.includes(word)) {
        score += 3;
        reasons.push(`topic name matches "${word}"`);
      }
    }

    // Content enthält Task-Wort als Substring
    for (const word of taskWords) {
      const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const count = (lowerContent.match(new RegExp(escapedWord, "g")) ?? []).length;
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

    // Trigram-Similarity: Topic-Name
    const topicTrigrams = generateTrigrams(topic);
    const topicSim = trigramSimilarity(taskTrigrams, topicTrigrams);
    if (topicSim > 0) {
      score += topicSim * 4;
      reasons.push(`trigram topic similarity: ${(topicSim * 100).toFixed(0)}%`);
    }

    // Trigram-Similarity: Content (erste 500 Zeichen)
    const contentTrigrams = generateTrigrams(entry.content.slice(0, 500));
    const contentSim = trigramSimilarity(taskTrigrams, contentTrigrams);
    if (contentSim > 0) {
      score += contentSim * 2;
      reasons.push(`trigram content similarity: ${(contentSim * 100).toFixed(0)}%`);
    }

    // Access-Frequenz als Tiebreaker
    score += entry.meta.accessCount * 0.05;

    // current-task immer relevant
    if (topic === "current-task") score += 10;

    if (score > 0) {
      const reason = reasons.length > 0 ? reasons.slice(0, 3).join(", ") : topic === "current-task" ? "aktiver Arbeitsstand" : "accessCount-Bonus";
      scored.push({ topic, score, reason });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}
