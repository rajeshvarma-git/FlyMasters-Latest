import test from 'node:test';
import assert from 'node:assert/strict';
import { caseMessageSourceId } from '../server/routes/cases.mjs';

test('case chat retries use one stable source id for the authenticated sender', () => {
  const id = 'a5e9ca0c-4962-4a7e-a43c-3d0b5c44ac17';
  assert.equal(
    caseMessageSourceId('student', 'student-1', id),
    caseMessageSourceId('student', 'student-1', id),
  );
});

test('case chat retry ids cannot collide across senders or invalid client ids', () => {
  const id = 'a5e9ca0c-4962-4a7e-a43c-3d0b5c44ac17';
  assert.notEqual(caseMessageSourceId('student', 'student-1', id), caseMessageSourceId('student', 'student-2', id));
  assert.notEqual(caseMessageSourceId('student', 'student-1', id), caseMessageSourceId('counselor', 'student-1', id));
  assert.equal(caseMessageSourceId('student', 'student-1', 'too-short'), null);
});
