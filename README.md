# YGO 卡片搜索

基于 **ygocore-database**(cards.cdb 卡片数据库)和 **ygopro-scripts**(Lua 效果脚本)
构建的自包含、可跨平台卡片搜索应用。纯静态网页,零运行时依赖,支持离线使用。

## 使用

**双击打开 `dist/index.html` 即可**,任何有现代浏览器的系统均可(macOS / Windows / Linux / 手机浏览器)。

也可以用任意静态服务器:

```bash
cd dist && python3 -m http.server 8765
# 浏览器访问 http://127.0.0.1:8765/
```

## 功能

- **全文搜索**:卡名 / 效果描述 / 卡片密码,空格分隔多关键词(AND),兼容中文输入法
- **多维筛选**:
  - 主类型(怪兽/魔法/陷阱)、细分类型(融合/同调/超量/灵摆/连接/调整…,全部满足)
  - 属性(任一)、种族(任一)
  - 等级/Link、灵摆刻度、攻击力、守备力数值区间
  - **字段/系列**:按系列名或代码筛选,采用与 ygopro-core `check_setcode` 一致的
    父子系列匹配语义(如"真次世代"自动属于"次世代")
  - 效果分类(数据库分类位)
  - **效果标签(脚本分析)**:诱发即时 / 诱发 / 点火 / 永续 / 反转 / 手坑 / 墓地效果 /
    超量·同调·融合·仪式·连接·灵摆召唤等(全部满足)
  - **咒文速度**:效果明细标注 SS1/SS2/SS3(怪兽按诱发即时=2、起动/诱发/反转=1,
    魔法按速攻=2其余=1;陷阱均为2、反击=3;永续等非发动型不标),可按速度筛选
  - OCG/TCG 收录、有无脚本
  - **禁限**:禁止 / 限制 / 准限制 / 无限制(数据来自 mycard/ygopro 的
    `lflist.conf`,构建时解析最新 OCG 表;结果行与详情带禁限徽章)
- **排序**:卡号 / 名称 / 攻击力 / 守备力 / 等级,升降序
- **多语言**:简体中文 / 日本語 / English,按需加载
- **详情面板**:完整解码信息(类型/属性/种族/星级/刻度/Link 箭头/攻守)、所属字段、
  同名卡(异画版本)跳转、效果分类、脚本分析出的效果类型/触发时机/发动区域/
  关联字段/关联卡片(可点击跳转)
- **URL 分享**:搜索状态同步到地址栏 hash,可直接保存或分享特定搜索结果
- 虚拟滚动,1.5 万卡片流畅浏览;移动端自适应布局
- **随机组卡**(顶栏切换):从卡片库(含先行卡)随机抽取卡组并导出 ydk
  - 主卡组数量 + 怪兽/魔法/陷阱最小张数(可选),额外卡组数量,每卡上限 1~3
    (同卡名异画共享上限);仪式/灵摆/陷阱怪兽归主卡组,融合/同调/超量/连接归额外,
    衍生物永不进池;「遵循禁限表」开关(默认开):禁止卡不进池、限制卡上限 1、
    准限制上限 2,关闭后无视禁限(结果行带禁限徽章)
  - 排除:一键排除本次结果、结果行单卡排除、规则排除(类型/属性/种族/字段,
    维度间 AND、维内 OR),每条规则显示实时命中数
  - 记录:设置/排除/抽取历史自动存 localStorage(最近 50 次),刷新不丢
  - 卡池导入导出(JSON,含设置+排除+规则+历史);结果导出 `.ydk`
    (`#main`/`#extra`/`!side`,重复卡按张数重复行)

## 数据来源与构建

运行时**不需要**原数据库;`dist/` 内的 `data-*.js` / `meta.js` 是构建时生成的自包含数据。
数据更新后重跑构建即可:

```bash
python3 build.py                      # 自动检测 BASE 目录下的 ygopro-super-pre.ypk
python3 build.py --ypk <path/to/xx.ypk>   # 指定先行卡包路径
python3 build.py --no-ypk             # 本次不合并先行卡包
python3 build.py --lflist <path>      # 指定禁限表路径
python3 build.py --no-lflist          # 本次不合并禁限表
```

构建过程:

1. 读取 `../ygocore-database/locales/{zh-CN,ja-JP,en-US}/cards.cdb`(SQLite,
   解码 datas+texts 表的位段字段:type/race/attribute/category/setcode 槽位/level 打包等,
   常量与 `../ygopro-core/common.h` 对齐)
