/* global window, document, location, history */
'use strict';

/* ================= 常量 ================= */

// 位 → 类型常量名(与 build.py / ygopro-core common.h 对齐)
var TYPE_NAMES = {
  0x1: 'MONSTER', 0x2: 'SPELL', 0x4: 'TRAP',
  0x10: 'NORMAL', 0x20: 'EFFECT', 0x40: 'FUSION', 0x80: 'RITUAL',
  0x100: 'TRAPMONSTER', 0x200: 'SPIRIT', 0x400: 'UNION', 0x800: 'DUAL',
  0x1000: 'TUNER', 0x2000: 'SYNCHRO', 0x4000: 'TOKEN',
  0x10000: 'QUICKPLAY', 0x20000: 'CONTINUOUS', 0x40000: 'EQUIP',
  0x80000: 'FIELD', 0x100000: 'COUNTER', 0x200000: 'FLIP', 0x400000: 'TOON',
  0x800000: 'XYZ', 0x1000000: 'PENDULUM', 0x2000000: 'SPSUMMON',
  0x4000000: 'LINK'
};
// 展示顺序
var TYPE_ORDER = ['MONSTER', 'SPELL', 'TRAP', 'NORMAL', 'EFFECT', 'RITUAL',
  'FUSION', 'SYNCHRO', 'XYZ', 'PENDULUM', 'LINK', 'TUNER', 'DUAL', 'UNION',
  'SPIRIT', 'FLIP', 'TOON', 'TRAPMONSTER', 'TOKEN', 'QUICKPLAY', 'CONTINUOUS',
  'EQUIP', 'FIELD', 'COUNTER', 'SPSUMMON'];
var TYPE_BIT = {};
Object.keys(TYPE_NAMES).forEach(function (k) { TYPE_BIT[TYPE_NAMES[k]] = +k; });

var MAIN_BITS = [0x1, 0x2, 0x4];
// 永续魔法/永续陷阱伪位:类型系统只有一个 TYPE_CONTINUOUS(0x20000),
// 靠主类型位区分魔/陷;伪位仅用于筛选状态,不代表真实 type 位(位 29/30 未被占用)
var SUB_CONT_SPELL = 0x40000000; // (t & 0x20000) && (t & 0x2)
var SUB_CONT_TRAP = 0x20000000;  // (t & 0x20000) && (t & 0x4)
var SUB_BITS = [0x20, 0x10, 0x80, 0x40, 0x2000, 0x800000, 0x1000000, 0x4000000,
  0x1000, 0x800, 0x400, 0x200, 0x200000, 0x400000, 0x100,
  0x10000, SUB_CONT_SPELL, SUB_CONT_TRAP, 0x40000, 0x80000, 0x100000];
var ATTR_BITS = [0x1, 0x2, 0x4, 0x8, 0x10, 0x20, 0x40];
var ATTR_COLORS = { 0x1: '#a0785a', 0x2: '#3d9be9', 0x4: '#e0563d', 0x8: '#57c785',
  0x10: '#f2d54e', 0x20: '#9b7fd4', 0x40: '#d4af37' };

var TAG_KEYS = ['QUICK', 'TRIGGER', 'IGNITION', 'CONTINUOUS', 'FLIP', 'EQUIP',
  'HAND_TRAP', 'GRAVE_EFFECT', 'SELF_LOCK', 'PENDULUM', 'XYZ', 'SYNCHRO', 'FUSION',
  'RITUAL', 'LINK'];
var ACT_KEYS = ['DESTROY', 'NEGATE', 'REMOVE', 'TOHAND', 'TODECK', 'TOGRAVE',
  'SPSUMMON', 'DRAW', 'DAMAGE', 'RECOVER', 'POSITION', 'RELEASE', 'CONTROL',
  'EQUIP', 'MOVE'];
// 自肃"仅限"token → 常量位(用于显示本地化名称)
var RACE_TOKEN_BITS = {
  RACE_WARRIOR: 0x1, RACE_SPELLCASTER: 0x2, RACE_FAIRY: 0x4, RACE_FIEND: 0x8,
  RACE_ZOMBIE: 0x10, RACE_MACHINE: 0x20, RACE_AQUA: 0x40, RACE_PYRO: 0x80,
  RACE_ROCK: 0x100, RACE_WINDBEAST: 0x200, RACE_PLANT: 0x400, RACE_INSECT: 0x800,
  RACE_THUNDER: 0x1000, RACE_DRAGON: 0x2000, RACE_BEAST: 0x4000,
  RACE_BEASTWARRIOR: 0x8000, RACE_DINOSAUR: 0x10000, RACE_FISH: 0x20000,
  RACE_SEASERPENT: 0x40000, RACE_REPTILE: 0x80000, RACE_PSYCHO: 0x100000,
  RACE_DEVINE: 0x200000, RACE_CREATORGOD: 0x400000, RACE_WYRM: 0x800000,
  RACE_CYBERSE: 0x1000000, RACE_ILLUSION: 0x2000000
};
var ATTR_TOKEN_BITS = {
  ATTRIBUTE_EARTH: 0x1, ATTRIBUTE_WATER: 0x2, ATTRIBUTE_FIRE: 0x4,
  ATTRIBUTE_WIND: 0x8, ATTRIBUTE_LIGHT: 0x10, ATTRIBUTE_DARK: 0x20,
  ATTRIBUTE_DEVINE: 0x40
};
var SUMMON_METHOD_KEYS = {
  PENDULUM: 'smPendulum', RITUAL: 'smRitual', FUSION: 'smFusion',
  SYNCHRO: 'smSynchro', XYZ: 'smXyz'
};

/* ================= 本地化标签 ================= */

