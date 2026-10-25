// test_rand.js — 随机组卡 + 细分类型伪位 纯逻辑单元测试
//
// 运行环境:应用页面(card-search/dist/index.html,数据加载完成后)。
// 方式一:浏览器 DevTools 控制台粘贴本文件全部内容,然后执行 runRandTests()
// 方式二:ZCode 浏览器自动化中 evaluate 注入本文件,再调用 runRandTests()
//
// 覆盖:deckKindOf 卡池归属 / randRuleMatches 规则语义(含永续魔法/永续陷阱伪位)
//       / randCapacity 同名容量 / drawFromPools 抽取与上限 / randDraw 约束与历史
//       / passFilters 伪位筛选 / applyRandData 存档校验 / subBitName 三语 / rfmt。
// 每次运行会备份并恢复 RSTATE 与 STATE.locale,不影响页面当前状态。
/* global window, deckKindOf, randRuleMatches, buildRandPools, randCapacity,
   drawFromPools, randDraw, randSnapshot, applyRandData, saveRand, renderRand,
   passFilters, subBitName, isPseudoSubBit, rfmt, randCardCap,
   RSTATE, STATE, DATA, cardById,
   SUB_BITS, SUB_CONT_SPELL, SUB_CONT_TRAP, EXTRA_DECK_BITS */

