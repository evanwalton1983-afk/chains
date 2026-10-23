/* Unit tests for the altLines module: one distribution per prop, fitted to the
   no-vig main line, then used to price every alternate rung.
   Run from the app folder with: node --test
   Like the fairPrice tests, these read the module straight out of index.html,
   between its start and end marker comments, so keep those two markers in
   place and keep that block free of other app code. The ladder tests also load
   the fairPrice block, because the ladder is priced through fairPrice.forSide. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const slice = (start, end) => {
  const a = HTML.indexOf(start), b = HTML.indexOf(end);
  if (a < 0 || b < a) throw new Error(`markers not found in index.html: ${start}`);
  return HTML.slice(a, b);
};
let loaded = null;
function mod() {
  if (loaded) return loaded;
  const fp = slice('/* ---------- fair price ---------- */', '/* ---------- end fair price ---------- */');
  const alt = slice('/* ---------- alt lines ---------- */', '/* ---------- end alt lines ---------- */');
  return (loaded = new Function(fp + '\n' + alt + '\nreturn {fairPrice, altLines};')());
}
const A = () => mod().altLines;
const FP = () => mod().fairPrice;

const METHODS = ['multiplicative', 'additive', 'power', 'shin'];
const near = (actual, expected, tol, what = '') => assert.ok(Math.abs(actual - expected) <= tol, `${what} expected ${expected}, got ${actual}`);
const dec = am => am > 0 ? 1 + am / 100 : 1 + 100 / -am;   // as amToDec in index.html

// Game logs, most recent first. SMALL has fewer than the 8 games a spread needs.
const SMALL = [4, 6, 3];
const POISSONISH = [4, 5, 6, 5, 3, 4, 5, 6, 4, 5, 3, 6, 5, 4, 5, 4];              // mean 4.6, variance well under the mean
const VOLATILE = [0, 12, 1, 9, 0, 11, 2, 10, 1, 13, 0, 8, 1, 12, 0, 9];            // mean 5.6, variance several times the mean
const YARDS = [88, 41, 67, 23, 112, 59, 74, 36, 95, 52, 18, 81, 64, 47, 70, 33];  // a receiver's yardage, mean about 59

test('normCdf matches known values in the middle and the tails', () => {
  const f = A().normCdf;
  near(f(0), 0.5, 1e-15);
  near(f(1.96), 0.9750021048517795, 1e-13);
  near(f(-1), 0.15865525393145707, 1e-13);
  near(f(3), 0.9986501019683699, 1e-13);
  near(f(-6), 9.865876450376946e-10, 1e-13);
  near(f(-2.3) + f(2.3), 1, 1e-14, 'symmetry:');
  assert.equal(f(-40), 0);
  assert.equal(f(40), 1);
});

