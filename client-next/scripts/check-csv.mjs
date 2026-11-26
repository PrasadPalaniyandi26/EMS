// Run with: npm run check:csv
import assert from 'node:assert/strict';
import { toCsv, parseCsv } from '../src/lib/csv.ts';

const out = toCsv(['a', 'b'], [['x",=1+1,"', '=HYPERLINK("u")'], [-5, '-5.25'], ['@cmd', '+91 98765 43210']]);
const lines = out.split('\r\n');
assert.equal(lines[1], '"x"",=1+1,""","\'=HYPERLINK(""u"")"');
assert.equal(lines[2], '-5,-5.25');
assert.equal(lines[3], "'@cmd,'+91 98765 43210");
// What was typed comes back, in the same two cells
assert.deepEqual(parseCsv(out).rows[0], { a: 'x",=1+1,"', b: '=HYPERLINK("u")' });
assert.deepEqual(parseCsv(out).rows[2], { a: '@cmd', b: '+91 98765 43210' });
console.log('CSV check passed.');
