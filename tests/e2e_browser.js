// e2e_browser.js — 浏览器端到端测试套件(通过 ZCode 浏览器自动化运行)
//
// 用法:在 ZCode 的 node_repl 中以 control-browser skill 驱动本套件,
//      需先 `python3 -m http.server 8765`(在 dist/ 目录)。
// 前置: python3 build.py && python3 -m unittest discover tests
// 2026-10-24 全量通过(24 单元 + 14 数据集成 + 16 端到端)。

const BASE = "http://127.0.0.1:8765/";

// ── 辅助(页面内) ────────────────────────────────────────────
const HELPERS = `
const $ = id => document.getElementById(id);
const resetAll = () => {
  $('resetFilters').click();
  const s = $('search'); s.value = ''; s.dispatchEvent(new Event('input'));
};
const setField = (name) => {
  const set = $('setcode'); set.value = name; set.dispatchEvent(new Event('input'));
  set.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
};
const clickChip = (sel, text) => {
  const c = [...document.querySelectorAll(sel)].find(x => x.textContent === text);
  if (!c) throw new Error('chip 不存在: ' + sel + ' / ' + text);
  c.click();
};
const count = () => $('resultCount').textContent.match(/共 ([\\d,]+)/)[1];
`;

// ── 用例(名称, 期望) ────────────────────────────────────────
const CASES = [
  ["默认加载(去重+隐藏衍生物)", "14,439"],
  ["字段筛选:青眼", "39"],
  ["效果标签:手坑", "261"],
  ["严格模式:破坏+怪兽+自己", "607"],   // GetFirstTarget 追溯修复后
  ["系列联动:青眼×机械", "6"],
  ["显示衍生物(+265)", "14,704"],
];

