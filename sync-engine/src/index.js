const { runMergeDemo } = require('./sync/mergeDemo');

if (require.main === module) {
  const result = runMergeDemo();
  console.log('[sync-engine] merge demo result:');
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { runMergeDemo };