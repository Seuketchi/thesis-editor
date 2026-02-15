import { describe, it, expect } from 'vitest';
import { ResearchereDB } from '../db';

describe('ThesisDB schema', () => {
  it('exports a ResearchereDB class', () => {
    expect(ResearchereDB).toBeDefined();
    const db = new ResearchereDB();
    expect(db.projects).toBeDefined();
    expect(db.files).toBeDefined();
    expect(db.assets).toBeDefined();
  });
});
