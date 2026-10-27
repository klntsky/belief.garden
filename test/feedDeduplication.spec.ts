import { test, expect } from '@playwright/test';
import { deleteRecord, hasRecord, readRecord, writeRecord } from '../src/storage.js';
import { getFeed, postFeed } from '../src/utils/userUtils.js';

test('new comment feed entries replace only the previous comment entry', async () => {
  const feedPath = 'data/feed.json';
  const originalFeed = hasRecord(feedPath) ? readRecord(feedPath) : null;
  const actor = `feed_test_${Date.now()}`;
  const beliefName = `Feed belief ${Date.now()}`;

  try {
    await postFeed({
      actor,
      type: 'choice_changed',
      beliefName,
      old_choice: null,
      new_choice: 'support',
    });
    await postFeed({ actor, type: 'new_comment', beliefName, text: 'first' });
    await postFeed({ actor, type: 'new_comment', beliefName, text: 'second' });

    const relevant = (await getFeed()).filter(entry =>
      entry.actor === actor && entry.beliefName === beliefName
    );
    expect(relevant.filter(entry => entry.type === 'new_comment')).toHaveLength(1);
    expect(relevant).toContainEqual(expect.objectContaining({ type: 'choice_changed' }));
  } finally {
    if (originalFeed === null) {
      if (hasRecord(feedPath)) deleteRecord(feedPath);
    } else {
      writeRecord(feedPath, originalFeed);
    }
  }
});