var L = {
  'zh-CN': {
    tags: { QUICK: '诱发即时', TRIGGER: '诱发', IGNITION: '起动', CONTINUOUS: '永续',
      FLIP: '反转', EQUIP: '装备效果', HAND_TRAP: '手坑', GRAVE_EFFECT: '墓地效果',
      SELF_LOCK: '自肃',
      PENDULUM: '灵摆', XYZ: '超量召唤', SYNCHRO: '同调召唤', FUSION: '融合召唤',
      RITUAL: '仪式召唤', LINK: '连接召唤' },
    cat: { CATEGORY_DESTROY: '破坏', CATEGORY_RELEASE: '解放', CATEGORY_REMOVE: '除外',
      CATEGORY_TOHAND: '加入手卡', CATEGORY_TODECK: '回到卡组', CATEGORY_TOGRAVE: '送入墓地',
      CATEGORY_DECKDES: '卡组破坏', CATEGORY_HANDES: '手牌破坏', CATEGORY_SUMMON: '召唤',
      CATEGORY_SPECIAL_SUMMON: '特殊召唤', CATEGORY_TOKEN: '衍生物', CATEGORY_GRAVE_ACTION: '墓地行动',
      CATEGORY_POSITION: '表示形式', CATEGORY_CONTROL: '控制权', CATEGORY_DISABLE: '效果无效化',
      CATEGORY_DISABLE_SUMMON: '召唤无效', CATEGORY_DRAW: '抽卡', CATEGORY_SEARCH: '卡组检索',
      CATEGORY_EQUIP: '装备', CATEGORY_DAMAGE: '伤害', CATEGORY_RECOVER: '回复',
      CATEGORY_ATKCHANGE: '攻击力变化', CATEGORY_DEFCHANGE: '守备力变化', CATEGORY_COUNTER: '指示物',
      CATEGORY_COIN: '猜硬币', CATEGORY_DICE: '骰子', CATEGORY_LEAVE_GRAVE: '离开墓地',
      CATEGORY_GRAVE_SPSUMMON: '墓地特招', CATEGORY_NEGATE: '无效', CATEGORY_ANNOUNCE: '宣言',
      CATEGORY_FUSION_SUMMON: '融合召唤', CATEGORY_TOEXTRA: '回额外卡组',
      CATEGORY_MSET: '盖放怪兽', CATEGORY_SSET: '盖放魔陷',
      CATEGORY_HANDES_SELF: '自己丢弃手卡', CATEGORY_HANDES_OPPO: '对方丢弃手卡',
      CATEGORY_DECK_SPSUMMON: '从卡组特殊召唤' },
    et: { EFFECT_TYPE_SINGLE: '单体', EFFECT_TYPE_FIELD: '场地型', EFFECT_TYPE_EQUIP: '装备型',
      EFFECT_TYPE_ACTIONS: '行动', EFFECT_TYPE_ACTIVATE: '发动', EFFECT_TYPE_FLIP: '反转',
      EFFECT_TYPE_IGNITION: '起动', EFFECT_TYPE_TRIGGER_O: '诱发(可选)', EFFECT_TYPE_TRIGGER_F: '诱发(强制)',
      EFFECT_TYPE_QUICK_O: '诱发即时(可选)', EFFECT_TYPE_QUICK_F: '诱发即时(强制)',
      EFFECT_TYPE_CONTINUOUS: '永续', EFFECT_TYPE_XMATERIAL: '超量素材效果',
      EFFECT_TYPE_GRANT: '赋予效果', EFFECT_TYPE_TARGET: '对象型' },
    ev: { EVENT_FREE_CHAIN: '任意时点', EVENT_DESTROY: '被破坏', EVENT_DESTROYED: '破坏送去墓地',
      EVENT_REMOVE: '被除外', EVENT_TO_HAND: '加入手卡', EVENT_TO_DECK: '回到卡组',
      EVENT_TO_GRAVE: '送入墓地', EVENT_LEAVE: '离场', EVENT_LEAVE_FIELD: '离开场上',
      EVENT_MOVE: '移动', EVENT_CHANGE_POS: '表示形式变更', EVENT_POS_CHANGE: '表示形式变更',
      EVENT_CHAINING: '效果发动时', EVENT_CHAIN_ACTIVATED: '成为连锁对象',
      EVENT_CHAIN_SOLVING: '效果处理时', EVENT_CHAIN_SOLVED: '效果处理完毕',
      EVENT_DISUSED: '效果被中断', EVENT_SUMMON: '召唤成功', EVENT_FLIP_SUMMON: '反转召唤成功',
      EVENT_SPSUMMON: '特殊召唤成功', EVENT_SUMMON_SUCCESS: '召唤成功',
      EVENT_SPSUMMON_SUCCESS: '特殊召唤成功', EVENT_FLIP: '反转',
      EVENT_SET: '盖放', EVENT_MSET: '怪兽盖放', EVENT_SSET: '魔陷盖放',
      EVENT_ADJUST: '状态调整', EVENT_BREAK_EFFECT: '效果开始', EVENT_PHASE: '阶段',
      EVENT_DRAW: '抽卡', EVENT_DAMAGE: '受到伤害', EVENT_RECOVER: '回复',
      EVENT_PREDRAW: '抽卡前', EVENT_ATTACK: '宣告攻击', EVENT_ATTACKED: '被攻击',
      EVENT_BATTLE_START: '战斗开始', EVENT_BATTLE_END: '战斗结束',
      EVENT_BATTLED: '战斗后', EVENT_BATTLE_DAMAGE: '战斗伤害',
      EVENT_BE_BATTLE_TARGET: '被选为攻击对象', EVENT_BECOME_TARGET: '被选为效果对象',
      EVENT_LEVEL_UP: '等级提升', EVENT_PAY_LPCOST: '支付基本分',
      EVENT_ATTACK_ANNOUNCE: '攻击宣言', EVENT_BATTLE_DESTROYED: '被战斗破坏',
      EVENT_BATTLE_DESTROYING: '战斗破坏对方时', EVENT_BE_MATERIAL: '作为素材使用',
      EVENT_FLIP_SUMMON_SUCCESS: '反转召唤成功', EVENT_DAMAGE_STEP_END: '伤害步骤结束时',
      EVENT_PRE_DAMAGE_CALCULATE: '伤害计算前', EVENT_RELEASE: '被解放',
      EVENT_CUSTOM: '自定义事件', EVENT_LEAVE_FIELD_P: '即将离场',
      EVENT_CHAIN_DISABLED: '连锁被无效', EVENT_CHAIN_END: '连锁结束',
      EVENT_PHASE_START: '阶段开始', EVENT_BATTLE_CONFIRM: '战斗确认',
      EVENT_CHAIN_NEGATED: '发动被无效', EVENT_EQUIP: '装备时',
      EVENT_DISCARD: '被丢弃', EVENT_DETACH_MATERIAL: '取除超量素材',
      EVENT_CONTROL_CHANGED: '控制权变更', EVENT_LEAVE_GRAVE: '离开墓地',
      EVENT_TURN_END: '回合结束', EVENT_BE_PRE_MATERIAL: '即将成为素材',
      EVENT_ATTACK_DISABLED: '攻击被无效', EVENT_TOSS_COIN: '猜硬币',
      EVENT_PRE_BATTLE_DAMAGE: '战斗伤害前', EVENT_SUMMON_NEGATED: '召唤被无效',
      EVENT_SPSUMMON_SUCCESS_G_P: '特殊召唤成功(群体)', EVENT_TOSS_DICE_NEGATE: '骰子结果无效',
      EVENT_TOSS_DICE: '掷骰子', EVENT_ADD_COUNTER: '增加指示物',
      EVENT_TOSS_COIN_NEGATE: '硬币结果无效', EVENT_LEAVE_DECK: '离开卡组',
      EVENT_SPSUMMON_NEGATED: '特殊召唤被无效', EVENT_REMOVE_COUNTER: '取除指示物',
      'EVENT_PHASE+PHASE_DRAW': '抽卡阶段', 'EVENT_PHASE+PHASE_STANDBY': '准备阶段',
      'EVENT_PHASE+PHASE_MAIN1': '主要阶段1', 'EVENT_PHASE+PHASE_MAIN2': '主要阶段2',
      'EVENT_PHASE+PHASE_BATTLE': '战斗阶段', 'EVENT_PHASE+PHASE_BATTLE_START': '战斗阶段开始',
      'EVENT_PHASE+PHASE_END': '结束阶段',
      'EVENT_PHASE_START+PHASE_DRAW': '抽卡阶段开始', 'EVENT_PHASE_START+PHASE_STANDBY': '准备阶段开始',
      'EVENT_PHASE_START+PHASE_MAIN1': '主要阶段1开始', 'EVENT_PHASE_START+PHASE_MAIN2': '主要阶段2开始',
      'EVENT_PHASE_START+PHASE_BATTLE': '战斗阶段开始', 'EVENT_PHASE_START+PHASE_END': '结束阶段开始',
      'EVENT_PHASE_START+PHASE_BATTLE_START': '战斗阶段开始(步骤开始)' },
    rg: { LOCATION_HAND: '手卡', LOCATION_DECK: '卡组', LOCATION_EXTRA: '额外卡组',
      LOCATION_GRAVE: '墓地', LOCATION_REMOVED: '除外区', LOCATION_ONFIELD: '场上',
      LOCATION_FIELD: '场上', LOCATION_MZONE: '怪兽区', LOCATION_SZONE: '魔陷区',
      LOCATION_PZONE: '灵摆区', LOCATION_FZONE: '场地区', LOCATION_BATTLE: '战斗步骤',
      LOCATION_OVERLAY: '作为超量素材' },
    cd: { EFFECT_UPDATE_ATTACK: '攻击力增减', EFFECT_UPDATE_DEFENSE: '守备力增减',
      EFFECT_CANNOT_SPECIAL_SUMMON: '不能特殊召唤', EFFECT_SPSUMMON_PROC: '特殊召唤手续',
      EFFECT_DISABLE: '效果无效化', EFFECT_INDESTRUCTABLE_BATTLE: '战斗破坏耐性',
      EFFECT_DISABLE_EFFECT: '效果无效(时限)', EFFECT_INDESTRUCTABLE_EFFECT: '效果破坏耐性',
      EFFECT_SET_ATTACK_FINAL: '攻击力固定值', EFFECT_CANNOT_ACTIVATE: '不能发动(卡/效果)',
      EFFECT_CANNOT_BE_EFFECT_TARGET: '不会成为效果对象', EFFECT_CANNOT_ATTACK: '不能攻击',
      EFFECT_IMMUNE_EFFECT: '效果免疫', EFFECT_DESTROY_REPLACE: '代替破坏',
      EFFECT_UPDATE_LEVEL: '等级增减', EFFECT_MATERIAL_CHECK: '素材检查',
      EFFECT_PIERCE: '穿刺伤害', EFFECT_CHANGE_LEVEL: '等级变更',
      EFFECT_DIRECT_ATTACK: '可直接攻击', EFFECT_AVOID_BATTLE_DAMAGE: '战斗伤害为0',
      EFFECT_CANNOT_SELECT_BATTLE_TARGET: '指定攻击对象限制', EFFECT_CANNOT_SUMMON: '不能通常召唤',
      EFFECT_EXTRA_ATTACK: '多次攻击', EFFECT_CANNOT_TRIGGER: '效果不能发动',
      EFFECT_EQUIP_LIMIT: '装备限制', EFFECT_SUMMON_PROC: '召唤手续',
      EFFECT_SET_ATTACK: '攻击力变更', EFFECT_CANNOT_ATTACK_ANNOUNCE: '不能宣告攻击',
      EFFECT_INDESTRUCTABLE_COUNT: '次数型破坏耐性', EFFECT_SET_DEFENSE_FINAL: '守备力固定值',
      EFFECT_ADD_TYPE: '追加卡片类型', EFFECT_CHANGE_DAMAGE: '伤害变更',
      EFFECT_SELF_DESTROY: '自我破坏', EFFECT_CANNOT_DIRECT_ATTACK: '不能直接攻击',
      EFFECT_CHANGE_BATTLE_DAMAGE: '战斗伤害变更', EFFECT_EXTRA_SUMMON_COUNT: '追加通常召唤机会',
      EFFECT_SET_BASE_ATTACK: '原始攻击力变更', EFFECT_CHANGE_ATTRIBUTE: '属性变更',
      EFFECT_CHANGE_RACE: '种族变更', EFFECT_CANNOT_CHANGE_POSITION: '不能变更表示形式',
      EFFECT_TRAP_ACT_IN_SET_TURN: '陷阱盖放回合可发动', EFFECT_CANNOT_BE_BATTLE_TARGET: '不会成为攻击对象',
      EFFECT_SPSUMMON_CONDITION: '特殊召唤条件', EFFECT_NO_EFFECT_DAMAGE: '所受效果伤害为0',
      EFFECT_MUST_ATTACK: '必须攻击', EFFECT_SET_DEFENSE: '守备力变更',
      EFFECT_CANNOT_BP: '不能进行战斗阶段', EFFECT_UNRELEASABLE_SUM: '不能作上级召唤解放',
      EFFECT_DISABLE_TRAPMONSTER: '陷阱怪兽效果无效', EFFECT_EXTRA_ATTACK_MONSTER: '对怪兽多次攻击',
      EFFECT_REMAIN_FIELD: '维持在场', EFFECT_CANNOT_MSET: '不能盖放怪兽',
      EFFECT_TRAP_ACT_IN_HAND: '陷阱可从手卡发动', EFFECT_CANNOT_BE_SYNCHRO_MATERIAL: '不能作同调素材',
      EFFECT_UNRELEASABLE_NONSUM: '不能作为解放', EFFECT_ATTACK_ALL: '攻击全部怪兽',
      EFFECT_DESTROY_SUBSTITUTE: '代替破坏', EFFECT_CANNOT_BE_LINK_MATERIAL: '不能作连接素材',
      EFFECT_CANNOT_BE_XYZ_MATERIAL: '不能作超量素材', EFFECT_TO_GRAVE_REDIRECT: '改变去墓地去向',
      EFFECT_CANNOT_BE_FUSION_MATERIAL: '不能作融合素材', EFFECT_CANNOT_FLIP_SUMMON: '不能反转召唤',
      EFFECT_DOUBLE_TRIBUTE: '可作为两份解放', EFFECT_CANNOT_SSET: '不能盖放魔陷',
      EFFECT_NO_BATTLE_DAMAGE: '不造成战斗伤害', EFFECT_SET_CONTROL: '控制权变更',
      EFFECT_REFLECT_BATTLE_DAMAGE: '反弹战斗伤害', EFFECT_MUST_ATTACK_MONSTER: '必须攻击怪兽',
      EFFECT_SET_BASE_DEFENSE: '原始守备力变更', EFFECT_DISABLE_FIELD: '封锁场地区',
      EFFECT_PUBLIC: '公开信息', EFFECT_CANNOT_REMOVE: '不能除外',
      EFFECT_SET_BASE_ATTACK_FINAL: '原始攻击力固定值', EFFECT_BATTLE_DESTROY_REDIRECT: '改变战斗破坏去向',
      EFFECT_LIMIT_SPECIAL_SUMMON_POSITION: '特殊召唤表示形式限制', EFFECT_SKIP_BP: '跳过战斗阶段',
      EFFECT_ADD_ATTRIBUTE: '追加属性', EFFECT_MONSTER_SSET: '怪兽在魔陷区盖放',
      EFFECT_DEFENSE_ATTACK: '守备表示攻击', EFFECT_CANNOT_INACTIVATE: '效果不能被无效',
      EFFECT_CANNOT_DISABLE: '效果不会被无效', EFFECT_SET_BASE_DEFENSE_FINAL: '原始守备力固定值',
      EFFECT_CANNOT_DRAW: '不能抽卡', EFFECT_CANNOT_DISABLE_SUMMON: '召唤不会被无效',
      EFFECT_INDESTRUCTABLE: '不会被破坏', EFFECT_CANNOT_CHANGE_CONTROL: '控制权不能变更',
      EFFECT_DOUBLE_DAMAGE: '受到伤害加倍', EFFECT_HALVE_DAMAGE: '受到伤害减半',
      EFFECT_CANNOT_DISEFFECT: '效果不能被无效化', EFFECT_CHANGE_LSCALE: '左刻度变更',
      EFFECT_CHANGE_RSCALE: '右刻度变更', EFFECT_EXTRA_LINK_MATERIAL: '可用其他卡作连接素材',
      EFFECT_XYZ_LEVEL: '改变超量阶级', EFFECT_LEAVE_FIELD_REDIRECT: '改变离场去向',
      EFFECT_SET_POSITION: '变更表示形式', EFFECT_TO_GRAVE_REDIRECT_CB: '改变去墓地去向',
      EFFECT_ATTACK_COST: '攻击需要代价', EFFECT_SELF_TOGRAVE: '自身送入墓地',
      EFFECT_IGNORE_BATTLE_TARGET: '无视攻击对象限制', EFFECT_NONTUNER: '视为非调整',
      EFFECT_UPDATE_LSCALE: '左刻度增减', EFFECT_UPDATE_RSCALE: '右刻度增减',
      EFFECT_DRAW_COUNT: '变更抽卡数', EFFECT_CANNOT_TO_HAND: '不能加入手卡',
      EFFECT_SKIP_DP: '跳过抽卡阶段', EFFECT_SPSUMMON_COST: '特殊召唤需要代价',
      EFFECT_QP_ACT_IN_NTPHAND: '速攻魔法可在他方回合从手卡发动', EFFECT_SUMMON_COST: '召唤需要代价',
      EFFECT_REFLECT_DAMAGE: '反弹效果伤害', EFFECT_CHANGE_INVOLVING_BATTLE_DAMAGE: '变更相关战斗伤害',
      EFFECT_EXTRA_RITUAL_MATERIAL: '可用其他卡作仪式素材', EFFECT_FLAG_EFFECT: '规则标记效果',
      EFFECT_FUSION_SUBSTITUTE: '可代替融合素材', EFFECT_SET_PROC: '盖放手续',
      EFFECT_OVERLAY_REMOVE_REPLACE: '代替取除超量素材', EFFECT_ADD_SETCODE: '追加所属字段',
      EFFECT_REMOVE_TYPE: '移除卡片类型', EFFECT_RITUAL_LEVEL: '改变仪式所需等级',
      EFFECT_CANNOT_TURN_SET: '不能变成里侧表示', EFFECT_REVERSE_DAMAGE: '伤害与回复反转',
      EFFECT_LIMIT_SUMMON_PROC: '限制召唤手续', EFFECT_MUST_USE_MZONE: '必须使用指定怪兽区',
      EFFECT_TRIBUTE_LIMIT: '限制解放数量', EFFECT_CANNOT_DISABLE_SPSUMMON: '特殊召唤不会被无效',
      EFFECT_QP_ACT_IN_SET_TURN: '速攻魔法盖放回合可发动', EFFECT_DECREASE_TRIBUTE: '减少所需解放',
      EFFECT_LIMIT_SET_PROC: '限制盖放手续', EFFECT_EXTRA_PENDULUM_SUMMON: '追加灵摆召唤次数',
      EFFECT_EXTRA_FUSION_MATERIAL: '可用其他卡作融合素材', EFFECT_EXTRA_SET_COUNT: '追加盖放次数',
      EFFECT_CANNOT_RELEASE: '不能被解放', EFFECT_ACTIVATE_COST: '发动需要代价',
      EFFECT_SKIP_M1: '跳过主要阶段1', EFFECT_LPCOST_CHANGE: '变更基本分支付方式',
      EFFECT_REMOVE_BRAINWASHING: '洗脑解除', EFFECT_SET_SUMMON_COUNT_LIMIT: '设定召唤次数限制',
      EFFECT_LEFT_SPSUMMON_COUNT: '剩余特殊召唤次数', EFFECT_SET_BATTLE_ATTACK: '变更战斗时攻击力',
      EFFECT_DOUBLE_XMATERIAL: '可作双重超量素材', EFFECT_SYNCHRO_LEVEL: '改变同调等级',
      EFFECT_SKIP_TURN: '跳过回合', EFFECT_ALSO_BATTLE_DAMAGE: '同时受到战斗伤害',
      EFFECT_HAND_LIMIT: '变更手卡数上限', EFFECT_CHANGE_CODE: '变更卡名',
      EFFECT_SEND_REPLACE: '改变送去墓地的处理', EFFECT_PATRICIAN_OF_DARKNESS: '由持有者选攻击对象',
      EFFECT_NECRO_VALLEY_IM: '王家长眠之谷(墓地封锁)', EFFECT_SPSUMMON_COUNT_LIMIT: '特殊召唤次数限制',
      EFFECT_CANNOT_TO_DECK: '不能回到卡组', EFFECT_ADD_FUSION_SETCODE: '追加融合用字段',
      EFFECT_ADD_EXTRA_TRIBUTE: '可额外作为解放', EFFECT_UPDATE_RANK: '阶级增减',
      EFFECT_TO_HAND_REDIRECT: '改变加入手卡去向', EFFECT_BP_TWICE: '可进行两次战斗阶段',
      EFFECT_SWAP_BASE_AD: '交换原始攻守', EFFECT_SYNCHRO_MATERIAL_CUSTOM: '自定义同调素材',
      EFFECT_SET_BATTLE_DEFENSE: '变更战斗时守备力', EFFECT_CANNOT_TO_GRAVE: '不能送去墓地',
      EFFECT_CANNOT_DISCARD_DECK: '不能从卡组送墓', EFFECT_CHANGE_RANK: '阶级变更',
      EFFECT_EXTRA_SYNCHRO_MATERIAL: '可用其他卡作同调素材', EFFECT_MAX_MZONE: '变更可用怪兽区数',
      EFFECT_BOTH_BATTLE_DAMAGE: '双方同时受到战斗伤害', EFFECT_SYNCHRO_LEVEL_EX: '改变同调等级(扩展)',
      EFFECT_CANNOT_DISCARD_HAND: '不能丢弃手卡', EFFECT_ADD_FUSION_CODE: '追加融合用卡名',
      EFFECT_SPIRIT_MAYNOT_RETURN: '灵魂怪兽可不回手卡', EFFECT_CHANGE_ENVIRONMENT: '变更场地环境',
      EFFECT_CHANGE_GRAVE_RACE: '变更墓地卡种族', EFFECT_REPLACE_DAMAGE: '代替受到伤害',
      EFFECT_MAX_SZONE: '变更可用魔陷区数', EFFECT_FORBIDDEN: '效果被封印',
      EFFECT_TUNER: '视为调整', EFFECT_CHAIN_MATERIAL: '连锁素材',
      EFFECT_REVERSE_RECOVER: '回复与伤害反转', EFFECT_NECRO_VALLEY: '王家长眠之谷',
      EFFECT_EXTRA_RELEASE_NONSUM: '可用非怪兽卡解放', EFFECT_DUAL_STATUS: '再度召唤状态',
      EFFECT_MUST_BE_SMATERIAL: '必须作为同调素材', EFFECT_EXTRA_RELEASE: '可额外解放',
      EFFECT_OVERLAY_RITUAL_MATERIAL: '超量素材用作仪式素材', EFFECT_FLAG_CANNOT_DISABLE: '不可无效标记',
      EFFECT_CANNOT_PLACE_COUNTER: '不能放置指示物', EFFECT_ADD_CARD_TYPE: '追加卡片类型',
      EFFECT_CHANGE_GRAVE_ATTRIBUTE: '变更墓地卡属性', EFFECT_ONLY_ATTACK_MONSTER: '只能攻击怪兽',
      EFFECT_ONLY_BE_ATTACKED: '对方只能攻击此卡', EFFECT_SKIP_SP: '跳过准备阶段',
      EFFECT_CANNOT_CHANGE_POS_E: '不能变更表示形式(回合结束)', EFFECT_UNRELEASABLE_EFFECT: '不能作为解放(效果)',
      EFFECT_SPSUMMON_PROC_G: '特殊召唤手续(群体)', EFFECT_REVEAL_ONFIELD: '公开场上信息',
      EFFECT_KAISER_COLOSSEUM: '凯撒斗技场规则', EFFECT_RCOUNTER_REPLACE: '代替取除指示物',
      EFFECT_CANNOT_SELECT_EFFECT_TARGET: '限制选择效果对象', EFFECT_CANNOT_TO_GRAVE_AS_COST: '不能作为代价送墓',
      EFFECT_USE_EXTRA_MZONE: '占用额外怪兽区', EFFECT_SKIP_M2: '跳过主要阶段2',
      EFFECT_SCRAP_CHIMERA: '废铁奇美拉限制', EFFECT_DIVINE_LIGHT: '神圣光辉规则',
      EFFECT_REVERSE_DECK: '反转卡组顺序', EFFECT_TO_DECK_REDIRECT: '改变回卡组去向',
      EFFECT_REVERSE_UPDATE: '反转攻守增减', EFFECT_MSET_COST: '怪兽盖放需要代价',
      EFFECT_SSET_COST: '魔陷盖放需要代价', EFFECT_EXTRA_RELEASE_SUM: '可额外解放(上级召唤)',
      EFFECT_FIRST_ATTACK: '首次攻击限制', EFFECT_CANNOT_DISABLE_FLIP_SUMMON: '反转召唤不会被无效',
      EFFECT_LPCOST_REPLACE: '代替支付基本分', EFFECT_DECREASE_TRIBUTE_SET: '减少盖放所需解放',
      EFFECT_SWAP_AD: '交换攻守', EFFECT_MUST_BE_FMATERIAL: '必须作为融合素材',
      EFFECT_MUST_BE_LMATERIAL: '必须作为连接素材', EFFECT_MUST_BE_XMATERIAL: '必须作为超量素材',
      EFFECT_CHANGE_FUSION_ATTRIBUTE: '变更融合用属性', EFFECT_CANNOT_EP: '不能进入结束阶段',
      EFFECT_DISCARD_COST_CHANGE: '变更丢弃代价', EFFECT_SPIRIT_DONOT_RETURN: '灵魂怪兽不回手卡',
      EFFECT_BATTLE_DAMAGE_TO_EFFECT: '战斗伤害转为效果伤害', EFFECT_DISABLE_CHAIN: '连锁无效',
      EFFECT_OPPO_SELECT_SPSUMMON_ZONE: '对方选择特殊召唤区域' },
    ui: { star: '★', rank: '阶', link: 'L', atk: '攻', def: '守', unknown: '？',
      sameName: '同卡名', member: '所属字段', refField: '关联字段', related: '关联卡片',
      dbCat: '效果分类(数据库)', scriptCat: '脚本声明分类', effType: '效果类型',
      triggerEv: '触发时机', actRange: '发动区域', scriptTags: '效果标签',
      noScript: '无脚本(通常怪兽等)', scriptNote: '以下由卡片 Lua 脚本静态分析得出,仅供参考',
      atkShort: 'ATK', defShort: 'DEF', scale: '刻度', count: '张卡',
      attr: '属性', race: '种族', source: '数据: ygocore-database / ygopro-scripts',
      pre: '先行', preNote: '先行卡(来自先行卡包,文本为简体中文,暂无日/英文版本)',
      zhOnly: '简中', zhNote: '该卡在此语言的数据库中缺失,以简体中文文本补入',
      showToken: '显示衍生物',
      fSr: '自肃', srkSp: '特殊召唤限制', srkSm: '召唤限制', srkSet: '盖放限制',
      srkFlip: '反转召唤限制', srkPos: '特殊召唤表示形式限制', srOnly: '仅限: ',
      srAll: '全部禁止', srTurn: '本回合', smPendulum: '灵摆召唤', smRitual: '仪式召唤',
      smFusion: '融合召唤', smSynchro: '同调召唤', smXyz: '超量召唤',
      srkCount: '特殊召唤次数限制', srPer: '次/回合', srBoth: '双方', srkAct: '发动限制',
      g2title: '系列中满足第二组条件的卡',
      effectList: '效果明细(按脚本注册顺序)', fEv: '触发', fRg: '区域', fCat: '分类',
      fCd: '效果代码', fAct: '动作', granted: '赋予效果',
      fTg: '对象', tgt: '取对象', noTgt: '不取对象', fSel: '选择',
      fLimit: '限制', perTurn: '次/回合', sideself: '己方', sideopp: '对方',
      sideboth: '双方', pcs: '张',
      mon: '怪兽', spell: '魔法', trap: '陷阱', faceup: '表侧', setdesc: '字段', st: '魔陷',
      pself: '自己', popp: '对方玩家', pboth: '双方玩家',
      pendEff: '灵摆效果', monEff: '怪兽效果', sameEff: '需同一效果满足', selfCard: '自身',
      fSs: '咒文速度', ss1: 'SS1', ss2: 'SS2', ss3: 'SS3',
      tabSearch: '搜索', tabRand: '随机组卡',
      rSet: '抽卡设置', rMainN: '主卡组数量', rMinMon: '怪兽最少(可选)', rMinSp: '魔法最少(可选)',
      rMinTr: '陷阱最少(可选)', rExtraN: '额外卡组数量', rCap: '每卡上限', rPre: '包含先行卡', rOt: '卡区',
      rRules: '排除规则', rAddRule: '添加排除规则', rRuleEmpty: '请先选择要排除的条件',
      rNoRules: '无——添加规则可把符合条件的卡移出卡池',
      rFMain: '类型(任一)', rFSub: '细分类型(全部满足)', rFSubShort: '细分', rFAttr: '属性(任一)', rFRace: '种族(任一)', rFSet: '字段',
      contSpell: '永续魔法', contTrap: '永续陷阱',
      rBl: '遵循禁限表',
      blTitle: '禁限', bl0: '禁止', bl1: '限制', bl2: '准限制', blU: '无限制',
      rHits: '命中', rExcl: '排除卡片', rClearExcl: '清空全部',
      rPoolFile: '卡池文件', rExportPool: '导出卡池(JSON)', rImportPool: '导入卡池(JSON)',
      rSetPlaceholder: '输入字段名或代码…',
      rDraw: '🎲 随机抽取', rHistory: '抽取历史', rClearHist: '清空历史',
      rExportYdk: '导出 ydk', rExAll: '一键排除本次结果', rExAllDone: '已把本次结果的 {0} 种卡加入排除清单',
      rExcluded: '已加入排除清单',
      rMainPool: '主池', rExtraPool: '额外池', rExtraDeck: '额外卡组',
      rEmpty: '尚未抽取——设置好数量后点「随机抽取」',
      rLegal: '提示:超出常规数量(主卡组 40~60 / 额外 0~15)',
      rErrNeg: '数量不能为负数', rErrMinSum: '怪兽/魔法/陷阱最小张数之和超过主卡组数量',
      rErrShort: '可用的{0}卡不足:需要 {2} 张,当前仅 {1} 张(受排除规则与每卡上限影响)',
      rErrMainShort: '主卡组可用卡不足:需要 {1} 张,当前仅 {0} 张',
      rErrExtra: '额外卡组可用卡不足:需要 {1} 张,当前仅 {0} 张',
      rImportBad: '卡池文件无效(需要本工具导出的 JSON)',
      rImportOk: '导入成功:排除 {0} 张卡,规则 {1} 条,历史 {2} 条',
      rImportConfirm: '导入将替换当前的设置、排除清单与抽取历史,是否继续?',
      rHistEntry: '主 {0} / 额 {1}', rAll: '全部' },
    act: { DESTROY: '破坏', NEGATE: '无效', REMOVE: '除外', TOHAND: '回到手卡',
      TODECK: '回到卡组', TOGRAVE: '送去墓地', SPSUMMON: '特殊召唤', DRAW: '抽卡',
      DAMAGE: '给予伤害', RECOVER: '回复基本分', POSITION: '变更表示形式',
      RELEASE: '解放', CONTROL: '夺取控制权', EQUIP: '装备', MOVE: '移动' }
  },
  'ja-JP': {
    tags: { QUICK: '誘発即時', TRIGGER: '誘発', IGNITION: '起動', CONTINUOUS: '永続',
      FLIP: 'リバース', EQUIP: '装備効果', HAND_TRAP: '手札誘発', GRAVE_EFFECT: '墓地効果',
      SELF_LOCK: '縛り',
      PENDULUM: 'ペンデュラム', XYZ: 'エクシーズ召喚', SYNCHRO: 'シンクロ召喚',
      FUSION: '融合召喚', RITUAL: '儀式召喚', LINK: 'リンク召喚' },
    cat: { CATEGORY_DESTROY: '破壊', CATEGORY_RELEASE: 'リリース', CATEGORY_REMOVE: '除外',
      CATEGORY_TOHAND: '手札に加える', CATEGORY_TODECK: 'デッキに戻す', CATEGORY_TOGRAVE: '墓地へ送る',
      CATEGORY_DECKDES: 'デッキ破壊', CATEGORY_HANDES: 'ハンデス', CATEGORY_SUMMON: '召喚',
      CATEGORY_SPECIAL_SUMMON: '特殊召喚', CATEGORY_TOKEN: 'トークン', CATEGORY_GRAVE_ACTION: '墓地アクション',
      CATEGORY_POSITION: '表示形式', CATEGORY_CONTROL: 'コントロール', CATEGORY_DISABLE: '効果無効化',
      CATEGORY_DISABLE_SUMMON: '召喚無効化', CATEGORY_DRAW: 'ドロー', CATEGORY_SEARCH: 'サーチ',
      CATEGORY_EQUIP: '装備', CATEGORY_DAMAGE: 'ダメージ', CATEGORY_RECOVER: '回復',
      CATEGORY_ATKCHANGE: '攻撃力変化', CATEGORY_DEFCHANGE: '守備力変化', CATEGORY_COUNTER: 'カウンター',
      CATEGORY_COIN: 'コイントス', CATEGORY_DICE: 'ダイス', CATEGORY_LEAVE_GRAVE: '墓地から離れる',
      CATEGORY_GRAVE_SPSUMMON: '墓地特殊召喚', CATEGORY_NEGATE: '無効', CATEGORY_ANNOUNCE: '宣言',
      CATEGORY_FUSION_SUMMON: '融合召喚', CATEGORY_TOEXTRA: 'EXデッキへ',
      CATEGORY_MSET: 'セット(モンスター)', CATEGORY_SSET: 'セット(魔法・罠)',
      CATEGORY_HANDES_SELF: '自分の手札を捨てる', CATEGORY_HANDES_OPPO: '相手の手札を捨てさせる',
      CATEGORY_DECK_SPSUMMON: 'デッキから特殊召喚' },
    et: { EFFECT_TYPE_SINGLE: 'シングル', EFFECT_TYPE_FIELD: 'フィールド', EFFECT_TYPE_EQUIP: '装備',
      EFFECT_TYPE_ACTIONS: 'アクション', EFFECT_TYPE_ACTIVATE: '発動', EFFECT_TYPE_FLIP: 'リバース',
      EFFECT_TYPE_IGNITION: '起動', EFFECT_TYPE_TRIGGER_O: '誘発(任意)', EFFECT_TYPE_TRIGGER_F: '誘発(強制)',
      EFFECT_TYPE_QUICK_O: '誘発即時(任意)', EFFECT_TYPE_QUICK_F: '誘発即時(強制)',
      EFFECT_TYPE_CONTINUOUS: '永続', EFFECT_TYPE_XMATERIAL: 'エクシーズ素材効果',
      EFFECT_TYPE_GRANT: '効果付与', EFFECT_TYPE_TARGET: '対象指定' },
    ev: { EVENT_FREE_CHAIN: '任意のタイミング', EVENT_DESTROY: '破壊された', EVENT_DESTROYED: '破壊され墓地へ',
      EVENT_REMOVE: '除外された', EVENT_TO_HAND: '手札に加わった', EVENT_TO_DECK: 'デッキに戻った',
      EVENT_TO_GRAVE: '墓地へ送られた', EVENT_LEAVE: '離れた', EVENT_LEAVE_FIELD: 'フィールドを離れた',
      EVENT_MOVE: '移動した', EVENT_CHANGE_POS: '表示形式変更', EVENT_POS_CHANGE: '表示形式変更',
      EVENT_CHAINING: '効果の発動時', EVENT_CHAIN_ACTIVATED: 'チェーンに乗った',
      EVENT_CHAIN_SOLVING: '効果処理時', EVENT_CHAIN_SOLVED: '効果処理終了時',
      EVENT_DISUSED: '効果が中断された', EVENT_SUMMON: '召喚成功', EVENT_FLIP_SUMMON: '反転召喚成功',
      EVENT_SPSUMMON: '特殊召喚成功', EVENT_SUMMON_SUCCESS: '召喚成功',
      EVENT_SPSUMMON_SUCCESS: '特殊召喚成功', EVENT_SET: 'セット',
      EVENT_MSET: 'モンスターセット', EVENT_SSET: '魔法・罠セット', EVENT_ADJUST: '状態調整',
      EVENT_BREAK_EFFECT: '効果開始', EVENT_PHASE: 'フェイズ', EVENT_DRAW: 'ドロー',
      EVENT_DAMAGE: 'ダメージを受けた', EVENT_RECOVER: '回復', EVENT_PREDRAW: 'ドロー前',
      EVENT_ATTACK: '攻撃宣言', EVENT_ATTACKED: '攻撃された', EVENT_BATTLE_START: 'バトル開始',
      EVENT_BATTLE_END: 'バトル終了', EVENT_BATTLED: 'バトル後', EVENT_BATTLE_DAMAGE: '戦闘ダメージ',
      EVENT_BE_BATTLE_TARGET: '攻撃対象にされた', EVENT_BECOME_TARGET: '効果の対象になった',
      EVENT_LEVEL_UP: 'レベルアップ', EVENT_PAY_LPCOST: 'LPを払った',
      EVENT_ATTACK_ANNOUNCE: '攻撃宣言', EVENT_BATTLE_DESTROYED: '戦闘で破壊された',
      EVENT_BATTLE_DESTROYING: '戦闘で破壊した時', EVENT_BE_MATERIAL: '素材として使用',
      EVENT_FLIP_SUMMON_SUCCESS: '反転召喚成功', EVENT_DAMAGE_STEP_END: 'ダメージステップ終了時',
      EVENT_PRE_DAMAGE_CALCULATE: 'ダメージ計算前', EVENT_RELEASE: 'リリースされた',
      EVENT_CUSTOM: 'カスタムイベント', EVENT_LEAVE_FIELD_P: 'フィールドを離れる際',
      EVENT_CHAIN_DISABLED: 'チェーン無効化', EVENT_CHAIN_END: 'チェーン終了',
      EVENT_PHASE_START: 'フェイズ開始', EVENT_BATTLE_CONFIRM: 'バトル確認',
      EVENT_CHAIN_NEGATED: '発動無効化', EVENT_EQUIP: '装備時',
      EVENT_DISCARD: '捨てられた', EVENT_DETACH_MATERIAL: 'エクシーズ素材を取り除く',
      EVENT_CONTROL_CHANGED: 'コントロール変更', EVENT_LEAVE_GRAVE: '墓地を離れた',
      EVENT_TURN_END: 'ターン終了', EVENT_BE_PRE_MATERIAL: '素材となる前',
      EVENT_ATTACK_DISABLED: '攻撃無効', EVENT_TOSS_COIN: 'コイントス',
      EVENT_PRE_BATTLE_DAMAGE: '戦闘ダメージ前', EVENT_SUMMON_NEGATED: '召喚無効化',
      EVENT_SPSUMMON_SUCCESS_G_P: '特殊召喚成功(グループ)', EVENT_TOSS_DICE_NEGATE: 'ダイス結果無効',
      EVENT_TOSS_DICE: 'ダイスロール', EVENT_ADD_COUNTER: 'カウンター追加',
      EVENT_TOSS_COIN_NEGATE: 'コイン結果無効', EVENT_LEAVE_DECK: 'デッキを離れた',
      EVENT_SPSUMMON_NEGATED: '特殊召喚無効化', EVENT_REMOVE_COUNTER: 'カウンター除去',
      EVENT_FLIP: 'リバース',
      'EVENT_PHASE+PHASE_DRAW': 'ドローフェーズ', 'EVENT_PHASE+PHASE_STANDBY': 'スタンバイフェーズ',
      'EVENT_PHASE+PHASE_MAIN1': 'メインフェーズ1', 'EVENT_PHASE+PHASE_MAIN2': 'メインフェーズ2',
      'EVENT_PHASE+PHASE_BATTLE': 'バトルフェーズ', 'EVENT_PHASE+PHASE_BATTLE_START': 'バトルフェーズ開始',
      'EVENT_PHASE+PHASE_END': 'エンドフェーズ',
      'EVENT_PHASE_START+PHASE_DRAW': 'ドローフェーズ開始', 'EVENT_PHASE_START+PHASE_STANDBY': 'スタンバイフェーズ開始',
      'EVENT_PHASE_START+PHASE_MAIN1': 'メインフェーズ1開始', 'EVENT_PHASE_START+PHASE_MAIN2': 'メインフェーズ2開始',
      'EVENT_PHASE_START+PHASE_BATTLE': 'バトルフェーズ開始', 'EVENT_PHASE_START+PHASE_END': 'エンドフェーズ開始',
      'EVENT_PHASE_START+PHASE_BATTLE_START': 'バトルフェーズ開始(ステップ開始)' },
    rg: { LOCATION_HAND: '手札', LOCATION_DECK: 'デッキ', LOCATION_EXTRA: 'EXデッキ',
      LOCATION_GRAVE: '墓地', LOCATION_REMOVED: '除外ゾーン', LOCATION_ONFIELD: 'フィールド上',
      LOCATION_FIELD: 'フィールド上', LOCATION_MZONE: 'モンスターゾーン', LOCATION_SZONE: '魔法・罠ゾーン',
      LOCATION_PZONE: 'ペンデュラムゾーン', LOCATION_FZONE: 'フィールドゾーン', LOCATION_BATTLE: 'バトル',
      LOCATION_OVERLAY: 'エクシーズ素材として' },
    cd: { EFFECT_UPDATE_ATTACK: '攻撃力アップ/ダウン', EFFECT_UPDATE_DEFENSE: '守備力アップ/ダウン',
      EFFECT_CANNOT_SPECIAL_SUMMON: '特殊召喚不可', EFFECT_SPSUMMON_PROC: '特殊召喚手続',
      EFFECT_DISABLE: '効果無効化', EFFECT_INDESTRUCTABLE_BATTLE: '戦闘破壊耐性',
      EFFECT_DISABLE_EFFECT: '効果無効(期限付き)', EFFECT_INDESTRUCTABLE_EFFECT: '効果破壊耐性',
      EFFECT_SET_ATTACK_FINAL: '攻撃力固定値', EFFECT_CANNOT_ACTIVATE: '発動不可',
      EFFECT_CANNOT_BE_EFFECT_TARGET: '効果の対象にならない', EFFECT_CANNOT_ATTACK: '攻撃不可',
      EFFECT_IMMUNE_EFFECT: '効果免疫', EFFECT_DESTROY_REPLACE: '破壊代替',
      EFFECT_PIERCE: '貫通ダメージ', EFFECT_CHANGE_LEVEL: 'レベル変更',
      EFFECT_DIRECT_ATTACK: '直接攻撃可能', EFFECT_AVOID_BATTLE_DAMAGE: '戦闘ダメージを0に',
      EFFECT_EXTRA_ATTACK: '複数回攻撃', EFFECT_EQUIP_LIMIT: '装備制限',
      EFFECT_SUMMON_PROC: '召喚手続', EFFECT_SET_ATTACK: '攻撃力変更',
      EFFECT_INDESTRUCTABLE_COUNT: '破壊耐性(回数制)', EFFECT_SET_DEFENSE_FINAL: '守備力固定値',
      EFFECT_ADD_TYPE: 'タイプ追加', EFFECT_CHANGE_DAMAGE: 'ダメージ変更',
      EFFECT_CANNOT_DIRECT_ATTACK: '直接攻撃不可', EFFECT_CHANGE_BATTLE_DAMAGE: '戦闘ダメージ変更',
      EFFECT_EXTRA_SUMMON_COUNT: '追加の通常召喚', EFFECT_CHANGE_ATTRIBUTE: '属性変更',
      EFFECT_CHANGE_RACE: '種族変更', EFFECT_CANNOT_CHANGE_POSITION: '表示形式変更不可',
      EFFECT_TRAP_ACT_IN_SET_TURN: 'セットターンに発動可(罠)', EFFECT_CANNOT_BE_BATTLE_TARGET: '攻撃対象にされない',
      EFFECT_SPSUMMON_CONDITION: '特殊召喚条件', EFFECT_NO_EFFECT_DAMAGE: '効果ダメージを0に',
      EFFECT_MUST_ATTACK: '必ず攻撃', EFFECT_CANNOT_BP: 'バトルフェイズ不可',
      EFFECT_TRAP_ACT_IN_HAND: '手札から発動可(罠)', EFFECT_CANNOT_BE_SYNCHRO_MATERIAL: 'シンクロ素材不可',
      EFFECT_ATTACK_ALL: '全モンスターを攻撃', EFFECT_CANNOT_BE_LINK_MATERIAL: 'リンク素材不可',
      EFFECT_CANNOT_BE_XYZ_MATERIAL: 'エクシーズ素材不可', EFFECT_CANNOT_BE_FUSION_MATERIAL: '融合素材不可',
      EFFECT_DOUBLE_TRIBUTE: '2体分のリリース', EFFECT_REFLECT_BATTLE_DAMAGE: '戦闘ダメージ反射',
      EFFECT_SKIP_BP: 'バトルフェイズをスキップ', EFFECT_DEFENSE_ATTACK: '守備表示で攻撃',
      EFFECT_NO_BATTLE_DAMAGE: '戦闘ダメージを与えない',
      EFFECT_UPDATE_LEVEL: 'レベルアップ/ダウン', EFFECT_MATERIAL_CHECK: '素材チェック',
      EFFECT_CANNOT_SELECT_BATTLE_TARGET: '攻撃対象指定制限', EFFECT_CANNOT_SUMMON: '通常召喚不可',
      EFFECT_CANNOT_TRIGGER: '効果発動不可', EFFECT_CANNOT_ATTACK_ANNOUNCE: '攻撃宣言不可',
      EFFECT_SELF_DESTROY: '自己破壊', EFFECT_SET_BASE_ATTACK: '元々の攻撃力変更',
      EFFECT_SET_DEFENSE: '守備力変更', EFFECT_UNRELEASABLE_SUM: 'アドバンス召喚のリリース不可',
      EFFECT_DISABLE_TRAPMONSTER: '罠モンスター無効', EFFECT_REMAIN_FIELD: 'フィールドに残る',
      EFFECT_EXTRA_ATTACK_MONSTER: 'モンスターへの複数回攻撃', EFFECT_CANNOT_MSET: 'モンスターセット不可',
      EFFECT_UNRELEASABLE_NONSUM: 'リリース不可', EFFECT_DESTROY_SUBSTITUTE: '破壊代替',
      EFFECT_CHANGE_LSCALE: '左スケール変更', EFFECT_CHANGE_RSCALE: '右スケール変更',
      EFFECT_XYZ_LEVEL: 'エクシーズランク変更', EFFECT_ADD_SETCODE: 'カテゴリ追加',
      EFFECT_CANNOT_TURN_SET: '裏側表示不可' },
    ui: { star: '★', rank: '階', link: 'L', atk: '攻', def: '守', unknown: '？',
      sameName: '同カード名', member: '所属フィールド', refField: '関連フィールド',
      related: '関連カード', dbCat: '効果分類(DB)', scriptCat: 'スクリプト分類',
      effType: '効果タイプ', triggerEv: '発動タイミング', actRange: '発動ゾーン',
      scriptTags: '効果タグ', noScript: 'スクリプトなし', scriptNote: '以下はLuaスクリプトの静的解析による参考情報',
      atkShort: 'ATK', defShort: 'DEF', scale: 'スケール', count: '枚',
      attr: '属性', race: '種族', source: 'データ: ygocore-database / ygopro-scripts',
      pre: '先行', preNote: '先行カード(先行パック収録,テキストは簡体中文)',
      zhOnly: '簡中', zhNote: 'この言語のデータベースに存在しないため,簡体中文のテキストで補完',
      showToken: 'トークンを表示',
      fSr: '縛り', srkSp: '特殊召喚制限', srkSm: '召喚制限', srkSet: 'セット制限',
      srkFlip: '反転召喚制限', srkPos: '表示形式制限', srOnly: 'のみ: ',
      srAll: '全面禁止', srTurn: 'このターン', smPendulum: 'ペンデュラム召喚', smRitual: '儀式召喚',
      smFusion: '融合召喚', smSynchro: 'シンクロ召喚', smXyz: 'エクシーズ召喚',
      srkCount: '特殊召喚回数制限', srPer: '回/ターン', srBoth: '双方', srkAct: '発動制限',
      g2title: 'シリーズ内で第2条件を満たすカード',
      effectList: '効果明细(スクリプト登録順)', fEv: '発動', fRg: 'ゾーン', fCat: '分類',
      fCd: '効果コード', fAct: '動作', granted: '付与効果',
      fTg: '対象', tgt: '対象を取る', noTgt: '対象を取らない', fSel: '選択',
      fLimit: '制限', perTurn: '回/ターン', sideself: '自分', sideopp: '相手',
      sideboth: '双方', pcs: '枚',
      mon: 'モンスター', spell: '魔法', trap: '罠', faceup: '表側', setdesc: 'カテゴリ', st: '魔法・罠',
      pself: '自分', popp: '相手プレイヤー', pboth: '双方プレイヤー',
      pendEff: 'ペンデュラム効果', monEff: 'モンスター効果', sameEff: '同一効果で満たす', selfCard: '自身',
      fSs: '呪文速度', ss1: 'SS1', ss2: 'SS2', ss3: 'SS3',
      tabSearch: '検索', tabRand: 'ランダムデッキ',
      rSet: '抽選設定', rMainN: 'メインデッキ枚数', rMinMon: 'モンスター最小(任意)', rMinSp: '魔法最小(任意)',
      rMinTr: '罠最小(任意)', rExtraN: 'EXデッキ枚数', rCap: '1枚あたりの上限', rPre: '先行カードを含む', rOt: '区分',
      rRules: '除外ルール', rAddRule: '除外ルールを追加', rRuleEmpty: '除外する条件を選択してください',
      rNoRules: 'なし——ルールを追加すると条件に合うカードをプールから外せます',
      rFMain: 'タイプ(いずれか)', rFSub: 'タイプ詳細(すべて満たす)', rFSubShort: '詳細', rFAttr: '属性(いずれか)', rFRace: '種族(いずれか)', rFSet: 'カテゴリ',
      contSpell: '永続魔法', contTrap: '永続罠',
      rBl: '禁止・制限を遵守',
      blTitle: '禁止・制限', bl0: '禁止', bl1: '制限', bl2: '準制限', blU: '無制限',
      rHits: '該当', rExcl: '除外カード', rClearExcl: 'すべてクリア',
      rPoolFile: 'プールファイル', rExportPool: 'プールを書き出す(JSON)', rImportPool: 'プールを読み込む(JSON)',
      rSetPlaceholder: 'カテゴリ名またはコードを入力…',
      rDraw: '🎲 ランダム抽選', rHistory: '抽選履歴', rClearHist: '履歴をクリア',
      rExportYdk: 'ydk を書き出す', rExAll: 'この結果をまとめて除外', rExAllDone: 'この結果の {0} 種類のカードを除外リストに追加しました',
      rExcluded: '除外リストに追加しました',
      rMainPool: 'メイン', rExtraPool: 'EX', rExtraDeck: 'EXデッキ',
      rEmpty: 'まだ抽選していません——枚数を設定して「ランダム抽選」を押してください',
      rLegal: '注意:一般的な枚数(メイン 40~60 / EX 0~15)を超えています',
      rErrNeg: '枚数は負にできません', rErrMinSum: '最小枚数の合計がメインデッキ枚数を超えています',
      rErrShort: '使える{0}カードが不足:{2} 枚必要ですが,{1} 枚しかありません(除外ルールと上限の影響)',
      rErrMainShort: 'メインデッキに使えるカードが不足:{1} 枚必要ですが,{0} 枚しかありません',
      rErrExtra: 'EXデッキに使えるカードが不足:{1} 枚必要ですが,{0} 枚しかありません',
      rImportBad: 'プールファイルが無効です(このツールが書き出した JSON が必要)',
      rImportOk: '読み込み完了:除外 {0} 枚,ルール {1} 件,履歴 {2} 件',
      rImportConfirm: '読み込むと現在の設定・除外リスト・抽選履歴が置き換えられます。続けますか?',
      rHistEntry: 'メイン {0} / EX {1}', rAll: '全部' },
    act: { DESTROY: '破壊', NEGATE: '無効化', REMOVE: '除外', TOHAND: '手札に戻す',
      TODECK: 'デッキに戻す', TOGRAVE: '墓地へ送る', SPSUMMON: '特殊召喚', DRAW: 'ドロー',
      DAMAGE: 'ダメージを与える', RECOVER: 'LPを回復', POSITION: '表示形式変更',
      RELEASE: 'リリース', CONTROL: 'コントロールを得る', EQUIP: '装備', MOVE: '移動' }
  },
  'en-US': {
    tags: { QUICK: 'Quick Effect', TRIGGER: 'Trigger', IGNITION: 'Ignition',
      CONTINUOUS: 'Continuous', FLIP: 'Flip', EQUIP: 'Equip Effect',
      HAND_TRAP: 'Hand Trap', GRAVE_EFFECT: 'GY Effect', SELF_LOCK: 'Self-restriction',
      PENDULUM: 'Pendulum', XYZ: 'Xyz Summon', SYNCHRO: 'Synchro Summon', FUSION: 'Fusion Summon',
      RITUAL: 'Ritual Summon', LINK: 'Link Summon' },
    cat: { CATEGORY_DESTROY: 'Destroy', CATEGORY_RELEASE: 'Tribute', CATEGORY_REMOVE: 'Banish',
      CATEGORY_TOHAND: 'Add to hand', CATEGORY_TODECK: 'Return to deck',
      CATEGORY_TOGRAVE: 'Send to GY', CATEGORY_DECKDES: 'Mill', CATEGORY_HANDES: 'Discard',
      CATEGORY_SUMMON: 'Summon', CATEGORY_SPECIAL_SUMMON: 'Special Summon',
      CATEGORY_TOKEN: 'Token', CATEGORY_GRAVE_ACTION: 'GY action', CATEGORY_POSITION: 'Position',
      CATEGORY_CONTROL: 'Control', CATEGORY_DISABLE: 'Disable', CATEGORY_DISABLE_SUMMON: 'Negate Summon',
      CATEGORY_DRAW: 'Draw', CATEGORY_SEARCH: 'Search', CATEGORY_EQUIP: 'Equip',
      CATEGORY_DAMAGE: 'Damage', CATEGORY_RECOVER: 'Recover', CATEGORY_ATKCHANGE: 'ATK change',
      CATEGORY_DEFCHANGE: 'DEF change', CATEGORY_COUNTER: 'Counter', CATEGORY_COIN: 'Coin toss',
      CATEGORY_DICE: 'Dice', CATEGORY_LEAVE_GRAVE: 'Leave GY', CATEGORY_GRAVE_SPSUMMON: 'GY Special Summon',
      CATEGORY_NEGATE: 'Negate', CATEGORY_ANNOUNCE: 'Declare', CATEGORY_FUSION_SUMMON: 'Fusion Summon',
      CATEGORY_TOEXTRA: 'To Extra Deck', CATEGORY_MSET: 'Set monster', CATEGORY_SSET: 'Set S/T',
      CATEGORY_HANDES_SELF: 'Discard own hand', CATEGORY_HANDES_OPPO: 'Opponent discards',
      CATEGORY_DECK_SPSUMMON: 'Special Summon from Deck' },
    et: { EFFECT_TYPE_SINGLE: 'Single', EFFECT_TYPE_FIELD: 'Field', EFFECT_TYPE_EQUIP: 'Equip',
      EFFECT_TYPE_ACTIONS: 'Actions', EFFECT_TYPE_ACTIVATE: 'Activate', EFFECT_TYPE_FLIP: 'Flip',
      EFFECT_TYPE_IGNITION: 'Ignition', EFFECT_TYPE_TRIGGER_O: 'Trigger (opt)',
      EFFECT_TYPE_TRIGGER_F: 'Trigger (mand)', EFFECT_TYPE_QUICK_O: 'Quick (opt)',
      EFFECT_TYPE_QUICK_F: 'Quick (mand)', EFFECT_TYPE_CONTINUOUS: 'Continuous',
      EFFECT_TYPE_XMATERIAL: 'Xyz Material', EFFECT_TYPE_GRANT: 'Grant', EFFECT_TYPE_TARGET: 'Target' },
    ev: { EVENT_FREE_CHAIN: 'Any time', EVENT_DESTROY: 'Destroyed', EVENT_DESTROYED: 'Destroyed & sent to GY',
      EVENT_REMOVE: 'Banished', EVENT_TO_HAND: 'Added to hand', EVENT_TO_DECK: 'Returned to deck',
      EVENT_TO_GRAVE: 'Sent to GY', EVENT_LEAVE: 'Leaves', EVENT_LEAVE_FIELD: 'Leaves field',
      EVENT_MOVE: 'Moved', EVENT_CHANGE_POS: 'Position changed', EVENT_POS_CHANGE: 'Position changed',
      EVENT_CHAINING: 'On activation', EVENT_CHAIN_ACTIVATED: 'Becomes chain link',
      EVENT_CHAIN_SOLVING: 'While resolving', EVENT_CHAIN_SOLVED: 'After resolution',
      EVENT_SUMMON: 'Summoned', EVENT_FLIP_SUMMON: 'Flip Summoned',
      EVENT_SPSUMMON: 'Special Summoned', EVENT_SUMMON_SUCCESS: 'Summoned',
      EVENT_SPSUMMON_SUCCESS: 'Special Summoned',
      EVENT_SET: 'Set', EVENT_MSET: 'Monster set', EVENT_SSET: 'S/T set',
      EVENT_PHASE: 'Phase', EVENT_DRAW: 'Draw', EVENT_DAMAGE: 'Damage taken',
      EVENT_RECOVER: 'Recover', EVENT_PREDRAW: 'Before draw', EVENT_ATTACK: 'Declares attack',
      EVENT_ATTACKED: 'Is attacked', EVENT_BATTLE_START: 'Battle starts', EVENT_BATTLE_END: 'Battle ends',
      EVENT_BATTLED: 'After battle', EVENT_BATTLE_DAMAGE: 'Battle damage',
      EVENT_BE_BATTLE_TARGET: 'Attack target', EVENT_BECOME_TARGET: 'Effect target',
      EVENT_PAY_LPCOST: 'Pays LP',
      EVENT_ATTACK_ANNOUNCE: 'Attack declaration', EVENT_BATTLE_DESTROYED: 'Destroyed by battle',
      EVENT_BATTLE_DESTROYING: 'Destroys by battle', EVENT_BE_MATERIAL: 'Used as material',
      EVENT_FLIP_SUMMON_SUCCESS: 'Flip Summoned', EVENT_DAMAGE_STEP_END: 'End of Damage Step',
      EVENT_PRE_DAMAGE_CALCULATE: 'Before damage calculation', EVENT_RELEASE: 'Tributed',
      EVENT_CUSTOM: 'Custom event', EVENT_LEAVE_FIELD_P: 'About to leave field',
      EVENT_CHAIN_DISABLED: 'Chain disabled', EVENT_CHAIN_END: 'Chain ends',
      EVENT_PHASE_START: 'Phase starts', EVENT_BATTLE_CONFIRM: 'Battle confirm',
      EVENT_CHAIN_NEGATED: 'Activation negated', EVENT_EQUIP: 'When equipped',
      EVENT_DISCARD: 'Discarded', EVENT_DETACH_MATERIAL: 'Xyz material detached',
      EVENT_CONTROL_CHANGED: 'Control changed', EVENT_LEAVE_GRAVE: 'Leaves GY',
      EVENT_TURN_END: 'Turn ends', EVENT_BE_PRE_MATERIAL: 'About to become material',
      EVENT_ATTACK_DISABLED: 'Attack negated', EVENT_TOSS_COIN: 'Coin toss',
      EVENT_PRE_BATTLE_DAMAGE: 'Before battle damage', EVENT_SUMMON_NEGATED: 'Summon negated',
      EVENT_SPSUMMON_SUCCESS_G_P: 'Special Summoned (group)', EVENT_TOSS_DICE_NEGATE: 'Dice result negated',
      EVENT_TOSS_DICE: 'Dice roll', EVENT_ADD_COUNTER: 'Counter placed',
      EVENT_TOSS_COIN_NEGATE: 'Coin result negated', EVENT_LEAVE_DECK: 'Leaves Deck',
      EVENT_SPSUMMON_NEGATED: 'Special Summon negated', EVENT_REMOVE_COUNTER: 'Counter removed',
      EVENT_FLIP: 'Flipped', EVENT_BREAK_EFFECT: 'Effect starts', EVENT_ADJUST: 'State adjust',
      EVENT_LEVEL_UP: 'Level up',
      'EVENT_PHASE+PHASE_DRAW': 'Draw Phase', 'EVENT_PHASE+PHASE_STANDBY': 'Standby Phase',
      'EVENT_PHASE+PHASE_MAIN1': 'Main Phase 1', 'EVENT_PHASE+PHASE_MAIN2': 'Main Phase 2',
      'EVENT_PHASE+PHASE_BATTLE': 'Battle Phase', 'EVENT_PHASE+PHASE_BATTLE_START': 'Battle Phase starts',
      'EVENT_PHASE+PHASE_END': 'End Phase',
      'EVENT_PHASE_START+PHASE_DRAW': 'Draw Phase begins', 'EVENT_PHASE_START+PHASE_STANDBY': 'Standby Phase begins',
      'EVENT_PHASE_START+PHASE_MAIN1': 'Main Phase 1 begins', 'EVENT_PHASE_START+PHASE_MAIN2': 'Main Phase 2 begins',
      'EVENT_PHASE_START+PHASE_BATTLE': 'Battle Phase begins', 'EVENT_PHASE_START+PHASE_END': 'End Phase begins',
      'EVENT_PHASE_START+PHASE_BATTLE_START': 'Start Step begins' },
    rg: { LOCATION_HAND: 'Hand', LOCATION_DECK: 'Deck', LOCATION_EXTRA: 'Extra Deck',
      LOCATION_GRAVE: 'GY', LOCATION_REMOVED: 'Banished', LOCATION_ONFIELD: 'On field',
      LOCATION_FIELD: 'On field', LOCATION_MZONE: 'Monster Zone', LOCATION_SZONE: 'S/T Zone',
      LOCATION_PZONE: 'Pendulum Zone', LOCATION_FZONE: 'Field Zone', LOCATION_BATTLE: 'Battle',
      LOCATION_OVERLAY: 'As Xyz Material' },
    cd: { EFFECT_UPDATE_ATTACK: 'ATK up/down', EFFECT_UPDATE_DEFENSE: 'DEF up/down',
      EFFECT_CANNOT_SPECIAL_SUMMON: 'Cannot Special Summon', EFFECT_SPSUMMON_PROC: 'Special Summon procedure',
      EFFECT_DISABLE: 'Disable', EFFECT_INDESTRUCTABLE_BATTLE: 'Battle indestructible',
      EFFECT_DISABLE_EFFECT: 'Negate effect (timed)', EFFECT_INDESTRUCTABLE_EFFECT: 'Effect indestructible',
      EFFECT_SET_ATTACK_FINAL: 'Set ATK (fixed)', EFFECT_CANNOT_ACTIVATE: 'Cannot activate',
      EFFECT_CANNOT_BE_EFFECT_TARGET: 'Cannot be targeted by effects', EFFECT_CANNOT_ATTACK: 'Cannot attack',
      EFFECT_IMMUNE_EFFECT: 'Unaffected by effects', EFFECT_DESTROY_REPLACE: 'Redirect destruction',
      EFFECT_PIERCE: 'Piercing damage', EFFECT_CHANGE_LEVEL: 'Change Level',
      EFFECT_DIRECT_ATTACK: 'Can attack directly', EFFECT_AVOID_BATTLE_DAMAGE: 'Take no battle damage',
      EFFECT_EXTRA_ATTACK: 'Multiple attacks', EFFECT_EQUIP_LIMIT: 'Equip limit',
      EFFECT_SUMMON_PROC: 'Summon procedure', EFFECT_SET_ATTACK: 'Set ATK',
      EFFECT_INDESTRUCTABLE_COUNT: 'Indestructible (N times)', EFFECT_SET_DEFENSE_FINAL: 'Set DEF (fixed)',
      EFFECT_ADD_TYPE: 'Add Type', EFFECT_CHANGE_DAMAGE: 'Change damage',
      EFFECT_CANNOT_DIRECT_ATTACK: 'Cannot attack directly', EFFECT_CHANGE_BATTLE_DAMAGE: 'Change battle damage',
      EFFECT_EXTRA_SUMMON_COUNT: 'Extra Normal Summon', EFFECT_CHANGE_ATTRIBUTE: 'Change Attribute',
      EFFECT_CHANGE_RACE: 'Change Type', EFFECT_CANNOT_CHANGE_POSITION: 'Cannot change battle position',
      EFFECT_TRAP_ACT_IN_SET_TURN: 'Trap: activate the turn set', EFFECT_CANNOT_BE_BATTLE_TARGET: 'Cannot be attack target',
      EFFECT_SPSUMMON_CONDITION: 'Special Summon condition', EFFECT_NO_EFFECT_DAMAGE: 'Take no effect damage',
      EFFECT_MUST_ATTACK: 'Must attack', EFFECT_CANNOT_BP: 'Skip Battle Phase',
      EFFECT_TRAP_ACT_IN_HAND: 'Trap: activate from hand', EFFECT_CANNOT_BE_SYNCHRO_MATERIAL: 'Cannot be Synchro Material',
      EFFECT_ATTACK_ALL: 'Attack all monsters', EFFECT_CANNOT_BE_LINK_MATERIAL: 'Cannot be Link Material',
      EFFECT_CANNOT_BE_XYZ_MATERIAL: 'Cannot be Xyz Material', EFFECT_CANNOT_BE_FUSION_MATERIAL: 'Cannot be Fusion Material',
      EFFECT_DOUBLE_TRIBUTE: 'Tribute as 2 monsters', EFFECT_REFLECT_BATTLE_DAMAGE: 'Reflect battle damage',
      EFFECT_SKIP_BP: 'Skip Battle Phase', EFFECT_DEFENSE_ATTACK: 'Attack using DEF',
      EFFECT_NO_BATTLE_DAMAGE: 'Inflict no battle damage',
      EFFECT_UPDATE_LEVEL: 'Level up/down', EFFECT_MATERIAL_CHECK: 'Material check',
      EFFECT_CANNOT_SELECT_BATTLE_TARGET: 'Attack target restriction', EFFECT_CANNOT_SUMMON: 'Cannot Normal Summon',
      EFFECT_CANNOT_TRIGGER: 'Cannot activate effect', EFFECT_CANNOT_ATTACK_ANNOUNCE: 'Cannot declare attack',
      EFFECT_SELF_DESTROY: 'Self-destruct', EFFECT_SET_BASE_ATTACK: 'Change original ATK',
      EFFECT_SET_DEFENSE: 'Set DEF', EFFECT_UNRELEASABLE_SUM: 'No Tribute for Tribute Summon',
      EFFECT_DISABLE_TRAPMONSTER: 'Disable Trap Monster', EFFECT_REMAIN_FIELD: 'Remains on field',
      EFFECT_EXTRA_ATTACK_MONSTER: 'Multiple attacks on monsters', EFFECT_CANNOT_MSET: 'Cannot Set monster',
      EFFECT_UNRELEASABLE_NONSUM: 'Cannot be Tributed', EFFECT_DESTROY_SUBSTITUTE: 'Destruction substitute',
      EFFECT_CHANGE_LSCALE: 'Change Left Scale', EFFECT_CHANGE_RSCALE: 'Change Right Scale',
      EFFECT_XYZ_LEVEL: 'Change Xyz Rank', EFFECT_ADD_SETCODE: 'Add archetype',
      EFFECT_CANNOT_TURN_SET: 'Cannot be Set face-down' },
    ui: { star: '★', rank: 'Rk', link: 'L', atk: 'ATK', def: 'DEF', unknown: '?',
      sameName: 'Same name as', member: 'Archetypes', refField: 'Referenced archetypes',
      related: 'Related cards', dbCat: 'Categories (DB)', scriptCat: 'Script categories',
      effType: 'Effect types', triggerEv: 'Trigger events', actRange: 'Activation zones',
      scriptTags: 'Effect tags', noScript: 'No script (Normal Monster etc.)',
      scriptNote: 'Derived from static analysis of the Lua script — heuristic, for reference',
      atkShort: 'ATK', defShort: 'DEF', scale: 'Scale', count: 'cards',
      attr: 'Attribute', race: 'Race', source: 'Data: ygocore-database / ygopro-scripts',
      pre: 'Pre-release', preNote: 'Pre-release card (from the preview pack; text available in Simplified Chinese only)',
      zhOnly: 'zh-CN', zhNote: 'Missing from this language database; shown with Simplified Chinese text',
      showToken: 'Show Tokens',
      fSr: 'Self-lock', srkSp: 'Special Summon lock', srkSm: 'Summon lock', srkSet: 'Set lock',
      srkFlip: 'Flip Summon lock', srkPos: 'Special Summon position lock', srOnly: 'only: ',
      srAll: 'all banned', srTurn: 'this turn', smPendulum: 'Pendulum Summon', smRitual: 'Ritual Summon',
      smFusion: 'Fusion Summon', smSynchro: 'Synchro Summon', smXyz: 'Xyz Summon',
      srkCount: 'Special Summon count limit', srPer: 'per turn', srBoth: 'both players', srkAct: 'Activation lock',
      g2title: 'Series cards matching Group-2',
      effectList: 'Effects (script registration order)', fEv: 'Trigger', fRg: 'Zone',
      fCat: 'Categories', fCd: 'Effect codes', fAct: 'Action', granted: 'Granted effect',
      fTg: 'Target', tgt: 'Targets', noTgt: "Doesn't target", fSel: 'Selects',
      fLimit: 'Limit', perTurn: 'per turn', sideself: 'own', sideopp: "opponent's",
      sideboth: 'both', pcs: ' cards',
      mon: 'Monster', spell: 'Spell', trap: 'Trap', faceup: 'Face-up', setdesc: 'Archetype', st: 'S/T',
      pself: 'self', popp: 'opponent', pboth: 'both players',
      pendEff: 'Pendulum Effect', monEff: 'Monster Effect', sameEff: 'Same effect required', selfCard: 'itself',
      fSs: 'Spell Speed', ss1: 'SS1', ss2: 'SS2', ss3: 'SS3',
      tabSearch: 'Search', tabRand: 'Random Deck',
      rSet: 'Draw settings', rMainN: 'Main Deck size', rMinMon: 'Min Monsters (opt.)', rMinSp: 'Min Spells (opt.)',
      rMinTr: 'Min Traps (opt.)', rExtraN: 'Extra Deck size', rCap: 'Copies per card', rPre: 'Include pre-release', rOt: 'Region',
      rRules: 'Exclusion rules', rAddRule: 'Add exclusion rule', rRuleEmpty: 'Pick at least one condition to exclude',
      rNoRules: 'None — add a rule to keep matching cards out of the pool',
      rFMain: 'Type (any)', rFSub: 'Subtypes (all required)', rFSubShort: 'Sub', rFAttr: 'Attribute (any)', rFRace: 'Race (any)', rFSet: 'Archetype',
      contSpell: 'Continuous Spell', contTrap: 'Continuous Trap',
      rBl: 'Follow banlist',
      blTitle: 'Banlist', bl0: 'Forbidden', bl1: 'Limited', bl2: 'Semi-Limited', blU: 'Unlimited',
      rHits: 'match', rExcl: 'Excluded cards', rClearExcl: 'Clear all',
      rPoolFile: 'Pool file', rExportPool: 'Export pool (JSON)', rImportPool: 'Import pool (JSON)',
      rSetPlaceholder: 'Archetype name or code…',
      rDraw: '🎲 Random Draw', rHistory: 'Draw history', rClearHist: 'Clear history',
      rExportYdk: 'Export .ydk', rExAll: 'Exclude this result', rExAllDone: 'Added {0} cards from this result to the exclusion list',
      rExcluded: 'added to exclusion list',
      rMainPool: 'Main pool', rExtraPool: 'Extra pool', rExtraDeck: 'Extra Deck',
      rEmpty: 'Nothing drawn yet — set the counts and press "Random Draw"',
      rLegal: 'Note: exceeds the usual size (Main 40–60 / Extra 0–15)',
      rErrNeg: 'Counts cannot be negative', rErrMinSum: 'Sum of minimums exceeds the Main Deck size',
      rErrShort: 'Not enough {0} cards: need {2}, only {1} available (after exclusions and per-card cap)',
      rErrMainShort: 'Not enough Main Deck cards: need {1}, only {0} available',
      rErrExtra: 'Not enough Extra Deck cards: need {1}, only {0} available',
      rImportBad: 'Invalid pool file (JSON exported by this tool required)',
      rImportOk: 'Imported: {0} excluded cards, {1} rules, {2} history entries',
      rImportConfirm: 'Importing replaces current settings, exclusions and history. Continue?',
      rHistEntry: 'Main {0} / Extra {1}', rAll: 'All' },
    act: { DESTROY: 'Destroy', NEGATE: 'Negate', REMOVE: 'Banish', TOHAND: 'Return to hand',
      TODECK: 'Return to deck', TOGRAVE: 'Send to GY', SPSUMMON: 'Special Summon',
      DRAW: 'Draw', DAMAGE: 'Inflict damage', RECOVER: 'Recover LP',
      POSITION: 'Change battle position', RELEASE: 'Tribute', CONTROL: 'Take control',
      EQUIP: 'Equip', MOVE: 'Move' }
  }
};

