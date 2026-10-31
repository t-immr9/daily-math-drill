// 毎日3分数学(数学II)の自動チェック
// 使い方: リポジトリのフォルダで  node tests/check.js
// 何か1つでも失敗すると、最後に「失敗」と表示して終了コード1で終わる。
// index.html は書き換えない(読み込んで、ブラウザの代わりの仮の画面で動かすだけ)。
const vm = require('vm'), fs = require('fs'), path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = (html.match(/<script>([\s\S]*)<\/script>/) || [])[1];
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { if (cond) pass++; else { fail++; console.log('✗ ' + name + (detail ? '  ' + detail : '')); } };

// ---- ブラウザの代わり(画面部品はすべて空の箱) ----
const el = () => new Proxy(function () {}, {
  get: (t, p) => p === 'classList' ? { add() {}, remove() {}, toggle() {} } : p === 'style' ? {} :
    ['appendChild', 'append', 'select', 'addEventListener'].includes(p) ? () => {} : p === 'closest' ? () => null : undefined,
  set: () => true
});
const store = {};
const ctx = vm.createContext({
  document: { querySelector: () => el(), createElement: () => el() },
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  btoa, atob, console
});
try { vm.runInContext(script, ctx); ok('スクリプトが読み込める', true); }
catch (e) { console.log('✗ スクリプトの読み込みでエラー: ' + e.message); process.exit(1); }
const run = c => vm.runInContext(c, ctx);

// ---- 1. 記録(スタンプ)を守るための約束 ----
ok('保存名が daily-math-v2-progress のまま(変えるとスタンプが消える)', run('STORAGE') === 'daily-math-v2-progress');
ok('スタンプの記録の形 {completed:true,score} のまま', /P\.days\[key\]=\{completed:true,score\}/.test(script));
ok('「振幅」という言葉を使っていない', !html.includes('振幅'));

// ---- 2. 問題データ ----
const Q = run('Q.map(q=>({id:q.id,u:q.u,t:q.t,g:q.g,q:q.q,i:q.i,m:q.m,a:q.a,f:q.f,x:q.x,k:q.k}))');
const ids = new Set(); let dup = 0; Q.forEach(q => { if (ids.has(q.id)) dup++; ids.add(q.id); });
ok('問題IDに重複がない', dup === 0, dup + '件');
ok('問題IDは英数字・記号のみ(引き継ぎコードのため)', Q.every(q => /^[\x20-\x7e]+$/.test(q.id)));
const PLAN = run('PLAN.map(e=>({id:e.id,u:e.u,t:e.t,name:e.name,n:pool(e).length}))');
PLAN.forEach(e => ok(`単元「${e.name}」に問題がある`, e.n > 0));

// ---- 3. 答えの数学的な正しさ ----
const V = { θ: 0.37, α: 0.81, β: 1.23 };
const ev = (s, v) => { v = Object.assign({}, V, v || {}); return eval(s.replace(/−/g, '-').replace(/＋/g, '+').replace(/√(\d+)/g, 'Math.sqrt($1)')
  .replace(/(\d+)\/(\d+)π/g, '($1*Math.PI/$2)').replace(/π\/(\d+)/g, '(Math.PI/$1)').replace(/(\d)\(/g, '$1*(')
  .replace(/(sin|cos|tan)²([θαβ])/g, 'Math.pow(Math.$1(V.$2),2)').replace(/(sin|cos|tan)([θαβ])/g, 'Math.$1(V.$2)')
  .replace(/(?<!\.)(sin|cos|tan)\(/g, 'Math.$1(').replace(/(?<![.\w])[θαβ]/g, 'V.$&').replace(/([\d)])(?=Math\.)/g, '$1*').replace(/(\))(?=\d)/g, '$1*')); };
const nr = (n, x) => x < 0 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n);
const num = s => eval(s.replace(/−/g, '-').replace(/\[(\d)\]√\{([^{}]*)\}/g, 'nr($1,($2))').replace(/√\{([^{}]*)\}/g, 'Math.sqrt($1)')
  .replace(/√(\d+)/g, 'Math.sqrt($1)').replace(/\^\{([^{}]*)\}/g, '**($1)').replace(/×/g, '*').replace(/÷/g, '/'));
