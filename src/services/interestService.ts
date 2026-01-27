import { db, type InterestTag } from './db';

/**
 * Parse an AI summary response to extract the summary text and tags.
 * If the AI doesn't produce a TAGS line, the full text becomes the summary and tags is empty.
 */
export function parseSummaryAndTags(raw: string): { summaryText: string; tags: string[] } {
  const tagMatch = raw.match(/\nTAGS:\s*(.+)$/im);
  if (!tagMatch) return { summaryText: raw.trim(), tags: [] };
  const summaryText = raw.slice(0, tagMatch.index).trim();
  const tags = tagMatch[1].split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  return { summaryText, tags };
}

/**
 * Update the interest profile when a user stars or queues an entry for TTS.
 * Reads the entry's existing tags, upserts into interestTags table,
 * then re-scores all tagged entries against the updated profile.
 */
export async function updateInterestProfile(entryId: number): Promise<void> {
  const entry = await db.entries.get(entryId);
  if (!entry?.tags || entry.tags.length === 0) return;

  const now = new Date();
  for (const tag of entry.tags) {
    const existing = await db.interestTags.where('tag').equals(tag).first();
    if (existing) {
      await db.interestTags.update(existing.id!, {
        count: existing.count + 1,
        lastSeen: now
      });
    } else {
      await db.interestTags.add({ tag, count: 1, lastSeen: now });
    }
  }

  // Re-score all tagged entries against the updated profile
  await rescoreAllTaggedEntries();
}

/**
 * Score a single entry against the current interest profile.
 * Score = sum of profile counts for each matching tag.
 */
export async function scoreEntry(entryId: number): Promise<void> {
  const entry = await db.entries.get(entryId);
  if (!entry?.tags || entry.tags.length === 0) return;

  const allTags = await db.interestTags.toArray();
  const tagMap = new Map(allTags.map(t => [t.tag, t.count]));

  let score = 0;
  for (const tag of entry.tags) {
    score += tagMap.get(tag) ?? 0;
  }

  await db.entries.update(entryId, { interestScore: score });
}

/**
 * Re-score ALL entries that have tags against the current interest profile.
 */
export async function rescoreAllTaggedEntries(): Promise<void> {
  const allTags = await db.interestTags.toArray();
  const tagMap = new Map(allTags.map(t => [t.tag, t.count]));

  const entries = await db.entries
    .filter(e => (e.tags?.length ?? 0) > 0)
    .toArray();

  for (const entry of entries) {
    let score = 0;
    for (const tag of entry.tags!) {
      score += tagMap.get(tag) ?? 0;
    }
    await db.entries.update(entry.id!, { interestScore: score });
  }
}

/**
 * Returns all interest tags sorted by count descending.
 */
export async function getInterestProfile(): Promise<InterestTag[]> {
  const tags = await db.interestTags.toArray();
  return tags.sort((a, b) => b.count - a.count);
}

/**
 * Delete a single interest tag by id, then re-score all entries.
 */
export async function deleteInterestTag(tagId: number): Promise<void> {
  await db.interestTags.delete(tagId);
  await rescoreAllTaggedEntries();
}

/**
 * Deletes all interest tags (for reset).
 */
export async function clearInterestProfile(): Promise<void> {
  await db.interestTags.clear();
}
