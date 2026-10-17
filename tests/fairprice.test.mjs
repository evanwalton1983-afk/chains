/* Unit tests for the fairPrice module: four ways to remove the vig.
   Run from the app folder with: node --test
   Chains is one HTML file with no build step, so these tests read the module
   straight out of index.html, between its start and end marker comments, and
   run it on its own. Keep those two markers in place. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const START = '/* ---------- fair price ---------- */';
const END = '/* ---------- end fair price ---------- */';
let loaded = null;
function fairPrice() {
  if (loaded) return loaded;
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0 || b < a) throw new Error('fairPrice module markers not found in index.html');
  return (loaded = new Function(html.slice(a, b) + '\nreturn fairPrice;')());
}

const METHODS = ['multiplicative', 'additive', 'power', 'shin'];
const sum = xs => xs.reduce((s, x) => s + x, 0);
const near = (actual, expected, tol, what = '') => assert.ok(Math.abs(actual - expected) <= tol, `${what} expected ${expected}, got ${actual}`);

// Decimal odds. Every method is run on every one of these.
const MARKETS = {
  'shin README, three outcomes': [2.6, 2.4, 4.3],
  'shin README, two outcomes': [1.5, 2.74],
  'even money, -110 both sides': [1 + 100 / 110, 1 + 100 / 110],
  'big favourite, -300 and +240': [4 / 3, 3.4],
  'five outcomes': [2.2, 4.0, 6.5, 9.0, 15.0],
  'no margin': [1.25, 5],
  'underround, +110 both sides': [2.1, 2.1],
};

test('the module offers the four methods in a fixed order', () => {
  assert.deepEqual(fairPrice().METHODS, METHODS);
});

test('Shin on 2.6, 2.4, 4.3 gives about 0.3730, 0.4048, 0.2222, the shin README example', () => {
  const p = fairPrice().shin([2.6, 2.4, 4.3]);
  [0.3730, 0.4048, 0.2222].forEach((x, i) => near(p[i], x, 5e-5, `outcome ${i}:`));
  // and to full precision against the output the README publishes
  [0.37299406033208965, 0.4047794109200184, 0.2222265287474275].forEach((x, i) => near(p[i], x, 1e-9, `outcome ${i}:`));
});

test('Shin on two outcomes uses the closed form and matches the shin README: 1.5, 2.74', () => {
  const p = fairPrice().shin([1.5, 2.74]);
  near(p[0], 0.6508515815085157, 1e-12, 'favourite:');
  near(p[1], 0.3491484184914841, 1e-12, 'underdog:');
});

test('every method sums to 1 on every market, with each probability between 0 and 1', () => {
  const fp = fairPrice();
  for (const [name, odds] of Object.entries(MARKETS)) for (const m of METHODS) {
    const p = fp[m](odds);
    assert.ok(Array.isArray(p) && p.length === odds.length, `${m} on ${name} returned ${p}`);
    near(sum(p), 1, 1e-9, `${m} on ${name}:`);
    assert.ok(p.every(x => x > 0 && x < 1), `${m} on ${name} gave ${p}`);
  }
});

test('multiplicative is the de-vig Chains already used: each implied probability over their sum', () => {
  const amToProb = a => a > 0 ? 100 / (a + 100) : -a / (-a + 100);   // as in index.html
  const amToDec = a => a > 0 ? 1 + a / 100 : 1 + 100 / -a;            // as in index.html
  for (const [o, u] of [[-120, 100], [-110, -110], [-300, 240], [150, -180]]) {
    const before = amToProb(o) / (amToProb(o) + amToProb(u));
    near(fairPrice().multiplicative([amToDec(o), amToDec(u)])[0], before, 1e-12, `${o} and ${u}:`);
  }
});

test('Shin and additive agree on two-outcome markets, as the shin README notes', () => {
  const fp = fairPrice();
  for (const odds of [[1.5, 2.74], [4 / 3, 3.4], [1.91, 1.91], [1.62, 2.45], [2.1, 2.1]]) {
    const add = fp.additive(odds);
    fp.shin(odds).forEach((x, i) => near(x, add[i], 1e-12, `${odds}:`));
  }
});

test('additive takes the same amount off every outcome', () => {
  const odds = [2.6, 2.4, 4.3], p = fairPrice().additive(odds);
  const each = (sum(odds.map(o => 1 / o)) - 1) / odds.length;
  odds.forEach((o, i) => near(1 / o - p[i], each, 1e-12, `outcome ${i}:`));
});