const letters = (s, A, B) => eval(s.replace(/−/g, '-').replace(/\^\{([^{}]*)\}/g, '**($1)').replace(/×/g, '*').replace(/÷/g, '/')
  .replace(/a/g, `(${A})`).replace(/b/g, `(${B})`).replace(/\)\(/g, ')*(').replace(/(\d)\(/g, '$1*(').replace(/\)(\d)/g, ')*$1'));
const stored = q => q.m === 'f' ? num(q.f[0][0]) / num(q.f[0][1]) : num(q.a[0]);
const close = (x, y) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x));
for (const q of Q) {
  try {
    let m;
    if (q.u === 'exlog' && q.t === 'l') {
      for (const [A, B] of [[1.7, 0.6], [2.3, 1.9]]) {
        const l = letters(q.q, A, B), r = q.m === 'f' ? letters(q.f[0][0], A, B) / letters(q.f[0][1], A, B) : letters(q.a[0], A, B);
        ok('計算: ' + q.q, close(l, r), `${l} ≠ ${r}`);
      }
      if (q.m === 'f') ok('マイナス乗は分数で答える形: ' + q.q, !/[−-]/.test(q.f[0].join('')));
    } else if (q.u === 'exlog' && q.t === 'x') {
      m = /^(\d)\^\{x\}＝(.+)$/.exec(q.q); ok('計算: ' + q.q, close(Math.pow(+m[1], +q.a[0]), num(m[2])));
    } else if (q.u === 'exlog') {
      ok('計算: ' + q.q, close(num(q.q), stored(q)), `${num(q.q)} ≠ ${stored(q)}`);
      const v = Math.abs(stored(q)), big = v < 1 ? Math.round(1 / v) : v;
      ok('答えが216以内: ' + q.q, big <= 216);
    } else if ((m = /^(sin|cos|tan) (\d+)°$/.exec(q.q))) {
      ok('計算: ' + q.q, close(Math[m[1]](m[2] * Math.PI / 180), q.m === 'f' ? ev(q.f[0][0]) / ev(q.f[0][1]) : ev(q.a[0])));
      if (q.m === 'f') q.f.forEach(z => ok('別の書き方も同じ値: ' + q.q, close(ev(z[0]) / ev(z[1]), ev(q.f[0][0]) / ev(q.f[0][1]))));
    } else if (q.t === 'p' || q.t === 'd') {
      const l = ev(q.q.replace(/^(sin|cos|tan) 2θ$/, (_, f) => `${f}(2*θ)`)), r = q.m === 'f' ? ev(q.f[0][0]) / ev(q.f[0][1]) : ev(q.a[0]);
      ok('公式: ' + q.q + (q.i ? '(' + q.i + ')' : ''), close(l, r));
    } else if (q.t === 's') {
      for (const th of [0.2, 1.1, 2.5]) q.a.forEach(z => ok('合成: ' + q.q + ' = ' + z, close(ev(q.q.replace(/\s/g, ''), { θ: th }), ev(z, { θ: th }))));
      q.a.forEach(z => { // 角は −π＜α≤π
        let m2 = /θ([+-])(\d*)π\/(\d+)\)$/.exec(z) || /θ([+-])(\d+)\/(\d+)π\)$/.exec(z);
        const k = (m2[2] === '' ? 1 : +m2[2]) / +m2[3] * (m2[1] === '-' ? -1 : 1);
        ok('合成の角が −π＜α≤π: ' + z, k > -1 && k <= 1);
      });
    }
  } catch (e) { ok('チェック中にエラー: ' + q.q, false, e.message); }
}

// ---- 4. キー操作どおりに入力して正解になるか(全問・全部の書き方) ----
const typeKeys = (field, str) => { let r = `active='${field}';`, i = 0;
  while (i < str.length) { if (str.startsWith('^{', i)) { r += "keyPress('上付き');"; i += 2; } else if (str[i] === '}') { r += "keyPress('上付き');"; i++; }
    else { r += `keyPress(${JSON.stringify(str[i] === '-' ? '\u2212' : str[i])});`; i++; } } return r; };