test('every prop market in index.html has a spec, and the yes or no market does not', () => {
  const keys = [...HTML.matchAll(/^ {2}(\w+):\{label:'[^']*'.*$/gm)].map(m => ({key:m[1], yesNo:/yesNo:true/.test(m[0])}));
  assert.ok(keys.length >= 10, `found only ${keys.length} markets`);
  for (const {key, yesNo} of keys) {
    if (yesNo) assert.equal(A().SPEC[key], undefined, `${key} is yes or no and should not have a spec`);
    else assert.ok(A().SPEC[key], `${key} has no spec in altLines.SPEC`);
  }
});

test('counts are Poisson or negative binomial, passing yards are normal, the skewed yardage is gamma', () => {
  const S = A().SPEC;
  for (const k of ['rec', 'rush_att', 'pass_att', 'pass_comp', 'pass_tds', 'pass_int']) assert.equal(S[k].kind, 'count', k);
  assert.equal(S.pass_yds.kind, 'normal');
  for (const k of ['rush_yds', 'rec_yds', 'rush_rec_yds']) assert.equal(S[k].kind, 'gamma', k);
});

test('lgamma and gammaQ match scipy: the pieces the gamma is built from', () => {
  const a = A();
  near(a.lgamma(0.5), 0.5723649429247004, 1e-13, 'lgamma(0.5):');
  near(a.lgamma(5), Math.log(24), 1e-13, 'lgamma(5):');
  near(a.lgamma(2.04), 0.017423062052386085, 1e-13, 'lgamma(2.04):');
  near(a.lgamma(9.7), 12.131084710789182, 1e-12, 'lgamma(9.7):');
  near(a.lgamma(0.25), 1.2880225246980772, 1e-13, 'lgamma(0.25):');
  // [shape, x, Q(shape, x)] from scipy.special.gammaincc
  for (const [s, x, q] of [[0.5, 0.3, 0.4385780260809997], [2.04, 1.1, 0.7104777097505994], [2.04, 6.0, 0.018439097592054872], [9.7, 3.0, 0.9983859642867428],
    [9.7, 20.0, 0.003887683008259911], [1.0, 2.5, 0.0820849986238988], [2.0, 2.5, 0.2872974951836458], [4.0, 0.001, 0.9999999999999584]]) {
    near(a.gammaQ(s, x), q, 1e-13, `Q(${s}, ${x}):`);
  }
  // shape 1 is the exponential and shape 2 is the Erlang, both with closed forms
  for (const x of [0.1, 1, 4, 12]) {
    near(a.gammaQ(1, x), Math.exp(-x), 1e-14, `exponential at ${x}:`);
    near(a.gammaQ(2, x), Math.exp(-x) * (1 + x), 1e-14, `Erlang at ${x}:`);
  }
  assert.equal(a.gammaQ(3, 0), 1); assert.equal(a.gammaQ(3, -2), 1);
  near(a.gammaQ(0.6, 40), 6.459905483477696e-19, 1e-30, 'far tail:');
});

test('Poisson: the fitted mean solves P(over) for the no-vig probability, checked against the closed form', () => {
  // pass_tds has no default overdispersion, so a short log gives a plain Poisson.
  // Over 1.5 is X >= 2, and P(X >= 2) = 1 - e^-m (1 + m). At 0.5 that gives m = 1.678347.
  const m = A().fit('pass_tds', SMALL, 1.5, 0.5);
  assert.equal(m.family, 'poisson');
  near(m.mean, 1.678347, 1e-5, 'mean:');
  near(m.tail(2), 1 - Math.exp(-m.mean) * (1 + m.mean), 1e-12, 'tail:');
  near(m.rung(1.5).pOver, 0.5, 1e-12, 'round trip:');
});

test('negative binomial: P(X = 0) is (1 + a m) to the power -1/a, and the main line still prices exactly', () => {
  const m = A().fit('rec', SMALL, 4.5, 0.6);       // short log, so the receptions default spread applies
  assert.equal(m.family, 'negbin');
  assert.ok(m.alpha > 0);
  near(1 - m.tail(1), Math.pow(1 + m.alpha * m.mean, -1 / m.alpha), 1e-12, 'zero mass:');
  near(m.rung(4.5).pOver, 0.6, 1e-12, 'round trip:');
});

test('normal: the mean sits half a standard deviation per z above the line, with the spread from the stat default', () => {
  const sd = A().SPEC.pass_yds.sd;
  const m = A().fit('pass_yds', SMALL, 249.5, 0.8413447460685429);   // P(Z < 1)
  assert.equal(m.family, 'normal');
  assert.equal(m.dispFrom, 'default');
  near(m.mean, 249.5 + sd, 1e-6, 'mean:');
  near(A().fit('pass_yds', SMALL, 249.5, 0.5).mean, 249.5, 1e-9, 'median at an even price:');
});

test('gamma: positive, right skewed, spread a fixed share of the mean, and the main line prices exactly', () => {
  const m = A().fit('rec_yds', SMALL, 59.5, 0.5);
  assert.equal(m.family, 'gamma');
  assert.equal(m.disp, A().SPEC.rec_yds.cv);
  near(m.sdX / m.mean, m.disp, 1e-12, 'cv:');
  assert.ok(m.mean > 59.5, `a right skewed stat has its mean above its median, got ${m.mean}`);
  // the tail is the module's own gamma: shape 1 / cv^2, scale mean * cv^2, whole yards so k means k - 0.5
  const a = 1 / (m.disp * m.disp);
  for (const k of [1, 20, 60, 140, 300]) near(m.tail(k), A().gammaQ(a, (k - 0.5) / (m.mean * m.disp * m.disp)), 1e-15, `tail(${k}):`);
  assert.equal(m.tail(0), 1, 'everything is 0 yards or more');
  assert.equal(m.tail(-5), 1);
  near(m.rung(59.5).pOver, 0.5, 1e-12, 'round trip:');
  // a bigger cv at the same median means a bigger mean and a fatter far tail
  const wide = A().fit('rec_yds', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 500], 59.5, 0.5);
  assert.ok(wide.disp > m.disp && wide.rung(150.5).pOver > m.rung(150.5).pOver);
});

test('under 5 games the stat default is used as it is, from there the games and the default are blended at n / (n + 16)', () => {
  const small = A().fit('rec_yds', YARDS.slice(0, 4), 59.5, 0.5), big = A().fit('rec_yds', YARDS, 59.5, 0.5), five = A().fit('rec_yds', YARDS.slice(0, 5), 59.5, 0.5);
  assert.equal(small.dispFrom, 'default'); assert.equal(small.n, 4); assert.equal(small.weight, 0);
  assert.equal(small.disp, A().SPEC.rec_yds.cv);
  assert.equal(big.dispFrom, 'logs'); assert.equal(big.n, 16); near(big.weight, 0.5, 1e-15, 'weight at 16 games:');
  near(five.weight, 5 / 21, 1e-15, 'weight at 5 games:');
  // 16 games and a shrink of 16 give the logs and the default equal say, in variance terms
  const mu = YARDS.reduce((s, x) => s + x, 0) / 16, sd = Math.sqrt(YARDS.reduce((s, x) => s + (x - mu) ** 2, 0) / 15), d = A().SPEC.rec_yds.cv;
  near(big.disp, Math.sqrt(((sd / mu) ** 2 + d * d) / 2), 1e-12, 'blended cv:');
  // passing yards blend the standard deviation itself
  const qb = [300, 220, 180, 250, 310, 190, 260, 240, 275, 205, 230, 285, 215, 245, 265, 195];
  const qm = qb.reduce((s, x) => s + x, 0) / 16, qs = Math.sqrt(qb.reduce((s, x) => s + (x - qm) ** 2, 0) / 15), d0 = A().SPEC.pass_yds.sd;
  near(A().fit('pass_yds', qb, 249.5, 0.5).disp, Math.sqrt((qs * qs + d0 * d0) / 2), 1e-12, 'blended sd:');
});

test('only the last 20 games count toward the spread', () => {
  const recent = YARDS.concat(YARDS).slice(0, 20), old = recent.concat([500, 500, 500, 500]);
  near(A().fit('rec_yds', old, 59.5, 0.5).disp, A().fit('rec_yds', recent, 59.5, 0.5).disp, 1e-12);
});

test('negative yards count as zero in the spread instead of breaking it', () => {
  const rush = [-2, 40, 12, -1, 75, 20, 0, 33, 51, 8];
  const m = A().fit('rush_yds', rush, 29.5, 0.5);
  assert.ok(m && isFinite(m.disp) && isFinite(m.mean));
  // exact: -5 counts as 0, so ten games of [0 x5, 60 x5] have mean 30 and sd sqrt(10 * 900 / 9), blended at 10 / 26
  const half = A().fit('rush_yds', [-5, -5, -5, -5, -5, 60, 60, 60, 60, 60], 29.5, 0.5), cvs = Math.sqrt(10 * 900 / 9) / 30, w = 10 / 26, d = A().SPEC.rush_yds.cv;
  near(half.disp, Math.sqrt(w * cvs * cvs + (1 - w) * d * d), 1e-12, 'floored cv:');
  const dead = A().fit('rush_yds', [-3, -1, 0, 0, -2, 0, 0, 0, -1, 0], 29.5, 0.5);
  assert.equal(dead.dispFrom, 'default', 'a log with no positive yards says nothing about the spread');
  assert.equal(dead.disp, A().SPEC.rush_yds.cv);
});

test('a spread blended from the logs is held to twice the stat default', () => {
  const wild = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 500], d = A().SPEC.rec_yds.cv;
  near(A().fit('rec_yds', wild, 59.5, 0.5).disp, d * 2, 1e-12, 'cap:');
  const flat = Array(12).fill(60);
  near(A().fit('rec_yds', flat, 59.5, 0.5).disp, Math.sqrt(16 / 28) * d, 1e-12, 'a perfectly steady player still keeps most of the default:');
});

