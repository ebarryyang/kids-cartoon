// 💥 admin-web 前端统一 POS 过滤：只留 名词(noun) + 动词(verb)
//    算法与 Python 侧 scripts/auto_process_video.py _filter_noun_verb_only() 完全对齐
//    3 层递进：① STOPWORDS + 形/副/介/连/助动词 黑名单  ② 带 pos 字段直接信它  ③ 白名单 + 后缀启发式

export interface VocabLike {
  id?: string;
  time?: number;
  wordEn?: string;
  wordZh?: string;
  imageUrl?: string;
  audioUrl?: string;
  coordX?: number;
  coordY?: number;
  pos?: string;
  [key: string]: any;
}

const ENGLISH_STOPWORDS = new Set<string>(`
a an the and or but if then else of to in on at for with from by as is are was were
be been being have has had do does did will would shall should may might can could must
i you he she it we they me him her us them my your his her its our their this that
these those am not no so too very also just about over under up down out off all some
any each every both few more most other such than s t don doesn didn won wouldn can
cannot isn aren wasn weren hasn haven hadn let re ll ve yeah ok okay hey hi hello yes
no mr mrs miss now here there when where why how what which who whom whose
`.split(/\s+/).filter(Boolean));

const POS_BLACKLIST_EXTRA = new Set<string>(`
big small little happy sad good bad nice great cute funny lovely beautiful old new
long short tall high low fast slow hot cold warm cool clean dirty dry wet soft hard
easy difficult hungry thirsty tired sorry ready right wrong left open shut close early
late first last next last same different kind nice sweet angry sorry sorry sure ready
here there now then today tomorrow yesterday always never sometimes often usually still
already yet just only even also really very much many well back again away forward almost
together always perhaps maybe maybe however therefore though although because while since
before after during between among through across behind below above beside under around
behind without within except instead including following towards against
`.split(/\s+/).filter(Boolean));

const KIDS_NOUN_WHITELIST = new Set<string>(`
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
city town village country world family dad daddy mom mummy mum brother sister
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
`.split(/\s+/).filter(Boolean));

const KIDS_VERB_WHITELIST = new Set<string>(`
run jump hop skip walk climb crawl dance sing play laugh smile cry talk speak say
tell shout whisper listen hear look see watch read write draw paint color cut stick
glue fold open close shut lock unlock push pull lift carry hold throw catch kick
bounce hit shoot pass score win lose try start stop begin finish continue wait hurry
rush come go leave arrive stay return move sit stand lie kneel bend turn nod shake
wave clap snap point reach stretch bend twist spin roll float swim dive fly ride
drive sail row eat drink taste chew bite swallow feed cook bake wash clean brush
comb dress undress wear takeoff puton button zip buckle sleep wake rest nap
dream work help share give take get make build break fix plant pick water dig
cook bake fry boil stir mix measure pour cut chop slice peel cook serve taste
buy sell pay cost count draw write type spell read learn teach study practice
test pass fail win lose start finish join leave invite welcome greet thank
apologize promise agree disagree ask answer question call ring knock hug kiss
show hide seek find
`.split(/\s+/).filter(Boolean));

const NOUN_SUFFIXES_3PLUS = [
  'tion', 'sion', 'ment', 'ness', 'ity', 'ist', 'ism', 'ance', 'ence',
  'ship', 'hood', 'dom', 'ure', 'ics', 'logy', 'ography', 'ology', 'ery',
  'ary', 'ory', 'ant', 'ent',
];
const VERB_SUFFIXES_2PLUS = ['ing', 'ed', 'ize', 'ise', 'ify', 'ate', 'en', 'es'];

export function isLikelyNoun(low: string): boolean {
  if (KIDS_NOUN_WHITELIST.has(low)) return true;
  for (const suf of NOUN_SUFFIXES_3PLUS) {
    if (low.endsWith(suf) && low.length > suf.length + 1) return true;
  }
  return false;
}

export function isLikelyVerb(low: string): boolean {
  if (KIDS_VERB_WHITELIST.has(low)) return true;
  for (const suf of VERB_SUFFIXES_2PLUS) {
    if (low.endsWith(suf) && low.length > suf.length + 1) return true;
  }
  return false;
}

export function filterNounVerbOnly<T extends VocabLike>(events: T[]): T[] {
  if (!events || events.length === 0) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const e of events) {
    if (!e) continue;
    const en = (e.wordEn || '').toString().trim();
    if (!en) continue;
    const low = en.toLowerCase();
    if (seen.has(low)) continue;
    if (ENGLISH_STOPWORDS.has(low) || POS_BLACKLIST_EXTRA.has(low)) continue;
    const pos = String(e.pos || '').toLowerCase().trim();
    let keep = false;
    if (pos === 'noun' || pos === 'verb') keep = true;
    else if (!pos) keep = isLikelyNoun(low) || isLikelyVerb(low);
    if (!keep) continue;
    seen.add(low);
    out.push(e);
  }
  return out;
}