const play = (id, f) => run(`(()=>{daily=[Q.find(q=>q.id===${JSON.stringify(id)})];index=0;results=[];checked=false;fractions=[];render();raw.answer='';raw.numerator='';raw.denominator='';raw.full='';${f};check();return results[0]})()`);
const MN = s => s.replace(/-/g, '\u2212');
let typed = 0;
for (const q of Q) {
  const forms = q.m === 'f' ? q.f.map(z => q.u === 'exlog' ? typeKeys('numerator', z[0]) + typeKeys('denominator', z[1])
      : `raw.numerator=${JSON.stringify(MN(z[0]))};raw.denominator=${JSON.stringify(MN(z[1]))}`)
    : q.m === 'n' ? q.a.map(a => q.u === 'exlog' ? typeKeys('answer', a) : `raw.answer=${JSON.stringify(MN(a))}`)
    : q.a.map(a => { let m = /^(.*)sin\(θ([+-])(\d*)π\/(\d+)\)$/.exec(a);
        if (m) return `raw.full=${JSON.stringify(MN(m[1]) + 'sin(θ' + MN(m[2]) + '§0)')};fractions=[{n:'${m[3]}π',d:'${m[4]}'}]`;
        m = /^(.*)sin\(θ([+-])(\d+)\/(\d+)π\)$/.exec(a);
        return `raw.full=${JSON.stringify(MN(m[1]) + 'sin(θ' + MN(m[2]) + '§0π)')};fractions=[{n:'${m[3]}',d:'${m[4]}'}]`; });
  forms.forEach(f => { typed++; ok('入力すると正解になる: ' + q.q + (q.i ? '(' + q.i + ')' : ''), play(q.id, f) === true); });
}
const byQ = s => Q.find(q => q.q === s).id;
ok('文字の順が逆でも正解 (a²b)³ → b³a⁶', play(byQ('(a^{2}b)^{3}'), typeKeys('answer', 'b^{3}a^{6}')) === true);
ok('マイナス乗のまま答えると不正解 a³×a⁻⁵ → a⁻²', play(byQ('a^{3}×a^{−5}'), typeKeys('numerator', 'a^{-2}') + typeKeys('denominator', '1')) === false);
ok('合成で +2π した角は不正解(−π＜α≤π)', play(byQ('sin θ−cos θ'), "raw.full='√2sin(θ+§0)';fractions=[{n:'7π',d:'4'}]") === false);
ok('加法定理は項の順が逆でも正解', play('sp', "raw.answer='cosβsinα＋sinβcosα'") === true);

// ---- 5. キー配置: 1〜9は3×3、その下が − 0 ⌫ ----
const sample = {}; Q.forEach(q => { const k = q.u + q.t; if (!sample[k]) sample[k] = q.id; });
for (const id of Object.values(sample)) {
  const L = run(`keyLayout(Q.find(q=>q.id===${JSON.stringify(id)}))`), k = L.indexOf('1');
  ok('キー配置(1〜9が3×3、下段が − 0 ⌫): ' + Q.find(q => q.id === id).g, k % 3 === 0 && L.slice(k, k + 12).join('') === '123456789−0⌫');
}

// ---- 6. 記録・単元選択・引き継ぎコード ----
run("P.days={};P.wrong={};P.units=PLAN.filter(e=>e.u==='trig').map(e=>e.id);P.set=null");
ok('1日の問題数は5問', run('buildDaily().length') === 5);
const setDays = arr => run(`P.days={};${JSON.stringify(arr)}.forEach(o=>{P.days[dayKey(o)]={completed:true,score:5}})`);
setDays([-2, -1, 0]); ok('連続日数(今日まで3日)', run("drawRecords('',0)") === 3);
setDays([-3, -2]); ok('2日空くと連続は0', run("drawRecords('',0)") === 0);
setDays([-5, -4, 0]); const code = run('exportCode()'); run("P.days={}");
ok('引き継ぎコードで記録を戻せる', run(`importCode(${JSON.stringify(code)})`) === true && run('Object.keys(P.days).length') === 3);
run("P={days:{'2026-10-01':{completed:true,score:4}}}");
ok('古い版の記録もそのまま読める', run("P.days['2026-10-01'].score") === 4);

console.log(`\n確認した項目: ${pass + fail}(うち入力テスト ${typed} 通り)`);
console.log(fail ? `失敗: ${fail} 件` : 'すべて成功');
process.exit(fail ? 1 : 0);
