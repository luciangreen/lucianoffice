// Word knowledge for the Converter and the year-level checks.

const IRREGULAR = {
  men: 'man', women: 'woman', people: 'person', children: 'child', mice: 'mouse', feet: 'foot', teeth: 'tooth',
  geese: 'goose', oxen: 'ox', data: 'datum', criteria: 'criterion', lives: 'life', knives: 'knife', wives: 'wife',
  leaves: 'leaf', wolves: 'wolf', halves: 'half', shelves: 'shelf', sheep: 'sheep', fish: 'fish', series: 'series',
  species: 'species', analyses: 'analysis', theses: 'thesis', bases: 'basis'
};
const IRREGULAR_PLURAL = Object.fromEntries(Object.entries(IRREGULAR).map(([p, s]) => [s, p]));
const NOT_PLURAL = new Set(['is', 'has', 'was', 'this', 'his', 'its', 'us', 'bus', 'gas', 'plus', 'yes', 'lens', 'news', 'class', 'glass', 'grass', 'boss', 'bonus', 'status', 'virus', 'campus', 'focus', 'process']);

export function singular(word) {
  const w = word.toLowerCase();
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (NOT_PLURAL.has(w) || w.endsWith('ss') || w.endsWith('us') || w.length < 3) return w;
  if (/[^aeiou]ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (/(ches|shes|sses|xes|zes|oes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}
export function plural(word) {
  const w = word.toLowerCase();
  if (IRREGULAR_PLURAL[w]) return IRREGULAR_PLURAL[w];
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
  if (/(ch|sh|ss|x|z|o)$/.test(w)) return w + 'es';
  return w + 's';
}
export const isPlural = (word) => singular(word) !== word.toLowerCase();
export const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

// Vague, qualitative adjectives and the measurable dimension each one is about.
// dir 'high': more of the dimension makes it truer (tall); 'low': less does (short).
export const VAGUE = {
  tall: { dim: 'height', dir: 'high' }, short: { dim: 'height', dir: 'low' },
  old: { dim: 'age', dir: 'high' }, young: { dim: 'age', dir: 'low' },
  heavy: { dim: 'weight', dir: 'high' }, light: { dim: 'weight', dir: 'low' },
  expensive: { dim: 'price', dir: 'high' }, dear: { dim: 'price', dir: 'high' }, cheap: { dim: 'price', dir: 'low' },
  fast: { dim: 'speed', dir: 'high' }, quick: { dim: 'speed', dir: 'high' }, slow: { dim: 'speed', dir: 'low' },
  big: { dim: 'size', dir: 'high' }, large: { dim: 'size', dir: 'high' }, small: { dim: 'size', dir: 'low' }, little: { dim: 'size', dir: 'low' },
  long: { dim: 'length', dir: 'high' },
  hot: { dim: 'temperature', dir: 'high' }, warm: { dim: 'temperature', dir: 'high' }, cold: { dim: 'temperature', dir: 'low' },
  rich: { dim: 'wealth', dir: 'high' }, poor: { dim: 'wealth', dir: 'low' },
  busy: { dim: 'workload', dir: 'high' }, popular: { dim: 'followers', dir: 'high' },
  profitable: { dim: 'profit', dir: 'high' }, successful: { dim: 'sales', dir: 'high' }
};

// Comparatives, drilled down to a comparison on the dimension.
export const COMPARATIVE = {
  older: ['age', '>'], younger: ['age', '<'], taller: ['height', '>'], shorter: ['height', '<'],
  heavier: ['weight', '>'], lighter: ['weight', '<'], bigger: ['size', '>'], larger: ['size', '>'], smaller: ['size', '<'],
  faster: ['speed', '>'], quicker: ['speed', '>'], slower: ['speed', '<'], cheaper: ['price', '<'], dearer: ['price', '>'],
  richer: ['wealth', '>'], poorer: ['wealth', '<'], longer: ['length', '>'], hotter: ['temperature', '>'], colder: ['temperature', '<'],
  busier: ['workload', '>']
};
export const COMPARATIVE_OF = Object.fromEntries(Object.entries(COMPARATIVE).map(([w, [d, op]]) => [`${d}${op}`, w]));

// Units that say which dimension a number measures ("190 cm tall", "40 years old").
export const UNIT_DIM = {
  cm: 'height', mm: 'length', m: 'length', metres: 'length', meters: 'length', km: 'length',
  kg: 'weight', g: 'weight', grams: 'weight', kilograms: 'weight', tonnes: 'weight',
  years: 'age', year: 'age', dollars: 'price', '$': 'price', 'km/h': 'speed', degrees: 'temperature'
};

export const INTENSIFIERS = new Set(['very', 'quite', 'rather', 'extremely', 'somewhat', 'fairly', 'really', 'too', 'so', 'pretty', 'highly', 'incredibly']);

// About 900 of the most frequent English words, roughly in frequency order. A word's
// position sets its difficulty band for the year-level checks; words not here are rare.
export const COMMON = `the of and to a in is it you that he was for on are with as i his they be at one have this from or had by
hot word but what some we can out other were all there when up use your how said an each she which do their time if will way
about many then them write would like so these her long make thing see him two has look more day could go come did number
sound no most people my over know water than call first who may down side been now find any new work part take get place made
live where after back little only round man year came show every good me give our under name very through just form sentence
great think say help low line differ turn cause much mean before move right boy old too same tell does set three want air well
also play small end put home read hand port large spell add even land here must big high such follow act why ask men change
went light kind off need house picture try us again animal point mother world near build self earth father head stand own page
should country found answer school grow study still learn plant cover food sun four between state keep eye never last let
thought city tree cross farm hard start might story saw far sea draw left late run don't while press close night real life few
north open seem together next white children begin got walk example ease paper group always music those both mark often letter
until mile river car feet care second book carry took science eat room friend began idea fish mountain stop once base hear
horse cut sure watch colour color face wood main enough plain girl usual young ready above ever red list though feel talk bird soon
body dog family direct pose leave song measure door product black short numeral class wind question happen complete ship area
half rock order fire south problem piece told knew pass since top whole king space heard best hour better true during hundred
five remember step early hold west ground interest reach fast verb sing listen six table travel less morning ten simple several
vowel toward war lay against pattern slow centre center love person money serve appear road map rain rule govern pull cold
notice voice unit power town fine certain fly fall lead cry dark machine note wait plan figure star box noun field rest correct
able pound done beauty drive stood contain front teach week final gave green oh quick develop ocean warm free minute strong
special mind behind clear tail produce fact street inch multiply nothing course stay wheel full force blue object decide surface
deep moon island foot system busy test record boat common gold possible plane stead dry wonder laugh thousand ago ran check game
shape equate miss brought heat snow tire bring yes distant fill east paint language among grand ball yet wave drop heart am
present heavy dance engine position arm wide sail material size vary settle speak weight general ice matter circle pair include
divide syllable felt perhaps pick sudden count square reason length represent art subject region energy hunt probable bed brother
egg ride cell believe fraction forest sit race window store summer train sleep prove lone leg exercise wall catch mount wish sky
board joy winter sat written wild instrument kept glass grass cow job edge sign visit past soft fun bright gas weather month
million bear finish happy hope flower clothe strange gone jump baby eight village meet root buy raise solve metal whether push
seven paragraph third shall held hair describe cook floor either result burn hill safe cat century consider type law bit coast
copy phrase silent tall sand soil roll temperature finger industry value fight lie beat excite natural view sense ear else quite
broke case middle kill son lake moment scale loud spring observe child straight consonant nation dictionary milk speed method
organ pay age section dress cloud surprise quiet stone tiny climb cool design poor lot experiment bottom key iron single stick
flat twenty skin smile crease hole trade melody trip office receive row mouth exact symbol die least trouble shout except wrote
seed tone join suggest clean break lady yard rise bad blow oil blood touch grew cent mix team wire cost lost brown wear garden
equal sent choose fell fit flow fair bank collect save control decimal gentle woman captain practice separate difficult doctor
please protect noon whose locate ring character insect caught period indicate radio spoke atom human history effect electric
expect crop modern element hit student corner party supply bone rail imagine provide agree thus capital won't chair danger
fruit rich thick soldier process operate guess necessary sharp wing create neighbour neighbor wash bat rather crowd corn compare poem
string bell depend meat rub tube famous dollar stream fear sight thin triangle planet hurry chief colony clock mine tie enter
major fresh search send yellow gun allow print dead spot desert suit current lift rose continue block chart hat sell success
company subtract event particular deal swim term opposite wife shoe shoulder spread arrange camp invent cotton born determine
quart nine truck noise level chance gather shop stretch throw shine property column molecule select wrong gray grey repeat
require broad prepare salt nose plural anger claim continent oxygen sugar death pretty skill women season solution magnet silver
thank branch match suffix especially fig afraid huge sister steel discuss forward similar guide experience score apple bought
led pitch coat mass card band rope slip win dream evening condition feed tool total basic smell valley nor double seat arrive
master track parent shore division sheet substance favour favor connect post spend chord fat glad original share station dad
bread charge proper bar offer segment slave duck instant market degree populate chick dear enemy reply drink occur support
speech nature range steam motion path liquid log meant quotient teeth shell neck business price sale buy pay customer cheap
expensive old young computer phone email online website internet count sum average total profit plan goal`
  .split(/\s+/).filter(Boolean);
const RANK = new Map(COMMON.map((w, i) => [w, i]));
export function wordRank(word) {
  const w = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!w) return 0;
  for (const form of [w, singular(w), w.replace(/(ing|ed|er|est|ly)$/, ''), w.replace(/(ing|ed)$/, 'e'), w.replace(/ies$/, 'y')]) {
    if (RANK.has(form)) return RANK.get(form);
  }
  return Infinity;
}

// Plainer words for the year-level rewrite. Each pair is (harder, plainer).
export const PLAINER = {
  utilise: 'use', utilize: 'use', commence: 'start', terminate: 'end', purchase: 'buy', approximately: 'about',
  sufficient: 'enough', assistance: 'help', demonstrate: 'show', facilitate: 'help', obtain: 'get', require: 'need',
  additional: 'more', numerous: 'many', subsequently: 'later', prior: 'before', endeavour: 'try', endeavor: 'try',
  ascertain: 'find out', comprehend: 'understand', construct: 'build', indicate: 'show', individual: 'person',
  however: 'but', therefore: 'so', consequently: 'so', nevertheless: 'still', regarding: 'about', inquire: 'ask',
  enquire: 'ask', residence: 'home', occupation: 'job', remuneration: 'pay', acquire: 'get', modify: 'change',
  objective: 'goal', initial: 'first', principal: 'main', fundamental: 'basic', significant: 'large', optimal: 'best',
  methodology: 'method', implement: 'carry out', component: 'part', sufficiently: 'enough', frequently: 'often',
  immediately: 'now', currently: 'now', anticipate: 'expect', beneficial: 'good', commodity: 'product'
};
