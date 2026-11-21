'use strict';

function escapeCell(value) {
  return '"' + String(value === null || value === undefined ? '' : value).replace(/"/g, '""') + '"';
}

function toCsv(rows, columns) {
  const header = columns.join(',');
  const body = rows.map((row) => columns.map((column) => escapeCell(row[column])).join(',')).join('\n');
  return header + '\n' + body + '\n';
}

module.exports = { toCsv };