test('a passing yards spread blended from the logs is held to twice the stat default', () => {
  const d = A().SPEC.pass_yds.sd;
  near(A().fit('pass_yds', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2000], 249.5, 0.5).disp, d * 2, 1e-12, 'cap:');
});

test('counts: the overdispersion blends the moment estimate with the stat default, and it is Poisson when that reaches zero', () => {
  const calm = A().fit('rec', POISSONISH, 4.5, 0.5), wild = A().fit('rec', VOLATILE, 4.5, 0.5), d = A().SPEC.rec.alpha;
  assert.equal(calm.family, 'poisson'); assert.equal(calm.alpha, 0); assert.equal(calm.dispFrom, 'logs');
  assert.equal(wild.family, 'negbin'); assert.equal(wild.dispFrom, 'logs');
  // moment estimate from the logs: alpha = (variance - mean) / mean^2, weighted n / (n + 16) = 1 / 2 here
  const m = VOLATILE.reduce((a, b) => a + b, 0) / 16, v = VOLATILE.reduce((a, b) => a + (b - m) ** 2, 0) / 15;
  near(wild.alpha, ((v - m) / (m * m) + d) / 2, 1e-12, 'alpha:');
  // a stat whose default is Poisson stays Poisson until the games say otherwise
  assert.equal(A().fit('pass_tds', SMALL, 1.5, 0.5).family, 'poisson');
  assert.equal(A().fit('pass_tds', POISSONISH, 1.5, 0.5).family, 'poisson');
  assert.equal(A().fit('pass_tds', VOLATILE, 1.5, 0.5).family, 'negbin');
  // and a very spread out log cannot push alpha past 1
  assert.equal(A().fit('rec', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 40], 4.5, 0.5).alpha, 1);
});