function loc(key) {
  var m = (L[STATE.locale] && L[STATE.locale][key]) || L['zh-CN'][key] || {};
  return function (t) { return m[t] || (L['zh-CN'][key] && L['zh-CN'][key][t]) || t; };
}

/* ================= 状态 ================= */

var STATE = {
  locale: 'zh-CN',
  q: '',
  main: [],      // 主类型位(任一)
  sub: [],       // 细分位(全部满足)
  attr: [],      // 属性位(任一)
  race: [],      // 种族位(任一)
  cats: [],      // 数据库效果分类位(任一)
  tags: [],      // 脚本标签(全部满足)
  tg: [],        // 效果明细:对象判定 1=取对象 0=不取对象(任一)
  acts: [],      // 效果明细:动作(任一)
  fdesc: [],     // 效果明细:卡片限定 MON/SPELL/TRAP/FACEUP(任一)
  pside: [],     // 效果明细:玩家方位 SELF/OPP/BOTH(含 BOTH 兼配)
  ss: [],        // 效果明细:咒文速度 1/2/3(任一)
  effStrict: false, // 效果明细严格模式:各条件须由同一效果满足
  dedupe: true,  // 同名卡存在有脚本版本时隐藏无脚本版本
  hideToken: true, // 默认隐藏衍生物
  setcode: 0,    // 字段代码(check_setcode 语义)
  lvMin: null, lvMax: null,
  scMin: null, scMax: null,
  atkMin: null, atkMax: null,
  defMin: null, defMax: null,
  ot: 0,         // 0=全部 1=仅OCG 2=仅TCG
  script: 0,     // 0=全部 1=有 2=无
  pre: 0,        // 0=全部 1=仅先行卡 2=排除先行卡
  bl: 0,         // 0=全部 1=禁止 2=限制 3=准限制 4=无限制(需构建时有禁限表)
  sortKey: 'id',
  sortDir: 1
};

