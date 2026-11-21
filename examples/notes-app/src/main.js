'use strict';

const { listNotes } = require('./notes');
const { toCsv } = require('./csv');

function exportNotes() {
  return toCsv(listNotes(), ['id', 'title']);
}

if (require.main === module) {
  process.stdout.write(exportNotes());
}

module.exports = { exportNotes };
