'use strict';

const NOTES = [
  { id: 1, title: 'Welcome' },
  { id: 2, title: 'Build original features' }
];

function listNotes() {
  return NOTES.map((note) => Object.assign({}, note));
}

module.exports = { listNotes };