var DATA = null;          // CARD_DATA
var STRS = null;          // CARD_STR
var META = null;          // CARD_META
var cardById = {};
var aliasIndex = {};
var hiddenIds = {};       // 同名无脚本卡(存在有脚本同名版本时隐藏)
var seriesIndex = {};     // setcode -> [卡id](系列联动搜索用)
var g2Matches = {};       // 第二组条件的全库命中集

/* 第二组(系列联动)条件:只使用能力维度,其余字段保持默认空值 */
var STATE2 = {
  q: '',
  main: [], sub: [], attr: [], race: [], cats: [], tags: [],
  tg: [], acts: [], fdesc: [], pside: [], ss: [],
  setcode: 0,
  lvMin: null, lvMax: null, scMin: null, scMax: null,
  atkMin: null, atkMax: null, defMin: null, defMax: null,
  ot: 0, script: 0, pre: 0, bl: 0, dedupe: false, hideToken: false,
  effStrict: false, sortKey: 'id', sortDir: 1, locale: 'zh-CN'
};

function g2ConditionsActive() {
  return !!(STATE2.q.trim() || STATE2.main.length || STATE2.sub.length ||
    STATE2.attr.length || STATE2.race.length || STATE2.cats.length ||
    STATE2.tags.length || STATE2.tg.length ||
    STATE2.acts.length || STATE2.fdesc.length || STATE2.pside.length ||
    ['lvMin', 'lvMax', 'atkMin', 'atkMax', 'defMin', 'defMax'].some(function (k) {
      return isNumeric(STATE2[k]);
    }));
}

function buildSeriesIndex() {
  seriesIndex = {};
  for (var i = 0; i < DATA.length; i++) {
    var c = DATA[i];
    var codes = memberSetcodes(c);
    for (var k = 0; k < codes.length; k++) {
      (seriesIndex[codes[k]] = seriesIndex[codes[k]] || []).push(c.id);
    }
  }
}

function seriesOf(c) {
  var seen = {}, out = [];
  var codes = memberSetcodes(c);
  for (var k = 0; k < codes.length; k++) {
    var bucket = seriesIndex[codes[k]] || [];
    for (var j = 0; j < bucket.length; j++) {
      if (!seen[bucket[j]]) { seen[bucket[j]] = 1; out.push(bucket[j]); }
    }
  }
  return out;
}

function seriesHasMatch(c) {
  if (!memberSetcodes(c).length) return false;
  var ids = seriesOf(c);
  for (var j = 0; j < ids.length; j++) {
    if (g2Matches[ids[j]]) return true;
  }
  return false;
}
var filtered = [];
var detailCardId = 0;   // 当前详情面板展示的卡(语言切换后重渲染用)
var setcodeCandidates = [];  // 字段自动完成候选(随语言重建)

/* ================= 工具 ================= */

function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function loadScript(src, cb) {
  var bid = (document.querySelector('meta[name="build"]') || {}).content || '';
  var s = document.createElement('script');
  s.src = src + (bid ? '?v=' + encodeURIComponent(bid) : '');
  s.onload = cb;
  s.onerror = function () { $('status').textContent = '加载失败: ' + src; };
  document.head.appendChild(s);
}
function decodeTypes(t) {
  var out = [];
  for (var i = 0; i < TYPE_ORDER.length; i++) {
    var bit = TYPE_BIT[TYPE_ORDER[i]];
    if (t & bit) out.push(bit);
  }
  return out;
}
function typeName(bit) {
  return (STRS && STRS.type[String(bit)]) || TYPE_NAMES[bit] || '?';
}
// 魔法/陷阱细分徽章图标:按实卡卡面符号手绘的矢量图(离线可用,各配醒目语义色)
var SUB_ICONS = {
  0x10000: { c: '#f0c040', svg: '<path fill="currentColor" d="M6.6 0 2.2 6.8h2.9L4.6 12 9.8 4.9H6.4Z"/>' },
  0x20000: { c: '#6db3f2', svg: '<circle cx="3.4" cy="6" r="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="8.6" cy="6" r="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/>' },
  0x40000: { c: '#7fd4a8', svg: '<path fill="currentColor" d="M5 .8h2v4.2h4.2v2H7v4.2H5V7H.8V5H5Z"/>' },
  0x80000: { c: '#c586c0', svg: '<circle cx="6" cy="6" r="4.7" fill="none" stroke="currentColor" stroke-width="1.2"/><ellipse cx="6" cy="6" rx="2.1" ry="4.7" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M1.3 6h9.4" fill="none" stroke="currentColor" stroke-width="1.1"/>' },
  0x100000: { c: '#ff7b72', svg: '<path d="M9.6 10.6V6.2A3.4 3.4 0 0 0 6.2 2.8H3.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path fill="currentColor" d="M5.2.7 1.4 2.8l3.8 2.1Z"/>' }
};
function typeBadgeText(bit) {
  var ic = SUB_ICONS[bit];
  return esc(typeName(bit)) +
    (ic ? ' <svg class="ticon" viewBox="0 0 12 12" style="color:' + ic.c + '" aria-hidden="true">' + ic.svg + '</svg>' : '');
}
// 细分筛选 chip 标签:伪位(永续魔法/永续陷阱)走三语文案,其余走类型名表
function subBitName(bit) {
  if (bit === SUB_CONT_SPELL) return loc('ui')('contSpell');
  if (bit === SUB_CONT_TRAP) return loc('ui')('contTrap');
  return typeName(bit);
}
function isPseudoSubBit(bit) {
  return bit === SUB_CONT_SPELL || bit === SUB_CONT_TRAP;
}
function attrName(bit) { return (STRS && STRS.attr[String(bit)]) || ''; }
function raceName(bit) { return (STRS && STRS.race[String(bit)]) || ''; }
function catName(bit) { return (STRS && STRS.cat[String(bit)]) || ''; }
function setcodeName(code) { return (STRS && STRS.setname[code.toString(16)]) || ''; }

function setcodeSlots(c) {
  var out = [], sc = c.sc;
  for (var i = 0; i < 4; i++) {
    var v = (sc >>> (16 * i)) & 0xffff;
    if (v) out.push(v);
  }
  var sm = META && META.script[String(c.id)];
  if (sm && sm.snm) {
    for (var k = 0; k < sm.snm.length; k++) out.push(sm.snm[k]);
  }
  return out;
}
// 与 ygopro-core check_setcode 一致
function matchSetcode(c, q) {
  if (!q) return true;
  var settype = q & 0xfff, setsubtype = q & 0xf000;
  var slots = setcodeSlots(c);
  for (var i = 0; i < slots.length; i++) {
    var s = slots[i];
    if (s && (s & 0xfff) === settype && (s & setsubtype) === setsubtype) return true;
  }
  return false;
}
function memberSetcodes(c) {
  var seen = {}, out = [];
  var slots = setcodeSlots(c);
  for (var i = 0; i < slots.length; i++) {
    var s = slots[i];
    var parent = s & 0xfff;
    [[s], parent !== s ? [parent] : []].forEach(function (pair) {
      var code = pair[0];
      if (code && !seen[code]) { seen[code] = 1; out.push(code); }
    });
  }
  return out;
}
function levelParts(c) {
  return {
    lv: c.lv & 0xff,
    lscale: (c.lv >>> 24) & 0xff,
    rscale: (c.lv >>> 16) & 0xff,
    marker: (c.lv >>> 8) & 0x1ff
  };
}
function fmtAtk(v) { return (v === -1 || v === -2) ? '？' : String(v); }
function circled(n) {
  return (n >= 1 && n <= 20) ? String.fromCharCode(0x2460 + n - 1) : ('(' + n + ')');
}
// 全角→半角归一化(全角 ASCII 区 U+FF01-FF5E 与全角空格 U+3000),并转小写
function normText(s) {
  var out = '';
  s = String(s == null ? '' : s);
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c === 0x3000) { out += ' '; continue; }
    if (c >= 0xFF01 && c <= 0xFF5E) { out += String.fromCharCode(c - 0xFEE0); continue; }
    out += s.charAt(i);
  }
  return out.toLowerCase();
}

function isNumeric(v) { return v !== null && v !== undefined && v !== '' && !isNaN(v); }

/* ================= 筛选与搜索 ================= */

// 咒文速度(官方规则):陷阱全部二速、反击陷阱三速;魔法速攻二速其余一速;
// 怪兽效果按 et(诱发即时=2;起动/诱发/反转=1;永续/手续等非发动型=不进连锁)
function effSpellSpeed(c, eff) {
  var et = (eff && eff.et) || [];
  if (c.t & 0x4) return (c.t & 0x100000) ? 3 : 2; // 陷阱:反击三速,其余(通常/永续)二速
  if (c.t & 0x2) return (c.t & 0x10000) ? 2 : 1;  // 魔法:速攻二速,其余一速
  if (et.indexOf('EFFECT_TYPE_QUICK_O') >= 0 || et.indexOf('EFFECT_TYPE_QUICK_F') >= 0) return 2;
  if (et.indexOf('EFFECT_TYPE_IGNITION') >= 0 || et.indexOf('EFFECT_TYPE_TRIGGER_O') >= 0 ||
      et.indexOf('EFFECT_TYPE_TRIGGER_F') >= 0 || et.indexOf('EFFECT_TYPE_FLIP') >= 0) return 1;
  return null;
}

function tokenMatch(card, terms) {
  if (!terms.length) return true;
  var hay = normText(card.n + '\n' + card.d + '\n' + card.id);
  for (var i = 0; i < terms.length; i++) {
    if (hay.indexOf(terms[i]) === -1) return false;
  }
  return true;
}

function passFilters(c, st) {
  var t = c.t;

  if (st.main.length) {
    var okMain = false;
    for (var i = 0; i < st.main.length; i++) if (t & st.main[i]) { okMain = true; break; }
    if (!okMain) return false;
  }
  for (var j = 0; j < st.sub.length; j++) {
    var need = st.sub[j];
    if (need === SUB_CONT_SPELL) {
      if (!((t & 0x20000) && (t & 0x2))) return false;
    } else if (need === SUB_CONT_TRAP) {
      if (!((t & 0x20000) && (t & 0x4))) return false;
    } else if (!(t & need)) {
      return false;
    }
  }
  if (st.attr.length) {
    var okA = false;
    for (var a = 0; a < st.attr.length; a++) if (c.at & st.attr[a]) { okA = true; break; }
    if (!okA) return false;
  }
  if (st.race.length) {
    var okR = false;
    for (var r = 0; r < st.race.length; r++) if (c.r & st.race[r]) { okR = true; break; }
    if (!okR) return false;
  }
  if (st.cats.length) {
    var okC = false;
    for (var k = 0; k < st.cats.length; k++) if (c.cat & st.cats[k]) { okC = true; break; }
    if (!okC) return false;
  }
  if (st.tags.length) {
    var sm = META.script[String(c.id)];
    if (!sm) return false;
    for (var g = 0; g < st.tags.length; g++) {
      if (sm.tags.indexOf(st.tags[g]) === -1) return false;
    }
  }
  // 效果明细筛选:对象判定、动作、卡片限定、玩家方位
  // 默认卡片级 AND(各行可由不同效果满足);effStrict 时须同一效果满足全部行
  if (st.tg.length || st.acts.length || st.fdesc.length || st.pside.length || st.ss.length) {
    var sm2 = META.script[String(c.id)];
    var effs = (sm2 && sm2.eff) || [];
    var effSides = function (e) {
      var sides = [];
      if (e.ap) {
        Object.keys(e.ap).forEach(function (k) {
          var s = e.ap[k];
          // 选"对方玩家/自己"时,作用双方的效果也算命中
          if (s === 'BOTH') sides.push('SELF', 'OPP', 'BOTH');
          else sides.push(s);
        });
      }
      // 对象/选择的方位(对方场上的卡也视为作用对方)
      [e.tsd, e.ssd].forEach(function (s) {
        if (!s) return;
        if (s === 'BOTH') sides.push('SELF', 'OPP', 'BOTH');
        else sides.push(s);
      });
      return sides;
    };
    var effMatch = function (e) {
      if (st.ss.length) {
        var s2 = effSpellSpeed(c, e);
        if (!s2 || st.ss.indexOf(s2) < 0) return false;
      }
      if (st.tg.length && st.tg.indexOf(e.tg) < 0) return false;
      if (st.acts.length) {
        // 严格模式:选中的动作须存在,且其追溯到的对象满足限定/方位;
        // 对象追溯不到(复杂写法)则该动词不计入命中,避免跨部分误关联
        var ok = st.acts.some(function (a) {
          if ((e.act || []).indexOf(a) < 0) return false;
          var obj = (e.ao && e.ao[a]) || null;
          if (st.fdesc.length) {
            if (!obj) return false;
            var pool = obj.f || [];
            if (!pool.some(function (d) { return st.fdesc.indexOf(d) >= 0; })) return false;
          }
          if (st.pside.length) {
            if (!obj) return false;
            var arr = obj.s ? [obj.s] : [];
            var exp = [];
            arr.forEach(function (s) {
              if (s === 'BOTH') exp.push('SELF', 'OPP', 'BOTH');
              else if (s) exp.push(s);
            });
            if (!st.pside.some(function (q) { return exp.indexOf(q) >= 0; })) return false;
          }
          return true;
        });
        if (!ok) return false;
      } else {
        if (st.fdesc.length && !(e.tf || []).concat(e.sf || []).some(function (d) { return st.fdesc.indexOf(d) >= 0; })) return false;
        if (st.pside.length) {
          var sides2 = effSides(e);
          if (!st.pside.some(function (q) { return sides2.indexOf(q) >= 0; })) return false;
        }
      }
      return true;
    };
    if (st.effStrict) {
      if (!effs.some(effMatch)) return false;
    } else {
      if (st.ss.length && !effs.some(function (e) {
        var s3 = effSpellSpeed(c, e);
        return s3 && st.ss.indexOf(s3) >= 0;
      })) return false;
      if (st.tg.length && !effs.some(function (e) { return st.tg.indexOf(e.tg) >= 0; })) return false;
      if (st.acts.length && !effs.some(function (e) {
        return (e.act || []).some(function (a) { return st.acts.indexOf(a) >= 0; });
      })) return false;
      if (st.fdesc.length && !effs.some(function (e) {
        return (e.tf || []).concat(e.sf || []).some(function (d) { return st.fdesc.indexOf(d) >= 0; });
      })) return false;
      if (st.pside.length && !effs.some(function (e) {
        var sides3 = effSides(e);
        return st.pside.some(function (q) { return sides3.indexOf(q) >= 0; });
      })) return false;
    }
  }
  if (!matchSetcode(c, st.setcode)) return false;

  if (st.ot === 1 && !(c.ot & 1)) return false;
  if (st.ot === 2 && !(c.ot & 2)) return false;
  if (st.script === 1 && !c.hs) return false;
  if (st.script === 2 && c.hs) return false;
  if (st.pre === 1 && !c.pre) return false;
  if (st.pre === 2 && c.pre) return false;
  // 禁限(bl: 0=禁止 1=限制 2=准限制,无字段=无限制;仅构建时有禁限表的卡才带 bl)
  if (st.bl === 1 && c.bl !== 0) return false;
  if (st.bl === 2 && c.bl !== 1) return false;
  if (st.bl === 3 && c.bl !== 2) return false;
  if (st.bl === 4 && c.bl !== undefined) return false;

  var lp = levelParts(c);
  if (isNumeric(st.lvMin) && lp.lv < +st.lvMin) return false;
  if (isNumeric(st.lvMax) && lp.lv > +st.lvMax) return false;
  var pend = (t & 0x1000000) && !(t & 0x4000);
  if (isNumeric(st.scMin) && (!pend || lp.lscale < +st.scMin)) return false;
  if (isNumeric(st.scMax) && (!pend || lp.lscale > +st.scMax)) return false;
  var isMon = t & 0x1;
  if (isNumeric(st.atkMin) && (!isMon || c.atk < +st.atkMin)) return false;
  if (isNumeric(st.atkMax) && (!isMon || c.atk > +st.atkMax)) return false;
  if (isNumeric(st.defMin)) {
    if (!isMon || (t & 0x4000000) || c.def < +st.defMin) return false; // Link 无守备
  }
  if (isNumeric(st.defMax)) {
    if (!isMon || (t & 0x4000000) || c.def > +st.defMax) return false;
  }
  return true;
}

