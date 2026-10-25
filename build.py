#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build.py — 从 ygocore-database + ygopro-scripts 构建自包含的静态卡片搜索应用。

数据源(仅构建时需要):
  ../ygocore-database/locales/<locale>/cards.cdb    SQLite 卡片数据库 (datas + texts)
  ../ygocore-database/locales/<locale>/strings.conf 系统串/字段名/分类名
  ../ygopro-scripts/c<cardid>.lua                   卡片效果脚本 (静态分析)

产物 dist/ 完全自包含,双击 index.html 即可在任意平台浏览器使用。

仅依赖 Python 3 标准库。
"""

import json
import os
import re
import shutil
import sqlite3
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(HERE)
DB_LOCALES_DIR = os.path.join(BASE, "ygocore-database", "locales")
SCRIPTS_DIR = os.path.join(BASE, "ygopro-scripts")
SRC_DIR = os.path.join(HERE, "src")
DIST_DIR = os.path.join(HERE, "dist")

LOCALES = ["zh-CN", "ja-JP", "en-US"]

# ---------------------------------------------------------------------------
# 常量定义 — 与 ygopro-core/common.h 对齐(位掩码)
# ---------------------------------------------------------------------------

TYPE_BITS = {  # bit -> 常量名
    0x1: "MONSTER", 0x2: "SPELL", 0x4: "TRAP",
    0x10: "NORMAL", 0x20: "EFFECT", 0x40: "FUSION", 0x80: "RITUAL",
    0x100: "TRAPMONSTER", 0x200: "SPIRIT", 0x400: "UNION", 0x800: "DUAL",
    0x1000: "TUNER", 0x2000: "SYNCHRO", 0x4000: "TOKEN",
    0x10000: "QUICKPLAY", 0x20000: "CONTINUOUS", 0x40000: "EQUIP",
    0x80000: "FIELD", 0x100000: "COUNTER", 0x200000: "FLIP", 0x400000: "TOON",
    0x800000: "XYZ", 0x1000000: "PENDULUM", 0x2000000: "SPSUMMON",
    0x4000000: "LINK",
}
# strings.conf 中本地化名称的基址:system 1050+bit / 1020+bit / 1010+bit / 1100+bit
SYS_TYPE_BASE = 1050
SYS_RACE_BASE = 1020
SYS_ATTR_BASE = 1010
SYS_CAT_BASE = 1100

RACE_BITS = [1 << i for i in range(26)]  # 0x1 战士 … 0x2000000 幻想魔

ATTR_BITS = [0x1, 0x2, 0x4, 0x8, 0x10, 0x20, 0x40]

LINK_MARKERS = [  # 与 common.h LINK_MARKER_* 对齐
    (0x001, "↙"), (0x002, "↓"), (0x004, "↘"),
    (0x008, "←"), (0x020, "→"),
    (0x040, "↖"), (0x080, "↑"), (0x100, "↗"),
]

# ---------------------------------------------------------------------------
# strings.conf 解析
# ---------------------------------------------------------------------------

def parse_strings_conf_text(text):
    """解析 strings.conf 文本,返回 (sys_dict, setname_dict, counter_dict, victory_dict)"""
    sysd, setname, counter, victory = {}, {}, {}, {}
    for line in text.splitlines():
        line = line.strip().lstrip("\ufeff")
        if not line.startswith("!"):
            continue
        parts = line.split()
        kind = parts[0][1:]
        if kind not in ("system", "setname", "counter", "victory"):
            continue
        if len(parts) < 3:
            continue
        key = parts[1]
        # 名称部分可能含制表符分隔的多个别名,取第一个
        rest = line.split(None, 2)[2] if len(parts) > 2 else ""
        name = rest.split("\t")[0].strip()
        try:
            if kind == "system":
                sysd[int(key)] = name
            elif kind == "setname":
                setname[int(key, 16)] = name
            elif kind == "counter":
                counter[int(key, 16) if key.lower().startswith("0x") else int(key)] = name
            elif kind == "victory":
                victory[int(key, 16) if key.lower().startswith("0x") else int(key)] = name
        except ValueError:
            continue
    return sysd, setname, counter, victory


def parse_strings_conf(path):
    with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
        return parse_strings_conf_text(f.read())


def localized_bit_names(sysd, base, bits):
    """把位列表映射为 [bit0名, bit1名, ...](按 bits 顺序)"""
    return [sysd.get(base + i, "") for i, b in enumerate(bits)]


# ---------------------------------------------------------------------------
# setcode 解包 — 与 ygopro-core/card_data.h check_setcode 语义一致
# ---------------------------------------------------------------------------

def setcode_slots(sc):
    """32 位整数 → 最多 4 个 16 位槽位"""
    slots = []
    for i in range(4):
        v = (sc >> (16 * i)) & 0xFFFF
        if v:
            slots.append(v)
    return slots


def setcode_display_names(slots, setname_dict):
    """槽位 → 展示用字段名列表(含父系列展开,如 真次世代→次世代)"""
    names = []
    for s in slots:
        if s in setname_dict:
            names.append((s, setname_dict[s]))
        parent = s & 0x0FFF
        if parent != s and parent in setname_dict:
            names.append((parent, setname_dict[parent]))
    # 去重保序
    seen, out = set(), []
    for code, name in names:
        if code not in seen:
            seen.add(code)
            out.append((code, name))
    return out


# ---------------------------------------------------------------------------
# 卡片数据库解析
# ---------------------------------------------------------------------------

def load_cards(cdb_path):
    # WAL 模式的 cdb 无法用只读 URI 直接打开(需要创建 -shm/-wal),
    # 拷贝到临时文件后以普通方式打开,既稳妥也不污染源目录
    import tempfile
    tmp = tempfile.NamedTemporaryFile(suffix=".cdb", delete=False)
    tmp.close()
    shutil.copyfile(cdb_path, tmp.name)
    cards = []
    try:
        conn = sqlite3.connect(tmp.name)
        cur = conn.cursor()
        cur.execute(
            "SELECT d.id, d.ot, d.alias, d.setcode, d.type, d.atk, d.def, d.level,"
            "       d.race, d.attribute, d.category, t.name, t.desc "
            "FROM datas d JOIN texts t ON d.id = t.id"
        )
        for row in cur.fetchall():
            (cid, ot, alias, setcode, ctype, atk, dfn, level,
             race, attribute, category, name, desc) = row
            cards.append({
                "id": cid,
                "n": name or "",
                "d": desc or "",
                "t": ctype,
                "atk": atk,
                "def": dfn,
                "lv": level,
                "r": race,
                "at": attribute,
                "sc": setcode,
                "cat": category,
                "ot": ot,
                "al": alias,
            })
        n_datas = cur.execute("SELECT count(*) FROM datas").fetchone()[0]
        n_texts = cur.execute("SELECT count(*) FROM texts").fetchone()[0]
        conn.close()
    finally:
        os.unlink(tmp.name)
    return cards, n_datas, n_texts


def decode_level(level, ctype):
    """level 打包字段 → (等级/Link数, 左刻度, 右刻度, Link箭头位)"""
    lv = level & 0xFF
    lscale = (level >> 24) & 0xFF
    rscale = (level >> 16) & 0xFF
    marker = (level >> 8) & 0x1FF
    return lv, lscale, rscale, marker


# ---------------------------------------------------------------------------
# Lua 脚本静态分析
# ---------------------------------------------------------------------------

RE_SET_TYPE = re.compile(r"SetType\(([^)]*)\)")
RE_SET_CODE = re.compile(r"SetCode\(([^)]*)\)")
RE_SET_CATEGORY = re.compile(r"SetCategory\(([^)]*)\)")
RE_SET_RANGE = re.compile(r"SetRange\(([^)]*)\)")
RE_TOKEN_EFFECT_TYPE = re.compile(r"EFFECT_TYPE_[A-Z0-9_]+")
RE_TOKEN_EVENT = re.compile(r"\bEVENT_[A-Z0-9_]+")
RE_TOKEN_CATEGORY = re.compile(r"CATEGORY_[A-Z0-9_]+")
RE_TOKEN_LOCATION = re.compile(r"LOCATION_[A-Z0-9_]+")
RE_ISSETCARD = re.compile(r"Is(?:Previous|Origin)?SetCard\(([^)]*)\)")
RE_HEX = re.compile(r"0x[0-9a-fA-F]+")
RE_SNM = re.compile(r"aux\.AddSetNameMonsterList\(\s*c\s*,\s*(0x[0-9a-fA-F]+)\s*\)")
RE_CODELIST = re.compile(r"aux\.AddCodeList\(\s*c\s*,\s*([0-9,\s]+)\)")
RE_ISCODE = re.compile(r"\bIsCode\(([^)]*)\)")
RE_NUM = re.compile(r"\b\d{5,10}\b")

SUMMON_PROC = [
    (re.compile(r"aux\.AddXyzProcedure"), "XYZ"),
    (re.compile(r"aux\.AddSynchroProcedure"), "SYNCHRO"),
    (re.compile(r"aux\.AddFusionProc"), "FUSION"),
    (re.compile(r"aux\.AddRitualProc"), "RITUAL"),
    (re.compile(r"aux\.AddLinkProcedure"), "LINK"),
    (re.compile(r"aux\.EnablePendulumAttribute"), "PENDULUM"),
]

ACTION_TYPES = {"EFFECT_TYPE_IGNITION", "EFFECT_TYPE_TRIGGER_O", "EFFECT_TYPE_TRIGGER_F",
                "EFFECT_TYPE_QUICK_O", "EFFECT_TYPE_QUICK_F", "EFFECT_TYPE_ACTIVATE",
                "EFFECT_TYPE_FLIP"}

RE_CREATE_EFFECT = re.compile(r"Effect\.CreateEffect\(([^)]*)\)")
RE_STRINGID = re.compile(r"SetDescription\(\s*aux\.Stringid\([^,]+,\s*(\d+)\s*\)\s*\)")
RE_TOKEN_EFFECTCODE = re.compile(r"\bEFFECT_[A-Z0-9_]+")
# EVENT_PHASE+PHASE_END / EVENT_PHASE_START+PHASE_DRAW 等组合触发
RE_PHASE_COMB = re.compile(r"EVENT_PHASE(?:_START)?\s*\+\s*PHASE_[A-Z0-9_]+")
# SetOperation 引用(具名函数 / 内联函数)
RE_OP_NAMED = re.compile(r"SetOperation\(\s*([\w.]+)\s*\)")
RE_OP_INLINE = re.compile(
    r"SetOperation\(\s*function\s*\([^)]*\)(.*?)\n\s*end\s*\)", re.S)
# 效果实际执行的动作(按重要性排序)
DUEL_ACTION_PATTERNS = [
    (re.compile(r"Duel\.Destroy\("), "DESTROY"),
    (re.compile(r"Duel\.Negate(?:Effect|Activation)\("), "NEGATE"),
    (re.compile(r"Duel\.Remove\("), "REMOVE"),
    (re.compile(r"Duel\.SendtoHand\("), "TOHAND"),
    (re.compile(r"Duel\.SendtoDeck\("), "TODECK"),
    (re.compile(r"Duel\.SendtoGrave\("), "TOGRAVE"),
    (re.compile(r"Duel\.SpecialSummon(?:Step)?\("), "SPSUMMON"),
    (re.compile(r"Duel\.Draw\("), "DRAW"),
    (re.compile(r"Duel\.Damage\("), "DAMAGE"),
    (re.compile(r"Duel\.Recover\("), "RECOVER"),
    (re.compile(r"Duel\.ChangePosition\("), "POSITION"),
    (re.compile(r"Duel\.Release\("), "RELEASE"),
    (re.compile(r"Duel\.(?:Get|Swap)Control\("), "CONTROL"),
    (re.compile(r"Duel\.Equip\("), "EQUIP"),
    (re.compile(r"Duel\.MoveToField\("), "MOVE"),
]


def _scan_actions(text):
    """从效果的操作函数文本中提取实际执行的动作"""
    acts = []
    for pat, key in DUEL_ACTION_PATTERNS:
        if pat.search(text) and key not in acts:
            acts.append(key)
    return acts[:6]


def _operation_bodies(seg, src):
    """收集效果的操作函数体:内联 function(...) end 与具名函数定义"""
    bodies = [m.group(1) for m in RE_OP_INLINE.finditer(seg)]
    for nm in set(RE_OP_NAMED.findall(seg)):
        if nm in ("aux.NULL",):
            continue
        fm = re.search(r"function\s+" + re.escape(nm) +
                       r"\s*\([^)]*\)(.*?)\nend", src, re.S)
        if fm:
            bodies.append(fm.group(1))
    return bodies


RE_TG_NAMED = re.compile(r"SetTarget\(\s*([\w.]+)\s*\)")

# 动作-对象数据流关联:Duel.Verb(arg) 的实参若来自某选择/取组调用,
# 则该动作的对象区域/方位/限定可精确追溯
AO_VERB_KEYS = {
    "Destroy": "DESTROY", "Remove": "REMOVE", "SendtoHand": "TOHAND",
    "SendtoDeck": "TODECK", "SendtoGrave": "TOGRAVE",
    "SpecialSummon": "SPSUMMON", "SpecialSummonStep": "SPSUMMON",
    "Release": "RELEASE", "GetControl": "CONTROL", "SwapControl": "CONTROL",
}
RE_ACTION_OBJ = re.compile(
    r"Duel\.(Destroy|Remove|SendtoHand|SendtoDeck|SendtoGrave|SpecialSummonStep"
    r"|SpecialSummon|Release|GetControl|SwapControl)\("
    r"\s*(Duel\.\w+\([^()]*(?:\([^()]*\)[^()]*)*\)|e:GetHandler\(\)|[\w.]+)")
RE_ASSIGN_CALL = re.compile(
    r"(?:local\s+)?([\w.]+)\s*=\s*(Duel\.\w+\([^()]*(?:\([^()]*\)[^()]*)*\))")
# 变量链:local tc=g:GetFirst() → 回溯 g 的选择调用;local c=e:GetHandler() → 自身
RE_GETFIRST = re.compile(r"(?:local\s+)?([\w.]+)\s*=\s*([\w.]+):Get(?:First|Next)\(\)")
RE_SELF_ASSIGN = re.compile(r"(?:local\s+)?([\w.]+)\s*=\s*e:GetHandler\(\)")


def _action_objects(bodies, src):
    """追溯动作实参到选择/取组调用,得到各动作对象的空间信息。

    支持:内联调用、单级变量赋值、GetFirst/GetNext 变量链、e:GetHandler()(自身)。
    """
    text = "\n".join(bodies)
    assign_cache = {m.group(1): m.group(2) for m in RE_ASSIGN_CALL.finditer(text)}
    self_vars = {m.group(1) for m in RE_SELF_ASSIGN.finditer(text)}
    target_vars = {m.group(1) for m in re.finditer(
        r"(?:local\s+)?([\w.]+)\s*=\s*Duel\.GetFirstTarget\(\)", text)}
    hop = {m.group(1): m.group(2) for m in RE_GETFIRST.finditer(text)}

    def resolve(var, depth=0):
        if var == "e:GetHandler()" or var in self_vars:
            return "SELF"
        if var == "Duel.GetFirstTarget()" or var in target_vars:
            return "TARGET"
        if var in assign_cache:
            return assign_cache[var]
        if var in hop and depth < 3:
            return resolve(hop[var], depth + 1)
        return None

    ao = {}
    for m in RE_ACTION_OBJ.finditer(text):
        key = AO_VERB_KEYS[m.group(1)]
        arg = m.group(2)
        if arg.startswith("Duel."):
            call = arg
        else:
            call = resolve(arg)
        if not call:
            continue
        self_flag = 0
        tgt_flag = 0
        if call == "SELF":
            self_flag = 1
            zones, side, descs = [], "SELF", []
        elif call == "TARGET":
            # 对象来自本效果的 SelectTarget,区域信息由调用方回填
            tgt_flag = 1
            zones, side, descs = [], None, []
        else:
            cm = RE_SEL_CALL.search(call)
            if not cm:
                continue
            zones, side, _, descs = _sel_info([(cm.group(1), cm.group(2))], src)
        if not (zones or side or descs) and not self_flag and not tgt_flag:
            continue
        prev = ao.get(key)
        if prev:
            zones = sorted(set(prev["z"]) | set(zones))
            sset = {x for x in (prev["s"], side) if x}
            side = "BOTH" if {"SELF", "OPP"} <= sset else (sset.pop() if sset else None)
            descs = list(dict.fromkeys((prev.get("f") or []) + descs))
            self_flag = prev.get("self", 0) or self_flag
            tgt_flag = prev.get("tgt", 0) or tgt_flag
        ao[key] = {"z": zones, "s": side, "f": descs,
                   "self": self_flag, "tgt": tgt_flag}
    return ao
RE_TG_INLINE = re.compile(
    r"SetTarget\(\s*function\s*\([^)]*\)(.*?)\n\s*end\s*\)", re.S)
# 选择/取组调用:不同 API 参数布局不同
#   SelectTarget/SelectMatchingCard: (tp, f, player, s, o, min, max, …)
#   GetMatchingGroup/Card, IsExistingMatchingCard: (f, tp, s, o, …)
#   GetFieldGroup: (tp, s, o)
RE_SEL_CALL = re.compile(
    r"Duel\.(SelectTarget|SelectMatchingCard|GetMatchingGroup|GetMatchingCard"
    r"|IsExistingMatchingCard|GetFieldGroup)\(([^()]*(?:\([^()]*\)[^()]*)*)\)",
    re.S)
RE_SETCL = re.compile(r"SetCountLimit\(\s*(\d+)")

# 自肃:作用于自己/双方的召唤/盖放/发动限制
SR_CODES = {
    "EFFECT_CANNOT_SPECIAL_SUMMON": "SPSUMMON",
    "EFFECT_CANNOT_SUMMON": "SUMMON",
    "EFFECT_CANNOT_MSET": "SET",
    "EFFECT_CANNOT_SSET": "SET",
    "EFFECT_CANNOT_FLIP_SUMMON": "FLIP",
    "EFFECT_LIMIT_SPECIAL_SUMMON_POSITION": "POS",
    "EFFECT_SPSUMMON_COUNT_LIMIT": "SPCOUNT",
    "EFFECT_CANNOT_ACTIVATE": "ACT",
}
RE_TGRANGE = re.compile(r"SetTargetRange\(\s*([01])\s*,\s*([01])\s*\)")
RE_SR_SETVALUE = re.compile(r"SetValue\(\s*(\d+)")
RE_SR_ALLOW = [
    (re.compile(r"not\s+\w+:IsSetCard\(\s*(0x[0-9a-fA-F]+)"), "SET:%s"),
    (re.compile(r"not\s+\w+:IsRace\(\s*(RACE_\w+)"), "RACE:%s"),
    (re.compile(r"not\s+\w+:IsType\(\s*(TYPE_\w+)"), "TYPE:%s"),
    (re.compile(r"not\s+\w+:IsAttribute\(\s*(ATTRIBUTE_\w+)"), "ATTR:%s"),
]


def _target_bodies(seg, src):
    bodies = [m.group(1) for m in RE_TG_INLINE.finditer(seg)]
    for nm in set(RE_TG_NAMED.findall(seg)):
        if nm in ("aux.TRUE", "aux.FALSE"):
            continue
        fm = re.search(r"function\s+" + re.escape(nm) +
                       r"\s*\([^)]*\)(.*?)\nend", src, re.S)
        if fm:
            bodies.append(fm.group(1))
    return bodies


# 以玩家为对象的动作:首参 tp(自己) / 1-tp(对方)
RE_PLAYER_ACTION = [
    (re.compile(r"Duel\.Damage\(\s*(tp|1-tp)\b"), "DAMAGE"),
    (re.compile(r"Duel\.Recover\(\s*(tp|1-tp)\b"), "RECOVER"),
    (re.compile(r"Duel\.Draw\(\s*(tp|1-tp)\b"), "DRAW"),
]


def _player_actions(text):
    """提取以玩家为对象的动作及其方位(Damage/Recover/Draw 首参)"""
    out = {}
    for pat, key in RE_PLAYER_ACTION:
        sides = set()
        for pm in pat.finditer(text):
            sides.add("SELF" if pm.group(1) == "tp" else "OPP")
        if sides:
            out[key] = "BOTH" if len(sides) > 1 else sides.pop()
    return out


def _filter_desc(filter_name, src):
    """解析选择调用的过滤函数,提取卡片限定(怪兽/魔法/陷阱/表侧/字段)"""
    if not filter_name or filter_name in ("nil", "aux.TRUE", "aux.FALSE",
                                           "aux.NOTFILTERED"):
        return []
    fm = re.search(r"function\s+" + re.escape(filter_name) +
                   r"\s*\([^)]*\)(.*?)\nend", src, re.S)
    if not fm:
        return []
    body = fm.group(1)
    desc = []
    if "IsRace(" in body or "TYPE_MONSTER" in body:
        desc.append("MON")
    if "TYPE_SPELL" in body:
        desc.append("SPELL")
    if "TYPE_TRAP" in body:
        desc.append("TRAP")
    if "IsFaceup" in body:
        desc.append("FACEUP")
    m = re.search(r"IsSetCard\(\s*(0x[0-9a-fA-F]+)", body)
    if m:
        desc.append("SET:" + m.group(1))
    return desc


def _sel_info(calls, src):
    """从选择/取组调用中提取区域、方位、数量与卡片限定。

    按 API 参数布局定位 己方区域(s)/对方区域(o) 两个参数;
    MZONE/SZONE 区域可推断卡片限定(怪兽/魔陷);过滤函数解析额外限定。
    """
    zones, sides, counts, descs = [], [], [], []
    for kind, args in calls:
        parts = [p.strip() for p in args.split(",")]
        if kind in ("SelectTarget", "SelectMatchingCard"):
            fidx, sidx, oidx = 1, 3, 4
            flip = len(parts) > 2 and parts[2] == "1-tp"
        elif kind == "GetFieldGroup":
            fidx, sidx, oidx = None, 1, 2
            flip = False
        else:  # GetMatchingGroup / GetMatchingCard / IsExistingMatchingCard
            fidx, sidx, oidx = 0, 2, 3
            flip = False
        sloc = parts[sidx] if len(parts) > sidx else ""
        oloc = parts[oidx] if len(parts) > oidx else ""
        s_has = "LOCATION" in sloc
        o_has = "LOCATION" in oloc
        if flip:
            s_has, o_has = o_has, s_has
        for loc in (sloc, oloc):
            zones.extend(RE_TOKEN_LOCATION.findall(loc))
        side = "BOTH" if (s_has and o_has) else ("SELF" if s_has else ("OPP" if o_has else None))
        if side:
            sides.append(side)
        if kind == "SelectTarget":
            ints = [int(p) for p in parts if re.fullmatch(r"\d+", p)]
            if len(ints) >= 2:
                counts.append((ints[-2], ints[-1]))
        if fidx is not None and len(parts) > fidx:
            descs.extend(_filter_desc(parts[fidx], src))
    # 区域推断卡片限定:怪兽区→怪兽,魔陷区→魔陷
    if "LOCATION_MZONE" in zones and "MON" not in descs:
        descs.append("MON")
    if "LOCATION_SZONE" in zones and not ({"SPELL", "TRAP"} & set(descs)):
        descs.append("ST")
    zones = sorted(set(zones))
    descs = list(dict.fromkeys(descs))
    if {"SELF", "OPP"} <= set(sides):
        side = "BOTH"
    else:
        side = sides[0] if sides else None
    return zones, side, counts, descs

QUICK_TYPES = {"EFFECT_TYPE_QUICK_O", "EFFECT_TYPE_QUICK_F"}
TRIGGER_TYPES = {"EFFECT_TYPE_TRIGGER_O", "EFFECT_TYPE_TRIGGER_F"}


def analyze_script_src(src):
    """对 Lua 脚本文本做静态分析,返回派生元数据。

    按 Effect.CreateEffect 把脚本切分为效果段,每段独立收集
    SetType/SetCode/SetCategory/SetRange —— 派生标签(如"手坑")
    要求类型与区域出现在同一个效果内,避免跨效果误判。
    """
    effects = []
    creates = list(RE_CREATE_EFFECT.finditer(src))
    for i, m in enumerate(creates):
        seg_end = creates[i + 1].start() if i + 1 < len(creates) else len(src)
        seg = src[m.end():seg_end]
        # CreateEffect(c) 为本卡效果;参数为其他(如 e:GetHandler()/tc)则是
        # 运行时赋予到别的卡上的效果 —— 前端用 ↳ 标示,不占用编号
        granted = 0 if m.group(1).strip() == "c" else 1
        et = sorted({m for arg in RE_SET_TYPE.findall(seg)
                     for m in RE_TOKEN_EFFECT_TYPE.findall(arg)})
        ev = sorted({m for arg in RE_SET_CODE.findall(seg)
                     for m in RE_TOKEN_EVENT.findall(arg)})
        # 组合触发:EVENT_PHASE+PHASE_END 等,保留完整阶段信息
        combos = {c.replace(" ", "")
                  for arg in RE_SET_CODE.findall(seg)
                  for c in RE_PHASE_COMB.findall(arg)}
        if combos:
            ev = sorted((set(ev) - {"EVENT_PHASE", "EVENT_PHASE_START"}) | combos)
        cats = sorted({m for arg in RE_SET_CATEGORY.findall(seg)
                       for m in RE_TOKEN_CATEGORY.findall(arg)})
        rg = sorted({m for arg in RE_SET_RANGE.findall(seg)
                     for m in RE_TOKEN_LOCATION.findall(arg)})
        md = RE_STRINGID.search(seg)
        d = int(md.group(1)) if md else None
        cd = sorted({m for arg in RE_SET_CODE.findall(seg)
                     for m in RE_TOKEN_EFFECTCODE.findall(arg)})
        # 过滤纯过程性声明(如"不可无效化的特殊召唤条件"):
        # 只有 SINGLE 类型、无事件/分类/区域/描述,且带 CANNOT_DISABLE 标记
        if not (et or ev or cats or rg or cd):
            continue
        if et == ["EFFECT_TYPE_SINGLE"] and not (ev or cats or rg or d or cd):
            continue
        if (et == ["EFFECT_TYPE_SINGLE"] and not (ev or cats or rg or d)
                and ("EFFECT_FLAG_CANNOT_DISABLE" in seg or "SPSUMMON_CONDITION" in seg)):
            continue
        # 操作函数中实际执行的动作(回到手卡/破坏/除外…)
        op_bodies = _operation_bodies(seg, src)
        tg_bodies = _target_bodies(seg, src)
        scan_text = "\n".join(op_bodies + tg_bodies)
        acts = _scan_actions("\n".join(op_bodies)) if (et or ev or cats or rg or cd) else []
        ao = _action_objects(op_bodies + tg_bodies, src)
        sel_calls = RE_SEL_CALL.findall(scan_text)
        t_calls = [c for c in sel_calls if c[0] == "SelectTarget"]
        s_calls = [c for c in sel_calls if c[0] != "SelectTarget"]
        has_target = ("EFFECT_FLAG_CARD_TARGET" in seg or bool(t_calls)
                      or "Duel.SetTargetCard(" in scan_text)
        is_action = bool(ACTION_TYPES & set(et))
        if has_target:
            tg = 1
        elif is_action:
            tg = 0
        else:
            tg = None
        tz, tsd, tcnt, tfd = _sel_info(t_calls, src)
        sz, ssd, _, sfd = _sel_info(s_calls, src)
        pa = _player_actions(scan_text)
        clm = RE_SETCL.search(seg)
        cl = int(clm.group(1)) if clm else 0
        effect = {"et": et, "ev": ev, "cat": cats, "rg": rg,
                  "d": d, "cd": cd, "g": granted, "act": acts}
        if tg is not None:
            effect["tg"] = tg
            if tz:
                effect["tz"] = tz
                if tsd:
                    effect["tsd"] = tsd
                if len(tcnt) == 1:
                    effect["tn"] = list(tcnt[0])
        if tfd:
            effect["tf"] = tfd
        if sz:
            effect["sz"] = sz
            if ssd:
                effect["ssd"] = ssd
        if sfd:
            effect["sf"] = sfd
        if ao:
            # GetFirstTarget 来源的对象:回填 SelectTarget 的区域/方位/限定
            for obj in ao.values():
                if obj.get("tgt"):
                    if tz and not obj["z"]:
                        obj["z"] = tz
                    if tsd and not obj["s"]:
                        obj["s"] = tsd
                    if tfd:
                        obj["f"] = list(dict.fromkeys((obj.get("f") or []) + tfd))
        if pa:
            effect["ap"] = pa
        if ao:
            effect["ao"] = ao
        if 1 <= cl <= 3:
            effect["cl"] = cl
        # 自肃检测:限制类效果码 + 作用于自己(1,0)或双方(1,1)
        srk = None
        srs = None
        for code, kind in SR_CODES.items():
            if code in cd:
                mr = RE_TGRANGE.search(seg)
                if mr:
                    a, b = mr.group(1), mr.group(2)
                    if a == "1" and b == "0":
                        srs = "SELF"
                    elif a == "1" and b == "1":
                        srs = "BOTH"
                if srs:
                    srk = kind
                break
        if srk:
            srtext = "\n".join(tg_bodies)
            sra = []
            for rx, fmt in RE_SR_ALLOW:
                ma = rx.search(srtext)
                if ma:
                    sra.append(fmt % ma.group(1))
            mm2 = re.search(r"SUMMON_TYPE_(\w+)", seg + srtext)
            srm = mm2.group(1) if mm2 else None
            mv = RE_SR_SETVALUE.search(seg)
            effect["sr"] = 1
            effect["srk"] = srk
            effect["srs"] = srs
            if sra:
                effect["sra"] = sra
            if srm:
                effect["srm"] = srm
            if srk == "SPCOUNT" and mv:
                effect["srn"] = int(mv.group(1))
            if "PHASE_END" in seg:
                effect["srd"] = "TURN"
        effects.append(effect)

    et = sorted({t for e in effects for t in e["et"]})
    ev = sorted({t for e in effects for t in e["ev"]})
    cats = sorted({t for e in effects for t in e["cat"]})
    rg = sorted({t for e in effects for t in e["rg"]})

    ref_sc = sorted({int(h, 16) for arg in RE_ISSETCARD.findall(src)
                     for h in RE_HEX.findall(arg)})

    snm = sorted({int(m.group(1), 16) for m in RE_SNM.finditer(src)})

    rel = []
    for m in RE_CODELIST.finditer(src):
        for n in re.findall(r"\d+", m.group(1)):
            rel.append(int(n))
    for arg in RE_ISCODE.findall(src):
        for n in RE_NUM.findall(arg):
            rel.append(int(n))
    rel = sorted(set(rel))[:60]

    def is_action(e):
        return bool(ACTION_TYPES & set(e["et"]))

    tags = []
    has_quick = bool(QUICK_TYPES & set(et))
    has_trigger = bool(TRIGGER_TYPES & set(et))
    if has_quick:
        tags.append("QUICK")
    if has_trigger:
        tags.append("TRIGGER")
    if "EFFECT_TYPE_IGNITION" in et:
        tags.append("IGNITION")
    if "EFFECT_TYPE_CONTINUOUS" in et:
        tags.append("CONTINUOUS")
    if "EFFECT_TYPE_FLIP" in et:
        tags.append("FLIP")
    if "EFFECT_TYPE_EQUIP" in et:
        tags.append("EQUIP")
    # 手坑:同一效果为诱发即时类型且从手卡发动
    if any((QUICK_TYPES & set(e["et"])) and "LOCATION_HAND" in e["rg"]
           for e in effects):
        tags.append("HAND_TRAP")
    # 墓地效果:同一可发动效果位于墓地/除外区
    if any(is_action(e) and ("LOCATION_GRAVE" in e["rg"] or "LOCATION_REMOVED" in e["rg"])
           for e in effects):
        tags.append("GRAVE_EFFECT")

    sum_tags = [tag for rx, tag in SUMMON_PROC if rx.search(src)]
    for t in sum_tags:
        if t not in tags:
            tags.append(t)
    # 自肃标签:任一效果含自肃限制
    if any(e.get("sr") for e in effects):
        tags.append("SELF_LOCK")

    # 陷阱怪兽:数据库 type 不含 0x100 位(引擎运行时才加),按脚本
    # TYPES_*TRAP_MONSTER 常量识别,构建时补上该位
    tm = 1 if "TRAP_MONSTER" in src else 0

    return {
        "eff": effects,
        "et": et, "ev": ev, "cats": cats, "rg": rg,
        "ref": ref_sc, "snm": snm, "rel": rel, "tags": tags,
        "tm": tm,
    }


def analyze_script(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return analyze_script_src(f.read())
    except OSError:
        return None


def build_script_meta():
    meta = {}
    t0 = time.time()
    files = [f for f in os.listdir(SCRIPTS_DIR)
             if f.startswith("c") and f.endswith(".lua")]
    for fn in files:
        cid_s = fn[1:-4]
        if not cid_s.isdigit():
            continue
        info = analyze_script(os.path.join(SCRIPTS_DIR, fn))
        if info:
            meta[int(cid_s)] = info
    sys.stderr.write("脚本分析: %d/%d 个文件, 耗时 %.1fs\n"
                     % (len(meta), len(files), time.time() - t0))
    return meta


# ---------------------------------------------------------------------------
# ygopro-super-pre.ypk 先行卡包支持
# ---------------------------------------------------------------------------

YPK_DEFAULT = os.path.join(BASE, "ygopro-super-pre.ypk")
LFLIST_DEFAULT = os.path.join(BASE, "lflist.conf")


def load_ypk(ypk_path):
    """读取先行卡包(ZIP)。

    结构: test-release.cdb(先行卡) + test-update.cdb(已有卡更新)
          + test-strings.conf(新增字段/指示物, 带 BOM) + script/c<id>.lua(最新脚本)
    返回 (release_cards, update_cards, extra_setnames, extra_scripts, extra_counters)
    """
    import tempfile
    import zipfile
    release, updates, setnames, counters, scripts = [], [], {}, {}, {}
    with zipfile.ZipFile(ypk_path) as z:
        names = z.namelist()

        def read_cdb(member):
            tmp = tempfile.NamedTemporaryFile(suffix=".cdb", delete=False)
            tmp.write(z.read(member))
            tmp.close()
            try:
                cards, _, _ = load_cards(tmp.name)
                return cards
            finally:
                os.unlink(tmp.name)

        for member in names:
            bn = os.path.basename(member).lower()
            if bn == "test-release.cdb":
                release = read_cdb(member)
            elif bn == "test-update.cdb":
                updates = read_cdb(member)
            elif bn == "test-strings.conf":
                _, sn, ct, _ = parse_strings_conf_text(
                    z.read(member).decode("utf-8-sig", errors="replace"))
                setnames, counters = sn, ct

        for member in names:
            bn = os.path.basename(member)
            if member.lower().startswith("script/") and \
                    bn.startswith("c") and bn.endswith(".lua"):
                cid = bn[1:-4]
                if cid.isdigit():
                    info = analyze_script_src(
                        z.read(member).decode("utf-8", errors="replace"))
                    if info:
                        scripts[int(cid)] = info
    return release, updates, setnames, counters, scripts


# ---------------------------------------------------------------------------
# 输出
# ---------------------------------------------------------------------------

def write_js(path, assignments):
    """assignments: [(varname, obj)] → window.<varname> = <json>;"""
    with open(path, "w", encoding="utf-8") as f:
        for name, obj in assignments:
            f.write("window.%s = %s;\n" % (name, json.dumps(
                obj, ensure_ascii=False, separators=(",", ":"))))


def parse_lflist(path):
    """解析 ygopro lflist.conf,取最新的 OCG 禁限表。

    格式:!节名 开新表(文件按新到旧排列,TCG 表名带 " TCG" 后缀);
    节内 #forbidden/#limit/#semi limit 为子节注释;条目 = "密码 数量 --注释",
    数量 0=禁止 1=限制 2=准限制,密码可能有前导零。
    返回 (节名, {code: count});找不到表时返回 (None, {})。
    """
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()
    sections = []  # [(name, {code: count})]
    cur = None
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("!"):
            cur = {}
            sections.append((line[1:].strip(), cur))
        elif line[0].isdigit() and cur is not None:
            parts = line.split()
            try:
                code = int(parts[0])
                count = int(parts[1]) if len(parts) > 1 else 0
            except (ValueError, IndexError):
                continue
            if count in (0, 1, 2) and code > 0:
                cur[code] = count
        # 其余(# 注释/子节头/$ 白名单标记)跳过
    for name, m in sections:
        if "TCG" not in name and m:
            return name, m
    if sections and sections[0][1]:
        return sections[0][0], sections[0][1]
    return None, {}


def stamp_lflist(cards, lfmap):
    """给卡打 bl 字段(0=禁止 1=限制 2=准限制);不在表内的不打(视为无限制)。

    禁限按卡名生效:异画卡(al 指向原版)与原版共享状态,取组内最严。
    """
    parent = {}  # 异画 id -> 原版 id
    for c in cards:
        al = c.get("al") or 0
        if al and al != c["id"]:
            parent[c["id"]] = al

    def group_root(i):
        seen = set()
        while i in parent and i not in seen:
            seen.add(i)
            i = parent[i]
        return i

    group = {}  # 组根 id -> 最严状态
    for code, cnt in lfmap.items():
        r = group_root(code)
        if r not in group or cnt < group[r]:
            group[r] = cnt
    for c in cards:
        st = group.get(group_root(c["id"]))
        if st is not None:
            c["bl"] = st


def build():
    os.makedirs(DIST_DIR, exist_ok=True)

    # 0. 先行卡包(--ypk 指定路径,默认自动检测 BASE 下的 ygopro-super-pre.ypk;--no-ypk 禁用)
    ypk_path = None
    args = sys.argv[1:]
    if "--no-ypk" not in args:
        for i, a in enumerate(args):
            if a == "--ypk" and i + 1 < len(args):
                ypk_path = args[i + 1]
        if ypk_path is None and os.path.exists(YPK_DEFAULT):
            ypk_path = YPK_DEFAULT
        if ypk_path is not None and not os.path.exists(ypk_path):
            sys.exit("找不到 ypk: %s" % ypk_path)

    # 1. Lua 脚本静态分析(语言无关)
    script_meta = build_script_meta()

    # 1.5 先行卡包
    ypk_info = {"enabled": False}
    release_cards, update_cards, extra_setnames, extra_counters = [], [], {}, {}
    if ypk_path:
        release_cards, update_cards, extra_setnames, extra_counters, ypk_scripts = \
            load_ypk(ypk_path)
        n_override = sum(1 for cid in ypk_scripts if cid in script_meta)
        for cid, info in ypk_scripts.items():
            script_meta[cid] = info  # ypk 内脚本较新,直接覆盖
        ypk_info = {
            "enabled": True,
            "source": os.path.basename(ypk_path),
            "mtime": time.strftime("%Y-%m-%d %H:%M:%S",
                                   time.localtime(os.path.getmtime(ypk_path))),
            "releaseCount": len(release_cards),
            "updateCount": len(update_cards),
            "scriptCount": len(ypk_scripts),
            "scriptOverride": n_override,
            "newSetnames": len(extra_setnames),
        }
        sys.stderr.write(
            "先行卡包 %s (修改于 %s): 先行 %d 张, 卡片更新 %d 条, 脚本 %d 个"
            "(其中覆盖旧分析 %d 个), 新增字段 %d 个\n"
            % (ypk_info["source"], ypk_info["mtime"], len(release_cards),
               len(update_cards), len(ypk_scripts), n_override,
               len(extra_setnames)))

    # 1.6 禁限表(--lflist 指定路径,默认自动检测 BASE 下的 lflist.conf;--no-lflist 禁用)
    lf_path = None
    if "--no-lflist" not in args:
        for i, a in enumerate(args):
            if a == "--lflist" and i + 1 < len(args):
                lf_path = args[i + 1]
        if lf_path is None and os.path.exists(LFLIST_DEFAULT):
            lf_path = LFLIST_DEFAULT
        if lf_path is not None and not os.path.exists(lf_path):
            sys.exit("找不到 lflist: %s" % lf_path)
    lf_name, lfmap = (None, {})
    lf_info = {"enabled": False}
    if lf_path:
        lf_name, lfmap = parse_lflist(lf_path)
        if not lfmap:
            sys.exit("lflist 解析失败(无有效条目): %s" % lf_path)
        lf_info = {
            "enabled": True,
            "source": os.path.basename(lf_path),
            "mtime": time.strftime("%Y-%m-%d %H:%M:%S",
                                   time.localtime(os.path.getmtime(lf_path))),
            "name": lf_name,
            "entries": len(lfmap),
            "n0": sum(1 for v in lfmap.values() if v == 0),
            "n1": sum(1 for v in lfmap.values() if v == 1),
            "n2": sum(1 for v in lfmap.values() if v == 2),
        }
        sys.stderr.write("禁限表 %s [%s]: 禁止 %d / 限制 %d / 准限制 %d\n"
                         % (lf_info["source"], lf_name, lf_info["n0"],
                            lf_info["n1"], lf_info["n2"]))

    # 2. 各语言数据库
    total_cards = 0
    n_merged_update = n_merged_new = 0
    all_member_setcodes = {}  # code -> 出现次数(用于字段筛选下拉)
    card_type_map = {}        # id -> type(用于自身破坏对象的限定回填)
    for locale in LOCALES:
        loc_dir = os.path.join(DB_LOCALES_DIR, locale)
        cdb = os.path.join(loc_dir, "cards.cdb")
        conf = os.path.join(loc_dir, "strings.conf")
        if not os.path.exists(cdb):
            sys.exit("缺少 %s" % cdb)
        cards, n_datas, n_texts = load_cards(cdb)
        if n_datas != n_texts or len(cards) != n_datas:
            sys.exit("[%s] 行数不一致: datas=%d texts=%d joined=%d"
                     % (locale, n_datas, n_texts, len(cards)))
        sysd, setname, counter, victory = parse_strings_conf(conf)

        # 合并先行卡包(ypk 文本为简体中文)
        # 先行卡:各语言共用中文文本(带"先行"标记);
        # 更新卡:仅简中接受文本覆盖,日/英只更新数据字段、保留本地文本
        by_id = {c["id"]: c for c in cards}
        for uc in update_cards:
            if uc["id"] in by_id:
                if locale == LOCALES[0]:
                    by_id[uc["id"]].update(uc)
                else:
                    by_id[uc["id"]].update(
                        {k: v for k, v in uc.items() if k not in ("n", "d")})
                if locale == LOCALES[0]:
                    n_merged_update += 1
            else:
                if locale == LOCALES[0]:
                    cards.append(uc)
                    by_id[uc["id"]] = uc
                    n_merged_new += 1
                else:
                    # 该语言主库没有这张卡:以简中文本补入并标记(详情页有说明)
                    uc2 = dict(uc)
                    uc2["zl"] = 1
                    cards.append(uc2)
                    by_id[uc2["id"]] = uc2
        for rc in release_cards:
            rc2 = dict(rc)
            rc2["pre"] = 1
            if rc2["id"] in by_id:
                by_id[rc2["id"]].update(rc2)
            else:
                cards.append(rc2)
                by_id[rc2["id"]] = rc2

        for c in cards:
            c["hs"] = 1 if c["id"] in script_meta else 0
            sm0 = script_meta.get(c["id"])
            # 陷阱怪兽:按脚本识别补 type 0x100 位
            if sm0 and sm0.get("tm"):
                c["t"] = c["t"] | 0x100
            card_type_map[c["id"]] = c["t"]
            for s in setcode_slots(c["sc"]):
                all_member_setcodes[s] = all_member_setcodes.get(s, 0) + 1
            sm = script_meta.get(c["id"])
            if sm:
                for s in sm["snm"]:
                    all_member_setcodes[s] = all_member_setcodes.get(s, 0) + 1

        # 禁限表打标(bl: 0=禁止 1=限制 2=准限制;无字段=无限制;异画组共享)
        if lfmap:
            stamp_lflist(cards, lfmap)

        # strings.conf 的本地化名称按"位序号"索引(第 N 位 → base+N)
        strs = {
            "type": {str(b): sysd.get(SYS_TYPE_BASE + (b.bit_length() - 1), "")
                     for b in TYPE_BITS},
            "race": {str(b): sysd.get(SYS_RACE_BASE + (b.bit_length() - 1), "")
                     for b in RACE_BITS},
            "attr": {str(b): sysd.get(SYS_ATTR_BASE + (b.bit_length() - 1), "")
                     for b in ATTR_BITS},
            "cat": {str(1 << i): sysd.get(SYS_CAT_BASE + i, "")
                    for i in range(32)},
            "setname": {("%x" % k): v for k, v in setname.items()},
            "counter": {str(k): v for k, v in counter.items()},
            "victory": {str(k): v for k, v in victory.items()},
        }
        # ypk 新增字段并入(名称为简中,各语言共用)
        for k, v in extra_setnames.items():
            strs["setname"].setdefault("%x" % k, v)
        for k, v in extra_counters.items():
            strs["counter"].setdefault(str(k), v)

        out = os.path.join(DIST_DIR, "data-%s.js" % locale)
        with open(out, "w", encoding="utf-8") as f:
            f.write("window.CARD_DATA_POOL = window.CARD_DATA_POOL || {};\n")
            f.write("window.CARD_DATA_POOL[%s] = %s;\n" % (
                json.dumps(locale),
                json.dumps({"c": cards, "s": strs},
                           ensure_ascii=False, separators=(",", ":"))))
        total_cards += len(cards)
        sys.stderr.write("[%s] %d 张卡(含先行 %d 张) → %s (%.1f MB)\n"
                         % (locale, len(cards), len(release_cards), out,
                            os.path.getsize(out) / 1048576.0))
    if ypk_path:
        sys.stderr.write("合并统计: 覆盖已有卡 %d 条, 新增普通卡 %d 条, 先行卡 %d 张\n"
                         % (n_merged_update, n_merged_new, len(release_cards)))

    # 3. 汇总脚本元数据 + 字段筛选候选(仅保留有名称或有卡员的字段码)
    # 自身破坏对象的限定按卡的种类回填(怪兽/魔法/陷阱)
    for cid, sm in script_meta.items():
        t = card_type_map.get(cid)
        if t is None:
            continue
        if t & 0x1:
            tf = ["MON"]
        elif t & 0x2:
            tf = ["SPELL"]
        elif t & 0x4:
            tf = ["TRAP"]
        else:
            continue
        for e in sm.get("eff", []):
            for obj in (e.get("ao") or {}).values():
                if obj.get("self"):
                    obj["f"] = tf
    member_candidates = sorted(all_member_setcodes.items(), key=lambda x: -x[1])
    meta_out = {
        "script": {str(k): v for k, v in script_meta.items()},
        "setcodeCounts": {("%x" % k): n for k, n in member_candidates},
        "generatedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "cardCount": total_cards // len(LOCALES),
        "scriptCount": len(script_meta),
        "preCount": len(release_cards),
        "ypk": ypk_info,
        "lflist": lf_info,
    }
    write_js(os.path.join(DIST_DIR, "meta.js"), [("CARD_META", meta_out)])
    sys.stderr.write("meta.js (%.1f MB), 字段候选 %d 个\n"
                     % (os.path.getsize(os.path.join(DIST_DIR, "meta.js")) / 1048576.0,
                        len(member_candidates)))

    # 4. 拷贝前端源码与许可文件;向 index.html 注入构建号(用于数据文件缓存击穿)
    build_id = time.strftime("%Y%m%d%H%M%S")
    for fn in os.listdir(SRC_DIR):
        if fn == "index.html":
            with open(os.path.join(SRC_DIR, fn), "r", encoding="utf-8") as f:
                html = f.read()
            html = html.replace("</head>",
                                '<meta name="build" content="%s">\n</head>' % build_id)
            html = html.replace('<link rel="stylesheet" href="style.css">',
                                '<link rel="stylesheet" href="style.css?v=%s">' % build_id)
            html = html.replace("<script src=\"app.js\"></script>",
                                "<script src=\"app.js?v=%s\"></script>" % build_id)
            with open(os.path.join(DIST_DIR, fn), "w", encoding="utf-8") as f:
                f.write(html)
        else:
            shutil.copy2(os.path.join(SRC_DIR, fn), os.path.join(DIST_DIR, fn))
    lic = os.path.join(SCRIPTS_DIR, "LICENSE")
    if os.path.exists(lic):
        shutil.copy2(lic, os.path.join(DIST_DIR, "LICENSE-ygopro-scripts.txt"))
    with open(os.path.join(DIST_DIR, "NOTICE.txt"), "w", encoding="utf-8") as f:
        f.write(
            "卡片数据与效果脚本分析结果来自:\n"
            "  - ygocore-database (cards.cdb / strings.conf)\n"
            "  - ygopro-scripts (c<id>.lua, GPL-2.0, 见 LICENSE-ygopro-scripts.txt)\n")
        if ypk_path:
            f.write("  - %s (先行卡/卡片更新/脚本, 修改于 %s)\n"
                    % (ypk_info["source"], ypk_info["mtime"]))
        f.write(
            "脚本标签/字段/关联卡等派生信息为启发式静态分析结果,仅供参考。\n"
            "先行卡文本为简体中文,各语言界面下共用;已有卡的更新仅覆盖数据字段,\n"
            "日/英文界面保留各自语言的名称与描述。\n"
            "构建时间: %s\n" % time.strftime("%Y-%m-%d %H:%M:%S"))

    # 5. 自检: 抽查已知卡片(经临时副本读取,避免 WAL 问题)
    print("\n=== 自检:已知卡片抽查(zh-CN) ===")
    import tempfile
    tmp = tempfile.NamedTemporaryFile(suffix=".cdb", delete=False)
    tmp.close()
    shutil.copyfile(os.path.join(DB_LOCALES_DIR, "zh-CN", "cards.cdb"), tmp.name)
    conn = sqlite3.connect(tmp.name)
    cur = conn.cursor()
    for cid, expect in [
        (89631139, "青眼白龙: 通常怪兽/光/龙/8星/3000/2500, 无脚本"),
        (14558127, "灰流丽: 效果+调整, 手坑(QUICK+LOCATION_HAND)"),
        (41420027, "神之宣告: 反击陷阱"),
        (16178681, "异色眼灵摆龙: 灵摆/效果, 刻度4/4"),
        (100268001, "先行卡·业火之魔神 艾克佐迪亚: setcode=0xde 封印"),
        (572850, "珠泪哀歌族·塞壬人鱼: 应已被 ypk update 覆盖"),
    ]:
        row = cur.execute(
            "SELECT t.name, d.type, d.atk, d.def, d.level, d.race, d.attribute, d.setcode"
            " FROM datas d JOIN texts t ON d.id=t.id WHERE d.id=?", (cid,)).fetchone()
        if row is None:
            # 先行卡不在主库,从内存中的 release 列表查
            rc = next((c for c in release_cards + update_cards if c["id"] == cid), None)
            if rc:
                print("  %s(%d)[ypk]: %s | pre=%s | atk=%s def=%s lv=%s | sc=%#x | tags=%s"
                      % (rc["n"], cid, expect, rc.get("pre", 0), rc["atk"], rc["def"],
                         rc["lv"] & 0xff, rc["sc"],
                         ",".join(script_meta.get(cid, {}).get("tags", []))))
            else:
                print("  !! %d 未找到(%s)" % (cid, expect))
            continue
        sm = script_meta.get(cid, {})
        name, ctype, atk, dfn, level, race, attribute, sc = row
        types = [TYPE_BITS[b] for b in sorted(TYPE_BITS) if ctype & b]
        lv, ls, rs, mk = decode_level(level, ctype)
        print("  %s(%d): %s | 类型%s | atk=%s def=%s lv=%s ls/rs=%s/%s | race=%#x attr=%#x"
              " | setcode=%#x | tags=%s | %s"
              % (name, cid, expect, types, atk, dfn, lv, ls, rs, race, attribute, sc,
                 ",".join(sm.get("tags", [])), "有脚本" if sm else "无脚本"))
    conn.close()
    os.unlink(tmp.name)
    print("\n构建完成 → %s" % DIST_DIR)


if __name__ == "__main__":
    build()