window.runRandTests = (function () {
  var tests = [];
  function t(name, fn) { tests.push({ name: name, fn: fn }); }

  function eq(act, exp, msg) {
    if (act !== exp) {
      throw new Error((msg || '') + ' 期望 ' + JSON.stringify(exp) + ',实际 ' + JSON.stringify(act));
    }
  }
  function ok(v, msg) { if (!v) throw new Error(msg || '断言失败'); }
  function sameSet(act, exp, msg) {
    var a = act.slice().sort(), b = exp.slice().sort();
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      throw new Error((msg || '') + ' 期望集合 ' + JSON.stringify(b) + ',实际 ' + JSON.stringify(a));
    }
  }

  var SEQ = 0;
  function mkCard(o) {
    var c = { id: ++SEQ, n: '测试卡' + SEQ, t: 0, atk: 0, def: 0, lv: 0, r: 0, at: 0,
      sc: 0, cat: 0, ot: 3, al: 0 };
    if (o) for (var k in o) c[k] = o[k];
    return c;
  }
  // passFilters 可接受的最小状态(与 STATE2 同构,数值字段缺省由 isNumeric 兜住)
  function mkSt(sub) {
    return { q: '', main: [], sub: sub || [], attr: [], race: [], cats: [], tags: [],
      tg: [], acts: [], fdesc: [], pside: [], effStrict: false, setcode: 0,
      lvMin: null, lvMax: null, scMin: null, scMax: null,
      atkMin: null, atkMax: null, defMin: null, defMax: null,
      ot: 0, script: 0, pre: 0 };
  }
  function firstCard(pred) {
    for (var i = 0; i < DATA.length; i++) if (pred(DATA[i])) return DATA[i];
    return null;
  }

  /* ================= A. deckKindOf 卡池归属 ================= */

  t('deckKindOf: 通常/效果怪兽→主卡组', function () {
    eq(deckKindOf(mkCard({ t: 0x11 })), 'mon');
    eq(deckKindOf(mkCard({ t: 0x21 })), 'mon');
  });
  t('deckKindOf: 仪式怪兽→主卡组', function () {
    eq(deckKindOf(mkCard({ t: 0x81 })), 'mon');
  });
  t('deckKindOf: 灵摆怪兽(无额外位)→主卡组', function () {
    eq(deckKindOf(mkCard({ t: 0x1000021 })), 'mon');
  });
  t('deckKindOf: 融合/同调/超量/连接→额外卡组', function () {
    eq(deckKindOf(mkCard({ t: 0x41 })), 'extra');
    eq(deckKindOf(mkCard({ t: 0x2021 })), 'extra');
    eq(deckKindOf(mkCard({ t: 0x800021 })), 'extra');
    eq(deckKindOf(mkCard({ t: 0x4000021 })), 'extra');
  });
  t('deckKindOf: 额外灵摆(灵摆+融合)→额外卡组', function () {
    eq(deckKindOf(mkCard({ t: 0x1000041 })), 'extra');
  });
  t('deckKindOf: 魔法/速攻/永续陷阱 归属', function () {
    eq(deckKindOf(mkCard({ t: 0x2 })), 'spell');
    eq(deckKindOf(mkCard({ t: 0x10002 })), 'spell');
    eq(deckKindOf(mkCard({ t: 0x20004 })), 'trap');
  });
  t('deckKindOf: 陷阱怪兽(运行时 0x100 位)→主卡组陷阱', function () {
    eq(deckKindOf(mkCard({ t: 0x20004 | 0x100 })), 'trap');
  });
  t('deckKindOf: 衍生物(含 0x4000)→不进池', function () {
    eq(deckKindOf(mkCard({ t: 0x4000 })), null);
    eq(deckKindOf(mkCard({ t: 0x4011 })), null);
    eq(deckKindOf(mkCard({ t: 0x1000000 | 0x4000 })), null);
  });
  t('deckKindOf: 无类型位→null', function () {
    eq(deckKindOf(mkCard({ t: 0 })), null);
  });

  /* ================= B. randRuleMatches 规则语义 ================= */

  t('规则: 空维度规则匹配任何卡', function () {
    var r = { main: [], sub: [], attr: [], race: [], setcode: 0 };
    ok(randRuleMatches(mkCard({ t: 0x11 }), r), '空规则应匹配');
  });
  t('规则: main 单位匹配', function () {
    var r = { main: [0x1], sub: [], attr: [], race: [], setcode: 0 };
    ok(randRuleMatches(mkCard({ t: 0x11 }), r));
    ok(!randRuleMatches(mkCard({ t: 0x2 }), r));
  });
  t('规则: main 维内 OR(任一)', function () {
    var r = { main: [0x2, 0x4], sub: [], attr: [], race: [], setcode: 0 };
    ok(randRuleMatches(mkCard({ t: 0x2 }), r), '魔法应命中');
    ok(randRuleMatches(mkCard({ t: 0x4 }), r), '陷阱应命中');
    ok(!randRuleMatches(mkCard({ t: 0x1 }), r));
  });
  t('规则: sub 单位匹配(仪式)', function () {
    var r = { main: [], sub: [0x80], attr: [], race: [], setcode: 0 };
    ok(randRuleMatches(mkCard({ t: 0x81 }), r), '仪式应命中');
    ok(!randRuleMatches(mkCard({ t: 0x11 }), r));
  });
  t('规则: sub 维内 AND(全部满足)', function () {
    var r = { main: [], sub: [0x1000, 0x20], attr: [], race: [], setcode: 0 };
    ok(randRuleMatches(mkCard({ t: 0x1021 }), r), '效果+调整应命中');   // 效果+调整
    ok(!randRuleMatches(mkCard({ t: 0x1001 }), r), '仅调整不应命中');  // 仅调整
  });
  t('规则: 旧格式规则(无 sub 字段)不抛错且 main 生效', function () {
    var r = { main: [0x2], attr: [], race: [], setcode: 0 };
    ok(randRuleMatches(mkCard({ t: 0x2 }), r));
    ok(!randRuleMatches(mkCard({ t: 0x1 }), r));
  });
  t('规则: attr 维内 OR', function () {
    var r = { main: [], sub: [], attr: [0x4, 0x8], race: [], setcode: 0 };
    ok(randRuleMatches(mkCard({ t: 0x21, at: 0x4 }), r), '炎应命中');
    ok(randRuleMatches(mkCard({ t: 0x21, at: 0x8 }), r), '风应命中');
    ok(!randRuleMatches(mkCard({ t: 0x21, at: 0x10 }), r));
  });
  t('规则: race 匹配', function () {
    var r = { main: [], sub: [], attr: [], race: [0x2000], setcode: 0 };
    ok(randRuleMatches(mkCard({ t: 0x11, r: 0x2000 }), r), '龙族应命中');
    ok(!randRuleMatches(mkCard({ t: 0x11, r: 0x1 }), r), '战士不应命中');
  });
  t('规则: 字段 setcode 按父子系列语义匹配', function () {
    var r1 = { main: [], sub: [], attr: [], race: [], setcode: 0xdd };
    ok(randRuleMatches(mkCard({ t: 0x11, sc: 0xdd }), r1));
    ok(!randRuleMatches(mkCard({ t: 0x11, sc: 0xde }), r1));
    var r2 = { main: [], sub: [], attr: [], race: [], setcode: 0x10f2 };
    ok(randRuleMatches(mkCard({ t: 0x11, sc: 0x10f20099 }), r2), '高位槽位应命中');
  });
  t('规则: 永续魔法伪位(0x40000000)=永续位+魔法位', function () {
    var r = { main: [], sub: [SUB_CONT_SPELL], attr: [], race: [], setcode: 0 };
    ok(randRuleMatches(mkCard({ t: 0x2 | 0x20000 }), r), '永续魔法应命中');
    ok(!randRuleMatches(mkCard({ t: 0x4 | 0x20000 }), r), '永续陷阱不应命中');
    ok(!randRuleMatches(mkCard({ t: 0x2 }), r), '普通魔法不应命中');
    ok(!randRuleMatches(mkCard({ t: 0x20000 }), r), '无主类型不应命中');
  });
  t('规则: 永续陷阱伪位(0x20000000)=永续位+陷阱位', function () {
    var r = { main: [], sub: [SUB_CONT_TRAP], attr: [], race: [], setcode: 0 };
    ok(randRuleMatches(mkCard({ t: 0x4 | 0x20000 }), r));
    ok(!randRuleMatches(mkCard({ t: 0x2 | 0x20000 }), r));
  });
  t('规则: 维度间 AND(主类型×属性)', function () {
    var r = { main: [0x1], sub: [], attr: [0x10], race: [], setcode: 0 };
    ok(randRuleMatches(mkCard({ t: 0x21, at: 0x10 }), r), '光怪兽应命中');
    ok(!randRuleMatches(mkCard({ t: 0x21, at: 0x20 }), r), '暗怪兽不应命中');
    ok(!randRuleMatches(mkCard({ t: 0x2, at: 0x10 }), r), '光魔法不应命中');
  });

  /* ================= C. randCapacity 同名容量 ================= */

  function capPool() {
    return [mkCard({ n: 'A' }), mkCard({ n: 'A' }), mkCard({ n: 'A' }),
      mkCard({ n: 'B' }), mkCard({ n: 'C' })];
  }
  t('容量: 每卡上限 3 → A 组 3 + B 1 + C 1 = 5', function () {
    RSTATE.cap = 3;
    eq(randCapacity(capPool()), 5);
  });
  t('容量: 每卡上限 1 → 按卡名去重 = 3', function () {
    RSTATE.cap = 1;
    eq(randCapacity(capPool()), 3);
  });
  t('容量: 每卡上限 2 → 2+1+1 = 4', function () {
    RSTATE.cap = 2;
    eq(randCapacity(capPool()), 4);
  });
  t('容量: 空池 = 0', function () {
    eq(randCapacity([]), 0);
  });
  t('容量: 无卡名卡按 #id 分组', function () {
    RSTATE.cap = 3;
    eq(randCapacity([mkCard({ id: 901, n: '' }), mkCard({ id: 902, n: '' })]), 2);
  });

  /* ================= D. drawFromPools 抽取 ================= */

  t('抽取: 满额抽取全部来自池内', function () {
    RSTATE.cap = 3;
    var pool = [mkCard({ n: 'A' }), mkCard({ n: 'B' }), mkCard({ n: 'C' })];
    var r = drawFromPools([pool], 3, {});
    eq(r.ids.length, 3);
    eq(r.deficit, 0);
    var ids = pool.map(function (c) { return c.id; });
    r.ids.forEach(function (id) { ok(ids.indexOf(id) >= 0, '抽出的卡应在池内'); });
  });
  t('抽取: 同名组受上限约束并正确报缺额', function () {
    RSTATE.cap = 1;
    var pool = [mkCard({ n: 'A' }), mkCard({ n: 'A' }), mkCard({ n: 'A' })];
    var r = drawFromPools([pool], 3, {});
    eq(r.ids.length, 1);
    eq(r.deficit, 2);
  });
  t('抽取: 预置 nameUse 跨池共享,单卡名可重复至上限', function () {
    RSTATE.cap = 3;
    var x = mkCard({ n: 'X' }), b = mkCard({ n: 'B' });
    var r = drawFromPools([[x], [b]], 2, { 'X': 3 });
    sameSet(r.ids, [b.id, b.id]);
    eq(r.deficit, 0);
  });
  t('抽取: 多池并集抽取', function () {
    RSTATE.cap = 1;
    var a = mkCard({ n: 'A' }), b = mkCard({ n: 'B' });
    var r = drawFromPools([[a], [b]], 2, {});
    sameSet(r.ids, [a.id, b.id]);
  });

  /* ================= E. randDraw 完整抽取 ================= */

  function resetDrawState() {
    RSTATE.mainN = 40; RSTATE.minMon = 0; RSTATE.minSp = 0; RSTATE.minTr = 0;
    RSTATE.extraN = 15; RSTATE.cap = 3; RSTATE.pre = 1; RSTATE.ot = 0; RSTATE.bl = 1;
    RSTATE.excluded = {}; RSTATE.rules = [];
  }
  t('抽取: 默认设置 主40+额15 且归属正确', function () {
    resetDrawState();
    var res = randDraw();
    ok(!res.err, '不应报错: ' + (res.err || ''));
    var e = res.entry;
    eq(e.main.length, 40);
    eq(e.extra.length, 15);
    e.main.forEach(function (id) {
      var k = deckKindOf(cardById[id]);
      ok(k === 'mon' || k === 'spell' || k === 'trap', '主卡组只能放主卡组卡');
    });
    e.extra.forEach(function (id) { eq(deckKindOf(cardById[id]), 'extra'); });
  });
  t('抽取: 最小张数 20/10/10 恰好满足', function () {
    resetDrawState();
    RSTATE.minMon = 20; RSTATE.minSp = 10; RSTATE.minTr = 10;
    var res = randDraw();
    ok(!res.err, '不应报错: ' + (res.err || ''));
    var kinds = {};
    res.entry.main.forEach(function (id) {
      kinds[deckKindOf(cardById[id])] = (kinds[deckKindOf(cardById[id])] || 0) + 1;
    });
    eq(kinds.mon, 20); eq(kinds.spell, 10); eq(kinds.trap, 10);
  });
  t('抽取: 上限 1 时主+额 55 张卡名全不同(跨卡组共享)', function () {
    resetDrawState();
    RSTATE.cap = 1;
    var res = randDraw();
    ok(!res.err);
    var names = res.entry.main.concat(res.entry.extra)
      .map(function (id) { return cardById[id].n; });
    var uniq = {};
    names.forEach(function (n) { uniq[n] = 1; });
    eq(Object.keys(uniq).length, 55);
  });
  t('抽取: 上限 3 时任一卡名 ≤3 张', function () {
    resetDrawState();
    RSTATE.cap = 3;
    var res = randDraw();
    ok(!res.err);
    var names = res.entry.main.concat(res.entry.extra)
      .map(function (id) { return cardById[id].n; });
    var cnt = {};
    names.forEach(function (n) { cnt[n] = (cnt[n] || 0) + 1; });
    Object.keys(cnt).forEach(function (n) { ok(cnt[n] <= 3, '卡名 ' + n + ' 超过 3 张'); });
  });
  t('抽取: 排除卡 10 次抽取不再出现', function () {
    resetDrawState();
    var target = buildRandPools().extra[0].id;
    RSTATE.excluded[target] = 1;
    for (var i = 0; i < 10; i++) {
      var res = randDraw();
      ok(!res.err);
      ok(res.entry.main.indexOf(target) < 0 && res.entry.extra.indexOf(target) < 0,
        '被排除卡不应出现');
    }
  });
  t('抽取: 仪式排除规则生效(主+额均无仪式卡)', function () {
    resetDrawState();
    RSTATE.rules = [{ main: [], sub: [0x80], attr: [], race: [], setcode: 0 }];
    for (var i = 0; i < 5; i++) {
      var res = randDraw();
      ok(!res.err);
      res.entry.main.concat(res.entry.extra).forEach(function (id) {
        ok(!(cardById[id].t & 0x80), '不应抽到仪式卡');
      });
    }
  });
  t('抽取: 永续陷阱排除规则使陷阱池减少量=池内永续陷阱数', function () {
    resetDrawState(); // bl=1:禁止卡不进池,池差应对照过滤后的数量
    var t0 = buildRandPools().trap.length;
    RSTATE.rules = [{ main: [], sub: [SUB_CONT_TRAP], attr: [], race: [], setcode: 0 }];
    var t1 = buildRandPools().trap.length;
    var expect = DATA.filter(function (c) {
      return (c.t & 0x20000) && (c.t & 0x4) && !(c.t & 0x4000) && c.bl !== 0;
    }).length;
    eq(t0 - t1, expect);
  });
  t('抽取: 最小张数之和超过主卡组数量 → 报错', function () {
    resetDrawState();
    RSTATE.minMon = 30; RSTATE.minSp = 30;
    ok(randDraw().err);
  });
  t('抽取: 额外池不足 → 报错', function () {
    resetDrawState();
    RSTATE.extraN = 999999;
    ok(typeof randDraw().err === 'string' && randDraw().err.length > 0);
  });
  t('抽取: 负数量 → 报错', function () {
    resetDrawState();
    RSTATE.mainN = -1;
    ok(randDraw().err);
  });
  t('抽取: 历史上限 50 条,超出后最旧记录被移除', function () {
    resetDrawState();
    RSTATE.mainN = 0; RSTATE.extraN = 0;
    RSTATE.history = [];
    for (var i = 0; i < 50; i++) RSTATE.history.push({ ts: 1000 + i, main: [], extra: [] });
    var res = randDraw();
    ok(!res.err);
    eq(RSTATE.history.length, 50);
    eq(RSTATE.history[0].ts, 1001, '最旧的 1000 应被移除');
    eq(RSTATE.view, 49, 'view 指向最新一条');
  });

  /* ================= F. passFilters 永续伪位(搜索/G2 共用) ================= */

  t('筛选: 永续魔法伪位命中永续魔法', function () {
    var st = mkSt([SUB_CONT_SPELL]);
    ok(passFilters(mkCard({ t: 0x2 | 0x20000 }), st));
    ok(!passFilters(mkCard({ t: 0x4 | 0x20000 }), st));
    ok(!passFilters(mkCard({ t: 0x2 }), st));
  });
  t('筛选: 永续陷阱伪位命中永续陷阱', function () {
    var st = mkSt([SUB_CONT_TRAP]);
    ok(passFilters(mkCard({ t: 0x4 | 0x20000 }), st));
    ok(!passFilters(mkCard({ t: 0x2 | 0x20000 }), st));
  });
  t('筛选: 真实永续位(0x20000)仍兼容', function () {
    var st = mkSt([0x20000]);
    ok(passFilters(mkCard({ t: 0x2 | 0x20000 }), st));
    ok(passFilters(mkCard({ t: 0x4 | 0x20000 }), st));
    ok(!passFilters(mkCard({ t: 0x2 }), st));
  });
  t('筛选: 伪位与其他维度 AND 组合', function () {
    var st = mkSt([SUB_CONT_SPELL]);
    st.attr = [0x4];
    ok(passFilters(mkCard({ t: 0x2 | 0x20000, at: 0x4 }), st), '炎永续魔法应命中');
    ok(!passFilters(mkCard({ t: 0x2 | 0x20000, at: 0x10 }), st), '光永续魔法不应命中');
    ok(!passFilters(mkCard({ t: 0x4 | 0x20000, at: 0x4 }), st), '炎永续陷阱不应命中');
  });

  /* ================= G. applyRandData 存档校验 ================= */

  t('存档: 合法数据完整应用', function () {
    applyRandData({ v: 1, s: { mainN: 45, minMon: 5, minSp: 5, minTr: 5, extraN: 10, cap: 2, pre: 0, ot: 1 },
      ex: [1, 2], rules: [{ main: [4], sub: [0x80], attr: [], race: [], setcode: 0xdd }],
      history: [{ ts: 1, main: [1], extra: [2] }] });
    eq(RSTATE.mainN, 45); eq(RSTATE.cap, 2); eq(RSTATE.pre, 0); eq(RSTATE.ot, 1);
    sameSet(Object.keys(RSTATE.excluded).map(Number), [1, 2]);
    eq(RSTATE.rules.length, 1); eq(RSTATE.rules[0].sub[0], 0x80);
    eq(RSTATE.history.length, 1); eq(RSTATE.view, 0);
  });
  t('存档: 非法字段按默认兜底(cap 越界→3,ot 非法→0,负数忽略)', function () {
    RSTATE.mainN = 40; RSTATE.minMon = 0; RSTATE.extraN = 15;
    RSTATE.cap = 3; RSTATE.pre = 1; RSTATE.ot = 0;
    applyRandData({ v: 1, s: { mainN: 'x', minMon: -5, extraN: 15.9, cap: 7, pre: 9, ot: 9 }, ex: [], rules: [], history: [] });
    eq(RSTATE.mainN, 40, '字符串数量应被忽略(保持原值 40)');
    eq(RSTATE.minMon, 0, '负数应被忽略');
    eq(RSTATE.extraN, 15, '小数应取整');
    eq(RSTATE.cap, 3);
    eq(RSTATE.pre, 1, 'pre 非 0 → 1');
    eq(RSTATE.ot, 0);
  });
  t('存档: 排除清单过滤非法元素', function () {
    applyRandData({ v: 1, ex: [7, '8', null, {}], rules: [], history: [] });
    sameSet(Object.keys(RSTATE.excluded).map(Number), [7]);
  });
  t('存档: 历史裁剪至上限 50 且 view 指向最新', function () {
    var hist = [];
    for (var i = 0; i < 55; i++) hist.push({ ts: i, main: [], extra: [] });
    applyRandData({ v: 1, ex: [], rules: [], history: hist });
    eq(RSTATE.history.length, 50);
    eq(RSTATE.history[0].ts, 5, '最旧 5 条应被裁剪');
    eq(RSTATE.view, 49);
  });
  t('存档: settings/excluded 别名键兼容', function () {
    applyRandData({ v: 1, settings: { mainN: 30, cap: 1 }, excluded: [99], rules: [], history: [] });
    eq(RSTATE.mainN, 30); eq(RSTATE.cap, 1);
    sameSet(Object.keys(RSTATE.excluded).map(Number), [99]);
  });
  t('存档: randSnapshot→JSON→applyRandData 往返一致', function () {
    resetDrawState();
    RSTATE.minMon = 3; RSTATE.cap = 2; RSTATE.excluded[42] = 1;
    RSTATE.rules = [{ main: [1], sub: [], attr: [0x4], race: [], setcode: 0 }];
    var snap = randSnapshot();
    applyRandData(JSON.parse(JSON.stringify(snap)));
    eq(RSTATE.mainN, snap.s.mainN); eq(RSTATE.minMon, 3); eq(RSTATE.cap, 2);
    ok(RSTATE.excluded[42]);
    eq(RSTATE.rules.length, 1); eq(RSTATE.rules[0].attr[0], 0x4);
  });

  /* ================= H. subBitName 与伪位工具 ================= */

  t('标签: 伪位走三语文案(zh/ja)', function () {
    STATE.locale = 'zh-CN';
    eq(subBitName(SUB_CONT_SPELL), '永续魔法');
    eq(subBitName(SUB_CONT_TRAP), '永续陷阱');
    STATE.locale = 'ja-JP';
    eq(subBitName(SUB_CONT_TRAP), '永続罠');
    STATE.locale = 'zh-CN';
  });
  t('标签: 真实位回退 typeName', function () {
    eq(subBitName(0x2000), typeName(0x2000));
  });
  t('工具: isPseudoSubBit 判定', function () {
    ok(isPseudoSubBit(SUB_CONT_SPELL));
    ok(isPseudoSubBit(SUB_CONT_TRAP));
    ok(!isPseudoSubBit(0x20000));
    ok(!isPseudoSubBit(0x1));
  });
  t('常量: SUB_BITS 含两个伪位且无重复、无越界', function () {
    ok(SUB_BITS.indexOf(SUB_CONT_SPELL) >= 0);
    ok(SUB_BITS.indexOf(SUB_CONT_TRAP) >= 0);
    var seen = {};
    SUB_BITS.forEach(function (v) {
      ok(!seen[v], 'SUB_BITS 不应有重复值');
      seen[v] = 1;
      ok(isPseudoSubBit(v) || v <= 0x4000000, '非法位值: ' + v);
    });
  });

  /* ================= I. rfmt ================= */

  t('rfmt: 按序号替换 {0}{1}{2}', function () {
    eq(rfmt('{0}/{1}/{2}', 'a', 'b', 'c'), 'a/b/c');
  });
  t('rfmt: 缺参占位符原样保留', function () {
    eq(rfmt('{0} {5}', 'x'), 'x {5}');
  });
  t('rfmt: null 模板返回空串', function () {
    eq(rfmt(null, 1), '');
  });

  /* ================= J. 全库数据集成 ================= */

  t('全库: 每张卡都有确定归属或被排除(衍生物/无类型)', function () {
    DATA.forEach(function (c) {
      var k = deckKindOf(c);
      ok(k === null || k === 'mon' || k === 'spell' || k === 'trap' || k === 'extra',
        '未知归属: ' + c.id);
      if (k === null) {
        ok((c.t & 0x4000) || !(c.t & (0x1 | 0x2 | 0x4 | EXTRA_DECK_BITS)),
          '非衍生物且有类型位却归属 null: ' + c.id);
      }
    });
  });
  t('全库: 四类卡池均非空', function () {
    resetDrawState();
    var p = buildRandPools();
    ok(p.mon.length > 0); ok(p.spell.length > 0);
    ok(p.trap.length > 0); ok(p.extra.length > 0);
  });
  t('全库: 青眼白龙归主卡组,灵摆/融合抽样归属正确', function () {
    if (cardById[89631139]) eq(deckKindOf(cardById[89631139]), 'mon');
    var fusion = firstCard(function (c) { return (c.t & 0x40) && !(c.t & 0x4000); });
    ok(fusion && deckKindOf(fusion) === 'extra');
    var pend = firstCard(function (c) { return (c.t & 0x1000000) && !(c.t & EXTRA_DECK_BITS) && !(c.t & 0x4000); });
    ok(pend && deckKindOf(pend) === 'mon');
  });

  /* ================= K. 禁限开关(遵循禁限表) ================= */

  t('禁限开关: 开启时禁止卡(bl0)不进池,限制/准限制/无限制进池', function () {
    resetDrawState(); RSTATE.bl = 1;
    ok(!randPoolPass(mkCard({ bl: 0 })), '禁止卡不应进池');
    ok(randPoolPass(mkCard({ bl: 1 })));
    ok(randPoolPass(mkCard({ bl: 2 })));
    ok(randPoolPass(mkCard({})), '无限制卡应进池');
  });
  t('禁限开关: 关闭时禁止卡可以进池', function () {
    resetDrawState(); RSTATE.bl = 0;
    ok(randPoolPass(mkCard({ bl: 0 })));
  });
  t('禁限开关: 单卡上限 限制→1 准限制→2 无限制→每卡上限(与上限取小)', function () {
    resetDrawState(); RSTATE.bl = 1; RSTATE.cap = 3;
    eq(randCardCap(mkCard({ bl: 1 })), 1);
    eq(randCardCap(mkCard({ bl: 2 })), 2);
    eq(randCardCap(mkCard({})), 3);
    RSTATE.cap = 1;
    eq(randCardCap(mkCard({ bl: 2 })), 1, '上限 1 时准限制也取 1');
    RSTATE.bl = 0; RSTATE.cap = 3;
    eq(randCardCap(mkCard({ bl: 1 })), 3, '关闭时无视禁限');
  });
  t('禁限开关: 容量按禁限上限折算', function () {
    var pool = [mkCard({ n: 'A', bl: 1 }), mkCard({ n: 'A', bl: 1 }),
      mkCard({ n: 'A', bl: 1 }), mkCard({ n: 'B' })];
    resetDrawState(); RSTATE.bl = 1; RSTATE.cap = 3;
    eq(randCapacity(pool), 2, 'A 组 3 张限 1 + B 单卡 1');
    RSTATE.bl = 0;
    eq(randCapacity(pool), 4, '关闭后 A 组 3 + B 单卡 1');
  });
  t('禁限开关: 全库池内无禁止卡,关闭后恢复', function () {
    resetDrawState(); RSTATE.bl = 1;
    var p1 = buildRandPools();
    var all = p1.mon.concat(p1.spell, p1.trap, p1.extra);
    all.forEach(function (c) { ok(c.bl !== 0, '开启时池内不应有禁止卡: ' + c.id); });
    RSTATE.bl = 0;
    var p0 = buildRandPools();
    var nBanned = p0.mon.concat(p0.spell, p0.trap, p0.extra)
      .filter(function (c) { return c.bl === 0; }).length;
    ok(nBanned > 0, '关闭后池内应有禁止卡');
    eq(p0.mon.length - p1.mon.length + p0.spell.length - p1.spell.length +
      p0.trap.length - p1.trap.length + p0.extra.length - p1.extra.length, nBanned);
  });
  t('禁限开关: 抽取无禁止卡且限制卡每卡组最多 1 张', function () {
    resetDrawState(); RSTATE.bl = 1;
    for (var i = 0; i < 10; i++) {
      var res = randDraw();
      ok(!res.err);
      var limCnt = {};
      res.entry.main.concat(res.entry.extra).forEach(function (id) {
        var c = cardById[id];
        ok(c.bl !== 0, '不应抽到禁止卡');
        if (c.bl === 1) limCnt[c.n] = (limCnt[c.n] || 0) + 1;
      });
      Object.keys(limCnt).forEach(function (n) {
        eq(limCnt[n], 1, '限制卡 ' + n + ' 超过 1 张');
      });
    }
  });
  t('禁限开关: 存档默认遵循(旧档无 bl 字段→1),可显式关闭', function () {
    applyRandData({ v: 1, s: {}, ex: [], rules: [], history: [] });
    eq(RSTATE.bl, 1, '旧档应默认遵循');
    applyRandData({ v: 1, s: { bl: 0 }, ex: [], rules: [], history: [] });
    eq(RSTATE.bl, 0);
  });

  /* ================= 运行器 ================= */

  return function () {
    if (typeof DATA === 'undefined' || !DATA) {
      return { error: '页面数据未加载(DATA 不存在),请等应用加载完成后再运行' };
    }
    var savedLocale = STATE.locale;
    var savedState = randSnapshot();
    STATE.locale = 'zh-CN';
    var results = [];
    for (var i = 0; i < tests.length; i++) {
      try {
        tests[i].fn();
        results.push({ name: tests[i].name, pass: true });
      } catch (e) {
        results.push({ name: tests[i].name, pass: false, err: String((e && e.message) || e) });
      }
    }
    STATE.locale = savedLocale;
    applyRandData(JSON.parse(JSON.stringify(savedState)));
    saveRand();
    renderRand();
    var failed = results.filter(function (r) { return !r.pass; });
    return { total: results.length, passCount: results.length - failed.length, failed: failed, results: results };
  };
}).call(window);