// ── 随机组卡用例(2026-10-24 全量通过,经浏览器自动化验证) ──────
// 卡池快照(ypk 2026-10-23):主池 12,514(怪 7,431 / 魔 2,967 / 陷 2,116)· 额外池 2,347;
// 「字段:青眼」排除规则命中 47;额外池 2,332 张在每卡上限 1 时按卡名容量为 2,201(异画同名 131)。
// 验证过的行为:
//   模式切换(#tabRand/#tabSearch,localStorage cardsearch.mode 持久,刷新后仍记住)
//   抽取:主 40 + 额外 15;最小张数 20/10/10 → 怪 20 / 魔 10 / 陷 10 恰好满足
//   每卡上限 ×1 → 40 张主卡卡名全不同
//   排除规则:字段=青眼 后连抽 5 次零命中;规则可单删
//   排除规则维度(第二轮修复后):主类型(任一)+ 细分类型(全部满足,20 位)+ 属性(任一)
//     + 种族(任一)+ 字段;属性:炎 命中 854;怪兽·细分:仪式 命中 165(10 连抽零命中);
//     细分:仪式 单独用 命中 249 = 仪式怪 165 + 仪式魔 84;旧存档无 sub 字段规则兼容
//   一键排除本次结果(55 种)→ 卡池减 40+15,再抽与该次零重叠
//   ydk 导出:#created by card-search random deck / #main 40 行 / #extra 15 行 / !side
//   卡池 JSON 导出:{v:1, s, ex, rules, history, savedAt}
//   刷新持久:模式/历史/排除/设置全部保留(localStorage cardsearch.rand.v1)
//   错误提示:最小张数之和超主卡组数 / 额外池不足(带容量数字)
//   三语:随机组卡全部标签 zh/ja/en 齐全,结果随语言重渲染
//   搜索回归:切回搜索模式后筛选/搜索正常
//   结果行基础数据(第三轮,用户要求加属性/种族/类别/星级/攻防):dcard 两行结构
//     (dl1=张数×名+密码+✕,dl2=类型徽章+属性色点+种族+★/阶/L+ATK/DEF+灵摆刻度);
//     连接怪无 DEF,超量显示"阶",灵摆显示"刻度 L/R",魔陷仅类型徽章;randStatsHtml 构建
//   细分类型永续拆分(第四轮,用户要求永续陷阱/永续魔法分开):伪位
//     SUB_CONT_SPELL=0x40000000 / SUB_CONT_TRAP=0x20000000(类型系统只有一个
//     TYPE_CONTINUOUS 0x20000,靠主类型位区分);passFilters/randRuleMatches 均按
//     (t&0x20000)+(t&0x2|0x4) 复合判定;搜索/G2/组卡规则三处 chips 均拆分;
//     数量核对:永续魔法 528(去重后 521)+ 永续陷阱 576(去重后 570)= 原"永续"1104;
//     同选两者 AND=0(卡不可能魔陷同体);旧 hash s=131072 兼容;ja 永続魔法/永続罠,en
//     Continuous Spell/Continuous Trap
//   禁限表(第五轮,数据来自 mycard/ygopro lflist.conf,经 fastly.jsdelivr.net 镜像
//     下载到 BASE/lflist.conf;raw.githubusercontent 在本网络被重置):build.py 取
//     第一个不带 TCG 标记的节(2026.10,禁止 94/限制 95/准限制 13),异画组取最严传播
//     (bl 字段仅 0/1/2 打标,无字段=无限制;实测传播 36 处全一致,共 100/117/21);
//     搜索页「禁限」组(全部/禁止/限制/准限制/无限制,hint=表名 2026.10):
//     禁止 94 全 bl=0 徽章红、限制 95、准限制 13、无限制 14,237(=全库-衍生物 265
//     -同名去重 422-禁限 202);hash bl=1..4 读写恢复;ja 禁止・制限/準制限/無制限,
//     en Forbidden/Limited/Semi-Limited/Unlimited;--lflist/--no-lflist 构建开关
//   随机组卡遵循禁限开关(第六轮,用户要求):RSTATE.bl(默认 1,旧档兼容默认开),
//     chip「遵循禁限表 · 2026.10」;开启:randPoolPass 拦 bl0,randCardCap 限 1/准 2
//     与每卡上限取小,randCapacity 按名组内最严折算;关闭:无视禁限。核对:开启时
//     主池 12,514→12,449/额外 2,347→2,312(恰减 100 张禁止卡),10 抽 0 禁止 0 超限,
//     关闭 30 抽出现 4 张禁止卡;重载持久;结果行带 bl 徽章;test_rand.js 扩到 68 例
//     (禁止不进池/单卡上限/容量折算/池恢复/抽取合规/存档默认)
//   搜索列表重排(第七轮,方案A 色条网格,用户选定):rowHtml 重写——左 4px 卡类色条
//     (k-mon 橙/k-spl 绿/k-trp 粉)+行内 5% 淡背景(::before opacity .05),r1=名(白,
//     窄屏省略号)+密码+先行/简中/禁限徽章+数值右上(等宽 mono,★ 金色,灵摆带刻度),
//     r2=等高 18px 胶囊固定顺序(属性填充 pill.attr 七色/光神深字→种族描边 pill.race→
//     卡类 badge.kindb 卡类色→其余类型→sp 弹性→标签右靠);魔法陷阱无属性种族胶囊;
//     行高 ROW_H=74 不变,虚拟滚动兼容。核对法:DOM 几何(tag/r2y 一致,rowH 74/78),
//     颜色用 getComputedStyle(borderLeft/backgroundColor) 对照。**顺手修了顶栏窄屏
//     溢出(390px 下 locale/toggleFilters 被挤出的历史问题,r1 省略号+topbar wrap)**
//   怪兽细分外框(第八轮,用户指定):色条方案升级为整行 2.5px 内嵌框(box-shadow inset,
//     色条取消),怪兽按召唤法取色——效果橙 #e8a33d/通常米黄 #d8c078/仪式青蓝 #4fc3d9/
//     融合紫 #9b7fd4/同调白 #e6edf3/超量银灰 #98a1ad(用户选定,纯黑在深底不可见)/
//     链接蓝 #3d9be9;灵摆=border-image linear-gradient 上 60% 怪兽色下 40% 绿
//     (pend-frame 类,优先级 融合>同调>超量>链接>效果>通常),::before 双色淡底;
//     frameClass(c) 判定顺序 魔→陷→灵摆→融→同→超→链→仪式→效果→通常。核对法:
//     逐细分筛选后 getComputedStyle boxShadow 含期望 rgb,灵摆查 borderImageSource。
//   第九轮(用户反馈三件):①数值从右上移到卡名/禁令徽章之后内联(.num 去 margin-left
//     auto,窄屏媒体查询保留右对齐);②仪式/通常灵摆上半框色修正——灵摆优先级改为
//     融>同>超>链>仪式(青蓝)>效果(橙)>通常(米黄),新增 f-pend-rit/f-pend-norm,
//     框色判定提取为独立函数 frameClassOf(c);③用户报"仅选通常仍显示通常灵摆结果"
//     ——9 步主细分序列复现全部正确(逻辑无 bug),真因=「系列条件·第二组」残留
//     (G2 面板有同名灵摆/通常 chips,残留后主结果被系列联动收窄,折叠时不可见):
//     复现 G2 残留场景 41 张混通常灵摆;修复=G2 生效时折叠标题也高亮蓝(g2-on 类)。
//     另一条混淆路径:刷新后 hash 恢复勾选,再点同 chip 是取消不是选中。
//   第十轮(用户要求):①详情卡名区加同款卡类色外框——openCard 把 h2/dsub/note/徽章
//     包进 #detail .dhead(f-* 框色类从 .cardrow 作用域提升为全局类共用);②魔陷细分
//     徽章加卡面符号(typeBadgeText/SUB_ICONS:速攻⚡\uFE0E 永续∞ 装备⊕ 场地🌐\uFE0E
//     反击↩,三处徽章渲染统一走它:列表行/详情/随机组卡 randStatsHtml)。核对:openCard
//     后 dhead className/computed boxShadow + 徽章 textContent 含符号。
//   细分图标矢量化(第十一轮,用户要"官方图片"):工作区无官方图标资产(ypk 只有先行
//     卡图 pics/*.jpg,raw.githubusercontent 被墙)——改为按实卡卡面符号手绘的内联
//     SVG(SUB_ICONS:速攻闪电/永续双环∞/装备十字/场地地球/反击折返箭头,
//     fill|stroke=currentColor 随徽章文字色,.badge .ticon 11px),三处徽章统一;
//     注意 CSS fill 规则会覆盖 SVG 的 fill="none" 表现属性,故不用 CSS 上色。
//   图标微调(第十二轮,用户反馈"靠上+对比度低"):badge 是 inline-block 文本流,内联
//     svg 默认按基线对齐偏高——.ticon 加 vertical-align: middle(量化 delta≈1px);
//     对比度=符号原来继承徽章弱灰文字色,改为各配语义色(速攻金 #f0c040/永续蓝
//     #6db3f2/装备绿 #7fd4a8/场地紫 #c586c0/反击红 #ff7b72),svg 内联 style=color。
//   咒文速度(第十三轮,用户问"能否标出各效果的咒文速度"):可行——数据已有(逐效果
//     et + 卡类型位),前端 effSpellSpeed(c,eff) 判定:魔法/陷阱卡=反击 3/速攻或
//     quick et 2/其余 1;怪兽 et 含 QUICK=2、IGNITION/TRIGGER/FLIP=1、永续等非发动
//     =null 不标注;速度取快优先、反击恒 3。展示=效果明细网格首项「咒文速度 N」;
//     筛选=效果明细组 SS1/2/3 chips(STATE.ss,参与严格模式,hash ss=,与 ps 相邻)。
//     样例:灰流丽 2/神之宣告 3,3/旋风 2/黑洞 1/死者苏生 1/星读之魔术师 怪兽效果 1
//     (灵摆效果 null)/增殖的G 首效果 2(其自特招手续脚本注册即 QUICK_O,勿当 bug);
//     SS3 筛选=179 张全反击陷阱;hash #ss=1,2。
//
// 第二轮修复(用户报"排除规则不全还一堆问号"):renderRandRuleForm 的属性行曾把
// {key,label} 对象数组传给只接受数字位的 mkType → typeName(对象)= '?'、toggleIn 塞对象
// 导致规则永远不命中;修复为与搜索页同构的数字位遍历,并顺带把 7 位混合类型行拆成
// 主类型(3,OR)+ 细分类型(SUB_BITS 20,AND)两行。教训:mkType(bits) 与 buildG2UI 的
// mk(pairs) 两种 chip 构建签名不能混用,属性行 label 含色点必须单独构建。