test('power raises every implied probability to one shared exponent, above 1 when there is a margin', () => {
  const odds = [2.2, 4.0, 6.5, 9.0, 15.0], p = fairPrice().power(odds);
  const ks = odds.map((o, i) => Math.log(p[i]) / Math.log(1 / o));
  ks.forEach((k, i) => near(k, ks[0], 1e-9, `outcome ${i}:`));
  assert.ok(ks[0] > 1, `exponent should be above 1, got ${ks[0]}`);
});

test('with no margin every method returns the plain implied probabilities', () => {
  const fp = fairPrice();
  for (const m of METHODS) fp[m]([1.25, 5]).forEach((x, i) => near(x, [0.8, 0.2][i], 1e-9, `${m}:`));
});

test('bad input returns null instead of throwing', () => {
  const fp = fairPrice();
  for (const bad of [null, undefined, [], [2], [2, 1], [2, 0.5], [2, NaN], [2, Infinity], [2, '3']]) for (const m of METHODS) {
    assert.equal(fp[m](bad), null, `${m}(${JSON.stringify(bad)})`);
  }
});

test('overByMethod takes the median over probability across books, per method', () => {
  const fp = fairPrice();
  const books = [[1.91, 1.91], [1.87, 1.95], [1.80, 2.02], [1.95, 1.87]];
  const by = fp.overByMethod(books);
  for (const m of METHODS) {
    const each = books.map(b => fp[m](b)[0]).sort((a, b) => a - b);
    near(by[m], (each[1] + each[2]) / 2, 1e-12, `${m}:`);
  }
  const three = books.slice(0, 3), mult = three.map(([o, u]) => (1 / o) / (1 / o + 1 / u)).sort((a, b) => a - b);
  near(fp.overByMethod(three).multiplicative, mult[1], 1e-12, 'odd count:');
});

test('overByMethod skips unusable prices and returns null when no book is usable', () => {
  const fp = fairPrice();
  near(fp.overByMethod([[2, 1], [1.8, 2.02]]).shin, fp.shin([1.8, 2.02])[0], 1e-12, 'one usable book:');
  assert.equal(fp.overByMethod([]), null);
  assert.equal(fp.overByMethod([[2, 1]]), null);
  assert.equal(fp.overByMethod(null), null);
});

test('forSide with the worst case gate takes the lowest fair probability for the side being bet', () => {
  const fp = fairPrice();
  const by = Object.fromEntries(METHODS.map(m => [m, fp[m]([4 / 3, 3.4])[0]]));   // over is the -300 favourite
  assert.ok(by.multiplicative < by.additive && by.additive < by.power, 'favourite: multiplicative lowest, power highest');
  assert.deepEqual(fp.forSide(by, 'over', 'worst'), {p:by.multiplicative, method:'multiplicative'});
  assert.deepEqual(fp.forSide(by, 'under', 'worst'), {p:1 - by.power, method:'power'});
});

test('forSide with a named method returns that method on either side', () => {
  const fp = fairPrice(), by = {multiplicative:0.6, additive:0.62, power:0.63, shin:0.62};
  assert.deepEqual(fp.forSide(by, 'over', 'shin'), {p:0.62, method:'shin'});
  const under = fp.forSide(by, 'under', 'power');
  near(under.p, 0.37, 1e-12, 'under:');
  assert.equal(under.method, 'power');
});

test('forSide treats near ties as ties and keeps the earlier method, so two-way Shin shows as additive', () => {
  const by = {multiplicative:0.55, additive:0.5, power:0.6, shin:0.5 - 1e-15};
  assert.equal(fairPrice().forSide(by, 'over', 'worst').method, 'additive');
});

test('forSide skips missing methods and returns null when nothing is usable', () => {
  const fp = fairPrice();
  assert.deepEqual(fp.forSide({multiplicative:0.5, additive:null, power:0.48}, 'over', 'worst'), {p:0.48, method:'power'});
  assert.equal(fp.forSide({}, 'over', 'worst'), null);
  assert.equal(fp.forSide({multiplicative:0.5}, 'over', 'shin'), null);
  assert.equal(fp.forSide(null, 'over', 'worst'), null);
});