test('a count log that is all zeros falls back to the stat default instead of dividing by zero', () => {
  const m = A().fit('pass_int', Array(12).fill(0), 0.5, 0.45);
  assert.ok(m && isFinite(m.mean) && m.dispFrom === 'default');
});

test('a fatter-tailed fit prices the far rungs higher than Poisson at the same main line', () => {
  const calm = A().fit('rec', POISSONISH, 4.5, 0.5), wild = A().fit('rec', VOLATILE, 4.5, 0.5);
  near(calm.rung(4.5).pOver, wild.rung(4.5).pOver, 1e-12, 'both match the main line:');
  assert.ok(wild.rung(10.5).pOver > calm.rung(10.5).pOver, 'over 10.5');
  assert.ok(wild.rung(0.5).pUnder > calm.rung(0.5).pUnder, 'under 0.5');
});

test('over, under and push always sum to 1, over falls and under rises as the line rises', () => {
  for (const [mk, vals, line, p] of [['rec', VOLATILE, 4.5, 0.55], ['pass_tds', POISSONISH, 2, 0.4], ['rec_yds', YARDS, 59.5, 0.5], ['pass_yds', SMALL, 250, 0.45], ['rush_att', POISSONISH, 17.5, 0.6]]) {
    const m = A().fit(mk, vals, line, p);
    let prev = null;
    for (let i = -6; i <= 6; i++) {
      const L = Math.max(0.5, line + i * (m.family === 'normal' || m.family === 'gamma' ? 10 : 1));
      const r = m.rung(L);
      near(r.over + r.under + r.push, 1, 1e-12, `${mk} ${L}:`);
      assert.ok(r.over >= -1e-15 && r.under >= -1e-15 && r.push >= -1e-15, `${mk} ${L} has a negative piece`);
      if (prev) { assert.ok(r.over <= prev.over + 1e-12, `${mk} over rose at ${L}`); assert.ok(r.under >= prev.under - 1e-12, `${mk} under fell at ${L}`); }
      prev = r;
    }
  }
});

