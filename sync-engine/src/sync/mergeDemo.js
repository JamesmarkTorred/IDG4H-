const Automerge = require('@automerge/automerge');
const { createExampleDoc } = require('../documents/exampleDoc');

function runMergeDemo() {
  // Simulate edge-node creating a record offline
  let edgeDoc = createExampleDoc();
  edgeDoc = Automerge.change(edgeDoc, 'edge: set recordId', (doc) => {
    doc.recordId = 'REC-001';
    doc.lastUpdated = new Date().toISOString();
  });

  // Simulate central-server receiving a clone and editing independently
  let centralDoc = Automerge.clone(edgeDoc);
  centralDoc = Automerge.change(centralDoc, 'central: add note', (doc) => {
    doc.notes = 'Reviewed by central server';
  });

  // Simulate edge-node making another offline edit before sync
  edgeDoc = Automerge.change(edgeDoc, 'edge: update timestamp', (doc) => {
    doc.lastUpdated = new Date().toISOString();
  });

  // Merge both divergent versions — this is the core CRDT guarantee:
  // no conflicts, no manual resolution needed
  const merged = Automerge.merge(edgeDoc, centralDoc);

  return merged;
}

module.exports = { runMergeDemo };