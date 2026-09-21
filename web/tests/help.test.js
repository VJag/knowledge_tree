import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HELP_TOPICS,
  getHelpTopic,
  renderHelpHub,
  renderHelpArticle,
} from '../js/help.js';

describe('help content', () => {
  it('defines core help topics', () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    assert.ok(ids.includes('topics'));
    assert.ok(ids.includes('progress'));
    assert.ok(ids.includes('sharing'));
    assert.ok(ids.includes('sync'));
  });

  it('getHelpTopic returns article or null', () => {
    assert.equal(getHelpTopic('progress').title, 'Progress & timing');
    assert.equal(getHelpTopic('missing'), null);
  });

  it('renderHelpHub includes cards for every topic', () => {
    const html = renderHelpHub();
    assert.match(html, /How KnowledgeTree works/);
    for (const topic of HELP_TOPICS) {
      assert.match(html, new RegExp(`data-help-id="${topic.id}"`));
      assert.match(html, new RegExp(topic.title.replace(/&/g, '&amp;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('renderHelpArticle renders sections and back link', () => {
    const html = renderHelpArticle('sharing');
    assert.match(html, /Sharing a tree/);
    assert.match(html, /View progress/);
    assert.match(html, /All help topics/);
  });

  it('unknown article id falls back to hub', () => {
    const html = renderHelpArticle('does-not-exist');
    assert.match(html, /How KnowledgeTree works/);
  });

  it('every topic has summary and sections', () => {
    for (const topic of HELP_TOPICS) {
      assert.ok(topic.summary.length > 10);
      assert.ok(topic.sections.length >= 1);
      for (const section of topic.sections) {
        assert.ok(section.heading);
        assert.ok(
          (section.paragraphs && section.paragraphs.length) ||
            (section.steps && section.steps.length) ||
            (section.bullets && section.bullets.length) ||
            (typeof section.callout === 'string' && section.callout.length)
        );
      }
    }
  });

  it('progress article mentions notes and history', () => {
    const html = renderHelpArticle('progress');
    assert.match(html, /notes/i);
    assert.match(html, /history/i);
  });
});