test('a whole number main line has a push, and the no-vig price is read with the push refunded', () => {
  // Over 2: wins on 3 or more, loses on 0 or 1, pushes on 2. The two prices only see the first two.
  const m = A().fit('pass_tds', POISSONISH, 2, 0.4);
  const r = m.rung(2);
  assert.ok(r.push > 0.1, `a Poisson near 2 pushes often, got ${r.push}`);
  near(r.over / (r.over + r.under), 0.4, 1e-12, 'refunded over probability:');
  near(r.pOver, 0.4, 1e-12, 'pOver is that same number:');
  near(r.pUnder, 0.6, 1e-12, 'pUnder:');
  // the same for yardage, where a whole number line is an integer yard count
  const y = A().fit('rec_yds', YARDS, 60, 0.45), ry = y.rung(60);
  assert.ok(ry.push > 0);
  near(ry.pOver, 0.45, 1e-12, 'yards:');
});

test('a line with no push gives the plain probabilities', () => {
  const r = A().fit('rec', VOLATILE, 4.5, 0.55).rung(6.5);
  assert.equal(r.push, 0);
  near(r.pOver, r.over, 1e-15); near(r.pUnder, r.under, 1e-15);
});

test('extreme but legal prices still fit', () => {
  for (const p of [0.02, 0.05, 0.5, 0.95, 0.98]) for (const [mk, line] of [['rec', 5.5], ['pass_att', 34.5], ['pass_yds', 249.5], ['rec_yds', 59.5], ['pass_tds', 0.5]]) {
    const m = A().fit(mk, SMALL, line, p);
    assert.ok(m, `${mk} ${line} ${p} returned null`);
    near(m.rung(line).pOver, p, 1e-9, `${mk} ${line} ${p}:`);
  }
});

test('input that cannot be fitted returns null instead of throwing', () => {
  const a = A();
  assert.equal(a.fit('anytime_td', SMALL, 0.5, 0.5), null);
  assert.equal(a.fit('nope', SMALL, 4.5, 0.5), null);
  for (const p of [0, 1, -0.1, 1.2, NaN, null, undefined, '0.5']) assert.equal(a.fit('rec', SMALL, 4.5, p), null, `p=${p}`);
  for (const L of [NaN, null, undefined, Infinity]) assert.equal(a.fit('rec', SMALL, L, 0.5), null, `line=${L}`);
  assert.equal(a.fit('rec', null, 4.5, 0.5).dispFrom, 'default', 'a missing log is a short log');
  assert.equal(a.fit('rec', [NaN, 'x', 4, null], 4.5, 0.5).n, 1, 'junk values are ignored');
  // a count line of 0 can never be over, so no price for it is believable
  assert.equal(a.fit('rec', SMALL, 0, 0.5), null);
});

test('fitAll fits one model per de-vig method and every one reproduces its own main line price', () => {
  const by = FP().overByMethod([[dec(-125), dec(105)], [dec(-120), dec(100)], [dec(-130), dec(110)]]);
  const f = A().fitAll('rec', VOLATILE, 4.5, by);
  assert.deepEqual(Object.keys(f.models), METHODS);
  for (const k of METHODS) near(f.models[k].rung(4.5).pOver, by[k], 1e-12, `${k}:`);
  assert.equal(f.family, f.models.shin.family);
  assert.equal(f.dispFrom, 'logs');
  const at = A().overAt(f.models, 6.5);
  assert.deepEqual(Object.keys(at), METHODS);
  for (const k of METHODS) near(at[k], f.models[k].rung(6.5).pOver, 1e-15);
});

test('fitAll gives null when no method can be fitted, and null entries when one cannot', () => {
  assert.equal(A().fitAll('rec', VOLATILE, 4.5, null), null);
  assert.equal(A().fitAll('anytime_td', VOLATILE, 0.5, {shin:0.5}), null);
  const f = A().fitAll('rec', VOLATILE, 4.5, {multiplicative:0.55, additive:null, power:NaN, shin:0.56});
  assert.ok(f.models.multiplicative && f.models.shin);
  assert.equal(f.models.additive, null); assert.equal(f.models.power, null);
  assert.equal(A().overAt(f.models, 6.5).additive, null);
});