2. 读取 `strings.conf`,获取各语言的类型/种族/属性/效果分类名称与字段(!setname)表
3. 合并先行卡包 `ygopro-super-pre.ypk`(见下节)
4. 静态分析 `../ygopro-scripts/c<id>.lua`(13,500+ 个脚本)及 ypk 内 `script/c<id>.lua`,
   **按 `Effect.CreateEffect` 切分为效果段逐效果分析**,每个效果展示:
   - 效果类型 / 触发时机(含 `EVENT_PHASE+PHASE_*` 组合,如"结束阶段")/ 发动区域 /
     脚本声明分类 / 效果代码(如"特殊召唤手续""攻击力增减",中日英对照)
   - **对象判定**:取对象(`EFFECT_FLAG_CARD_TARGET` 或 `SelectTarget`,含方位与数量,
     如"取对象(双方 场上 ×1)")或不取对象;非对象的 `SelectMatchingCard` 选择范围单独展示
   - **动作**:追踪 `SetOperation` 函数体中的 `Duel.*` 调用(回到手卡/破坏/除外/特殊召唤…15 种)
   - **次数限制**(`SetCountLimit`,如"1 次/回合");赋予到其他卡上的效果用 ↳ 标示,不占编号
   - `IsSetCard / aux.AddSetNameMonsterList` → 所属/关联字段
   - `aux.AddCodeList / IsCode` → 关联卡片
   - 派生标签:**手坑** = 同一效果为诱发即时类型且从手卡发动;
     墓地效果 = 同一可发动效果位于墓地/除外区;以及各召唤法相关等
5. 输出 `dist/`(每语言一个数据文件注册进 `window.CARD_DATA_POOL`,按需加载;meta.js 为语言无关的脚本分析结果)

> 注意:脚本分析为正则级启发式静态分析,覆盖标准写法,结果仅供参考。
> ja-JP 的 cards.cdb 为 WAL 模式,构建时先拷贝临时副本读取,不污染源文件。

## 先行卡包(ygopro-super-pre.ypk)与更新流程

`.ypk` 是 ZIP 格式的 YGOPro 扩展包,构建时读取其中:

| 成员 | 用途 |
| --- | --- |
| `test-release.cdb` | **先行卡**(约 143 张,9 位 100xxxxxxx 卡号)→ 并入三个语言,标记 `先行`(金色徽章) |
| `test-update.cdb` | 已有卡的数据更新 → **直接覆盖**主库同名卡的字段;主库没有的作为普通新卡加入 |
| `test-strings.conf` | 新增字段(!setname)与指示物定义 → 并入三个语言的字段表 |
| `script/c<id>.lua` | 最新脚本 → 分析后**覆盖** ygopro-scripts 仓库的旧分析结果 |

先行卡文本为简体中文,在日/英文界面下共用(详情页有提示);已有卡的更新在
日/英文界面**只覆盖数据字段,保留各语言的名称与描述**。可用侧栏「先行卡」筛选组
单独查看(全部 / 仅先行 / 排除先行),URL 参数 `pr`。

**当 ypk 更新时**(例如下载了新的先行卡包):

```bash
# 1. 用新的 ygopro-super-pre.ypk 覆盖 /Users/pam/Code/ygo/ygopro-super-pre.ypk
#    (或放到任意位置,构建时用 --ypk 指定)
# 2. 重新构建:
cd card-search && python3 build.py
# 3. 刷新浏览器即可(若以 http 服务方式使用;file:// 直接重新打开)
```

构建日志会打印该包的修改时间与合并统计(先行张数/更新条数/脚本覆盖数),`meta.js`
中的 `CARD_META.ypk` 也记录了这些信息,便于核对是否已用上新版卡包。
主数据库(ygocore-database)或脚本仓库更新后同样只需重跑 `python3 build.py`。

## 目录结构

```
card-search/
├── build.py      构建脚本
├── README.md
├── src/          前端源码(index.html / app.js / style.css)
└── dist/         构建产物(自包含,双击 index.html 使用)
    ├── index.html / app.js / style.css
    ├── data-zh-CN.js / data-ja-JP.js / data-en-US.js
    ├── meta.js
    ├── LICENSE-ygopro-scripts.txt   (GPL-2.0)
    └── NOTICE.txt
```

## 测试

```bash
python3 -m unittest discover tests -v   # 24 项分析管线单元测试 + 14 项数据集成校验
```

- `tests/test_build.py`:分析函数单元测试(效果分段/手坑判定/取对象/动作与数据流
  追溯/自肃三类/组合触发/陷阱怪兽/关联卡/次数限制/strings.conf 解析)
- `tests/test_data.py`:构建产物校验(已知卡片字段/雷轰动作对象/米德拉什自肃/
  阿尔玛斯自身破坏/计数快照:先行 143、自肃 1042、衍生物 265、陷阱怪兽 76 等;
  需先 `python3 build.py`)
- `tests/test_rand.js`:随机组卡纯逻辑单元测试(61 例),在应用页面环境中运行——
  浏览器控制台粘贴全文后执行 `runRandTests()`,或经浏览器自动化注入后调用;
  覆盖 deckKindOf 卡池归属/规则匹配语义(含永续魔法·永续陷阱伪位)/同名容量/
  抽取上限与跨卡组共享/最小张数与错误路径/历史裁剪/applyRandData 存档校验与
  往返一致/passFilters 伪位筛选/全库归属完备性;运行后自动恢复页面状态
- `tests/e2e_browser.js`:浏览器端到端用例清单(搜索/筛选/系列联动/语言往返/
  严格模式/哈希恢复等 16 项,经浏览器自动化执行)

## 许可

- 卡片脚本数据来自 [ygopro-scripts](https://github.com/Fluorohydride/ygopro-scripts)(GPL-2.0),
  许可证副本见 `dist/LICENSE-ygopro-scripts.txt`
- 本应用代码可自由使用
