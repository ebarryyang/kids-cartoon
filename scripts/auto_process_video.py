import os
import re
import sys
import io
import json
import math
import argparse
import subprocess
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

# ============================================================
# 🔧 Windows/PowerShell 默认 stdout 是 GBK，打印 emoji / 中文会
#    UnicodeEncodeError: 'gbk' codec can't encode character '…'
#    这里一进脚本就强制 stdout/stderr 为 UTF-8（优先级最高，
#    结合环境变量 PYTHONIOENCODING=utf-8 双保险）
# ============================================================
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

try:
    import whisper
except ImportError:
    print("Error: 未安装 whisper。请运行: pip install -U openai-whisper")
    print("  (Windows 建议先装 ffmpeg: winget install ffmpeg 或 choco install ffmpeg)")
    exit(1)

try:
    import requests
except ImportError:
    print("Error: 未安装 requests。请运行: pip install requests")
    exit(1)


# ============================================================
# 🔧 1. 公共工具
# ============================================================
def format_timestamp(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    milliseconds = int((seconds - int(seconds)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{milliseconds:03d}"


def generate_vtt_content(segments: List[Dict[str, Any]]) -> str:
    vtt = "WEBVTT\n\n"
    for i, seg in enumerate(segments):
        start = format_timestamp(seg['start'])
        end = format_timestamp(seg['end'])
        vtt += f"{i+1}\n{start} --> {end}\n{seg['text'].strip()}\n\n"
    return vtt


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


# ============================================================
# 🤖 2. 生词抽取（多引擎可切换，优先免费层）
# ============================================================
LLM_PROVIDERS = [
    # 完全免费额度：SiliconFlow(硅基流动) 新用户送额度，有 qwen/deepseek/kimi/glm 免费/Pro 模型可用
    # 官方可用模型参考：https://docs.siliconflow.cn/
    # —— 2026-08-30 实测可用性：
    #      ✅ 能成功响应：
    #         · Qwen/Qwen2.5-7B-Instruct       （响应最快，首推抽词用）
    #         · Qwen/Qwen2.5-32B-Instruct      （抽词稳定）
    #         · Qwen/Qwen2.5-72B-Instruct      （长文本翻译首选）
    #         · deepseek-ai/DeepSeek-V3        （中译英翻译强）
    #         · deepseek-ai/DeepSeek-V3.2      （偶尔超时，备用）
    #      ❌ 实测返回 403 disabled / 400 不存在（删除不要用）：
    #         · deepseek-ai/DeepSeek-V2.5 → 403 Model disabled
    #         · deepseek-chat              → 400 Model does not exist
    #         · Qwen/Qwen3-30B             → 400 Model does not exist
    ("siliconflow",
     "https://api.siliconflow.cn/v1/chat/completions",
     ["SILICONFLOW_API_KEY", "SILICONFLOW_KEY"],
     [
         # ① 首推：Qwen 系列（抽词质量稳定 + 响应快，实测能通）
         "Qwen/Qwen2.5-7B-Instruct",
         "Qwen/Qwen2.5-14B-Instruct",
         "Qwen/Qwen2.5-32B-Instruct",
         "Qwen/Qwen2.5-72B-Instruct",
         # ② 次推：DeepSeek V3 / V3.2（翻译质量好，实测能通，抽词备用）
         "deepseek-ai/DeepSeek-V3",
         "deepseek-ai/DeepSeek-V3.2",
         # ③ Kimi 系列（长上下文，翻译/抽词都可用，官方 SDK 名 Pro/moonshotai/Kimi-K2.6）
         "Pro/moonshotai/Kimi-K2.6",
         "moonshotai/Kimi-K2.5",
         "moonshotai/Kimi-Chat",
         # ④ GLM 系列（智谱，官方 SDK 名 Pro/zai-org/GLM-5.1）
         "Pro/zai-org/GLM-5.1",
         "Pro/zai-org/GLM-4.4-Air",
         "THUDM/glm-4-9b-chat",
         "THUDM/chatglm3-6b",
     ]),
    # DeepSeek 官方免费额度
    ("deepseek",
     "https://api.deepseek.com/v1/chat/completions",
     ["DEEPSEEK_API_KEY", "DEEPSEEK_KEY"],
     ["deepseek-chat", "deepseek-reasoner"]),
    # 通用兼容 OpenAI 协议
    ("openai-compat",
     None,  # 从 env 读 BASE_URL
     ["OPENAI_API_KEY", "ANYSCALE_API_KEY", "TOGETHER_API_KEY", "GROQ_API_KEY"],
     None),
]


def _first_env(keys: List[str]) -> Optional[str]:
    for k in keys:
        v = os.environ.get(k)
        if v:
            return v
    return None


def _llm_chat(base_url: str, api_key: str, model: str, system: str, user: str,
              temperature: float = 0.5, timeout: int = 240,
              provider_label: str = "",
              max_tokens: Optional[int] = None) -> Optional[str]:
    # 允许通过环境变量 LLM_TIMEOUT 全局覆盖超时时间
    try:
        env_timeout = int(os.environ.get("LLM_TIMEOUT", "0") or 0)
        if env_timeout > 0:
            timeout = env_timeout
    except Exception:
        pass
    label = f"[{provider_label}] " if provider_label else ""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    masked_key = (api_key[:6] + '...' + api_key[-4:]) if len(api_key) > 12 else (len(api_key) > 0 and '***' or 'EMPTY')
    max_tok = max_tokens if max_tokens is not None else int(
        os.environ.get("LLM_MAX_TOKENS", "4096") or 4096
    )
    print(f"   {label}🔑 key={masked_key} len={len(api_key)} model={model} max_tokens={max_tok} temp={temperature}")
    payload: Dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "stream": False,
        "max_tokens": max_tok,
    }
    # 仅 system 含 JSON 输出指令时，加 response_format=json_object 对齐 SiliconFlow Pro/zai-org/GLM-5.1 用法（兼容）
    if "JSON" in system or "json" in system or "输出 JSON" in system:
        try:
            payload["response_format"] = {"type": "json_object"}
        except Exception:
            pass
    try:
        r = requests.post(base_url, headers=headers, json=payload, timeout=timeout)
        # ✅ 详细错误诊断：状态码 + 响应前 500 字
        if r.status_code != 200:
            print(f"   {label}❌ HTTP {r.status_code} {r.reason}")
            try:
                body = r.text
                print(f"   {label}📦 响应前 700 字符: {body[:700]}")
            except Exception:
                pass
            return None
        data = r.json()
        return data['choices'][0]['message']['content'].strip()
    except Exception as e:
        import traceback
        print(f"   {label}⚠️  LLM 调用异常 ({base_url}): {type(e).__name__}: {e}")
        print(f"   {label}📋 调用栈: {traceback.format_exc(limit=2)}")
        if hasattr(e, 'response') and e.response is not None:
            try:
                print(f"   {label}响应: {e.response.text[:500]}")
            except Exception:
                pass
        return None


def _vocab_prompt(vtt_text: str, num_words: int) -> Tuple[str, str]:
    system = (
        "你是一名专业的儿童英语教研专家，专攻 5-8 岁儿童英语学习内容。"
        "回答严格、只输出 JSON 数组，不要 Markdown 代码块，不要任何解释文字。"
    )
    user = f"""以下是一集儿童英语动画的 WebVTT 字幕（含时间戳）：

--- BEGIN VTT ---
{vtt_text}
--- END VTT ---

请严格只输出一个 JSON 数组，包含 {num_words} 个最适合 5-8 岁儿童学习的核心生词。
每个元素是一个 JSON 对象，字段如下：
- "time": number (秒，保留 1 位小数，这个单词在字幕中大约出现的时间戳)
- "wordEn": string (英文字面，首字母大写)
- "wordZh": string (准确、儿童友好的中文释义)
- "pos": string (严格只有两个取值之一："noun" 表示名词，"verb" 表示实义动词)
- "coordX": number (20 到 80 之间的整数，气泡 X 坐标 %)
- "coordY": number (20 到 80 之间的整数，气泡 Y 坐标 %)

要求：
1. wordEn 必须是字幕文本中真实出现过的词；
2. 【💥 严格词性约束】每个词必须是 ① 具象名词（如 apple、cat、ball、house、water 等小朋友看得见摸得着的人/事/物） 或 ② 实义动词（如 run、jump、play、eat、sing、dance 等表达实际动作的词）；**绝对禁止**：形容词、副词、代词、冠词、介词、连词、助动词（is/are/was/were/be/been/have/has/do/does/did/will/would/shall/should/may/might/can/could/must）、情态动词、感叹词、数词；
3. 不要短语、不要整句、不要专用人名地名（除非 Peppa 这类核心角色词）；
4. 每个 JSON 对象字段名与类型必须准确，"pos" 字段必须是 "noun" 或 "verb" 二者之一，不要其他取值；
5. 只输出 JSON 数组，整体以 [ 开头，以 ] 结尾，不输出任何多余字符。
"""
    return system, user


def _parse_json_array(text: str) -> Optional[List[Dict[str, Any]]]:
    if not text:
        return None
    s = text.strip()
    # 去掉可能的 ```json ... ```
    s = re.sub(r"^```[a-zA-Z]*\s*", "", s)
    s = re.sub(r"\s*```$", "", s)
    s = s.strip()
    # 截取第一个 [ 到 最后一个 ]
    m = re.search(r"\[[\s\S]*\]", s)
    if not m:
        return None
    try:
        arr = json.loads(m.group(0))
        if isinstance(arr, list):
            return arr
    except Exception as e:
        print(f"   ⚠️  JSON 解析失败: {e}")
    return None


def extract_vocabulary_with_llm(vtt_text: str, num_words: int,
                                vocab_model_hint: Optional[str] = None,
                                max_tokens_override: Optional[int] = None
                                ) -> Optional[List[Dict[str, Any]]]:
    """尝试多个免费 LLM Provider 抽取生词 JSON 列表，失败返回 None

    Provider 内多模型按优先级依次降级尝试（比如 siliconflow V3.2 → V3 → Qwen → Kimi → GLM）
    """
    print("\n🚀 正在调用大模型提取核心生词 (优先免费层)...")

    system, user = _vocab_prompt(vtt_text, num_words)

    # 1) 遍历预设 providers
    for name, base_url, env_keys, models in LLM_PROVIDERS:
        if name == "openai-compat":
            base = os.environ.get("OPENAI_BASE_URL") or os.environ.get("ANYSCALE_BASE_URL") or os.environ.get("TOGETHER_BASE_URL")
            model = vocab_model_hint or os.environ.get("OPENAI_MODEL") or "gpt-4o-mini"
            model_list = [model]
            if not base:
                continue
            keys_list = env_keys
        else:
            base = base_url
            keys_list = env_keys
            # 用户显式指定了 vocab_model_hint 时，只跑那个模型；否则按 models 列表顺序依次降级尝试
            if vocab_model_hint:
                # 用户写了 --vocab-model 就信他的（写在最前）再 fallback 到 models[0]
                model_list = [vocab_model_hint] + (models or [])
                # 去重保留顺序
                seen = set()
                dedup = []
                for m in model_list:
                    if m and m not in seen:
                        seen.add(m)
                        dedup.append(m)
                model_list = dedup
            else:
                model_list = models or []

        key = _first_env(keys_list)
        if not key:
            print(f"   → 跳过 [{name}]（没有设置环境变量 {keys_list}）")
            continue

        for idx, model in enumerate(model_list):
            print(f"   → 尝试 [{name}] 模型 {model}  ({idx+1}/{len(model_list)} 个) base={base}")
            res = _llm_chat(base, key, model, system, user, temperature=0.5,
                            provider_label=name, max_tokens=max_tokens_override)
            parsed = _parse_json_array(res or "")
            if parsed:
                filtered = _filter_noun_verb_only(parsed, target_count=num_words)
                print(f"   ✅ [{name}] 模型 {model} 抽取成功，原始 {len(parsed)} 词 → 名动过滤后 {len(filtered)} 词")
                return filtered or None

    # 2) 兜底：环境变量里显式的 LLM_PROVIDER/LLM_BASE/LLM_MODEL/LLM_API_KEY
    explicit_base = os.environ.get("LLM_BASE_URL")
    explicit_key = os.environ.get("LLM_API_KEY")
    explicit_model = vocab_model_hint or os.environ.get("LLM_MODEL", "gpt-4o-mini")
    if explicit_base and explicit_key:
        print(f"   → 尝试显式 LLM {explicit_base} 模型 {explicit_model}")
        res = _llm_chat(explicit_base, explicit_key, explicit_model, system, user,
                        provider_label="explicit-llm", max_tokens=max_tokens_override)
        parsed = _parse_json_array(res or "")
        if parsed:
            return _filter_noun_verb_only(parsed, target_count=num_words) or None

    return None


# ============================================================
# 🆓 3. 零 API 兜底：本地 spaCy/纯规则抽取 + ArgosTranslate 翻译
# ============================================================
ENGLISH_STOPWORDS = set("""
a an the and or but if then else of to in on at for with from by as is are was were
be been being have has had do does did will would shall should may might can could must
i you he she it we they me him her us them my your his her its our their this that
these those am not no so too very also just about over under up down out off all some
any each every both few more most other such than s t don doesn didn won wouldn can
cannot isn aren wasn weren hasn haven hadn let re ll ve yeah ok okay hey hi hello yes
no mr mrs miss now here there when where why how what which who whom whose
""".split())

# 扩展停用词：常见助动词/情态动词 + 常见形容词 + 常见副词 + 常见介词 + 常见连词 + 常见代词
POS_BLACKLIST_EXTRA = set("""
big small little happy sad good bad nice great cute funny lovely beautiful old new
long short tall high low fast slow hot cold warm cool clean dirty dry wet soft hard
easy difficult hungry thirsty tired sorry ready right wrong left open shut close early
late first last next last same different kind nice sweet angry sorry sorry sure ready
here there now then today tomorrow yesterday always never sometimes often usually still
already yet just only even also really very much many well back again away forward almost
together always perhaps maybe maybe however therefore though although because while since
before after during between among through across behind below above beside under around
behind without within except instead including following towards against
""".split())

# 儿童英语常见名词白名单（命中即算 noun，不管后缀）
KIDS_NOUN_WHITELIST = set("""
apple banana orange grape pear peach lemon strawberry watermelon cherry tomato potato
carrot cabbage bread cake cookie biscuit chocolate candy sugar rice noodle egg milk
water juice tea coffee honey jam butter cheese meat fish chicken duck pig cow sheep
horse rabbit dog cat mouse elephant tiger lion bear monkey panda giraffe zebra kangaroo
bird duck butterfly bee ant spider fish whale dolphin shark octopus turtle frog snake
lizard dinosaur dragon unicorn robot teddy doll ball balloon kite puzzle block car
bus train plane boat ship bicycle truck rocket helicopter umbrella hat cap coat
jacket scarf glove sock shoe boot dress skirt shirt pants shorts belt glasses watch
bag backpack purse box bottle cup bowl plate spoon fork knife pen pencil paper book
eraser ruler crayon marker chalk desk chair table bed pillow blanket door window wall
floor ceiling roof room house home school classroom playground garden park zoo farm
beach forest mountain river lake sea ocean island sun moon star cloud rain snow wind
fire water ice tree flower grass leaf bush rock stone sand mud dirt road street
city town village country world family daddy daddy mummy mommy mum dad brother sister
baby boy girl friend teacher doctor nurse driver farmer worker king queen prince
princess pirate superhero wizard fairy monster ghost clown story song game toy
picture photo music movie cartoon show party picnic holiday birthday christmas
halloween easter summer autumn winter spring morning afternoon evening night day
week month year time clock bell letter number color shape circle square triangle
star heart line point flag map key ring bell button hammer screwdriver tool drum
piano guitar violin trumpet horn bell puppet costume mask crown cape sword shield
helmet castle tower bridge road path tunnel station airport hospital library shop
market mall cafe restaurant kitchen bathroom bedroom livingroom garden garage
animal plant fruit vegetable food drink clothes shoe hat bag toy furniture tool
vehicle place season holiday time color shape number people job story game song
music picture book letter word sentence page lesson homework prize present gift
surprise party picnic game race competition match team player score goal point
penelope peppa george suzy rebecca richard emily danny pedro zoe wendy gerald gabriella
candycat fox elephant rabbit bear pig sheep wolf ladybird unicorn dinosaur dragon
hand head eye ear nose mouth tooth finger toe leg arm foot hair skin tummy face
smile laugh cry hug kiss picnic park playground bedroom bathroom kitchen garden
teddy teddybear bike scooter slide swing sandpit sand bucket spade castle shell
wave sea ocean rock pool slide swing ladder rope ballon cake biscuit cookie sweet
puzzle crayon pencil rubber book page sticker poster photo camera television radio
phone telephone bell clock mirror picture frame chair table door window light lamp
brush paste toothbrush soap towel shampoo rubber eraser ruler pencilcase bag backpack
coat jacket scarf glove hat cap sock shoe boot tie belt button zip buckle glasses
bracelet necklace ring key map present gift surprise balloon candle cake cupcake
sweet treat biscuit cookie bread rice noodle soup sandwich pie butter cheese milk
juice water tea honey jam egg ice cream chocolate candy lollipop popsicle
""".split())

# 儿童英语常见实义动词白名单（命中即算 verb）
KIDS_VERB_WHITELIST = set("""
run jump hop skip walk climb crawl dance sing play laugh smile cry talk speak say
tell shout whisper listen hear look see watch read write draw paint color cut stick
glue fold open close shut lock unlock push pull lift carry hold throw catch kick
bounce hit shoot pass score win lose try start stop begin finish continue wait hurry
rush come go leave arrive stay return move sit stand lie kneel bend turn nod shake
wave clap snap point reach stretch bend twist spin roll float swim dive fly ride
drive sail row eat drink taste chew bite swallow feed cook bake wash clean brush
comb dress undress wear take off put on button zip buckle sleep wake rest nap
dream work help share give take get make build break fix plant pick water dig
cook bake fry boil stir mix measure pour cut chop slice peel cook serve taste
buy sell pay cost count draw write type spell read learn teach study practice
test pass fail win lose start finish join leave invite welcome greet thank
apologize promise agree disagree ask answer question call ring knock hug kiss
smile cry laugh wave nod shake point show hide seek find lose win
hold wave stop clap jump run walk play sing dance eat drink wash brush read write
draw paint go come see look hear listen sit stand lie sleep wake
""".split())

# 名词后缀（高置信）
_NOUN_SUFFIXES = (
    'tion', 'sion', 'ment', 'ness', 'ity', 'er', 'or', 'ist', 'ism',
    'ance', 'ence', 'ship', 'hood', 'dom', 'ure', 'ty', 'ics', 'logy',
    'ography', 'ology', 'al', 'age', 'ery', 'ary', 'ory', 'ant', 'ent',
)

# 动词后缀（高置信，排除已在名词后缀里的）
_VERB_SUFFIXES = (
    'ing', 'ed', 'ize', 'ise', 'ify', 'ate', 'en',
)


def _looks_like_noun(w: str) -> bool:
    low = w.lower().strip()
    if not low or len(low) < 2:
        return False
    if low in KIDS_NOUN_WHITELIST:
        return True
    # 名词后缀：3 字母以上后缀再判断，避免 2 字母后缀误判(如 or/er)
    for suf in _NOUN_SUFFIXES:
        if len(suf) >= 3 and low.endswith(suf) and len(low) > (len(suf) + 1):
            return True
    return False


def _looks_like_verb(w: str) -> bool:
    low = w.lower().strip()
    if not low or len(low) < 2:
        return False
    if low in KIDS_VERB_WHITELIST:
        return True
    # -ing / -ed / -es（只要 3 字母以上的动词后缀就算）
    for suf in _VERB_SUFFIXES:
        if len(suf) >= 2 and low.endswith(suf) and len(low) > (len(suf) + 1):
            # 排除：明显名词带 ed（比如 "bed" 结尾但它是名词）—— 用白名单已经兜住了
            return True
    return False


def _filter_noun_verb_only(items: Optional[List[Dict[str, Any]]],
                           target_count: Optional[int] = None,
                           *,
                           local_extra_tf: Optional[Dict[str, int]] = None,
                           lenient_local: bool = False
                           ) -> List[Dict[str, Any]]:
    """💥 最终只保留 具象名词 + 实义动词，3 层递进过滤：
    ① 先过 STOPWORDS + POS_BLACKLIST（助动词/常见形副介连词）
    ② 模型输出带 pos 字段时，严格信它（只留 pos=noun/verb）
    ③ 模型没带 pos 字段的 → 用【儿童名动白名单】+【后缀启发式】双重判断
        → 若 lenient_local=True（本地抽词兜底）：满足 STOPWORDS/BLACKLIST 之外 + 词长 3-7 字母也算名词兜底
    最后若指定 target_count，截取前 N（不足就不足，宁少勿错）
    """
    if not items:
        return []
    out: List[Dict[str, Any]] = []
    seen_lower = set()
    for v in items:
        if not v or not isinstance(v, dict):
            continue
        raw_en = (v.get('wordEn') or '').strip()
        if not raw_en:
            continue
        low = raw_en.lower()
        if low in seen_lower:
            continue
        # ① 停用词 + 扩展黑名单直接丢
        if low in ENGLISH_STOPWORDS or low in POS_BLACKLIST_EXTRA:
            continue
        # ② 模型写了 pos 就严格信它
        pos = (v.get('pos') or '').strip().lower()
        keep = False
        if pos in ('noun', 'verb'):
            keep = True
        # ③ 没 pos 的走白名单 + 后缀启发式
        if not keep and not pos:
            if _looks_like_noun(low) or _looks_like_verb(low):
                keep = True
        # ④ 本地抽词宽松兜底（没命中白名单/后缀的词，只要不在黑名单 + 词长合适 + TF>=2 就保留为名词）
        if not keep and lenient_local and not pos:
            wlen = len(low)
            tf_ok = (local_extra_tf.get(low, 0) >= 2) if local_extra_tf else False
            if 3 <= wlen <= 7 and (tf_ok or wlen <= 5):
                keep = True
                pos = 'noun'
                v['pos'] = pos
        if not keep:
            continue
        # 启发式写 pos 给后续前端用
        if not pos:
            if _looks_like_noun(low) and not _looks_like_verb(low):
                v['pos'] = 'noun'
            elif _looks_like_verb(low) and not _looks_like_noun(low):
                v['pos'] = 'verb'
            else:
                v['pos'] = 'noun'  # 两者都像的默认归名词
        seen_lower.add(low)
        # 保证必须字段都齐（缺失的补空，不要崩）
        safe = dict(v)
        safe.setdefault('time', 0.0)
        cap = raw_en[0].upper() + raw_en[1:]
        safe.setdefault('wordEn', cap)
        safe['wordEn'] = cap
        safe.setdefault('wordZh', '')
        safe.setdefault('coordX', 50)
        safe.setdefault('coordY', 50)
        if 'pos' not in safe:
            safe['pos'] = 'noun'
        out.append(safe)
        if target_count and len(out) >= target_count:
            break
    return out


def _segments_to_word_time(segments: List[Dict[str, Any]]
                           ) -> List[Tuple[str, float]]:
    """把所有 segments 拉平为 (小写单词, 约出现秒数) 的列表"""
    pairs: List[Tuple[str, float]] = []
    for seg in segments:
        t = (seg['start'] + seg['end']) / 2.0
        text = seg.get('text', '') or ''
        for m in re.finditer(r"[A-Za-z][A-Za-z\-']*", text):
            w = m.group(0).lower()
            if 2 <= len(w) <= 12:
                pairs.append((w, t))
    return pairs


def _parse_vtt_cues(vtt_text: str) -> List[Tuple[int, int, str]]:
    """解析 WebVTT，返回 [(cue_idx_start_ms, cue_idx_end_ms, cue_text), ...]（为了不改主流程用 ms 元组，行号保留）"""
    cues: List[Tuple[int, int, str]] = []
    lines = vtt_text.splitlines()
    # cues 结构：可选索引行 + 时间行  "HH:MM:SS.mmm --> HH:MM:SS.mmm" + 文本行（多行直到空行）
    ts_re = re.compile(
        r"(\d+):(\d+):(\d+)\.(\d+)\s*-->\s*(\d+):(\d+):(\d+)\.(\d+)"
    )
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        # 跳过 WEBVTT head / NOTE
        if i == 0 and line.upper().startswith("WEBVTT"):
            i += 1
            continue
        if not line:
            i += 1
            continue
        if line.upper().startswith("NOTE"):
            # 跳到下一个空行
            while i < len(lines) and lines[i].strip():
                i += 1
            continue
        # 可选数字行 cue no.
        if line.isdigit():
            i += 1
            line = lines[i].strip() if i < len(lines) else ""
        m = ts_re.search(line)
        if not m:
            i += 1
            continue
        sh, sm, ss, sms, eh, em, es, ems = map(int, m.groups())
        start_ms = ((sh * 60 + sm) * 60 + ss) * 1000 + sms
        end_ms = ((eh * 60 + em) * 60 + es) * 1000 + ems
        i += 1
        text_lines: List[str] = []
        while i < len(lines) and lines[i].strip():
            text_lines.append(lines[i].strip())
            i += 1
        cues.append((start_ms, end_ms, " ".join(text_lines).strip()))
    return cues


def _llm_translate_vtt(vtt_text: str, zh_model_hint: Optional[str],
                       max_tokens_override: Optional[int] = None) -> Optional[str]:
    """
    把整个 en.vtt 丢给 LLM 成段翻译，严格保持 cue 数量和顺序，1:1 对应。
    Provider 内多模型按优先级依次降级（V3.2 → V3 → Qwen → Kimi → GLM）。
    返回纯文本 VTT（含 WEBVTT head + cues），不含时间行只替换每一条 cue 的文本。
    """
    print("   🚀 尝试调用 LLM 翻译整套字幕（1:1 保留每条 cue 顺序，不改动时间戳）...")

    system = (
        "你是一名专业的儿童英语动画字幕翻译专家，擅长把英文短句翻译成 5-8 岁儿童听懂的、自然的中文。"
        "严格输出翻译后的 **纯 JSON 数组**：每个元素是一个字符串，对应英文 VTT 中 cue 的中文翻译，数量必须与输入的 cue 总数完全一致、顺序一一对应。"
        "不要输出解释、不要输出 Markdown 代码块、不要重复原文、不要加数字编号、不要改动任何时间戳信息。"
    )

    # 先把 cues 抽出，给模型一个带编号的翻译清单（避免模型数错数量）
    cues = _parse_vtt_cues(vtt_text)
    if not cues:
        print("   ⚠️  VTT 解析为空，LLM 翻译中止。")
        return None

    numbered = []
    for i, (s, e, t) in enumerate(cues):
        numbered.append(f"{i+1}. {t}")
    user = (
        f"下方是一集儿童英语动画的英文字幕清单（共 {len(cues)} 条，每行一个编号）。\n"
        f"请严格按顺序、1:1 对应输出中文翻译，数量必须 = {len(cues)}，不要漏也不要多。\n\n"
        f"要求：\n"
        f"1) 简单自然、适合 5-8 岁儿童中文语感；\n"
        f"2) 角色名字（Penelope / Peppa / George / Dad / Mum 等）保留常见中文译名（如 佩内洛普 / 佩奇 / 乔治 / 爸爸 / 妈妈）；\n"
        f"3) 每条 cue 翻译尽量与原文长度匹配，避免中文过长；\n"
        f"4) 最后只输出一个 JSON 字符串数组，长度 = {len(cues)}。\n\n"
        f"--- 原文清单（共 {len(cues)} 条） ---\n"
        f"{chr(10).join(numbered)}\n"
    )

    # LLM 链：SiliconFlow（多模型降级）→ DeepSeek → OpenAI-compat → 显式 LLM_BASE/KEY/MODEL
    target_model: Optional[str] = zh_model_hint
    for name, base_url, env_keys, models in LLM_PROVIDERS:
        if name == "openai-compat":
            base = os.environ.get("OPENAI_BASE_URL") or os.environ.get("ANYSCALE_BASE_URL") or os.environ.get("TOGETHER_BASE_URL")
            model = target_model or os.environ.get("OPENAI_MODEL") or "gpt-4o-mini"
            model_list = [model]
            if not base:
                continue
        else:
            base = base_url
            if target_model:
                # 用户指定了 --zh-model，写在最前 + 依次 fallback 到 models 列表
                model_list_raw = [target_model] + (models or [])
                seen = set()
                model_list = []
                for m in model_list_raw:
                    if m and m not in seen:
                        seen.add(m)
                        model_list.append(m)
            else:
                model_list = models or []
        if not model_list:
            continue
        key = _first_env(env_keys)
        if not key:
            print(f"   → 跳过 [{name}]（没有设置环境变量 {env_keys}）")
            continue

        # 多模型依次尝试
        zh_vtt_out: Optional[str] = None
        for idx, model in enumerate(model_list):
            print(f"   → 尝试 [{name}] 模型 {model}  ({idx+1}/{len(model_list)})  base={base}")
            res = _llm_chat(base, key, model, system, user, temperature=0.3,
                            provider_label=name, max_tokens=max_tokens_override)
            if not res:
                continue
            # 允许返回 ```json ... ```，也允许直接是数组
            cleaned = res.strip()
            cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned).strip()
            m_arr = re.search(r"\[[\s\S]*\]", cleaned)
            if not m_arr:
                continue
            try:
                arr = json.loads(m_arr.group(0))
            except Exception as e:
                print(f"   ⚠️  JSON 解析失败: {e}")
                continue
            if not isinstance(arr, list):
                continue
            if len(arr) != len(cues):
                print(f"   ⚠️  LLM 返回的中文条数 ({len(arr)}) 与原文 ({len(cues)}) 不一致，跳过此模型。")
                continue
            # 重新构造 zh.vtt（严格用 cues 原始的 start/end，只是换文本）
            zh_vtt = "WEBVTT\n\n"
            for i, (s_ms, e_ms, _) in enumerate(cues):
                zh_vtt += f"{i+1}\n{format_timestamp(s_ms/1000.0)} --> {format_timestamp(e_ms/1000.0)}\n"
                zh_text = str(arr[i]).strip()
                zh_vtt += f"{zh_text}\n\n"
            zh_vtt_out = zh_vtt
            break
        if zh_vtt_out:
            print(f"   ✅ [{name}] 字幕翻译成功！共 {len(cues)} 条中文 cue。")
            return zh_vtt_out

    # 兜底：显式 LLM_BASE/KEY
    explicit_base = os.environ.get("LLM_BASE_URL")
    explicit_key = os.environ.get("LLM_API_KEY")
    explicit_model = target_model or os.environ.get("LLM_MODEL", "gpt-4o-mini")
    if explicit_base and explicit_key:
        print(f"   → 尝试显式 LLM {explicit_base} 模型 {explicit_model}")
        res = _llm_chat(explicit_base, explicit_key, explicit_model, system, user, temperature=0.3,
                        max_tokens=max_tokens_override)
        if res:
            cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", res.strip())
            cleaned = re.sub(r"\s*```$", "", cleaned).strip()
            m_arr = re.search(r"\[[\s\S]*\]", cleaned)
            if m_arr:
                try:
                    arr = json.loads(m_arr.group(0))
                    if isinstance(arr, list) and len(arr) == len(cues):
                        zh_vtt = "WEBVTT\n\n"
                        for i, (s_ms, e_ms, _) in enumerate(cues):
                            zh_vtt += f"{i+1}\n{format_timestamp(s_ms/1000.0)} --> {format_timestamp(e_ms/1000.0)}\n{str(arr[i]).strip()}\n\n"
                        return zh_vtt
                except Exception:
                    pass

    return None


def _offline_translate_vtt(vtt_text: str) -> Optional[str]:
    """零 API 兜底：逐句 argostranslate（慢、但可用），严格 1:1 保留 cue 顺序"""
    print("   🛰️  LLM 全失败，切换到 ArgosTranslate 本地逐句翻译（较慢，建议之后配个免费 LLM Key）...")
    cues = _parse_vtt_cues(vtt_text)
    if not cues:
        return None
    try:
        import argostranslate.package as ap
        import argostranslate.translate as at
        installed = at.get_installed_languages()
        en_lang = next((l for l in installed if l.code == 'en'), None)
        zh_lang = next((l for l in installed if l.code == 'zh'), None)
        if not (en_lang and zh_lang):
            print("   📦  未安装 en→zh 翻译包，尝试自动下载...")
            ap.update_package_index()
            pkg = next(
                (x for x in ap.get_available_packages() if x.from_code == 'en' and x.to_code == 'zh'),
                None,
            )
            if not pkg:
                print("   ⚠️  Argos 也没有 en→zh 包，放弃。")
                return None
            ap.install_from_path(pkg.download())
            installed = at.get_installed_languages()
            en_lang = next((l for l in installed if l.code == 'en'), None)
            zh_lang = next((l for l in installed if l.code == 'zh'), None)
        if not (en_lang and zh_lang):
            return None
        translation = en_lang.get_translation(zh_lang)
        zh_vtt = "WEBVTT\n\n"
        n = len(cues)
        for i, (s_ms, e_ms, text) in enumerate(cues):
            zh_vtt += f"{i+1}\n{format_timestamp(s_ms/1000.0)} --> {format_timestamp(e_ms/1000.0)}\n"
            zh_line = (translation.translate(text) or "").strip() if text else ""
            zh_vtt += f"{zh_line}\n\n"
            if (i + 1) % 20 == 0 or i + 1 == n:
                print(f"   ⏳ Argos 翻译进度: {i+1}/{n}")
        return zh_vtt
    except ImportError:
        print("   ⚠️  未安装 argostranslate（pip install argostranslate），本地兜底失败。")
        return None
    except Exception as e:
        print(f"   ⚠️  Argos 翻译失败: {e}")
        return None


def translate_vtt_to_zh(vtt_text: str, base_name: str, output_dir: Path,
                        force_local: bool = False, zh_model_hint: Optional[str] = None,
                        max_tokens_override: Optional[int] = None) -> Optional[Path]:
    """
    翻译 en VTT → zh VTT，LLM 优先、离线兜底。成功返回 zh.vtt 路径。
    输出文件: {output_dir}/{base_name}_zh.vtt
    """
    zh_path = output_dir / f"{base_name}_zh.vtt"
    if zh_path.exists() and zh_path.stat().st_size > 100:
        print(f"✅ 中文字幕已存在，跳过翻译: {zh_path}")
        return zh_path

    print(f"\n🌐 正在翻译英文字幕 → 中文字幕（{base_name}_zh.vtt）...")
    zh_vtt: Optional[str] = None
    if not force_local:
        zh_vtt = _llm_translate_vtt(vtt_text, zh_model_hint,
                                    max_tokens_override=max_tokens_override)
    if not zh_vtt:
        zh_vtt = _offline_translate_vtt(vtt_text)
    if not zh_vtt:
        print("❌ 中文字幕翻译失败。建议：\n"
              "   1) 在管理后台 /admin/settings 填一个免费 LLM Key（推荐 SiliconFlow Qwen2.5-32B 或 DeepSeek）\n"
              "   2) 或 pip install argostranslate（离线翻译，质量略低但无需 API Key）\n"
              "   3) 或在管理后台用 Step4 手动粘贴中文 VTT。")
        return None

    with open(zh_path, "w", encoding="utf-8") as f:
        f.write(zh_vtt)
    print(f"✅ 中文字幕已生成: {zh_path}")

    cues_src = len(_parse_vtt_cues(vtt_text))
    cues_zh = len(_parse_vtt_cues(zh_vtt))
    if cues_src != cues_zh:
        print(f"⚠️  提示：原英文字幕 {cues_src} 条，中文翻译 {cues_zh} 条，数量不一致，建议 Step4 手动校对。")
    return zh_path


def _translate_to_zh(word: str) -> str:
    """优先用 argostranslate（本地离线），失败则尝试一个免费接口；再失败返回空字符串"""
    # 1) 缓存
    cache_key = f"__translate_cache_{word.lower()}.txt"
    cache_dir = Path(__file__).parent / ".translate_cache"
    ensure_dir(cache_dir)
    cache_file = cache_dir / cache_key
    if cache_file.exists():
        try:
            return cache_file.read_text(encoding="utf-8").strip()
        except Exception:
            pass

    # 2) Argos Translate（本地离线）
    try:
        import argostranslate.package as ap
        import argostranslate.translate as at
        installed = at.get_installed_languages()
        en_lang = next((l for l in installed if l.code == 'en'), None)
        zh_lang = next((l for l in installed if l.code == 'zh'), None)
        if not (en_lang and zh_lang):
            # 尝试下载安装 en→zh
            ap.update_package_index()
            available = ap.get_available_packages()
            pkg = next(
                (x for x in available if x.from_code == 'en' and x.to_code == 'zh'),
                None,
            )
            if pkg:
                path = pkg.download()
                ap.install_from_path(path)
                installed = at.get_installed_languages()
                en_lang = next((l for l in installed if l.code == 'en'), None)
                zh_lang = next((l for l in installed if l.code == 'zh'), None)
        if en_lang and zh_lang:
            translation = en_lang.get_translation(zh_lang)
            if translation:
                zh = translation.translate(word) or ""
                if zh.strip():
                    try:
                        cache_file.write_text(zh.strip(), encoding="utf-8")
                    except Exception:
                        pass
                    return zh.strip()
    except ImportError:
        pass
    except Exception as e:
        print(f"   ⚠️  argostranslate 失败: {e}")

    # 3) 完全没有翻译能力时，返回空串（用户手动填）
    return ""


def extract_vocabulary_local(segments: List[Dict[str, Any]], vtt_text: str, num_words: int
                             ) -> List[Dict[str, Any]]:
    """零 API：基于 TF / 停用词 / 词长打分，选出最合适的 N 个词"""
    print("\n🧠 未检测到可用的大模型 API，切换到 **本地零依赖抽词** (TF + 停用词 + 儿童词长偏好)")
    print("   (提示：之后只要设置 SILICONFLOW_API_KEY / DEEPSEEK_API_KEY 等任一可用 key，就会自动切回 LLM 抽词，质量更高)")

    pairs = _segments_to_word_time(segments)
    tf: Dict[str, int] = {}
    first_time: Dict[str, float] = {}
    for w, t in pairs:
        if w in ENGLISH_STOPWORDS:
            continue
        if len(w) < 3 or len(w) > 11:
            continue
        tf[w] = tf.get(w, 0) + 1
        if w not in first_time:
            first_time[w] = t

    if not tf:
        return []

    max_tf = max(tf.values())

    def score(w: str) -> float:
        tf_norm = tf[w] / max_tf
        len_pref = 1.0 if 3 <= len(w) <= 7 else (0.7 if 8 <= len(w) <= 9 else 0.4)
        # 首字母大写的词（专有名词/句首）稍微加一点分但不过度
        return (tf_norm * 0.6 + len_pref * 0.4)

    ranked = sorted(tf.keys(), key=score, reverse=True)[:num_words * 3]

    # 翻译 & 组装
    result: List[Dict[str, Any]] = []
    seen_lower = set()
    import random
    rng = random.Random(42)
    for w in ranked:
        if w in seen_lower:
            continue
        seen_lower.add(w)
        zh = _translate_to_zh(w)
        t = round(first_time.get(w, 0.0), 1)
        result.append({
            "time": t,
            "wordEn": w.capitalize(),
            "wordZh": zh,
            "coordX": rng.randint(25, 75),
            "coordY": rng.randint(20, 70),
        })
        if len(result) >= num_words:
            break

    # 按时间排序
    result.sort(key=lambda x: x['time'])
    filtered = _filter_noun_verb_only(result, target_count=num_words,
                                      local_extra_tf=tf, lenient_local=True)
    if len(filtered) != len(result):
        print(f"   ✅ 本地抽词（名动过滤）：原始 {len(result)} 词 → 保留 {len(filtered)} 名词/动词")
    elif len(filtered) == 0 and len(result) > 0:
        print(f"   ⚠️  名动过滤后全空！放宽兜底：前 {min(num_words, len(result))} 个保留为名词")
        # 终极兜底：本地抽词如果一个都没留下来（名动过滤太严），直接用 result 的前 N 个
        return result[:num_words]
    return filtered


# ============================================================
# 🔊 4. TTS 多引擎：Edge-TTS（免费微软神经语音，首选）> gTTS > 兜底不生成
# ============================================================
def generate_tts_audio(text: str, index: int, video_name: str, out_dir: Path
                       ) -> Optional[str]:
    """生成单词发音，成功返回相对 URL 路径 `/media/{video_name}_audio/xxx.mp3`"""
    ensure_dir(out_dir)
    audio_path = out_dir / f"word_{index:02d}_{re.sub(r'[^A-Za-z0-9_-]', '_', text)}.mp3"
    audio_url_rel = f"/media/{out_dir.name}/{audio_path.name}"

    if audio_path.exists() and audio_path.stat().st_size > 1024:
        print(f"   ✅ 发音已存在，跳过生成: {audio_path.name}")
        return audio_url_rel

    # 1) Edge-TTS（完全免费，微软神经语音，支持 en-US-JennyNeural 等儿童友好声线）
    try:
        import asyncio
        try:
            import edge_tts
        except ImportError:
            edge_tts = None
            # 尝试用命令行调用（pip install edge-tts 后会有 edge-tts CLI）
        if edge_tts is not None:
            voice = os.environ.get("EDGE_TTS_VOICE", "en-US-JennyNeural")
            rate = os.environ.get("EDGE_TTS_RATE", "-10%")
            communicate = edge_tts.Communicate(text, voice, rate=rate)
            # 同步执行异步
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    loop.run_until_complete(communicate.save(str(audio_path)))
                finally:
                    loop.close()
            except Exception:
                try:
                    asyncio.run(communicate.save(str(audio_path)))
                except Exception as ee:
                    raise ee
            if audio_path.exists() and audio_path.stat().st_size > 1024:
                print(f"   ✅ Edge-TTS 发音生成: {audio_path.name}")
                return audio_url_rel
        else:
            # CLI 方式
            voice = os.environ.get("EDGE_TTS_VOICE", "en-US-JennyNeural")
            rate = os.environ.get("EDGE_TTS_RATE", "-10%")
            subprocess.run(
                ["edge-tts", "--voice", voice, "--rate", rate,
                 "--text", text, "--write-media", str(audio_path)],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                timeout=30,
            )
            if audio_path.exists() and audio_path.stat().st_size > 1024:
                print(f"   ✅ Edge-TTS (CLI) 发音生成: {audio_path.name}")
                return audio_url_rel
    except ImportError:
        print("   ℹ️  未安装 edge-tts，跳过（可 pip install edge-tts 获得高质量免费神经 TTS）")
    except Exception as e:
        print(f"   ⚠️  Edge-TTS 失败: {e}")

    # 2) gTTS（Google 免费 TTS，需联网）
    try:
        from gtts import gTTS
        tts = gTTS(text=text, lang='en', slow=True)
        tts.save(str(audio_path))
        if audio_path.exists() and audio_path.stat().st_size > 512:
            print(f"   ✅ gTTS 发音生成: {audio_path.name}")
            return audio_url_rel
    except ImportError:
        print("   ℹ️  未安装 gTTS，可忽略（pip install gTTS 开启备份方案）")
    except Exception as e:
        print(f"   ⚠️  gTTS 失败: {e}")

    # 3) 兜底：不生成音频文件，消费端使用系统 Web Speech 合成
    print(f"   ⏭  发音生成跳过（无可用 TTS 引擎）→ 播放端使用系统 Web Speech Synthesis")
    return None


# ============================================================
# 📦 5. 统一输出生词表（同时产出 MD + JSON，两端通用）
# ============================================================
VOCAB_JSON_SCHEMA = {
    "version": 1,
    "meta": {"format": "kids-cartoon.vocabulary.v1",
             "description": "生词气泡时间轴事件（H5 TimelineEvent & 小程序 CourseEvent 通用）"},
    "events": [],  # [{id,time,wordEn,wordZh,imageUrl,audioUrl,coordX,coordY}]
}


def build_vocab_outputs(vocab: List[Dict[str, Any]], base_name: str, audio_urls: Dict[int, Optional[str]],
                        ) -> Tuple[str, Dict[str, Any]]:
    """同时生成 Markdown（给 TimelineEditor 导入用）+ JSON（给 H5 播放器 + 小程序消费用）"""
    events: List[Dict[str, Any]] = []
    md_lines = [
        "| 触发时间(s) | 英文单词 | 中文释义 | X坐标 | Y坐标 |",
        "| --- | --- | --- | --- | --- |",
    ]
    for i, v in enumerate(vocab):
        t = v.get("time", 0)
        en = v.get("wordEn") or ""
        zh = v.get("wordZh") or ""
        x = int(v.get("coordX", 50) or 50)
        y = int(v.get("coordY", 30) or 30)
        audio_url = audio_urls.get(i) or ""
        evt = {
            "id": f"evt_{base_name}_{i+1:03d}",
            "time": round(float(t), 1),
            "wordEn": en,
            "wordZh": zh,
            "imageUrl": "",  # 后续可接入 DALL-E / flux-schnell 自动配图，这里留空手动填
            "audioUrl": audio_url or "",
            "coordX": x,
            "coordY": y,
        }
        events.append(evt)
        md_lines.append(f"| {evt['time']:.1f} | {en} | {zh} | {x} | {y} |")

    md_text = "\n".join(md_lines) + "\n"
    json_obj = dict(VOCAB_JSON_SCHEMA)
    json_obj["events"] = events
    return md_text, json_obj


# ============================================================
# 🚀 6. 主流程
# ============================================================
def main() -> None:
    parser = argparse.ArgumentParser(
        description="【完全免费版】自动处理儿童英文动画：Whisper 转字幕 + 多引擎抽生词 + Edge-TTS/gTTS 生成发音"
    )
    parser.add_argument("video_path", help="要处理的视频文件路径 (例如: video.mp4)")
    parser.add_argument("--model", default="base",
                        choices=["tiny", "base", "small", "medium", "large"],
                        help="Whisper 模型大小 (默认 base。越大越准但越慢，无 GPU 建议 tiny/base)")
    parser.add_argument("--words", type=int, default=12,
                        help="要提取的生词数量 (默认 12)")
    parser.add_argument("--skip-tts", action="store_true",
                        help="跳过 TTS 生成（纯平台 Web Speech Synthesis 兜底）")
    parser.add_argument("--force-local", action="store_true",
                        help="强制本地零 API 抽词，不尝试任何 LLM 在线接口")
    parser.add_argument("--no-mkv-convert", action="store_true",
                        help="跳过 mkv → mp4 自动转封装")
    parser.add_argument("--translate-zh", action="store_true",
                        help="【推荐】翻译英文字幕生成中文字幕 {base_name}_zh.vtt（LLM 优先 → ArgosTranslate 本地兜底）")
    parser.add_argument("--vocab-model", default=None,
                        help="指定生词抽取用的 LLM 模型名（SiliconFlow 推荐 deepseek-ai/DeepSeek-V3.2 / Pro/zai-org/GLM-5.1 / Pro/moonshotai/Kimi-K2.6）")
    parser.add_argument("--zh-model", default=None,
                        help="指定中文字幕翻译用的 LLM 模型名（SiliconFlow 推荐 deepseek-ai/DeepSeek-V3.2 / Pro/zai-org/GLM-5.1）")
    parser.add_argument("--max-tokens", type=int, default=None,
                        help="LLM 单次调用 max_tokens，默认 4096，可通过环境变量 LLM_MAX_TOKENS 覆盖")

    args = parser.parse_args()
    video_path = Path(args.video_path)

    if not video_path.exists():
        print(f"❌ 找不到视频文件: {video_path}")
        return

    output_dir = video_path.parent
    base_name = video_path.stem

    # mkv → mp4
    if video_path.suffix.lower() == '.mkv' and not args.no_mkv_convert:
        mp4_path = output_dir / f"{base_name}.mp4"
        if not mp4_path.exists():
            print(f"\n⚠️  检测到 .mkv 文件！网页端 <video> 不支持播放 mkv。")
            print(f"🔄 正在用 FFmpeg 无损封装转成 .mp4 (秒级)：{mp4_path.name}")
            try:
                subprocess.run(
                    ["ffmpeg", "-i", str(video_path), "-codec", "copy", str(mp4_path)],
                    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                print("✅ 转换成功！后续建议在管理后台使用此 mp4。")
            except FileNotFoundError:
                print("❌ 未检测到 ffmpeg，请先安装 (winget install ffmpeg 或 choco install ffmpeg)")
            except Exception as e:
                print(f"❌ 转封装失败: {e}")
                print("   (脚本将继续提取字幕，可手动转格式)")
        if mp4_path.exists():
            video_path = mp4_path

    vtt_path = output_dir / f"{base_name}_en.vtt"
    md_path = output_dir / f"{base_name}_vocabulary.md"
    json_path = output_dir / f"{base_name}_vocabulary.json"
    audio_dir = output_dir / f"{base_name}_audio"

    print(f"\n🎬 开始处理视频: {video_path.name}")
    print(f"🤖 加载 Whisper 模型 ({args.model}) (首次会自动下载权重)...")

    model = whisper.load_model(args.model)
    print("🎙️  语音识别中...")
    result = model.transcribe(str(video_path), language="en", fp16=False)
    segments = result.get("segments", []) or []

    vtt_content = generate_vtt_content(segments)
    with open(vtt_path, "w", encoding="utf-8") as f:
        f.write(vtt_content)
    print(f"✅ 英文字幕已生成: {vtt_path}")

    # 中文字幕（翻译）：--translate-zh 默认走 LLM → 离线 Argos 兜底
    zh_vtt_path: Optional[Path] = None
    if args.translate_zh:
        zh_vtt_path = translate_vtt_to_zh(
            vtt_content, base_name, output_dir,
            force_local=args.force_local,
            zh_model_hint=args.zh_model,
            max_tokens_override=args.max_tokens,
        )

    # 抽词：LLM 优先 → 本地兜底（💥 统一名动 3 层过滤）
    vocab: Optional[List[Dict[str, Any]]] = None
    if not args.force_local:
        vocab = extract_vocabulary_with_llm(vtt_content, args.words,
                                            vocab_model_hint=args.vocab_model,
                                            max_tokens_override=args.max_tokens)
    if not vocab:
        vocab = extract_vocabulary_local(segments, vtt_content, args.words)
        print(f"✅ 本地抽词结束，得到 {len(vocab)} 个生词（名动过滤已完成，质量低于 LLM，建议之后配置免费 LLM API 重跑）")
    else:
        print(f"✅ 大模型抽词结束，得到 {len(vocab)} 个生词（严格名词/动词，已过滤形容词/副词/介词/助动词等）")
    # 最后兜底：无论前面抽的什么，再强制跑一遍（保证宁少勿错）
    if vocab:
        vocab = _filter_noun_verb_only(vocab, target_count=args.words)

    # TTS
    audio_rel_map: Dict[int, Optional[str]] = {}
    if vocab and not args.skip_tts:
        print("\n🔊 生成单词发音音频（优先 Edge-TTS 免费神经语音）...")
        ensure_dir(audio_dir)
        for i, v in enumerate(vocab):
            text = (v.get("wordEn") or "").strip()
            if not text:
                continue
            rel = generate_tts_audio(text, i, base_name, audio_dir)
            audio_rel_map[i] = rel
    else:
        print("\n⏭  已跳过 TTS 生成，播放时将使用系统 Web Speech Synthesis (浏览器/小程序内置合成)")

    # 导出 MD + JSON
    md_text, json_obj = build_vocab_outputs(vocab or [], base_name, audio_rel_map)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_text)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_obj, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 生词表 Markdown (用于 TimelineEditor 导入): {md_path}")
    print(f"✅ 生词表 JSON (用于 H5/小程序直接消费):   {json_path}")
    if audio_dir.exists():
        print(f"✅ 发音音频文件夹: {audio_dir}")
        print("   👉 把整个文件夹复制到 admin-web/public/media/ 下，文件名保持不变，JSON 中的 audioUrl 会自动对上")
    if zh_vtt_path and zh_vtt_path.exists():
        print(f"✅ 中文字幕 VTT: {zh_vtt_path}")
        print("   👉 后台自动匹配工具会按相同文件名 stem 自动挂上 zh.vtt，无需手动填")

    print("\n======== 后续在管理后台中的操作 ========")
    print("  1) 打开 /admin → 内容管理 → 新增课件 → 填标题 → 保存")
    print("  2) 进入「时间轴」编辑器 → 填视频 URL + 字幕 URL → 点「导入词汇表 (MD)」选择", md_path.name)
    print("  3) 点「AI 模拟预览」检查每个气泡时间点，可手动改词/位置/图片/发音")
    print("  4) 回到「课程资料管理」→ 点顶部 🧙 自动匹配全部 → 自动挂视频 / 英字幕 / 中字幕 / 生词表 4 字段")
    print("  5) 下载 courses.json → 覆盖 client-web/public/data/courses.json → merge-dist + deploy")

    # 若有空中文，提示用户
    empty_zh = [v.get("wordEn") for v in (vocab or []) if not (v.get("wordZh") or "").strip()]
    if empty_zh:
        print("\n⚠️  以下单词未获取到中文释义（未装 argostranslate 或未联网翻译），请在管理后台手动补全：")
        print("   •", ", ".join(empty_zh))


if __name__ == "__main__":
    main()