test('rungLines walks the main line out in market sized steps and keeps the main line', () => {
  const a = A();
  assert.deepEqual(a.rungLines('rec', 4.5), [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5]);
  assert.deepEqual(a.rungLines('rec', 2.5), [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5], 'nothing at or below zero');
  assert.deepEqual(a.rungLines('pass_yds', 249.5), [149.5, 174.5, 199.5, 224.5, 249.5, 274.5, 299.5, 324.5, 349.5]);
  assert.deepEqual(a.rungLines('rec_yds', 59.5), [19.5, 29.5, 39.5, 49.5, 59.5, 69.5, 79.5, 89.5, 99.5]);
  assert.deepEqual(a.rungLines('rec_yds', 24.5), [4.5, 9.5, 14.5, 19.5, 24.5, 29.5, 34.5, 39.5, 44.5], 'small yardage lines step by 5');
  assert.ok(a.rungLines('rush_att', 17.5).includes(17.5));
  assert.deepEqual(a.rungLines('anytime_td', 0.5), []);
  assert.deepEqual(a.rungLines('rec', NaN), []);
});

test('rungLines adds the lines books actually hang, sorted, without repeats', () => {
  const r = A().rungLines('rec', 4.5, [4.5, 12.5, 3.5, 5, 4.5000000001]);
  assert.deepEqual(r, [0.5, 1.5, 2.5, 3.5, 4.5, 5, 5.5, 6.5, 7.5, 8.5, 12.5]);
  assert.deepEqual(A().rungLines('rec', 4.5, [NaN, null, -1, 0]), A().rungLines('rec', 4.5), 'junk lines are ignored');
});

test('ladderRows: fair odds follow the shown method, EV follows the gate, the flag follows the threshold', () => {
  const by = FP().overByMethod([[dec(-125), dec(105)], [dec(-120), dec(100)], [dec(-130), dec(110)]]);
  const f = A().fitAll('rec', VOLATILE, 4.5, by);
  const prices = {'over|5.5':{price:200, book:'dk'}, 'over|6.5':{price:400, book:'fd'}, 'over|4.5':{price:-120, book:'mgm'}};
  const rows = A().ladderRows(f.models, [3.5, 4.5, 5.5, 6.5], {side:'over', show:'shin', gate:'worst', forSide:FP().forSide, evMin:0.10,
    best:(L, side) => prices[`${side}|${L}`] || null});
  assert.equal(rows.length, 4);
  const main = rows[1];
  near(main.pShow, by.shin, 1e-12, 'shown method at the main line:');
  assert.equal(main.showMethod, 'shin');
  near(main.pGate, Math.min(...METHODS.map(k => by[k])), 1e-12, 'worst case at the main line:');
  near(main.ev, main.pGate * dec(-120) - 1, 1e-12, 'ev:');
  assert.equal(rows[0].best, null); assert.equal(rows[0].ev, null); assert.equal(rows[0].flag, false);
  for (const r of rows) {
    const worst = Math.min(...METHODS.map(k => A().overAt(f.models, r.line)[k]));
    near(r.pGate, worst, 1e-12, `gate at ${r.line}:`);
    if (r.ev != null) assert.equal(r.flag, r.ev >= 0.10, `flag at ${r.line}`);
  }
});

test('ladderRows flags a rung whose EV is on the bar or above it, not one that is positive but short of it', () => {
  const by = FP().overByMethod([[dec(-125), dec(105)], [dec(-120), dec(100)], [dec(-130), dec(110)]]);
  const f = A().fitAll('rec', VOLATILE, 4.5, by);
  const run = evMin => A().ladderRows(f.models, [6.5], {side:'over', show:'shin', gate:'worst', forSide:FP().forSide, evMin, best:() => ({price:500, book:'dk'})})[0];
  const e = run(0.1).ev;
  assert.ok(e > 0.05, `the test needs a clearly positive EV, got ${e}`);
  assert.equal(run(e - 0.05).flag, true, 'above the bar');
  assert.equal(run(e).flag, true, 'exactly on the bar');
  assert.equal(run(e + 0.05).flag, false, 'positive but under the bar');
  assert.equal(run(e + 1e-9).flag, false, 'just under the bar');
});