function refresh() {
  if (!DATA) return;
  var terms = normText(STATE.q.trim()).split(/\s+/).filter(Boolean);
  // 第二组(系列条件):先全库算命中集,再要求第一组结果的同系列中有命中卡
  var g2Active = g2ConditionsActive();
  g2Matches = {};
  if (g2Active) {
    var g2terms = normText(STATE2.q.trim()).split(/\s+/).filter(Boolean);
    for (var gi = 0; gi < DATA.length; gi++) {
      if (passFilters(DATA[gi], STATE2) && tokenMatch(DATA[gi], g2terms)) {
        g2Matches[DATA[gi].id] = 1;
      }
    }
  }
  filtered = [];
  for (var i = 0; i < DATA.length; i++) {
    var c1 = DATA[i];
    if (!passFilters(c1, STATE)) continue;
    if (STATE.dedupe && hiddenIds[c1.id]) continue;
    if (STATE.hideToken && (c1.t & 0x4000)) continue;
    if (!tokenMatch(c1, terms)) continue;
    if (g2Active && !seriesHasMatch(c1)) continue;
    filtered.push(c1);
  }
  var key = STATE.sortKey, dir = STATE.sortDir;
  var locTag = { 'zh-CN': 'zh-Hans-CN', 'ja-JP': 'ja', 'en-US': 'en' }[STATE.locale] || 'en';
  filtered.sort(function (a, b) {
    var va, vb;
    if (key === 'name') {
      return dir * String(a.n || '').localeCompare(String(b.n || ''), locTag);
    }
    if (key === 'lv') { va = a.lv & 0xff; vb = b.lv & 0xff; }
    else { va = a[key]; vb = b[key]; }
    va = (va === undefined || va === null) ? -1e9 : va;
    vb = (vb === undefined || vb === null) ? -1e9 : vb;
    if (va < vb) return -dir;
    if (va > vb) return dir;
    return a.id - b.id;
  });
  $('resultCount').innerHTML = '共 <b>' + filtered.length.toLocaleString() +
    '</b> ' + esc(loc('ui')('count') || '张卡') +
    ' / ' + DATA.length.toLocaleString();
  listState.start = -1;
  renderList();
  writeHash();
}

/* ================= 虚拟滚动 ================= */

var ROW_H = 74;
var listState = { start: -1, n: 0 };

function renderList() {
  var wrap = $('listWrap');
  var el = $('list');
  el.style.height = filtered.length * ROW_H + 'px';
  var start = Math.max(0, Math.floor(wrap.scrollTop / ROW_H) - 8);
  var n = Math.ceil(wrap.clientHeight / ROW_H) + 16;
  if (start === listState.start && n === listState.n) return;
  listState.start = start; listState.n = n;
  var html = [];
  for (var i = start; i < Math.min(start + n, filtered.length); i++) {
    html.push(rowHtml(filtered[i], i));
  }
  el.innerHTML = html.join('');
}

// 卡类框色判定:魔法绿/陷阱粉;怪兽按召唤法细分(对齐实卡卡框色系)
function frameClassOf(c) {
  var t = c.t;
  if (t & 0x2) return 'f-spl';
  if (t & 0x4) return 'f-trp';
  if (t & 0x1000000) { // 灵摆:上半取其余细分色(融合>同调>超量>链接>仪式>效果>通常)
    if (t & 0x40) return 'f-pend-fus';
    if (t & 0x2000) return 'f-pend-syn';
    if (t & 0x800000) return 'f-pend-xyz';
    if (t & 0x4000000) return 'f-pend-lnk';
    if (t & 0x80) return 'f-pend-rit';
    if (t & 0x20) return 'f-pend';
    return 'f-pend-norm';
  }
  if (t & 0x40) return 'f-fus';
  if (t & 0x2000) return 'f-syn';
  if (t & 0x800000) return 'f-xyz';
  if (t & 0x4000000) return 'f-lnk';
  if (t & 0x80) return 'f-rit';
  if (t & 0x20) return 'f-eff';
  return 'f-norm';
}

// 搜索结果行(色框方案):整行 2.5px 同色外框,怪兽按召唤法细分取色
// (效果橙/通常米黄/仪式青蓝/融合紫/同调白/超量银灰/链接蓝;灵摆上 60% 怪兽色下 40% 绿)
function rowHtml(c, idx) {
  var ui = loc('ui');
  var bits = decodeTypes(c.t);
  var frameCls = frameClassOf(c);
  var pendFrame = frameCls.indexOf('f-pend') === 0 ? ' pend-frame' : '';

  // 第一行右侧数值:★/阶/Link · ATK · DEF · 灵摆刻度
  var num = [];
  if (c.t & 0x1) {
    var lp = levelParts(c);
    var lvLabel;
    if (c.t & 0x4000000) lvLabel = ui('link') + lp.lv;
    else if (c.t & 0x800000) lvLabel = ui('rank') + lp.lv;
    else lvLabel = ui('star') + lp.lv;
    if (c.t & 0x1000) lvLabel += '·T';
    num.push('<span class="st">' + lvLabel + '</span>');
    num.push('<span class="lb">' + ui('atkShort') + '</span> ' + fmtAtk(c.atk));
    if (!(c.t & 0x4000000)) {
      num.push('<span class="lb">' + ui('defShort') + '</span> ' + fmtAtk(c.def));
    }
    if ((c.t & 0x1000000) && !(c.t & 0x4000)) {
      num.push('<span class="lb">' + ui('scale') + '</span> ' + lp.lscale + '/' + lp.rscale);
    }
  }

  // 第一行状态徽章:先行/简中/禁限
  var head = [];
  if (c.pre) head.push('<span class="badge pre">' + esc(ui('pre')) + '</span>');
  else if (c.zl) head.push('<span class="badge zhonly">' + esc(ui('zhOnly')) + '</span>');
  if (c.bl === 0) head.push('<span class="badge bl0">' + esc(ui('bl0')) + '</span>');
  else if (c.bl === 1) head.push('<span class="badge bl1">' + esc(ui('bl1')) + '</span>');
  else if (c.bl === 2) head.push('<span class="badge bl2">' + esc(ui('bl2')) + '</span>');

  // 第二行胶囊:属性(填充) → 种族(描边) → 卡类徽章(色) → 其余类型 → 标签右靠
  var meta = [];
  if (c.t & 0x1 && c.at) {
    for (var a = 0; a < ATTR_BITS.length; a++) {
      if (c.at & ATTR_BITS[a]) {
        var ab = ATTR_BITS[a];
        var dark = (ab === 0x10 || ab === 0x40); // 光/神用深色字
        meta.push('<span class="pill attr' + (dark ? ' dk' : '') + '" style="--ac:' +
          (ATTR_COLORS[ab] || '#888') + '">' + esc(attrName(ab)) + '</span>');
        break;
      }
    }
  }
  if (c.t & 0x1) {
    for (var r = 0; r < 26; r++) {
      if (c.r & (1 << r)) {
        meta.push('<span class="pill race">' + esc(raceName(1 << r)) + '</span>');
        break;
      }
    }
  }
  for (var i = 0; i < bits.length; i++) {
    var b = bits[i];
    if (b === 0x1 || b === 0x2 || b === 0x4) {
      meta.push('<span class="badge kindb">' + esc(typeName(b)) + '</span>');
    } else {
      var cls = 'badge';
      if (b === 0x4000000) cls += ' t-link';
      else if (b === 0x1000000) cls += ' t-pendulum';
      meta.push('<span class="' + cls + '">' + typeBadgeText(b) + '</span>');
    }
  }
  var sm = META.script[String(c.id)];
  if (sm && sm.tags && sm.tags.length) {
    var tl = loc('tags');
    var parts = [];
    for (var g = 0; g < sm.tags.length && g < 3; g++) {
      parts.push('<span class="badge tag">' + esc(tl(sm.tags[g])) + '</span>');
    }
    meta.push('<span class="sp"></span>' + parts.join(''));
  }

  return '<div class="cardrow ' + frameCls + pendFrame + '" data-i="' + idx + '" style="top:' + (idx * ROW_H) + 'px">' +
    '<div class="r1"><span class="cname">' + esc(c.n) + '</span>' +
    '<span class="cid">' + c.id + '</span>' + head.join('') +
    (num.length ? '<span class="num">' + num.join('<span class="lb"> · </span>') + '</span>' : '') + '</div>' +
    '<div class="r2">' + meta.join('') + '</div>' +
    '</div>';
}

/* ================= 详情 ================= */

function openCard(id) {
  var c = cardById[id];
  if (!c) return;
  detailCardId = id;
  var ui = loc('ui');
  var sm = META.script[String(c.id)];
  var bits = decodeTypes(c.t);
  var h = ['<button class="close" title="关闭 (Esc)">✕</button>'];

  // 卡名区:与列表行同款的卡类色外框
  var fc = frameClassOf(c);
  h.push('<div class="dhead ' + fc + (fc.indexOf('f-pend') === 0 ? ' pend-frame' : '') + '">');
  h.push('<h2>' + esc(c.n) + '</h2>');
  h.push('<div class="dsub">' + c.id +
    (c.pre ? ' · <span class="preflag">' + esc(loc('ui')('pre')) + '</span>' : '') +
    (c.zl ? ' · <span class="preflag">' + esc(loc('ui')('zhOnly')) + '</span>' : '') +
    (c.ot === 1 ? ' · OCG' : c.ot === 2 ? ' · TCG' : '') + '</div>');
  if (c.pre) {
    h.push('<div class="note" style="margin:0 0 8px">' + esc(loc('ui')('preNote')) + '</div>');
  } else if (c.zl) {
    h.push('<div class="note" style="margin:0 0 8px">' + esc(loc('ui')('zhNote')) + '</div>');
  }

  // 类型徽章
  var badges = [];
  if (c.pre) badges.push('<span class="badge pre">' + esc(loc('ui')('pre')) + '</span>');
  else if (c.zl) badges.push('<span class="badge zhonly">' + esc(loc('ui')('zhOnly')) + '</span>');
  if (c.bl === 0) badges.push('<span class="badge bl0">' + esc(loc('ui')('bl0')) + '</span>');
  else if (c.bl === 1) badges.push('<span class="badge bl1">' + esc(loc('ui')('bl1')) + '</span>');
  else if (c.bl === 2) badges.push('<span class="badge bl2">' + esc(loc('ui')('bl2')) + '</span>');
  for (var i = 0; i < bits.length; i++) {
    var b = bits[i];
    var cls = 'badge';
    if (b === 0x1) cls += ' t-monster cat-mon';
    else if (b === 0x2) cls += ' t-spell';
    else if (b === 0x4) cls += ' t-trap';
    else if (b === 0x4000000) cls += ' t-link';
    else if (b === 0x1000000) cls += ' t-pendulum';
    badges.push('<span class="' + cls + '">' + typeBadgeText(b) + '</span>');
  }
  h.push('<div class="dbadges">' + badges.join('') + '</div>');
  h.push('</div>'); // /dhead

  // 同名卡
  if (c.al && c.al !== c.id && cardById[c.al]) {
    h.push('<div class="dbadges" style="margin-top:8px"><span class="chip small linkchip" data-goto="' +
      c.al + '">↪ ' + esc(ui('sameName')) + ': ' + esc(cardById[c.al].n) + '</span></div>');
  }
  var rev = aliasIndex[c.id];
  if (rev && rev.length) {
    var revHtml = [];
    for (var ri = 0; ri < rev.length; ri++) {
      revHtml.push('<span class="chip small linkchip" data-goto="' + rev[ri] + '">' +
        esc(cardById[rev[ri]].n) + ' (' + rev[ri] + ')</span>');
    }
    h.push('<div class="dbadges" style="margin-top:6px">' + revHtml.join('') + '</div>');
  }

  // 怪兽数值
  if (c.t & 0x1) {
    var lp = levelParts(c);
    var cells = [];
    for (var a = 0; a < ATTR_BITS.length; a++) {
      if (c.at & ATTR_BITS[a]) {
        cells.push('<div class="cell"><span class="k">' + esc(ui('attr')) +
          '</span><span class="v" style="color:' + (ATTR_COLORS[ATTR_BITS[a]] || '#fff') +
          '">● ' + esc(attrName(ATTR_BITS[a])) + '</span></div>');
        break;
      }
    }
    var races = [];
    for (var rr = 0; rr < 26; rr++) {
      if (c.r & (1 << rr)) races.push(esc(raceName(1 << rr)));
    }
    cells.push('<div class="cell"><span class="k">' + esc(ui('race')) + '</span><span class="v">' +
      (races.join('/') || '-') + '</span></div>');
    var lvName = (c.t & 0x4000000) ? ui('link') : (c.t & 0x800000) ? ui('rank') : ui('star');
    cells.push('<div class="cell"><span class="k">' + lvName + '</span><span class="v">' + lp.lv + '</span></div>');
    cells.push('<div class="cell"><span class="k">' + ui('atkShort') + '</span><span class="v">' + fmtAtk(c.atk) + '</span></div>');
    if (!(c.t & 0x4000000)) {
      cells.push('<div class="cell"><span class="k">' + ui('defShort') + '</span><span class="v">' + fmtAtk(c.def) + '</span></div>');
    }
    if ((c.t & 0x1000000) && !(c.t & 0x4000)) {
      cells.push('<div class="cell"><span class="k">' + ui('scale') + '</span><span class="v">' +
        lp.lscale + ' / ' + lp.rscale + '</span></div>');
    }
    h.push('<div class="dstat" style="margin-top:12px">' + cells.join('') + '</div>');
    if (c.t & 0x4000000 && lp.marker) {
      var arrows = [];
      var MK = [[0x001, '↙'], [0x002, '↓'], [0x004, '↘'], [0x008, '←'], [0x020, '→'],
        [0x040, '↖'], [0x080, '↑'], [0x100, '↗']];
      for (var m = 0; m < MK.length; m++) if (lp.marker & MK[m][0]) arrows.push(MK[m][1]);
      h.push('<div style="margin-top:6px;font-size:18px;letter-spacing:4px;color:#6db3f2">' +
        arrows.join('') + '</div>');
    }
  }

  // 所属字段
  var mem = memberSetcodes(c);
  if (mem.length) {
    var memHtml = [];
    for (var mi = 0; mi < mem.length; mi++) {
      var nm = setcodeName(mem[mi]);
      memHtml.push('<span class="chip small">' + esc(nm || ('0x' + mem[mi].toString(16))) +
        (nm ? '' : '') + '</span>');
    }
    h.push('<h4>' + esc(ui('member')) + '</h4><div class="dbadges">' + memHtml.join('') + '</div>');
  }

  // 效果描述
  h.push('<h4>——</h4><div class="desc">' + esc(c.d) + '</div>');

  // 数据库效果分类
  var catChips = [];
  for (var cb = 0; cb < 32; cb++) {
    if (c.cat & (1 << cb)) {
      var cn = catName((1 << cb) >>> 0);
      if (cn) catChips.push('<span class="chip small">' + esc(cn) + '</span>');
    }
  }
  if (catChips.length) {
    h.push('<h4>' + esc(ui('dbCat')) + '</h4><div class="dbadges">' + catChips.join('') + '</div>');
  }

  // 脚本分析
  if (sm) {
    h.push('<h4>' + esc(ui('scriptTags')) + '</h4>');
    var tl = loc('tags');
    var sec1 = [];
    for (var st = 0; st < sm.tags.length; st++) {
      sec1.push('<span class="chip small on">' + esc(tl(sm.tags[st])) + '</span>');
    }
    if (sec1.length) h.push('<div class="dbadges">' + sec1.join('') + '</div>');

    // 逐效果明细:标题行(类型+触发)+ 属性网格;赋予效果 ↳ 标示不占编号;
    // 灵摆怪兽按发动区域拆分为 灵摆效果(灵摆区)/怪兽效果 两节,各自独立编号
    if (sm.eff && sm.eff.length) {
      var etl = loc('et'), evl = loc('ev'), rgl = loc('rg'), cl = loc('cat'),
          cdl = loc('cd'), al = loc('act');
      var SIDE = { SELF: 'sideself', OPP: 'sideopp', BOTH: 'sideboth' };
      var P_SIDE = { SELF: 'pself', OPP: 'popp', BOTH: 'pboth' };
      var descLabel = function (tok) {
        if (tok === 'MON') return ui('mon');
        if (tok === 'SPELL') return ui('spell');
        if (tok === 'TRAP') return ui('trap');
        if (tok === 'ST') return ui('st');
        if (tok === 'FACEUP') return ui('faceup');
        if (tok.indexOf('SET:') === 0) {
          var sc = parseInt(tok.slice(4), 16);
          return ui('setdesc') + ':' + (setcodeName(sc) || ('0x' + sc.toString(16)));
        }
        return tok;
      };
      // 展示层去冗余:已显示"怪兽区/魔陷区"时不再重复"怪兽/魔陷"限定(筛选仍可用)
      var dispDesc = function (descs, zones) {
        return (descs || []).filter(function (t) {
          if (t === 'MON' && zones && zones.indexOf('LOCATION_MZONE') >= 0) return false;
          if (t === 'ST' && zones && zones.indexOf('LOCATION_SZONE') >= 0) return false;
          return true;
        });
      };
      var renderEffs = function (list) {
        var numIdx = 0;
        for (var ei = 0; ei < list.length; ei++) {
        var ef = list[ei];
        var headParts = [];
        if (ef.et.length) headParts.push('<span class="efftypes">' + esc(ef.et.map(etl).join(' + ')) + '</span>');
        if (ef.ev.length) headParts.push('<span class="efftrig">' + esc(ui('fEv') + ': ' + ef.ev.map(evl).join(' + ')) + '</span>');
        var items = [];
        function item(k, v) {
          items.push('<div class="effitem"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>');
        }
        var ss = effSpellSpeed(c, ef);
        if (ss) item(ui('fSs'), String(ss));
        if (ef.rg.length) item(ui('fRg'), ef.rg.map(rgl).join(' + '));
        if (ef.cat.length) item(ui('fCat'), ef.cat.map(cl).join(' + '));
        if (ef.cd && ef.cd.length) item(ui('fCd'), ef.cd.map(cdl).join(' + '));
        if (ef.tg != null) {
          if (ef.tg) {
            var tgd = [];
            if (ef.tsd) tgd.push(ui(SIDE[ef.tsd]));
            if (ef.tz && ef.tz.length) tgd.push(ef.tz.map(rgl).join(' + '));
            var dtf = dispDesc(ef.tf, ef.tz);
            if (dtf.length) tgd.push(dtf.map(descLabel).join(' + '));
            if (ef.tn) tgd.push(ef.tn[0] === ef.tn[1] ? ('×' + ef.tn[0])
              : (ef.tn[0] + '~' + ef.tn[1] + ui('pcs')));
            item(ui('fTg'), ui('tgt') + (tgd.length ? '(' + tgd.join(' ') + ')' : ''));
          } else {
            item(ui('fTg'), ui('noTgt'));
          }
        }
        if (ef.sz && ef.sz.length) {
          var szd = [];
          if (ef.ssd) szd.push(ui(SIDE[ef.ssd]));
          szd.push(ef.sz.map(rgl).join(' + '));
          var dsf = dispDesc(ef.sf, ef.sz);
          if (dsf.length) szd.push(dsf.map(descLabel).join(' + '));
          item(ui('fSel'), szd.join(' '));
        }
        // 自肃:限制种类 + 作用方位 + 仅限内容 + 适用召唤法 + 时长
        if (ef.sr) {
          var SRK = { SPSUMMON: 'srkSp', SUMMON: 'srkSm', SET: 'srkSet', FLIP: 'srkFlip', POS: 'srkPos', SPCOUNT: 'srkCount', ACT: 'srkAct' };
          var srParts = [];
          if (ef.srs === 'BOTH') srParts.push(ui('srBoth'));
          if (ef.sra && ef.sra.length) {
            srParts.push(ui('srOnly') + ef.sra.map(function (tok) {
              if (tok.indexOf('SET:') === 0) {
                var sc2 = parseInt(tok.slice(4), 16);
                return ui('setdesc') + ':' + (setcodeName(sc2) || ('0x' + sc2.toString(16)));
              }
              if (tok.indexOf('RACE:') === 0) {
                var rb = RACE_TOKEN_BITS[tok.slice(5)];
                return rb ? raceName(rb) : tok.slice(5);
              }
              if (tok.indexOf('TYPE:') === 0) {
                var tb = TYPE_BIT[tok.slice(5)];
                return tb ? typeName(tb) : tok.slice(5);
              }
              if (tok.indexOf('ATTR:') === 0) {
                var ab = ATTR_TOKEN_BITS[tok.slice(5)];
                return ab ? attrName(ab) : tok.slice(5);
              }
              return tok;
            }).join(' + '));
          } else if (ef.srk !== 'SPCOUNT') {
            srParts.push(ui('srAll'));
          }
          if (ef.srm && SUMMON_METHOD_KEYS[ef.srm]) srParts.push(ui(SUMMON_METHOD_KEYS[ef.srm]));
          if (ef.srd === 'TURN') srParts.push(ui('srTurn'));
          var srKindL = (ef.srk === 'SPCOUNT')
            ? ui('srkCount') + ' ' + (ef.srn || 1) + ' ' + ui('srPer')
            : ui(SRK[ef.srk] || 'srkSp');
          item(ui('fSr'), srKindL + '(' + srParts.join(' · ') + ')');
        }
        if (ef.act && ef.act.length) {
          var actv = ef.act.map(function (a) {
            var lb = al(a);
            if (ef.ap && ef.ap[a]) lb += '(' + ui(P_SIDE[ef.ap[a]]) + ')';
            var obj = ef.ao && ef.ao[a];
            if (obj) {
              var ob = [];
              if (obj.self) ob.push(ui('selfCard'));
              else if (obj.s) ob.push(ui(SIDE[obj.s]));
              if (obj.z && obj.z.length) ob.push(obj.z.map(rgl).join(' + '));
              var odf = dispDesc(obj.f, obj.z);
              if (odf.length) ob.push(odf.map(descLabel).join(' + '));
              if (ob.length) lb += '(' + ob.join(' ') + ')';
            }
            return lb;
          });
          item(ui('fAct'), actv.join(' + '));
        }
        if (ef.cl) item(ui('fLimit'), ef.cl + ' ' + ui('perTurn'));
        if (!headParts.length && !items.length) continue;
        var head;
        if (ef.g) {
          head = '<span class="effnum">↳</span><span class="effgrant">' + esc(ui('granted')) + '</span>' + headParts.join('');
        } else {
          numIdx++;
          head = '<span class="effnum">' + circled(numIdx) + '</span>' + headParts.join('');
        }
        h.push('<div class="effcard' + (ef.g ? ' granted' : '') + '">' +
          '<div class="effhead">' + head + '</div>' +
          (items.length ? '<div class="effgrid">' + items.join('') + '</div>' : '') +
          '</div>');
        }
      };
      var isPend = (c.t & 0x1000000) && !(c.t & 0x4000);
      var pendEffs = [], monEffs = [];
      if (isPend) {
        sm.eff.forEach(function (e) {
          ((e.rg || []).indexOf('LOCATION_PZONE') >= 0 ? pendEffs : monEffs).push(e);
        });
      }
      if (isPend && pendEffs.length && monEffs.length) {
        h.push('<h4>' + esc(ui('pendEff')) + '</h4>');
        renderEffs(pendEffs);
        h.push('<h4>' + esc(ui('monEff')) + '</h4>');
        renderEffs(monEffs);
      } else {
        h.push('<h4>' + esc(ui('effectList')) + '</h4>');
        renderEffs(sm.eff);
      }
    }

    if (sm.ref && sm.ref.length) {
      var sec5 = [];
      for (var sf = 0; sf < sm.ref.length; sf++) {
        var rn = setcodeName(sm.ref[sf]);
        sec5.push('<span class="chip small">' + esc(rn || ('0x' + sm.ref[sf].toString(16))) + '</span>');
      }
      h.push('<h4>' + esc(ui('refField')) + '</h4><div class="dbadges">' + sec5.join('') + '</div>');
    }
    if (sm.rel && sm.rel.length) {
      var sec6 = [];
      for (var sl = 0; sl < sm.rel.length; sl++) {
        var rid = sm.rel[sl];
        if (rid === c.id) continue;
        var rc = cardById[rid];
        if (rc) {
          sec6.push('<span class="chip small linkchip" data-goto="' + rid + '">' + esc(rc.n) +
            '</span>');
        }
      }
      if (sec6.length) {
        h.push('<h4>' + esc(ui('related')) + '</h4><div class="dbadges">' + sec6.join('') + '</div>');
      }
    }
  } else {
    h.push('<h4>' + esc(ui('scriptTags')) + '</h4><div class="note">' + esc(ui('noScript')) + '</div>');
  }

  // 第二组(系列联动):列出该系列中命中第二组条件的卡
  if (g2ConditionsActive()) {
    var g2mates = seriesOf(c).filter(function (id) { return g2Matches[id] && cardById[id]; });
    if (g2mates.length) {
      h.push('<h4>' + esc(ui('g2title')) + '</h4><div class="dbadges">' +
        g2mates.map(function (id) {
          var mc = cardById[id];
          return '<span class="chip small linkchip' + (id === c.id ? ' on' : '') +
            '" data-goto="' + id + '">' + (id === c.id ? '● ' : '') + esc(mc.n) + '</span>';
        }).join('') + '</div>');
    }
  }

  h.push('<div class="note">' + esc(ui('scriptNote')) + ' · ' + esc(ui('source')) + '</div>');

  $('detail').innerHTML = h.join('');
  $('detailWrap').classList.remove('hidden');
  $('detail').scrollTop = 0;
}

