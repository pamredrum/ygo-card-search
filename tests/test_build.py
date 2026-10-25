#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build.py 分析管线单元测试。

运行: python3 -m unittest discover tests -v
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build  # noqa: E402


def analyze(src):
    return build.analyze_script_src(src)


def eff_by_tag(res, key, val):
    """按字段值找效果"""
    for e in res["eff"]:
        if e.get(key) == val:
            return e
    return None


class TestSetcode(unittest.TestCase):
    def test_slots(self):
        self.assertEqual(build.setcode_slots(0xDD), [0xDD])
        self.assertEqual(build.setcode_slots(0x10F20099), [0x99, 0x10F2])
        self.assertEqual(build.setcode_slots(0), [])

    def test_display_names_parent_expansion(self):
        names = build.setcode_display_names([0x1002], {0x1002: "真次世代", 0x2: "次世代"})
        self.assertEqual(names, [(0x1002, "真次世代"), (0x2, "次世代")])


class TestStringsConf(unittest.TestCase):
    def test_parse_with_bom_and_tabs(self):
        text = "\ufeff#comment\n!system 1050 怪兽\n!setname 0x2 次世代\tジェネクス\n!counter 0x79 邪心教义指示物\n"
        sysd, setname, counter, _ = build.parse_strings_conf_text(text)
        self.assertEqual(sysd[1050], "怪兽")
        self.assertEqual(setname[0x2], "次世代")  # 制表符别名被剥离
        self.assertEqual(counter[0x79], "邪心教义指示物")

    def test_commented_lines_skipped(self):
        text = "#!setname 0x2002 盟军·次世代\n!setname 0x3 魅惑的女王\n"
        _, setname, _, _ = build.parse_strings_conf_text(text)
        self.assertNotIn(0x2002, setname)
        self.assertEqual(setname[0x3], "魅惑的女王")


class TestEffectSegmentation(unittest.TestCase):
    def test_multi_effects_and_granted(self):
        src = """
function s.initial_effect(c)
	local e1=Effect.CreateEffect(c)
	e1:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)
	e1:SetCode(EVENT_SUMMON_SUCCESS)
	e1:SetTarget(s.tg)
	e1:SetOperation(s.op)
	c:RegisterEffect(e1)
	local e2=Effect.CreateEffect(c)
	e2:SetType(EFFECT_TYPE_CONTINUOUS)
	e2:SetCode(EVENT_PHASE+PHASE_END)
	c:RegisterEffect(e2)
end
function s.op(e,tp,eg,ep,ev,re,r,rp)
	local tc=Effect.CreateEffect(e:GetHandler())
	tc:SetType(EFFECT_TYPE_CONTINUOUS)
	tc:SetCode(EVENT_PHASE+PHASE_STANDBY)
	Duel.RegisterEffect(tc,tp)
end
"""
        res = analyze(src)
        self.assertEqual(len(res["eff"]), 3)
        self.assertEqual(res["eff"][0]["g"], 0)
        self.assertEqual(res["eff"][2]["g"], 1)  # 赋予效果
        # 组合触发展开
        self.assertIn("EVENT_PHASE+PHASE_END", res["eff"][1]["ev"])

    def test_procedural_noise_filtered(self):
        src = """
local e0=Effect.CreateEffect(c)
e0:SetType(EFFECT_TYPE_SINGLE)
e0:SetProperty(EFFECT_FLAG_CANNOT_DISABLE+EFFECT_FLAG_UNCOPYABLE)
e0:SetCode(EFFECT_SPSUMMON_CONDITION)
c:RegisterEffect(e0)
"""
        res = analyze(src)
        self.assertEqual(res["eff"], [])

    def test_real_effect_single_type_kept(self):
        src = """
local e4=Effect.CreateEffect(c)
e4:SetType(EFFECT_TYPE_SINGLE)
e4:SetCode(EFFECT_CHANGE_BATTLE_DAMAGE)
e4:SetValue(aux.ChangeBattleDamage(1,DOUBLE_DAMAGE))
c:RegisterEffect(e4)
"""
        res = analyze(src)
        self.assertEqual(len(res["eff"]), 1)
        self.assertEqual(res["eff"][0]["cd"], ["EFFECT_CHANGE_BATTLE_DAMAGE"])