// 注:搜索/全半角/哈希恢复/语言往返/详情结构(灵摆分节/自肃/同卡名跳转)/
//    翻译零缺失等场景见会话记录;关键断言已纳入 tests/test_build.py 与 tests/test_data.py。
//   咒文速度修正(第十四轮,用户质疑"普通/永续陷阱真的是1吗"):官方规则为陷阱全部
//     二速(通常/永续陷阱的发动与效果发动都是二速,可连锁一速二速)、反击三速——
//     原实现误标一速(把"对方回合可发动"的时点概念与咒文速度混淆)。修正:陷阱分支
//     返回 counter?3:2,魔法速攻 2 其余 1,怪兽按 et 不变。核对:通常/永续陷阱=2、
//     反击=3、全库 SS1 效果中陷阱数=0;分布 SS1 16537/SS2 7410/SS3 268。
//     规则佐证:OCG规则书 readthedocs/百度百科「咒文速度」(陷阱=二速)。
//   折叠修复(第十五轮,用户报"第二组条件的折叠有问题"):历史遗留——CSS 只藏
//     .chips.collapsible-body,而效果明细/第二组的折叠体是 .collapsible-body.effcol
//     (无 .chips 类),收起状态 display:block 内容一直可见。修复=泛化为
//     .collapsible .collapsible-body { display:none }(open 时 flex 不变),
//     并删除 randHistoryWrap 的冗余特例。核对:两组收起 display none/不可见、
//     展开 chips 正常(128 颗)、随机组卡抽取历史开合正常。
//   随机组卡结果行加同款色框(第十六轮,用户要求,其余不动):randDcardHtml 加
//     frameClassOf(c) + pend-frame 类,.dcard 复用全局 f-* 框色(box-shadow inset
//     2.5px + ::before 淡底,灵摆 border-image 双色);54 行框色与卡类分布逐一对上。