function closeDetail() {
  $('detailWrap').classList.add('hidden');
  detailCardId = 0;
}

/* ================= URL 哈希 ================= */

function writeHash() {
  var p = new URLSearchParams();
  if (STATE.q) p.set('q', STATE.q);
  if (STATE.locale !== 'zh-CN') p.set('loc', STATE.locale);
  if (STATE.main.length) p.set('m', STATE.main.join(','));
  if (STATE.sub.length) p.set('s', STATE.sub.join(','));
  if (STATE.attr.length) p.set('at', STATE.attr.join(','));
  if (STATE.race.length) p.set('rc', STATE.race.join(','));
  if (STATE.cats.length) p.set('ct', STATE.cats.join(','));
  if (STATE.tags.length) p.set('tg2', STATE.tags.join(','));
  if (STATE.tg.length) p.set('tv', STATE.tg.join(','));
  if (STATE.acts.length) p.set('ac', STATE.acts.join(','));
  if (STATE.fdesc.length) p.set('fd', STATE.fdesc.join(','));
  if (STATE.pside.length) p.set('ps', STATE.pside.join(','));
  if (STATE.ss.length) p.set('ss', STATE.ss.join(','));
  if (STATE.effStrict) p.set('es', '1');
  if (!STATE.hideToken) p.set('tk', '1');
  if (STATE2.q.trim()) p.set('g2q', STATE2.q.trim());
  if (STATE2.tags.length) p.set('g2t', STATE2.tags.join(','));
  if (STATE2.tg.length) p.set('g2v', STATE2.tg.join(','));
  if (STATE2.acts.length) p.set('g2a', STATE2.acts.join(','));
  if (STATE2.fdesc.length) p.set('g2f', STATE2.fdesc.join(','));
  if (STATE2.pside.length) p.set('g2p', STATE2.pside.join(','));
  if (STATE2.main.length) p.set('g2m', STATE2.main.join(','));
  if (STATE2.sub.length) p.set('g2sb', STATE2.sub.join(','));
  if (STATE2.attr.length) p.set('g2at', STATE2.attr.join(','));
  if (STATE2.race.length) p.set('g2rc', STATE2.race.join(','));
  if (STATE2.cats.length) p.set('g2ct', STATE2.cats.join(','));
  var g2nums = { lvMin: 'g2l0', lvMax: 'g2l1', atkMin: 'g2k0', atkMax: 'g2k1',
    defMin: 'g2b0', defMax: 'g2b1' };
  Object.keys(g2nums).forEach(function (k) {
    if (isNumeric(STATE2[k])) p.set(g2nums[k], STATE2[k]);
  });
  if (!STATE.dedupe) p.set('hd', '0');
  if (STATE.setcode) p.set('sc', STATE.setcode.toString(16));
  var nums = { lvMin: 'lv0', lvMax: 'lv1', scMin: 'ps0', scMax: 'ps1',
    atkMin: 'a0', atkMax: 'a1', defMin: 'd0', defMax: 'd1' };
  Object.keys(nums).forEach(function (k) {
    if (isNumeric(STATE[k])) p.set(nums[k], STATE[k]);
  });
  if (STATE.ot) p.set('ot', STATE.ot);
  if (STATE.script) p.set('hs', STATE.script);
  if (STATE.pre) p.set('pr', STATE.pre);
  if (STATE.bl) p.set('bl', STATE.bl);
  if (STATE.sortKey !== 'id') p.set('sk', STATE.sortKey);
  if (STATE.sortDir !== 1) p.set('sd', STATE.sortDir);
  var h = p.toString();
  history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
}

function readHash() {
  if (!location.hash || location.hash.length < 2) return false;
  var p = new URLSearchParams(location.hash.slice(1));
  var got = false;
  var num = function (v) { return isNumeric(v) ? +v : null; };
  if (p.has('q')) { STATE.q = p.get('q'); got = true; }
  if (p.has('loc') && L[p.get('loc')]) STATE.locale = p.get('loc');
  var csv = function (k, arr) {
    if (!p.has(k)) return;
    arr.length = 0;
    p.get(k).split(',').forEach(function (x) {
      var v = parseInt(x, 10);
      if (!isNaN(v)) arr.push(v);
    });
    got = true;
  };
  csv('m', STATE.main); csv('s', STATE.sub); csv('at', STATE.attr);
  csv('rc', STATE.race); csv('ct', STATE.cats); csv('tg2', STATE.tags);
  csv('tv', STATE.tg); csv('ac', STATE.acts);
  csv('fd', STATE.fdesc); csv('ps', STATE.pside);
  csv('ss', STATE.ss);
  if (p.has('es')) STATE.effStrict = p.get('es') === '1';
  if (p.has('tk')) STATE.hideToken = p.get('tk') !== '1';
  if (p.has('g2q')) STATE2.q = p.get('g2q');
  if (p.has('g2v')) {
    STATE2.tg = p.get('g2v').split(',').map(function (x) { return +x; })
      .filter(function (v) { return v === 0 || v === 1; });
  }
  var csvStr2 = function (k, arr, valid) {
    if (!p.has(k)) return;
    arr.length = 0;
    p.get(k).split(',').forEach(function (x) {
      if (valid.indexOf(x) >= 0) arr.push(x);
    });
  };
  csvStr2('g2t', STATE2.tags, TAG_KEYS);
  csvStr2('g2a', STATE2.acts, ACT_KEYS);
  csvStr2('g2f', STATE2.fdesc, ['MON', 'SPELL', 'TRAP', 'ST', 'FACEUP']);
  csvStr2('g2p', STATE2.pside, ['SELF', 'OPP', 'BOTH']);
  var csvNum2 = function (k, arr) {
    if (!p.has(k)) return;
    arr.length = 0;
    p.get(k).split(',').forEach(function (x) {
      var v = parseInt(x, 10);
      if (!isNaN(v)) arr.push(v);
    });
  };
  csvNum2('g2m', STATE2.main); csvNum2('g2sb', STATE2.sub);
  csvNum2('g2at', STATE2.attr); csvNum2('g2rc', STATE2.race);
  csvNum2('g2ct', STATE2.cats);
  var g2numMap = { g2l0: 'lvMin', g2l1: 'lvMax', g2k0: 'atkMin', g2k1: 'atkMax',
    g2b0: 'defMin', g2b1: 'defMax' };
  Object.keys(g2numMap).forEach(function (k) {
    if (p.has(k) && isNumeric(p.get(k))) STATE2[g2numMap[k]] = +p.get(k);
  });
  // 兼容旧链接:tg= 原为效果标签参数
  if (p.has('tg')) {
    p.get('tg').split(',').forEach(function (x) {
      if (TAG_KEYS.indexOf(x) >= 0 && STATE.tags.indexOf(x) < 0) STATE.tags.push(x);
    });
    got = true;
  }
  if (p.has('hd')) STATE.dedupe = p.get('hd') !== '0';
  if (p.has('sc')) { STATE.setcode = parseInt(p.get('sc'), 16) || 0; got = true; }
  var nums = { lv0: 'lvMin', lv1: 'lvMax', ps0: 'scMin', ps1: 'scMax',
    a0: 'atkMin', a1: 'atkMax', d0: 'defMin', d1: 'defMax' };
  Object.keys(nums).forEach(function (k) {
    if (p.has(k)) { STATE[nums[k]] = num(p.get(k)); got = true; }
  });
  if (p.has('ot')) STATE.ot = +p.get('ot') || 0;
  if (p.has('hs')) STATE.script = +p.get('hs') || 0;
  if (p.has('pr')) STATE.pre = +p.get('pr') || 0;
  if (p.has('bl')) {
    var bv = +p.get('bl');
    if (bv >= 0 && bv <= 4) STATE.bl = bv;
  }
  if (p.has('sk')) STATE.sortKey = p.get('sk');
  if (p.has('sd')) STATE.sortDir = +p.get('sd') || 1;
  return got;
}

/* ================= 筛选 UI ================= */

function makeChip(label, on, onclick, extra) {
  var el = document.createElement('span');
  el.className = 'chip' + (on ? ' on' : '') + (extra || '');
  el.innerHTML = label;
  el.addEventListener('click', onclick);
  return el;
}

function toggleIn(arr, v) {
  var i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1); else arr.push(v);
}

function buildFilterUI() {
  // 主类型
  var fMain = $('f-main');
  fMain.innerHTML = '';
  MAIN_BITS.forEach(function (bit) {
    fMain.appendChild(makeChip(esc(typeName(bit)), STATE.main.indexOf(bit) >= 0, function () {
      toggleIn(STATE.main, bit); refresh(); buildFilterUI();
    }));
  });
  // 衍生物开关(默认隐藏)
  var fTok = $('f-token');
  if (fTok) {
    var uiM = loc('ui');
    fTok.innerHTML = '';
    fTok.appendChild(makeChip(esc(uiM('showToken')), !STATE.hideToken, function () {
      STATE.hideToken = !STATE.hideToken; refresh(); buildFilterUI();
    }, ' small'));
  }
  // 细分
  var fSub = $('f-sub');
  fSub.innerHTML = '';
  SUB_BITS.forEach(function (bit) {
    fSub.appendChild(makeChip(esc(subBitName(bit)), STATE.sub.indexOf(bit) >= 0, function () {
      toggleIn(STATE.sub, bit); refresh(); buildFilterUI();
    }));
  });
  // 属性
  var fAttr = $('f-attr');
  fAttr.innerHTML = '';
  ATTR_BITS.forEach(function (bit) {
    var label = '<span class="dot" style="background:' + (ATTR_COLORS[bit] || '#888') +
      '"></span>' + esc(attrName(bit));
    fAttr.appendChild(makeChip(label, STATE.attr.indexOf(bit) >= 0, function () {
      toggleIn(STATE.attr, bit); refresh(); buildFilterUI();
    }));
  });
  // 种族
  var fRace = $('f-race');
  fRace.innerHTML = '';
  for (var r = 0; r < 26; r++) {
    (function (bit) {
      fRace.appendChild(makeChip(esc(raceName(bit)), STATE.race.indexOf(bit) >= 0, function () {
        toggleIn(STATE.race, bit); refresh(); buildFilterUI();
      }));
    })(1 << r);
  }
  // 数据库效果分类
  var fCat = $('f-cat');
  fCat.innerHTML = '';
  for (var cb = 0; cb < 32; cb++) {
    (function (bit) {
      var nm = catName(bit);
      if (!nm) return;
      fCat.appendChild(makeChip(esc(nm), STATE.cats.indexOf(bit) >= 0, function () {
        toggleIn(STATE.cats, bit); refresh(); buildFilterUI();
      }));
    })((1 << cb) >>> 0);
  }
  // 脚本标签
  var fTags = $('f-tags');
  fTags.innerHTML = '';
  var tl = loc('tags');
  TAG_KEYS.forEach(function (tag) {
    fTags.appendChild(makeChip(esc(tl(tag)), STATE.tags.indexOf(tag) >= 0, function () {
      toggleIn(STATE.tags, tag); refresh(); buildFilterUI();
    }));
  });
  // 效果明细:严格模式开关 + 对象判定
  var fTg = $('f-tg');
  if (fTg) {
    var uiL = loc('ui');
    var fEs = $('f-effstrict');
    if (fEs) {
      fEs.innerHTML = '';
      fEs.appendChild(makeChip(esc(uiL('sameEff')), STATE.effStrict, function () {
        STATE.effStrict = !STATE.effStrict; refresh(); buildFilterUI();
      }));
    }
    fTg.innerHTML = '';
    [['1', 'tgt'], ['0', 'noTgt']].forEach(function (pair) {
      var v = +pair[0];
      fTg.appendChild(makeChip(esc(uiL(pair[1])), STATE.tg.indexOf(v) >= 0, function () {
        toggleIn(STATE.tg, v); refresh(); buildFilterUI();
      }));
    });
  }
  // 效果明细:动作
  var fActs = $('f-acts');
  if (fActs) {
    fActs.innerHTML = '';
    var al2 = loc('act');
    ACT_KEYS.forEach(function (a) {
      fActs.appendChild(makeChip(esc(al2(a)), STATE.acts.indexOf(a) >= 0, function () {
        toggleIn(STATE.acts, a); refresh(); buildFilterUI();
      }));
    });
  }
  // 效果明细:卡片限定与玩家方位
  var fFd = $('f-fdesc'), fPs = $('f-pside');
  if (fFd) {
    fFd.innerHTML = '';
    [['MON', 'mon'], ['SPELL', 'spell'], ['TRAP', 'trap'], ['ST', 'st'], ['FACEUP', 'faceup']].forEach(function (pair) {
      fFd.appendChild(makeChip(esc(uiL(pair[1])), STATE.fdesc.indexOf(pair[0]) >= 0, function () {
        toggleIn(STATE.fdesc, pair[0]); refresh(); buildFilterUI();
      }));
    });
  }
  if (fPs) {
    fPs.innerHTML = '';
    [['SELF', 'pself'], ['OPP', 'popp'], ['BOTH', 'pboth']].forEach(function (pair) {
      fPs.appendChild(makeChip(esc(uiL(pair[1])), STATE.pside.indexOf(pair[0]) >= 0, function () {
        toggleIn(STATE.pside, pair[0]); refresh(); buildFilterUI();
      }));
    });
  }
  // 效果明细:咒文速度
  var fSsRow = $('f-ss');
  if (fSsRow) {
    fSsRow.innerHTML = '';
    var ssUi = loc('ui');
    [[1, 'ss1'], [2, 'ss2'], [3, 'ss3']].forEach(function (pair) {
      fSsRow.appendChild(makeChip(esc(ssUi(pair[1])), STATE.ss.indexOf(pair[0]) >= 0, function () {
        toggleIn(STATE.ss, pair[0]); refresh(); buildFilterUI();
      }));
    });
  }
  // 同名去重开关
  var fDd = $('f-dedupe');
  if (fDd) {
    fDd.innerHTML = '';
    fDd.appendChild(makeChip('隐藏无脚本同名卡', STATE.dedupe, function () {
      STATE.dedupe = !STATE.dedupe; refresh(); buildFilterUI();
    }, ' small'));
  }
  // OT
  var fOt = $('f-ot');
  fOt.innerHTML = '';
  [['0', '全部'], ['1', 'OCG'], ['2', 'TCG']].forEach(function (pair) {
    fOt.appendChild(makeChip(pair[1], STATE.ot === +pair[0], function () {
      STATE.ot = +pair[0]; refresh(); buildFilterUI();
    }));
  });
  // 脚本
  var fS = $('f-script');
  fS.innerHTML = '';
  [['0', '全部'], ['1', '有脚本'], ['2', '无脚本']].forEach(function (pair) {
    fS.appendChild(makeChip(pair[1], STATE.script === +pair[0], function () {
      STATE.script = +pair[0]; refresh(); buildFilterUI();
    }));
  });
  // 先行卡
  var fPre = $('f-pre');
  if (fPre) {
    fPre.innerHTML = '';
    [['0', '全部'], ['1', '仅先行卡'], ['2', '排除先行卡']].forEach(function (pair) {
      fPre.appendChild(makeChip(pair[1], STATE.pre === +pair[0], function () {
        STATE.pre = +pair[0]; refresh(); buildFilterUI();
      }));
    });
  }
  // 禁限(构建时含禁限表才显示;bl: 1=禁止 2=限制 3=准限制 4=无限制)
  var fgBl = $('fg-bl');
  if (fgBl) {
    if (META && META.lflist && META.lflist.enabled) {
      fgBl.classList.remove('hidden');
      $('blTitle').textContent = loc('ui')('blTitle');
      $('blHint').textContent = META.lflist.name;
      var fBl = $('f-bl');
      fBl.innerHTML = '';
      [['0', '全部'], ['1', 'bl0'], ['2', 'bl1'], ['3', 'bl2'], ['4', 'blU']]
        .forEach(function (pair) {
          var label = pair[1] === '全部' ? '全部' : esc(loc('ui')(pair[1]));
          fBl.appendChild(makeChip(label, STATE.bl === +pair[0], function () {
            STATE.bl = +pair[0]; refresh(); buildFilterUI();
          }));
        });
    } else {
      fgBl.classList.add('hidden');
    }
  }
  // 字段自动完成候选(名称 + 卡员数,含主库字段与 ypk 新增字段)
  setcodeCandidates = [];
  var seenCodes = {};
  var counts = META.setcodeCounts || {};
  Object.keys(counts).forEach(function (hex) {
    var code = parseInt(hex, 16);
    setcodeCandidates.push({ code: code, hex: hex, name: setcodeName(code), count: counts[hex] });
    seenCodes[code] = 1;
  });
  Object.keys(STRS.setname).forEach(function (hk) {
    var code = parseInt(hk, 16);
    if (!seenCodes[code]) {
      setcodeCandidates.push({ code: code, hex: hk, name: STRS.setname[hk], count: 0 });
    }
  });
  renderSetcodeSel();

  // 数值输入回填
  var bindNum = function (id, key) {
    var el = $(id);
    el.value = isNumeric(STATE[key]) ? STATE[key] : '';
    el.oninput = function () {
      STATE[key] = el.value === '' ? null : +el.value;
      refresh();
    };
  };
  bindNum('lvMin', 'lvMin'); bindNum('lvMax', 'lvMax');
  bindNum('scMin', 'scMin'); bindNum('scMax', 'scMax');
  bindNum('atkMin', 'atkMin'); bindNum('atkMax', 'atkMax');
  bindNum('defMin', 'defMin'); bindNum('defMax', 'defMax');
  buildG2UI();
}

/* ================= 第二组(系列联动)条件 UI ================= */

function resetG2State() {
  STATE2.q = '';
  STATE2.main = []; STATE2.sub = []; STATE2.attr = []; STATE2.race = [];
  STATE2.cats = []; STATE2.tags = []; STATE2.tg = []; STATE2.acts = [];
  STATE2.fdesc = []; STATE2.pside = []; STATE2.ss = [];
  STATE2.lvMin = STATE2.lvMax = STATE2.atkMin = STATE2.atkMax =
    STATE2.defMin = STATE2.defMax = null;
  var g2q = $('g2q');
  if (g2q) g2q.value = '';
}

function buildG2UI() {
  var uiL = loc('ui');
  var tl = loc('tags');
  var al2 = loc('act');
  var g2q = $('g2q');
  if (g2q) {
    if (!g2q.__bound) {
      g2q.__bound = 1;
      g2q.addEventListener('input', function () {
        STATE2.q = g2q.value;
        refresh();
      });
    }
    if (g2q.value !== STATE2.q && document.activeElement !== g2q) g2q.value = STATE2.q;
  }
  var mk = function (contId, pairs, arr) {
    var cont = $(contId);
    if (!cont) return;
    cont.innerHTML = '';
    pairs.forEach(function (pair) {
      // label 需为已安全的 HTML(纯文本在构造时已 esc,含标记的按原样传入)
      cont.appendChild(makeChip(pair.label, arr.indexOf(pair.key) >= 0, function () {
        toggleIn(arr, pair.key);
        refresh();
        buildG2UI();
      }));
    });
  };
  // 卡片属性维度(主类型/细分/属性/种族/数据库分类)与数值范围
  mk('g2-main', MAIN_BITS.map(function (b) { return { key: b, label: esc(typeName(b)) }; }), STATE2.main);
  mk('g2-sub', SUB_BITS.map(function (b) { return { key: b, label: esc(subBitName(b)) }; }), STATE2.sub);
  mk('g2-attr', ATTR_BITS.map(function (b) {
    return { key: b, label: '<span class="dot" style="background:' + (ATTR_COLORS[b] || '#888') + '"></span>' + esc(attrName(b)) };
  }), STATE2.attr);
  var racePairs = [];
  for (var ri = 0; ri < 26; ri++) racePairs.push({ key: 1 << ri, label: esc(raceName(1 << ri)) });
  mk('g2-race', racePairs, STATE2.race);
  var catPairs = [];
  for (var ci = 0; ci < 32; ci++) {
    (function (bit) {
      var nm = catName(bit);
      if (nm) catPairs.push({ key: bit, label: esc(nm) });
    })(1 << ci);
  }
  mk('g2-cat', catPairs, STATE2.cats);
  var bindNum2 = function (id, key) {
    var el = $(id);
    if (!el) return;
    if (!el.__bound) {
      el.__bound = 1;
      el.addEventListener('input', function () {
        STATE2[key] = el.value === '' ? null : +el.value;
        refresh();
      });
    }
    if (document.activeElement !== el) el.value = isNumeric(STATE2[key]) ? STATE2[key] : '';
  };
  bindNum2('g2lvMin', 'lvMin'); bindNum2('g2lvMax', 'lvMax');
  bindNum2('g2atkMin', 'atkMin'); bindNum2('g2atkMax', 'atkMax');
  bindNum2('g2defMin', 'defMin'); bindNum2('g2defMax', 'defMax');
  mk('g2-tags', TAG_KEYS.map(function (t) { return { key: t, label: esc(tl(t)) }; }), STATE2.tags);
  mk('g2-tg', [{ key: 1, label: esc(uiL('tgt')) }, { key: 0, label: esc(uiL('noTgt')) }], STATE2.tg);
  mk('g2-acts', ACT_KEYS.map(function (a) { return { key: a, label: esc(al2(a)) }; }), STATE2.acts);
  mk('g2-fdesc', [['MON', 'mon'], ['SPELL', 'spell'], ['TRAP', 'trap'], ['ST', 'st'], ['FACEUP', 'faceup']]
    .map(function (p) { return { key: p[0], label: esc(uiL(p[1])) }; }), STATE2.fdesc);
  mk('g2-pside', [['SELF', 'pself'], ['OPP', 'popp'], ['BOTH', 'pboth']]
    .map(function (p) { return { key: p[0], label: esc(uiL(p[1])) }; }), STATE2.pside);
  var hint = $('g2hint');
  if (hint) hint.textContent = g2ConditionsActive() ? '● 已启用' : '';
  // 折叠状态下也要能看出第二组条件在生效(防止残留条件被遗忘)
  var fgG2 = $('fg-g2');
  if (fgG2) fgG2.classList.toggle('g2-on', g2ConditionsActive());
  var clear = $('g2clear');
  if (clear && !clear.__bound) {
    clear.__bound = 1;
    clear.addEventListener('click', function () {
      resetG2State();
      refresh();
      buildG2UI();
    });
  }
}