test('ladderRows never flags a rung whose fair chance is under 3% or over 97%, where the model ran too confident in testing', () => {
  const by = FP().overByMethod([[dec(-125), dec(105)], [dec(-120), dec(100)], [dec(-130), dec(110)]]);
  const f = A().fitAll('rec', VOLATILE, 4.5, by);
  const row = (L, side, price) => A().ladderRows(f.models, [L], {side, show:'shin', gate:'worst', forSide:FP().forSide, evMin:0.1, best:() => ({price, book:'dk'})})[0];
  const longshot = row(16.5, 'over', 9000), safe = row(16.5, 'under', -200), mid = row(6.5, 'over', 500);
  assert.ok(longshot.pGate < 0.03 && longshot.ev > 0.1, `needs a long shot with a big EV, got p ${longshot.pGate} ev ${longshot.ev}`);
  assert.ok(safe.pGate > 0.97 && safe.ev > 0.1, `needs a near certainty with a big EV, got p ${safe.pGate} ev ${safe.ev}`);
  assert.ok(mid.pGate > 0.03 && mid.pGate < 0.97 && mid.ev > 0.1);
  assert.equal(longshot.flag, false); assert.equal(longshot.inRange, false);
  assert.equal(safe.flag, false); assert.equal(safe.inRange, false);
  assert.equal(mid.flag, true); assert.equal(mid.inRange, true);
  assert.equal(A().FLAG_MIN_P, 0.03); assert.equal(A().FLAG_MAX_P, 0.97);
});

test('ladderRows prices the under with the lowest under probability, and uses the under price', () => {
  const by = FP().overByMethod([[dec(-125), dec(105)], [dec(-120), dec(100)]]);
  const f = A().fitAll('rec', VOLATILE, 4.5, by);
  const rows = A().ladderRows(f.models, [3.5, 4.5], {side:'under', show:'multiplicative', gate:'worst', forSide:FP().forSide, evMin:0.10,
    best:(L, side) => side === 'under' ? {price:110, book:'czr'} : null});
  for (const r of rows) {
    const at = A().overAt(f.models, r.line);
    near(r.pGate, Math.min(...METHODS.map(k => 1 - at[k])), 1e-12, `under gate at ${r.line}:`);
    near(r.pShow, 1 - at.multiplicative, 1e-12, `under shown at ${r.line}:`);
    near(r.ev, r.pGate * dec(110) - 1, 1e-12, `under ev at ${r.line}:`);
  }
});

test('ladderRows reads a whole number rung with the push refunded', () => {
  const by = FP().overByMethod([[dec(-115), dec(-105)]]);
  const f = A().fitAll('pass_tds', POISSONISH, 2, by);
  const [row] = A().ladderRows(f.models, [2], {side:'over', show:'shin', gate:'shin', forSide:FP().forSide, evMin:0.1, best:() => ({price:-105, book:'dk'})});
  near(row.pShow, by.shin, 1e-12);
  assert.equal(row.push, true);
});

test('ladderRows carries the model fair price and survives models that failed to fit', () => {
  const f = A().fitAll('rec', VOLATILE, 4.5, {multiplicative:0.55, additive:null, power:null, shin:null});
  const [row] = A().ladderRows(f.models, [5.5], {side:'over', show:'shin', gate:'worst', forSide:FP().forSide, evMin:0.1, best:() => null});
  assert.equal(row.pShow, null);
  assert.ok(row.pGate != null, 'worst still works off the one method that fitted');
  assert.equal(row.ev, null);
});

test('the house rule against em and en dashes holds in the app, the tests and the docs', () => {
  const dash = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');   // built from char codes so this file stays dash free
  for (const f of ['../index.html', '../sw.js', '../CLAUDE.md', '../CHANGELOG.md', '../README.md', './altlines.test.mjs', './fairprice.test.mjs']) {
    const t = readFileSync(new URL(f, import.meta.url), 'utf8');
    const i = t.search(dash);
    assert.equal(i, -1, `${f} has a dash near: ${i < 0 ? '' : t.slice(Math.max(0, i - 30), i + 30)}`);
  }
});
