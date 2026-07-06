const Automerge = require('@automerge/automerge');

// PLACEHOLDER document shape — proves Automerge mechanics only.
// Real FHIR-resource shape depends on audit-confirmed data (ADR 0000).
function createExampleDoc() {
  return Automerge.from({
    recordId: null,
    lastUpdated: null,
    notes: '',
  });
}

module.exports = { createExampleDoc };