function renderSetcodeSel() {
  var box = $('setcodeSel');
  box.innerHTML = '';
  if (STATE.setcode) {
    var nm = setcodeName(STATE.setcode);
    var chip = makeChip(esc(nm || ('0x' + STATE.setcode.toString(16))) + ' ✕', true, function () {
      STATE.setcode = 0; $('setcode').value = ''; refresh(); renderSetcodeSel();
    });
    box.appendChild(chip);
  }
}

function setupSetcodeInput() {
  var input = $('setcode');
  var drop = $('setcodeDrop');
  var hideTimer = null;
  var sugIdx = -1;

  function hide() {
    drop.classList.add('hidden');
    sugIdx = -1;
  }
  function apply(code) {
    STATE.setcode = code;
    input.value = setcodeName(code) || ('0x' + code.toString(16));
    refresh();
    renderSetcodeSel();
    hide();
  }
  // 建议:不区分大小写与全角/半角(精确 > 前缀 > 包含,同分按卡员数)
  function suggestions(q) {
    var nq = normText(q);
    if (!nq) return [];
    var out = [];
    setcodeCandidates.forEach(function (it) {
      var nn = normText(it.name || '');
      var score = -1;
      if (nn === nq) score = 0;
      else if (nn.indexOf(nq) === 0) score = 1;
      else if (nn.indexOf(nq) > 0) score = 2;
      else {
        var hex = nq.replace(/^0x/, '');
        if (/^[0-9a-f]+$/.test(hex) && it.hex.indexOf(hex) === 0 && hex.length >= 2) score = 1;
      }
      if (score >= 0) out.push({ it: it, score: score });
    });
    out.sort(function (a, b) { return a.score - b.score || (b.it.count || 0) - (a.it.count || 0); });
    return out.slice(0, 12);
  }
  function renderSug(list) {
    if (!list.length) { hide(); return; }
    drop.innerHTML = list.map(function (s) {
      var it = s.it;
      return '<div class="opt" data-code="' + it.code + '">' +
        esc(it.name || ('0x' + it.hex)) +
        (it.count ? '<span class="cnt">' + it.count + '</span>' : '') +
        '<span class="code">0x' + it.hex + '</span></div>';
    }).join('');
    sugIdx = -1;
    drop.classList.remove('hidden');
  }
  function markActive() {
    var opts = drop.querySelectorAll('.opt');
    opts.forEach(function (o, i) { o.classList.toggle('active', i === sugIdx); });
    if (opts[sugIdx]) opts[sugIdx].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', function () { renderSug(suggestions(input.value)); });
  input.addEventListener('focus', function () { if (input.value) renderSug(suggestions(input.value)); });
  input.addEventListener('blur', function () { hideTimer = setTimeout(hide, 160); });
  drop.addEventListener('mousedown', function (e) {
    clearTimeout(hideTimer);
    var opt = e.target.closest('.opt');
    if (!opt) return;
    e.preventDefault();
    apply(+opt.dataset.code);
  });
  input.addEventListener('keydown', function (e) {
    var opts = drop.querySelectorAll('.opt');
    var visible = !drop.classList.contains('hidden') && opts.length;
    if (e.key === 'ArrowDown' && visible) {
      e.preventDefault();
      sugIdx = (sugIdx + 1) % opts.length;
      markActive();
    } else if (e.key === 'ArrowUp' && visible) {
      e.preventDefault();
      sugIdx = (sugIdx - 1 + opts.length) % opts.length;
      markActive();
    } else if (e.key === 'Enter') {
      if (visible) {
        e.preventDefault();
        apply(+(opts[sugIdx >= 0 ? sugIdx : 0].dataset.code));
      } else {
        // 无建议:按名称兜底(精确 > 前缀 > 包含)
        var v = input.value.trim();
        if (!v) { STATE.setcode = 0; refresh(); renderSetcodeSel(); return; }
        var nv = normText(v);
        var list = suggestions(v);
        if (list.length) { apply(list[0].it.code); return; }
        STATE.setcode = 0;
        renderSetcodeSel();
      }
    } else if (e.key === 'Escape') {
      hide();
    }
  });
}

/* ================= 随机组卡 ================= */

var EXTRA_DECK_BITS = 0x40 | 0x2000 | 0x800000 | 0x4000000;
var RAND_KEY = 'cardsearch.rand.v1';
var RAND_HIST_MAX = 50;

var RSTATE = {
  mainN: 40, minMon: 0, minSp: 0, minTr: 0, extraN: 15, cap: 3,
  pre: 1, ot: 0, bl: 1,
  excluded: {},   // id -> 1(手动排除的卡)
  rules: [],      // 排除规则 {main:[位], sub:[位], attr:[位], race:[位], setcode:0}
                  // 主/属性/种族维内任一(OR),细分维内全部满足(AND),维度间 AND
  formMain: [], formSub: [], formAttr: [], formRace: [], formSetcode: 0, // 规则表单当前选择
  history: [],    // {ts, main:[id], extra:[id]}
  view: -1        // 当前查看的历史下标(-1=无)
};

var randPools = null;

function rfmt(tpl) {
  var s = String(tpl == null ? '' : tpl);
  for (var i = 1; i < arguments.length; i++) {
    s = s.split('{' + (i - 1) + '}').join(String(arguments[i]));
  }
  return s;
}

// 卡在组卡中的归属:衍生物不进池;融合/同调/超量/连接归额外;其余怪兽/魔法/陷阱归主
function deckKindOf(c) {
  var t = c.t;
  if (t & 0x4000) return null;
  if (t & EXTRA_DECK_BITS) return 'extra';
  if (t & 0x1) return 'mon';
  if (t & 0x2) return 'spell';
  if (t & 0x4) return 'trap';
  return null;
}

function randRuleMatches(c, r) {
  if (r.main.length) {
    var okM = false;
    for (var i = 0; i < r.main.length; i++) if (c.t & r.main[i]) { okM = true; break; }
    if (!okM) return false;
  }
  var subs = r.sub || []; // 兼容未走 applyRandData 的旧格式规则(无 sub 字段)
  for (var sb = 0; sb < subs.length; sb++) {
    var nd = subs[sb];
    if (nd === SUB_CONT_SPELL) {
      if (!((c.t & 0x20000) && (c.t & 0x2))) return false;
    } else if (nd === SUB_CONT_TRAP) {
      if (!((c.t & 0x20000) && (c.t & 0x4))) return false;
    } else if (!(c.t & nd)) {
      return false;
    }
  }
  if (r.attr.length) {
    var okA = false;
    for (var a = 0; a < r.attr.length; a++) if (c.at & r.attr[a]) { okA = true; break; }
    if (!okA) return false;
  }
  if (r.race.length) {
    var okR = false;
    for (var rc = 0; rc < r.race.length; rc++) if (c.r & r.race[rc]) { okR = true; break; }
    if (!okR) return false;
  }
  if (r.setcode && !matchSetcode(c, r.setcode)) return false;
  return true;
}

function randPoolPass(c) {
  if (!RSTATE.pre && c.pre) return false;
  if (RSTATE.ot === 1 && !(c.ot & 1)) return false;
  if (RSTATE.ot === 2 && !(c.ot & 2)) return false;
  if (RSTATE.bl && c.bl === 0) return false; // 遵循禁限:禁止卡不进池
  if (RSTATE.excluded[c.id]) return false;
  for (var i = 0; i < RSTATE.rules.length; i++) {
    if (randRuleMatches(c, RSTATE.rules[i])) return false;
  }
  return true;
}

// 单卡可抽上限:遵循禁限时限制卡 1 张、准限制 2 张(与每卡上限取小);
// 禁止卡(0)不进池,由 randPoolPass 拦截;无 bl 字段即无限制
function randCardCap(c) {
  if (RSTATE.bl && (c.bl === 1 || c.bl === 2)) return Math.min(RSTATE.cap, c.bl);
  return RSTATE.cap;
}

function buildRandPools() {
  var pools = { mon: [], spell: [], trap: [], extra: [] };
  for (var i = 0; i < DATA.length; i++) {
    var c = DATA[i];
    var k = deckKindOf(c);
    if (k && randPoolPass(c)) pools[k].push(c);
  }
  return pools;
}

function randNameOf(c) { return c.n || ('#' + c.id); }

// 按卡名分组后的可抽容量(同名/异画共享每卡上限与禁限上限)
function randCapacity(pool) {
  var byName = {};
  for (var i = 0; i < pool.length; i++) {
    var c = pool[i];
    var n = randNameOf(c);
    if (!byName[n]) byName[n] = { size: 0, cap: randCardCap(c) };
    else if (randCardCap(c) < byName[n].cap) byName[n].cap = randCardCap(c);
    byName[n].size++;
  }
  var total = 0;
  Object.keys(byName).forEach(function (n) {
    total += Math.min(byName[n].size, byName[n].cap);
  });
  return total;
}

function drawFromPools(poolArr, n, nameUse) {
  var picked = [];
  while (picked.length < n) {
    var cands = [];
    for (var p = 0; p < poolArr.length; p++) {
      var pool = poolArr[p];
      for (var i = 0; i < pool.length; i++) {
        if ((nameUse[randNameOf(pool[i])] || 0) < randCardCap(pool[i])) cands.push(pool[i]);
      }
    }
    if (!cands.length) return { ids: picked, deficit: n - picked.length };
    var c = cands[Math.floor(Math.random() * cands.length)];
    var nm = randNameOf(c);
    nameUse[nm] = (nameUse[nm] || 0) + 1;
    picked.push(c.id);
  }
  return { ids: picked, deficit: 0 };
}

function randDraw() {
  var uiL = loc('ui');
  var mainN = +RSTATE.mainN || 0, extraN = +RSTATE.extraN || 0;
  var mins = { mon: +RSTATE.minMon || 0, spell: +RSTATE.minSp || 0, trap: +RSTATE.minTr || 0 };
  if (mainN < 0 || extraN < 0 || mins.mon < 0 || mins.spell < 0 || mins.trap < 0)
    return { err: uiL('rErrNeg') };
  if (mins.mon + mins.spell + mins.trap > mainN)
    return { err: uiL('rErrMinSum') };
  var pools = buildRandPools();
  var need = [[pools.mon, mins.mon, typeName(0x1)], [pools.spell, mins.spell, typeName(0x2)],
    [pools.trap, mins.trap, typeName(0x4)]];
  for (var i = 0; i < need.length; i++) {
    var cap = randCapacity(need[i][0]);
    if (cap < need[i][1]) return { err: rfmt(uiL('rErrShort'), need[i][2], cap, need[i][1]) };
  }
  var mainCap = randCapacity(pools.mon.concat(pools.spell, pools.trap));
  if (mainCap < mainN) return { err: rfmt(uiL('rErrMainShort'), mainCap, mainN) };
  var extraCap = randCapacity(pools.extra);
  if (extraCap < extraN) return { err: rfmt(uiL('rErrExtra'), extraCap, extraN) };

  var nameUse = {};
  var mainIds = [];
  for (var k = 0; k < need.length; k++) {
    var r = drawFromPools([need[k][0]], need[k][1], nameUse);
    if (r.deficit) {
      return { err: rfmt(uiL('rErrShort'), need[k][2],
        need[k][1] - r.deficit, need[k][1]) };
    }
    mainIds = mainIds.concat(r.ids);
  }
  var r2 = drawFromPools([pools.mon, pools.spell, pools.trap], mainN - mainIds.length, nameUse);
  if (r2.deficit) {
    return { err: rfmt(uiL('rErrMainShort'),
      mainN - mainIds.length - r2.deficit, mainN - mainIds.length) };
  }
  mainIds = mainIds.concat(r2.ids);
  var r3 = drawFromPools([pools.extra], extraN, nameUse);
  if (r3.deficit) {
    return { err: rfmt(uiL('rErrExtra'), extraN - r3.deficit, extraN) };
  }
  var entry = { ts: Date.now(), main: mainIds, extra: r3.ids };
  RSTATE.history.push(entry);
  while (RSTATE.history.length > RAND_HIST_MAX) RSTATE.history.shift();
  RSTATE.view = RSTATE.history.length - 1;
  saveRand();
  return { entry: entry };
}

function randSnapshot() {
  return {
    s: { mainN: RSTATE.mainN, minMon: RSTATE.minMon, minSp: RSTATE.minSp, minTr: RSTATE.minTr,
      extraN: RSTATE.extraN, cap: RSTATE.cap, pre: RSTATE.pre, ot: RSTATE.ot, bl: RSTATE.bl },
    ex: Object.keys(RSTATE.excluded).map(function (x) { return +x; }),
    rules: RSTATE.rules,
    history: RSTATE.history
  };
}

function saveRand() {
  try {
    var d = randSnapshot();
    d.v = 1;
    localStorage.setItem(RAND_KEY, JSON.stringify(d));
  } catch (e) { /* 隐私模式等场景下静默失败 */ }
}

function applyRandData(d) {
  d = d || {};
  var s = d.s || d.settings || {};
  var nums = ['mainN', 'minMon', 'minSp', 'minTr', 'extraN'];
  nums.forEach(function (k) {
    if (typeof s[k] === 'number' && isFinite(s[k]) && s[k] >= 0) RSTATE[k] = Math.floor(s[k]);
  });
  RSTATE.cap = (s.cap === 1 || s.cap === 2 || s.cap === 3) ? s.cap : 3;
  RSTATE.pre = s.pre === 0 ? 0 : 1;
  RSTATE.ot = (s.ot === 1 || s.ot === 2) ? s.ot : 0;
  RSTATE.bl = s.bl === 0 ? 0 : 1; // 旧存档无 bl 字段 → 默认遵循禁限
  RSTATE.excluded = {};
  var ex = d.ex || d.excluded || [];
  if (Array.isArray(ex)) {
    ex.forEach(function (id) {
      if (typeof id === 'number' && isFinite(id)) RSTATE.excluded[id] = 1;
    });
  }
  RSTATE.rules = [];
  var rules = Array.isArray(d.rules) ? d.rules : [];
  rules.forEach(function (r) {
    if (!r || typeof r !== 'object') return;
    var pick = function (a) {
      return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'number' && isFinite(x); }) : [];
    };
    RSTATE.rules.push({ main: pick(r.main), sub: pick(r.sub), attr: pick(r.attr),
      race: pick(r.race),
      setcode: (typeof r.setcode === 'number' && isFinite(r.setcode)) ? r.setcode : 0 });
  });
  RSTATE.history = [];
  var hist = Array.isArray(d.history) ? d.history : [];
  hist.forEach(function (h) {
    if (h && typeof h.ts === 'number' && Array.isArray(h.main) && Array.isArray(h.extra)) {
      RSTATE.history.push({ ts: h.ts, main: h.main, extra: h.extra });
    }
  });
  while (RSTATE.history.length > RAND_HIST_MAX) RSTATE.history.shift();
  RSTATE.view = RSTATE.history.length - 1;
}

function loadRand() {
  try {
    var raw = localStorage.getItem(RAND_KEY);
    if (raw) applyRandData(JSON.parse(raw));
  } catch (e) { /* 存档损坏时忽略,使用默认值 */ }
}

function viewedEntry() {
  return (RSTATE.view >= 0 && RSTATE.view < RSTATE.history.length) ? RSTATE.history[RSTATE.view] : null;
}

function randMsg(text, isErr) {
  var el = $('randMsg');
  if (!el) return;
  if (!text) { el.className = 'hidden'; return; }
  el.textContent = text;
  el.className = isErr ? 'err' : 'ok';
}

function randExcludeIds(ids) {
  var added = 0;
  ids.forEach(function (id) {
    if (!RSTATE.excluded[id]) { RSTATE.excluded[id] = 1; added++; }
  });
  saveRand();
  renderRand();
  return added;
}

function randStamp(ts) {
  var d = new Date(ts);
  var p2 = function (x) { return (x < 10 ? '0' : '') + x; };
  return String(d.getFullYear()) + p2(d.getMonth() + 1) + p2(d.getDate()) +
    '-' + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
}

function downloadText(text, name) {
  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}

function randExportYdk() {
  var e = viewedEntry();
  if (!e) return;
  var lines = ['#created by card-search random deck', '#main'];
  e.main.forEach(function (id) { lines.push(String(id)); });
  lines.push('#extra');
  e.extra.forEach(function (id) { lines.push(String(id)); });
  lines.push('!side');
  downloadText(lines.join('\n') + '\n', 'random-' + randStamp(e.ts) + '.ydk');
}

function randExportPool() {
  var d = randSnapshot();
  d.v = 1;
  d.savedAt = new Date().toISOString();
  downloadText(JSON.stringify(d, null, 2), 'random-pool-' + randStamp(Date.now()) + '.json');
}

function randImportPool(file) {
  var reader = new FileReader();
  reader.onload = function () {
    var uiL = loc('ui');
    var d = null;
    try { d = JSON.parse(String(reader.result)); } catch (e) { d = null; }
    if (!d || typeof d !== 'object' || d.v !== 1) { randMsg(uiL('rImportBad'), true); return; }
    var ex = d.ex || d.excluded || [];
    var nEx = Array.isArray(ex) ? ex.length : 0;
    var nRu = Array.isArray(d.rules) ? d.rules.length : 0;
    var nH = Array.isArray(d.history) ? d.history.length : 0;
    if (!window.confirm(uiL('rImportConfirm'))) return;
    applyRandData(d);
    saveRand();
    renderRand();
    randMsg(rfmt(uiL('rImportOk'), nEx, nRu, nH));
  };
  reader.readAsText(file);
}

function randAddRule() {
  var uiL = loc('ui');
  var r = { main: RSTATE.formMain.slice(), sub: RSTATE.formSub.slice(),
    attr: RSTATE.formAttr.slice(), race: RSTATE.formRace.slice(), setcode: RSTATE.formSetcode };
  if (!r.main.length && !r.sub.length && !r.attr.length && !r.race.length && !r.setcode) {
    randMsg(uiL('rRuleEmpty'), true);
    return;
  }
  RSTATE.rules.push(r);
  RSTATE.formMain = []; RSTATE.formSub = []; RSTATE.formAttr = []; RSTATE.formRace = [];
  RSTATE.formSetcode = 0;
  $('rSetcode').value = '';
  saveRand();
  renderRand();
}

function randRuleDesc(r) {
  var uiL = loc('ui');
  var parts = [];
  if (r.main.length) parts.push(r.main.map(typeName).join('/'));
  if (r.sub.length) parts.push(uiL('rFSubShort') + ':' + r.sub.map(subBitName).join('+'));
  if (r.attr.length) parts.push(uiL('attr') + ':' + r.attr.map(attrName).join('/'));
  if (r.race.length) parts.push(uiL('race') + ':' + r.race.map(raceName).join('/'));
  if (r.setcode) parts.push(uiL('setdesc') + ':' + (setcodeName(r.setcode) || ('0x' + r.setcode.toString(16))));
  return parts.join(' · ');
}

function randRuleHits(r) {
  var n = 0;
  for (var i = 0; i < DATA.length; i++) {
    var c = DATA[i];
    if (!deckKindOf(c)) continue;
    if (!RSTATE.pre && c.pre) continue;
    if (RSTATE.ot === 1 && !(c.ot & 1)) continue;
    if (RSTATE.ot === 2 && !(c.ot & 2)) continue;
    if (randRuleMatches(c, r)) n++;
  }
  return n;
}

function renderRandStats() {
  if (!DATA) return;
  var p = randPools || buildRandPools();
  var uiL = loc('ui');
  var mainN = p.mon.length + p.spell.length + p.trap.length;
  var html = uiL('rMainPool') + ' <b>' + mainN.toLocaleString() + '</b>' +
    ' (' + uiL('mon') + ' ' + p.mon.length.toLocaleString() +
    ' / ' + uiL('spell') + ' ' + p.spell.length.toLocaleString() +
    ' / ' + uiL('trap') + ' ' + p.trap.length.toLocaleString() + ')' +
    ' · ' + uiL('rExtraPool') + ' <b>' + p.extra.length.toLocaleString() + '</b>';
  var m = +RSTATE.mainN || 0, e2 = +RSTATE.extraN || 0;
  if ((m > 0 && (m < 40 || m > 60)) || e2 > 15) {
    html += '<span class="rlegal">' + esc(uiL('rLegal')) + '</span>';
  }
  $('randStats').innerHTML = html;
}

function renderRandRuleForm() {
  var mkType = function (contId, bits, arr) {
    var box = $(contId);
    box.innerHTML = '';
    bits.forEach(function (bit) {
      box.appendChild(makeChip(esc(subBitName(bit)), arr.indexOf(bit) >= 0, function () {
        toggleIn(arr, bit);
        renderRandRuleForm();
      }));
    });
  };
  mkType('r-fmain', MAIN_BITS, RSTATE.formMain);
  mkType('r-fsub', SUB_BITS, RSTATE.formSub);
  // 属性:label 含色点,不能走 typeName,与搜索页属性 chips 同构(必须传数字位)
  var attrBox = $('r-fattr');
  attrBox.innerHTML = '';
  ATTR_BITS.forEach(function (bit) {
    var label = '<span class="dot" style="background:' + (ATTR_COLORS[bit] || '#888') +
      '"></span>' + esc(attrName(bit));
    attrBox.appendChild(makeChip(label, RSTATE.formAttr.indexOf(bit) >= 0, function () {
      toggleIn(RSTATE.formAttr, bit);
      renderRandRuleForm();
    }));
  });
  var raceBox = $('r-frace');
  raceBox.innerHTML = '';
  for (var r = 0; r < 26; r++) {
    (function (bit) {
      raceBox.appendChild(makeChip(esc(raceName(bit)), RSTATE.formRace.indexOf(bit) >= 0, function () {
        toggleIn(RSTATE.formRace, bit);
        renderRandRuleForm();
      }));
    })(1 << r);
  }
  renderRandSetcodeSel();
}

function renderRandSetcodeSel() {
  var box = $('rSetcodeSel');
  box.innerHTML = '';
  if (RSTATE.formSetcode) {
    var nm = setcodeName(RSTATE.formSetcode);
    box.appendChild(makeChip(esc(nm || ('0x' + RSTATE.formSetcode.toString(16))) + ' ✕', true,
      function () {
        RSTATE.formSetcode = 0;
        $('rSetcode').value = '';
        renderRandSetcodeSel();
      }));
  }
}