class TestHandTrap(unittest.TestCase):
    def test_same_effect_quick_hand(self):
        src = """
local e1=Effect.CreateEffect(c)
e1:SetType(EFFECT_TYPE_QUICK_O)
e1:SetCode(EVENT_CHAINING)
e1:SetRange(LOCATION_HAND)
c:RegisterEffect(e1)
"""
        res = analyze(src)
        self.assertIn("HAND_TRAP", res["tags"])

    def test_cross_effect_not_hand_trap(self):
        # 手卡区域的效果 + 另一个场上的诱发即时 → 不应判为手坑
        src = """
local e1=Effect.CreateEffect(c)
e1:SetType(EFFECT_TYPE_FIELD)
e1:SetCode(EFFECT_SPSUMMON_PROC)
e1:SetRange(LOCATION_HAND)
c:RegisterEffect(e1)
local e2=Effect.CreateEffect(c)
e2:SetType(EFFECT_TYPE_QUICK_O)
e2:SetCode(EVENT_FREE_CHAIN)
e2:SetRange(LOCATION_MZONE)
c:RegisterEffect(e2)
"""
        res = analyze(src)
        self.assertNotIn("HAND_TRAP", res["tags"])

    def test_grave_effect(self):
        src = """
local e1=Effect.CreateEffect(c)
e1:SetType(EFFECT_TYPE_TRIGGER_O)
e1:SetCode(EVENT_TO_GRAVE)
e1:SetRange(LOCATION_GRAVE)
c:RegisterEffect(e1)
"""
        res = analyze(src)
        self.assertIn("GRAVE_EFFECT", res["tags"])


class TestTargeting(unittest.TestCase):
    def test_select_target_info(self):
        src = """
function s.filter(c) return c:IsFaceup() and c:IsSetCard(0xee) end
local e1=Effect.CreateEffect(c)
e1:SetType(EFFECT_TYPE_QUICK_O)
e1:SetCode(EVENT_FREE_CHAIN)
e1:SetProperty(EFFECT_FLAG_CARD_TARGET)
e1:SetRange(LOCATION_MZONE)
e1:SetTarget(s.tg)
c:RegisterEffect(e1)
function s.tg(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return true end
	Duel.SelectTarget(tp,s.filter,tp,LOCATION_ONFIELD,LOCATION_ONFIELD,1,1,nil)
end
"""
        res = analyze(src)
        e = res["eff"][0]
        self.assertEqual(e["tg"], 1)
        self.assertEqual(e["tz"], ["LOCATION_ONFIELD"])
        self.assertEqual(e["tsd"], "BOTH")
        self.assertEqual(e["tn"], [1, 1])
        self.assertEqual(e["tf"], ["FACEUP", "SET:0xee"])

    def test_no_targeting_action_effect(self):
        src = """
local e1=Effect.CreateEffect(c)
e1:SetType(EFFECT_TYPE_IGNITION)
e1:SetCode(EVENT_FREE_CHAIN)
e1:SetOperation(s.op)
c:RegisterEffect(e1)
function s.op(e,tp,eg,ep,ev,re,r,rp)
	local g=Duel.GetMatchingGroup(nil,tp,0,LOCATION_MZONE,nil)
	Duel.Destroy(g,REASON_EFFECT)
end
"""
        res = analyze(src)
        e = res["eff"][0]
        self.assertEqual(e["tg"], 0)  # 动作型效果无取对象标记
        self.assertEqual(e["sz"], ["LOCATION_MZONE"])
        self.assertEqual(e["ssd"], "OPP")

    def test_zone_inferred_descriptor(self):
        src = """
local e1=Effect.CreateEffect(c)
e1:SetType(EFFECT_TYPE_ACTIVATE)
e1:SetCode(EVENT_FREE_CHAIN)
e1:SetOperation(s.op)
c:RegisterEffect(e1)
function s.op(e,tp,eg,ep,ev,re,r,rp)
	local sg=Duel.GetMatchingGroup(nil,tp,0,LOCATION_MZONE,nil)
	Duel.Destroy(sg,REASON_EFFECT)
end
"""
        res = analyze(src)
        e = res["eff"][0]
        self.assertIn("MON", e["sf"])          # 怪兽区推断
        self.assertEqual(e["ao"]["DESTROY"]["z"], ["LOCATION_MZONE"])
        self.assertEqual(e["ao"]["DESTROY"]["s"], "OPP")
        self.assertIn("MON", e["ao"]["DESTROY"]["f"])


