const { runMergeDemo } = require('../sync/mergeDemo');

describe('Automerge merge demo', () => {
  it('merges divergent edge and central edits without conflict', () => {
    const result = runMergeDemo();

    expect(result.recordId).toBe('REC-001');
    expect(result.notes).toBe('Reviewed by central server');
    expect(result.lastUpdated).toBeTruthy();
  });
});