function setupRandSetcodeInput() {
  var input = $('rSetcode');
  var drop = $('rSetcodeDrop');
  var hideTimer = null;
  var sugIdx = -1;
  function hide() { drop.classList.add('hidden'); sugIdx = -1; }
  function apply(code) {
    RSTATE.formSetcode = code;
    input.value = setcodeName(code) || ('0x' + code.toString(16));
    renderRandSetcodeSel();
    hide();
  }
  // 建议:不区分大小写与全角/半角(精确 > 前缀 > 包含,同分按卡员数)
  function suggestions(q) {
    var nq = normText(q);
    if (!nq) return [];
    var out = [];
    setcodeCandidates.forEach(function (it) {
      var nn = normText(it.name || '');
      var score = -1;
      if (nn === nq) score = 0;
      else if (nn.indexOf(nq) === 0) score = 1;
      else if (nn.indexOf(nq) > 0) score = 2;
      else {
        var hex = nq.replace(/^0x/, '');
        if (/^[0-9a-f]+$/.test(hex) && it.hex.indexOf(hex) === 0 && hex.length >= 2) score = 1;
      }
      if (score >= 0) out.push({ it: it, score: score });
    });
    out.sort(function (a, b) { return a.score - b.score || (b.it.count || 0) - (a.it.count || 0); });
    return out.slice(0, 12);
  }
  function renderSug(list) {
    if (!list.length) { hide(); return; }
    drop.innerHTML = list.map(function (s) {
      var it = s.it;
      return '<div class="opt" data-code="' + it.code + '">' +
        esc(it.name || ('0x' + it.hex)) +
        (it.count ? '<span class="cnt">' + it.count + '</span>' : '') +
        '<span class="code">0x' + it.hex + '</span></div>';
    }).join('');
    sugIdx = -1;
    drop.classList.remove('hidden');
  }
  function markActive() {
    var opts = drop.querySelectorAll('.opt');
    opts.forEach(function (o, i) { o.classList.toggle('active', i === sugIdx); });
    if (opts[sugIdx]) opts[sugIdx].scrollIntoView({ block: 'nearest' });
  }
  input.addEventListener('input', function () { renderSug(suggestions(input.value)); });
  input.addEventListener('focus', function () { if (input.value) renderSug(suggestions(input.value)); });
  input.addEventListener('blur', function () { hideTimer = setTimeout(hide, 160); });
  drop.addEventListener('mousedown', function (e) {
    clearTimeout(hideTimer);
    var opt = e.target.closest('.opt');
    if (!opt) return;
    e.preventDefault();
    apply(+opt.dataset.code);
  });
  input.addEventListener('keydown', function (e) {
    var opts = drop.querySelectorAll('.opt');
    var visible = !drop.classList.contains('hidden') && opts.length;
    if (e.key === 'ArrowDown' && visible) {
      e.preventDefault();
      sugIdx = (sugIdx + 1) % opts.length;
      markActive();
    } else if (e.key === 'ArrowUp' && visible) {
      e.preventDefault();
      sugIdx = (sugIdx - 1 + opts.length) % opts.length;
      markActive();
    } else if (e.key === 'Enter') {
      if (visible) {
        e.preventDefault();
        apply(+(opts[sugIdx >= 0 ? sugIdx : 0].dataset.code));
      } else {
        var v = input.value.trim();
        if (!v) { RSTATE.formSetcode = 0; renderRandSetcodeSel(); return; }
        var list = suggestions(v);
        if (list.length) apply(list[0].it.code);
      }
    } else if (e.key === 'Escape') {
      hide();
    }
  });
}

function renderRandForm() {
  var uiL = loc('ui');
  var numIds = { rMainN: 'mainN', rMinMon: 'minMon', rMinSp: 'minSp', rMinTr: 'minTr', rExtraN: 'extraN' };
  Object.keys(numIds).forEach(function (id) {
    var el = $(id);
    if (el && document.activeElement !== el) el.value = RSTATE[numIds[id]];
  });
  var capBox = $('r-cap');
  capBox.innerHTML = '';
  [1, 2, 3].forEach(function (n) {
    capBox.appendChild(makeChip('×' + n, RSTATE.cap === n, function () {
      RSTATE.cap = n;
      saveRand();
      renderRandForm();
    }));
  });
  var preBox = $('r-pre');
  preBox.innerHTML = '';
  preBox.appendChild(makeChip(esc(uiL('rPre')), !!RSTATE.pre, function () {
    RSTATE.pre = RSTATE.pre ? 0 : 1;
    saveRand();
    renderRand();
  }));
  // 遵循禁限表开关(构建时含禁限表才显示;开启:禁止不进池,限制 1 张,准限制 2 张)
  var blBox = $('r-bl');
  blBox.innerHTML = '';
  if (META && META.lflist && META.lflist.enabled) {
    var blName = META.lflist.name || '';
    blBox.appendChild(makeChip(esc(uiL('rBl')) + (blName ? ' · ' + esc(blName) : ''), !!RSTATE.bl,
      function () {
        RSTATE.bl = RSTATE.bl ? 0 : 1;
        saveRand();
        renderRand();
      }));
  }
  var otBox = $('r-ot');
  otBox.innerHTML = '';
  [[0, 'rAll'], [1, 'OCG'], [2, 'TCG']].forEach(function (pair) {
    otBox.appendChild(makeChip(pair[1] === 'rAll' ? esc(uiL('rAll')) : pair[1],
      RSTATE.ot === pair[0], function () {
        RSTATE.ot = pair[0];
        saveRand();
        renderRand();
      }));
  });
  renderRandRuleForm();
}

function renderRandRules() {
  var box = $('rRuleList');
  var uiL = loc('ui');
  if (!RSTATE.rules.length) {
    box.innerHTML = '<div class="rempty">' + esc(uiL('rNoRules')) + '</div>';
    return;
  }
  box.innerHTML = RSTATE.rules.map(function (r, i) {
    return '<div class="rrow"><span class="rdesc">' + esc(randRuleDesc(r)) + '</span>' +
      '<span class="rhits">' + esc(uiL('rHits')) + ' ' + randRuleHits(r).toLocaleString() + '</span>' +
      '<button class="dex" data-rdel="' + i + '">✕</button></div>';
  }).join('');
}

function renderRandExcl() {
  var box = $('rExclList');
  var ids = Object.keys(RSTATE.excluded).map(Number);
  if (!ids.length) {
    box.innerHTML = '<div class="rempty">—</div>';
    return;
  }
  box.innerHTML = ids.map(function (id) {
    var c = cardById[id];
    return '<span class="chip small" data-xdel="' + id + '">' +
      esc(c ? c.n : ('#' + id)) + ' ✕</span>';
  }).join('');
}

// 结果行的第二行基础数据:类型徽章 + 属性色点/种族 + 星级(阶/Link)/攻防 + 灵摆刻度
function randStatsHtml(c) {
  var uiL = loc('ui');
  var bits = decodeTypes(c.t);
  var badges = [];
  for (var i = 0; i < bits.length; i++) {
    var b = bits[i];
    var cls = 'badge';
    if (b === 0x1) cls += ' t-monster cat-mon';
    else if (b === 0x2) cls += ' t-spell';
    else if (b === 0x4) cls += ' t-trap';
    else if (b === 0x4000000) cls += ' t-link';
    else if (b === 0x1000000) cls += ' t-pendulum';
    badges.push('<span class="' + cls + '">' + typeBadgeText(b) + '</span>');
  }
  var parts = [];
  if (c.t & 0x1) {
    for (var a = 0; a < ATTR_BITS.length; a++) {
      if (c.at & ATTR_BITS[a]) {
        parts.push('<span class="dot" style="background:' +
          (ATTR_COLORS[ATTR_BITS[a]] || '#888') + '"></span>' + esc(attrName(ATTR_BITS[a])));
        break;
      }
    }
    for (var r = 0; r < 26; r++) {
      if (c.r & (1 << r)) { parts.push(esc(raceName(1 << r))); break; }
    }
    var lp = levelParts(c);
    var lvLabel;
    if (c.t & 0x4000000) lvLabel = uiL('link') + lp.lv;
    else if (c.t & 0x800000) lvLabel = uiL('rank') + lp.lv;
    else lvLabel = uiL('star') + lp.lv;
    if (c.t & 0x1000) lvLabel += '·T';
    parts.push('<span class="stat">' + lvLabel + '</span>');
    parts.push('<span class="stat">' + uiL('atkShort') + ' ' + fmtAtk(c.atk) + '</span>');
    if (!(c.t & 0x4000000)) {
      parts.push('<span class="stat">' + uiL('defShort') + ' ' + fmtAtk(c.def) + '</span>');
    }
    if ((c.t & 0x1000000) && !(c.t & 0x4000)) {
      parts.push('<span class="stat">' + uiL('scale') + ' ' + lp.lscale + '/' + lp.rscale + '</span>');
    }
  }
  return badges.join(' ') + (parts.length ? ' <span class="dstats">' + parts.join(' ') + '</span>' : '');
}

function randDcardHtml(id, cnt) {
  var c = cardById[id];
  var badges = '';
  var fc = '';
  var pendCls = '';
  if (c) {
    if (c.pre) badges += ' <span class="badge pre">' + esc(loc('ui')('pre')) + '</span>';
    else if (c.zl) badges += ' <span class="badge zhonly">' + esc(loc('ui')('zhOnly')) + '</span>';
    if (c.bl === 0) badges += ' <span class="badge bl0">' + esc(loc('ui')('bl0')) + '</span>';
    else if (c.bl === 1) badges += ' <span class="badge bl1">' + esc(loc('ui')('bl1')) + '</span>';
    else if (c.bl === 2) badges += ' <span class="badge bl2">' + esc(loc('ui')('bl2')) + '</span>';
    fc = frameClassOf(c);
    pendCls = fc.indexOf('f-pend') === 0 ? ' pend-frame' : '';
  }
  return '<div class="dcard ' + fc + pendCls + '" data-id="' + id + '">' +
    '<div class="dl1"><span class="dcnt">' + cnt + '×</span>' +
    '<span class="dname">' + esc(c ? c.n : ('#' + id)) + '</span>' + badges +
    '<span class="dcid">' + id + '</span>' +
    '<button class="dex" data-exone="' + id + '" title="✕">✕</button></div>' +
    (c ? '<div class="dl2">' + randStatsHtml(c) + '</div>' : '') +
    '</div>';
}

function renderRandResult() {
  var box = $('randResult');
  var uiL = loc('ui');
  var e = viewedEntry();
  if (!e) {
    box.innerHTML = '<div class="rempty big">' + esc(uiL('rEmpty')) + '</div>';
    return;
  }
  var h = ['<div class="rreshead"><span class="rts">' + esc(new Date(e.ts).toLocaleString()) + '</span>' +
    '<span class="rsum">' + esc(rfmt(uiL('rHistEntry'), e.main.length, e.extra.length)) + '</span>' +
    '<button class="ghost" data-ract="ydk">' + esc(uiL('rExportYdk')) + '</button>' +
    '<button class="ghost" data-ract="exall">' + esc(uiL('rExAll')) + '</button></div>'];
  var counts = {};
  var order = {};
  e.main.forEach(function (id, i) {
    counts[id] = (counts[id] || 0) + 1;
    if (order[id] === undefined) order[id] = i;
  });
  var KINDS = [['mon', 'mon'], ['spell', 'spell'], ['trap', 'trap']];
  KINDS.forEach(function (pair) {
    var kind = pair[0];
    var ids = Object.keys(counts).map(Number).filter(function (id) {
      var c = cardById[id];
      return c && deckKindOf(c) === kind;
    }).sort(function (a, b) { return order[a] - order[b]; });
    if (!ids.length) return;
    var copies = ids.reduce(function (s, id) { return s + counts[id]; }, 0);
    h.push('<div class="dsec ' + kind + '">' + esc(uiL(kind)) + ' · ' + copies + '</div>');
    ids.forEach(function (id) { h.push(randDcardHtml(id, counts[id])); });
  });
  var extraCounts = {};
  e.extra.forEach(function (id) { extraCounts[id] = (extraCounts[id] || 0) + 1; });
  var extraIds = Object.keys(extraCounts).map(Number).sort(function (a, b) {
    return e.extra.indexOf(a) - e.extra.indexOf(b);
  });
  h.push('<div class="dsec extra">' + esc(uiL('rExtraDeck')) + ' · ' + e.extra.length + '</div>');
  if (!extraIds.length) h.push('<div class="rempty">—</div>');
  extraIds.forEach(function (id) { h.push(randDcardHtml(id, extraCounts[id])); });
  box.innerHTML = h.join('');
}

function renderRandHistory() {
  var box = $('randHistory');
  var uiL = loc('ui');
  if (!RSTATE.history.length) {
    box.innerHTML = '<div class="rempty">—</div>';
    return;
  }
  var rows = [];
  for (var i = RSTATE.history.length - 1; i >= 0; i--) {
    var e2 = RSTATE.history[i];
    rows.push('<div class="hrow' + (i === RSTATE.view ? ' on' : '') + '" data-hview="' + i + '">' +
      '<span class="hts">' + esc(new Date(e2.ts).toLocaleString()) + '</span>' +
      '<span class="hsum">' + esc(rfmt(uiL('rHistEntry'), e2.main.length, e2.extra.length)) + '</span>' +
      '<button class="dex" data-hdel="' + i + '">✕</button></div>');
  }
  box.innerHTML = rows.join('');
}

function renderRand() {
  if (!DATA) return;
  randPools = buildRandPools();
  renderRandStats();
  renderRandForm();
  renderRandRules();
  renderRandExcl();
  renderRandResult();
  renderRandHistory();
}

function bindRandEvents() {
  var numIds = { rMainN: 'mainN', rMinMon: 'minMon', rMinSp: 'minSp', rMinTr: 'minTr', rExtraN: 'extraN' };
  Object.keys(numIds).forEach(function (id) {
    var el = $(id);
    if (!el || el.__rbound) return;
    el.__rbound = 1;
    el.addEventListener('input', function () {
      RSTATE[numIds[id]] = el.value === '' ? 0 : Math.max(0, Math.floor(+el.value || 0));
      saveRand();
      renderRandStats();
    });
  });
  $('rDraw').addEventListener('click', function () {
    if (!DATA) return;
    var r = randDraw();
    if (r.err) { randMsg(r.err, true); return; }
    randMsg('');
    renderRand();
  });
  $('rAddRule').addEventListener('click', randAddRule);
  $('rClearExcl').addEventListener('click', function () {
    RSTATE.excluded = {};
    saveRand();
    renderRand();
  });
  $('rClearHist').addEventListener('click', function () {
    RSTATE.history = [];
    RSTATE.view = -1;
    saveRand();
    renderRand();
  });
  $('rExportPool').addEventListener('click', randExportPool);
  $('rImportPool').addEventListener('click', function () { $('rImportFile').click(); });
  $('rImportFile').addEventListener('change', function () {
    if (this.files && this.files[0]) randImportPool(this.files[0]);
    this.value = '';
  });
  $('randSide').addEventListener('click', function (e) {
    var rd = e.target.closest('[data-rdel]');
    if (rd) {
      RSTATE.rules.splice(+rd.dataset.rdel, 1);
      saveRand();
      renderRand();
      return;
    }
    var xd = e.target.closest('[data-xdel]');
    if (xd) {
      delete RSTATE.excluded[+xd.dataset.xdel];
      saveRand();
      renderRand();
    }
  });
  $('randMain').addEventListener('click', function (e) {
    var act = e.target.closest('[data-ract]');
    if (act) {
      if (act.dataset.ract === 'ydk') {
        randExportYdk();
      } else if (act.dataset.ract === 'exall') {
        var entry = viewedEntry();
        if (entry) {
          var uniq = {};
          entry.main.concat(entry.extra).forEach(function (id) { uniq[id] = 1; });
          randExcludeIds(Object.keys(uniq).map(Number));
          randMsg(rfmt(loc('ui')('rExAllDone'), Object.keys(uniq).length));
        }
      }
      return;
    }
    var ex = e.target.closest('[data-exone]');
    if (ex) {
      var id = +ex.dataset.exone;
      randExcludeIds([id]);
      var c = cardById[id];
      randMsg((c ? c.n : ('#' + id)) + ' ' + loc('ui')('rExcluded'));
      return;
    }
    var hd = e.target.closest('[data-hdel]');
    if (hd) {
      RSTATE.history.splice(+hd.dataset.hdel, 1);
      if (RSTATE.view >= RSTATE.history.length) RSTATE.view = RSTATE.history.length - 1;
      saveRand();
      renderRand();
      return;
    }
    var hv = e.target.closest('.hrow');
    if (hv) {
      RSTATE.view = +hv.dataset.hview;
      renderRandResult();
      renderRandHistory();
      return;
    }
    var row = e.target.closest('.dcard');
    if (row && cardById[+row.dataset.id]) openCard(+row.dataset.id);
  });
  setupRandSetcodeInput();
}

function applyRandLocale() {
  var uiL = loc('ui');
  $('tabSearch').textContent = uiL('tabSearch');
  $('tabRand').textContent = uiL('tabRand');
  var map = {
    'r-h-set': 'rSet', 'r-l-mainn': 'rMainN', 'r-l-minmon': 'rMinMon', 'r-l-minsp': 'rMinSp',
    'r-l-mintr': 'rMinTr', 'r-l-extran': 'rExtraN', 'r-l-cap': 'rCap', 'r-l-ot': 'rOt',
    'r-h-rules': 'rRules', 'r-l-fmain': 'rFMain', 'r-l-fsub': 'rFSub', 'r-l-fattr': 'rFAttr', 'r-l-frace': 'rFRace',
    'r-l-fset': 'rFSet', 'r-h-excl': 'rExcl', 'r-h-pool': 'rPoolFile', 'r-h-hist': 'rHistory'
  };
  Object.keys(map).forEach(function (id) {
    var el = $(id);
    if (el) el.textContent = uiL(map[id]);
  });
  $('rAddRule').textContent = uiL('rAddRule');
  $('rClearExcl').textContent = uiL('rClearExcl');
  $('rExportPool').textContent = uiL('rExportPool');
  $('rImportPool').textContent = uiL('rImportPool');
  $('rDraw').textContent = uiL('rDraw');
  $('rClearHist').textContent = uiL('rClearHist');
  $('rSetcode').placeholder = uiL('rSetPlaceholder');
}

function setMode(mode) {
  var rand = mode === 'rand';
  document.body.classList.toggle('rand-mode', rand);
  $('layout').classList.toggle('hidden', rand);
  $('randLayout').classList.toggle('hidden', !rand);
  $('tabSearch').classList.toggle('on', !rand);
  $('tabRand').classList.toggle('on', rand);
  try { localStorage.setItem('cardsearch.mode', rand ? 'rand' : 'search'); } catch (e) { }
  if (rand) renderRand();
}

/* ================= 数据加载 ================= */

function onLocaleLoaded(locale) {
  var pool = window.CARD_DATA_POOL && window.CARD_DATA_POOL[locale];
  if (!pool) {
    $('status').textContent = '数据加载失败: ' + locale;
    $('status').classList.remove('hidden');
    return;
  }
  DATA = pool.c;
  STRS = pool.s;
  cardById = {};
  aliasIndex = {};
  hiddenIds = {};
  var byName = {};
  for (var i = 0; i < DATA.length; i++) {
    var c = DATA[i];
    cardById[c.id] = c;
    if (c.n) {
      (byName[c.n] = byName[c.n] || []).push(c);
    }
    if (c.al && c.al !== c.id) {
      (aliasIndex[c.al] = aliasIndex[c.al] || []).push(c.id);
    }
  }
  Object.keys(byName).forEach(function (nm) {
    var g = byName[nm];
    if (g.some(function (x) { return x.hs; })) {
      g.forEach(function (x) { if (!x.hs) hiddenIds[x.id] = 1; });
    }
  });
  $('status').classList.add('hidden');
  buildSeriesIndex();
  buildFilterUI();
  refresh();
  applyRandLocale();
  renderRand();
  // 语言切换后,若详情面板正打开则用新语言重新渲染
  if (detailCardId && !$('detailWrap').classList.contains('hidden')) {
    openCard(detailCardId);
  }
}

function switchLocale(locale) {
  if (!L[locale]) return;
  STATE.locale = locale;
  $('locale').value = locale;
  // 已加载过(数据池中存在)则直接切换 —— 修复往返切换时读到被覆盖的全局数据的问题
  if (window.CARD_DATA_POOL && window.CARD_DATA_POOL[locale]) {
    onLocaleLoaded(locale);
    return;
  }
  $('status').textContent = '正在加载 ' + locale + ' 数据…';
  $('status').classList.remove('hidden');
  loadScript('data-' + locale + '.js', function () {
    onLocaleLoaded(locale);
  });
}

/* ================= 事件绑定与启动 ================= */

function bindEvents() {
  var composing = false;
  var search = $('search');
  search.addEventListener('compositionstart', function () { composing = true; });
  search.addEventListener('compositionend', function () { composing = false; doSearch(); });
  search.addEventListener('input', function () { if (!composing) doSearch(); });
  function doSearch() {
    STATE.q = search.value;
    refresh();
  }

  $('locale').addEventListener('change', function () { switchLocale(this.value); });

  $('sortKey').addEventListener('change', function () {
    STATE.sortKey = this.value; refresh();
  });
  $('sortDir').addEventListener('click', function () {
    STATE.sortDir = -STATE.sortDir;
    this.textContent = STATE.sortDir === 1 ? '↑' : '↓';
    refresh();
  });

  $('listWrap').addEventListener('scroll', function () {
    requestAnimationFrame(renderList);
  });
  window.addEventListener('resize', function () {
    listState.start = -1; renderList();
  });

  $('list').addEventListener('click', function (e) {
    var row = e.target.closest('.cardrow');
    if (row) openCard(filtered[+row.dataset.i].id);
  });

  $('detail').addEventListener('click', function (e) {
    if (e.target.classList.contains('close')) { closeDetail(); return; }
    var chip = e.target.closest('[data-goto]');
    if (chip) openCard(+chip.dataset.goto);
  });
  $('detailMask').addEventListener('click', closeDetail);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDetail();
  });

  $('resetFilters').addEventListener('click', function () {
    STATE.main = []; STATE.sub = []; STATE.attr = []; STATE.race = [];
    STATE.cats = []; STATE.tags = []; STATE.setcode = 0;
    STATE.tg = []; STATE.acts = []; STATE.fdesc = []; STATE.pside = []; STATE.ss = []; STATE.effStrict = false; STATE.dedupe = true; STATE.hideToken = true;
    STATE.lvMin = STATE.lvMax = STATE.scMin = STATE.scMax = null;
    STATE.atkMin = STATE.atkMax = STATE.defMin = STATE.defMax = null;
    STATE.ot = 0; STATE.script = 0; STATE.pre = 0; STATE.dedupe = true;
    resetG2State();
    $('setcode').value = '';
    buildFilterUI(); refresh();
  });

  $('toggleFilters').addEventListener('click', function () {
    if (document.body.classList.contains('rand-mode')) $('randSide').classList.toggle('open');
    else $('filters').classList.toggle('open');
  });

  $('tabSearch').addEventListener('click', function () { setMode('search'); });
  $('tabRand').addEventListener('click', function () { setMode('rand'); });

  bindRandEvents();

  document.querySelectorAll('.collhead').forEach(function (h) {
    h.addEventListener('click', function () {
      h.parentElement.classList.toggle('open');
      listState.start = -1;
    });
  });

  setupSetcodeInput();

  // 从分享链接切换 hash 时同步状态(同页 hash 变更不会触发重新加载)
  window.addEventListener('hashchange', function () {
    var keep = STATE.locale;
    STATE.main = []; STATE.sub = []; STATE.attr = []; STATE.race = [];
    STATE.cats = []; STATE.tags = []; STATE.setcode = 0;
    STATE.tg = []; STATE.acts = []; STATE.fdesc = []; STATE.pside = []; STATE.ss = []; STATE.effStrict = false; STATE.dedupe = true; STATE.hideToken = true;
    STATE.lvMin = STATE.lvMax = STATE.scMin = STATE.scMax = null;
    STATE.atkMin = STATE.atkMax = STATE.defMin = STATE.defMax = null;
    STATE.ot = 0; STATE.script = 0; STATE.pre = 0; STATE.bl = 0; STATE.q = '';
    resetG2State();
    readHash();
    $('search').value = STATE.q;
    $('setcode').value = '';
    if (STATE.locale !== keep) switchLocale(STATE.locale);
    else { buildFilterUI(); refresh(); }
  });
}

function init() {
  loadRand();
  bindEvents();
  readHash();
  $('search').value = STATE.q;
  $('locale').value = STATE.locale;
  $('sortKey').value = STATE.sortKey;
  $('sortDir').textContent = STATE.sortDir === 1 ? '↑' : '↓';
  applyRandLocale();
  var mode = 'search';
  try { mode = localStorage.getItem('cardsearch.mode') || 'search'; } catch (e) { }
  setMode(mode);
  loadScript('meta.js', function () {
    META = window.CARD_META;
    switchLocale(STATE.locale);
  });
}

init();