class TestActions(unittest.TestCase):
    def test_action_scan_and_player_side(self):
        src = """
local e1=Effect.CreateEffect(c)
e1:SetType(EFFECT_TYPE_ACTIVATE)
e1:SetCode(EVENT_FREE_CHAIN)
e1:SetOperation(s.op)
c:RegisterEffect(e1)
function s.op(e,tp,eg,ep,ev,re,r,rp)
	Duel.Damage(1-tp,300,REASON_EFFECT)
	Duel.Draw(tp,1,REASON_EFFECT)
end
"""
        res = analyze(src)
        e = res["eff"][0]
        self.assertEqual(set(e["act"]), {"DAMAGE", "DRAW"})
        self.assertEqual(e["ap"], {"DAMAGE": "OPP", "DRAW": "SELF"})

    def test_both_players_damage(self):
        src = """
local e1=Effect.CreateEffect(c)
e1:SetType(EFFECT_TYPE_ACTIVATE)
e1:SetCode(EVENT_FREE_CHAIN)
e1:SetOperation(s.op)
c:RegisterEffect(e1)
function s.op(e,tp,eg,ep,ev,re,r,rp)
	Duel.Damage(tp,300,REASON_EFFECT)
	Duel.Damage(1-tp,300,REASON_EFFECT)
end
"""
        res = analyze(src)
        self.assertEqual(res["eff"][0]["ap"]["DAMAGE"], "BOTH")

    def test_action_object_self_destroy(self):
        src = """
local e1=Effect.CreateEffect(c)
e1:SetType(EFFECT_TYPE_IGNITION)
e1:SetRange(LOCATION_SZONE)
e1:SetOperation(s.op)
c:RegisterEffect(e1)
function s.op(e,tp,eg,ep,ev,re,r,rp)
	local c=e:GetHandler()
	Duel.Destroy(c,REASON_EFFECT)
end
"""
        res = analyze(src)
        ao = res["eff"][0]["ao"]["DESTROY"]
        self.assertEqual(ao["self"], 1)
        self.assertEqual(ao["s"], "SELF")

    def test_action_object_getfirst_hop(self):
        src = """
local e1=Effect.CreateEffect(c)
e1:SetType(EFFECT_TYPE_TRIGGER_O)
e1:SetCode(EVENT_TO_GRAVE)
e1:SetTarget(s.tg)
e1:SetOperation(s.op)
c:RegisterEffect(e1)
function s.tg(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return true end
	Duel.SelectTarget(tp,nil,tp,0,LOCATION_MZONE,1,1,nil)
end
function s.op(e,tp,eg,ep,ev,re,r,rp)
	local g=Duel.GetFirstTarget()
	local tc=g:GetFirst()
	Duel.SendtoHand(tc,nil,REASON_EFFECT)
end
"""
        res = analyze(src)
        ao = res["eff"][0]["ao"]["TOHAND"]
        self.assertEqual(ao["z"], ["LOCATION_MZONE"])
        self.assertEqual(ao["s"], "OPP")


