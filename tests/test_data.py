#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""构建产物(dist/)集成校验。

前置: python3 build.py 已运行。
运行: python3 -m unittest discover tests -v
"""
import json
import os
import re
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(os.path.dirname(HERE), "dist")


def load_dist():
    meta = json.loads(re.search(
        r"window\.CARD_META = (.+);\n", open(os.path.join(DIST, "meta.js")).read(), re.S).group(1))
    zh = json.loads(re.search(
        r'window\.CARD_DATA_POOL\["zh-CN"\] = (.+);\n',
        open(os.path.join(DIST, "data-zh-CN.js")).read(), re.S).group(1))
    return meta, zh


@unittest.skipUnless(os.path.exists(os.path.join(DIST, "meta.js")),
                    "dist 未构建(先运行 python3 build.py)")
class TestDataIntegrity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.meta, cls.zh = load_dist()
        cls.cards = {c["id"]: c for c in cls.zh["c"]}

    def test_card_count(self):
        self.assertEqual(len(self.zh["c"]), 15126)

    def test_blue_eyes(self):
        c = self.cards[89631139]
        self.assertEqual(c["n"], "青眼白龙")
        self.assertEqual(c["t"] & 0x1, 0x1)
        self.assertEqual(c["t"] & 0x10, 0x10)     # 通常
        self.assertEqual(c["atk"], 3000)
        self.assertEqual(c["def"], 2500)
        self.assertEqual(c["lv"] & 0xFF, 8)
        self.assertEqual(c["r"], 0x2000)           # 龙
        self.assertEqual(c["at"], 0x10)            # 光
        self.assertEqual(c["sc"], 0xDD)
        self.assertEqual(c["hs"], 0)

    def test_ash_blossom_hand_trap(self):
        c = self.cards[14558127]
        self.assertEqual(c["t"] & 0x1000, 0x1000)  # 调整
        sm = self.meta["script"]["14558127"]
        self.assertIn("HAND_TRAP", sm["tags"])
        self.assertEqual(sm["eff"][0]["tg"], 0)          # 不取对象
        self.assertEqual(sm["eff"][0]["act"], ["NEGATE"])
        self.assertNotIn("ap", sm["eff"][0])             # 无玩家方位动作

    def test_odd_eyes_scales(self):
        c = self.cards[16178681]
        self.assertEqual((c["lv"] >> 24) & 0xFF, 4)  # 左刻度
        self.assertEqual((c["lv"] >> 16) & 0xFF, 4)  # 右刻度

    def test_raigeki_action_object(self):
        # 雷轰 69196160:破坏己方怪兽区
        sm = self.meta["script"]["69196160"]
        ao = sm["eff"][0]["ao"]["DESTROY"]
        self.assertEqual(ao["s"], "SELF")
        self.assertEqual(ao["z"], ["LOCATION_MZONE"])

    def test_winda_count_limit(self):
        sm = self.meta["script"]["94977269"]
        e = [x for x in sm["eff"] if x.get("sr")][0]
        self.assertEqual(e["srk"], "SPCOUNT")
        self.assertEqual(e["srs"], "BOTH")
        self.assertEqual(e["srn"], 1)

    def test_almas_self_destroy(self):
        # 焰圣剑-阿尔玛斯 98319530:破坏自身(魔法卡)
        sm = self.meta["script"]["98319530"]
        ao = [x for x in sm["eff"] if x.get("ao")][0]["ao"]["DESTROY"]
        self.assertEqual(ao["self"], 1)
        self.assertEqual(ao["f"], ["SPELL"])

    def test_counter_hex_names(self):
        # counter 代码为十六进制(曾因按十进制解析而丢失)
        counters = self.zh["s"]["counter"]
        self.assertIn("121", counters)  # 0x79
        self.assertEqual(counters["121"], "邪心教义指示物")

    def test_trap_monsters_tagged(self):
        tm = [c for c in self.zh["c"] if c["t"] & 0x100]
        self.assertEqual(len(tm), 76)
        self.assertIn(26905245, [c["id"] for c in tm])  # 金属反射史莱姆

    def test_self_lock_count(self):
        n = sum(1 for s in self.meta["script"].values()
                if any(e.get("sr") for e in s.get("eff", [])))
        self.assertEqual(n, 1042)

    def test_token_count(self):
        n = sum(1 for c in self.zh["c"] if c["t"] & 0x4000)
        self.assertEqual(n, 265)

    def test_pre_release_cards(self):
        pre = [c for c in self.zh["c"] if c.get("pre")]
        self.assertEqual(len(pre), 143)
        self.assertEqual(self.meta["ypk"]["releaseCount"], 143)

    def test_zh_only_fallback_cards_flagged(self):
        # 不在日文主库、以简中补入的卡须带 zl 标记
        ja = json.loads(re.search(
            r'window\.CARD_DATA_POOL\["ja-JP"\] = (.+);\n',
            open(os.path.join(DIST, "data-ja-JP.js")).read(), re.S).group(1))
        zl = [c for c in ja["c"] if c.get("zl")]
        self.assertEqual(len(zl), 2)

    def test_ypk_update_keeps_localized_text(self):
        # 43228023 在日文库保留日文名(更新只覆盖数据字段)
        ja = json.loads(re.search(
            r'window\.CARD_DATA_POOL\["ja-JP"\] = (.+);\n',
            open(os.path.join(DIST, "data-ja-JP.js")).read(), re.S).group(1))
        c = {x["id"]: x for x in ja["c"]}[43228023]
        self.assertEqual(c["n"], "青眼の究極亜竜")


if __name__ == "__main__":
    unittest.main(verbosity=2)