class TestSelfLock(unittest.TestCase):
    def test_pendulum_scale_lock(self):
        src = """
local e2=Effect.CreateEffect(c)
e2:SetType(EFFECT_TYPE_FIELD)
e2:SetRange(LOCATION_PZONE)
e2:SetCode(EFFECT_CANNOT_SPECIAL_SUMMON)
e2:SetProperty(EFFECT_FLAG_PLAYER_TARGET)
e2:SetTargetRange(1,0)
e2:SetTarget(s.splimit)
c:RegisterEffect(e2)
function s.splimit(e,c,tp,sumtp,sumpos)
	return not c:IsSetCard(0xab) and bit.band(sumtp,SUMMON_TYPE_PENDULUM)==SUMMON_TYPE_PENDULUM
end
"""
        res = analyze(src)
        self.assertIn("SELF_LOCK", res["tags"])
        e = res["eff"][0]
        self.assertEqual(e["srk"], "SPSUMMON")
        self.assertEqual(e["srs"], "SELF")
        self.assertEqual(e["sra"], ["SET:0xab"])
        self.assertEqual(e["srm"], "PENDULUM")

    def test_spsummon_count_limit_both(self):
        src = """
local e4=Effect.CreateEffect(c)
e4:SetType(EFFECT_TYPE_FIELD)
e4:SetCode(EFFECT_SPSUMMON_COUNT_LIMIT)
e4:SetRange(LOCATION_MZONE)
e4:SetProperty(EFFECT_FLAG_PLAYER_TARGET)
e4:SetTargetRange(1,1)
e4:SetValue(1)
c:RegisterEffect(e4)
"""
        res = analyze(src)
        e = res["eff"][0]
        self.assertEqual(e["srk"], "SPCOUNT")
        self.assertEqual(e["srs"], "BOTH")
        self.assertEqual(e["srn"], 1)

    def test_activation_lock_turn(self):
        src = """
local e1=Effect.CreateEffect(e:GetHandler())
e1:SetType(EFFECT_TYPE_FIELD)
e1:SetCode(EFFECT_CANNOT_ACTIVATE)
e1:SetTargetRange(1,0)
e1:SetValue(s.aclimit)
e1:SetReset(RESET_PHASE+PHASE_END+RESET_SELF_TURN,2)
Duel.RegisterEffect(e1,tp)
"""
        res = analyze(src)
        self.assertIn("SELF_LOCK", res["tags"])
        e = res["eff"][0]
        self.assertEqual(e["srk"], "ACT")
        self.assertEqual(e["srd"], "TURN")

    def test_opponent_lock_not_selflock(self):
        src = """
local e1=Effect.CreateEffect(c)
e1:SetType(EFFECT_TYPE_FIELD)
e1:SetCode(EFFECT_CANNOT_SPECIAL_SUMMON)
e1:SetTargetRange(0,1)
c:RegisterEffect(e1)
"""
        res = analyze(src)
        self.assertNotIn("SELF_LOCK", res["tags"])


class TestRelatedCards(unittest.TestCase):
    def test_codelist_and_iscode(self):
        src = """
aux.AddCodeList(c,68468459,36623431)
function s.filter(c)
	return c:IsCode(41091257) or c:IsSetCard(0xee)
end
"""
        res = analyze(src)
        self.assertIn(68468459, res["rel"])
        self.assertIn(36623431, res["rel"])
        self.assertIn(41091257, res["rel"])
        self.assertIn(0xEE, res["ref"])


class TestTrapMonster(unittest.TestCase):
    def test_trap_monster_token(self):
        src = """
function s.target(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return Duel.IsPlayerCanSpecialSummonMonster(tp,id,0,TYPES_EFFECT_TRAP_MONSTER,0,3000,10,RACE_AQUA,ATTRIBUTE_WATER) end
end
"""
        res = analyze(src)
        self.assertEqual(res["tm"], 1)


class TestCountLimit(unittest.TestCase):
    def test_count_limit(self):
        src = """
local e1=Effect.CreateEffect(c)
e1:SetType(EFFECT_TYPE_TRIGGER_O)
e1:SetCode(EVENT_SUMMON_SUCCESS)
e1:SetCountLimit(1)
c:RegisterEffect(e1)
"""
        res = analyze(src)
        self.assertEqual(res["eff"][0]["cl"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
