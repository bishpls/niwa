// engine/scene3d/kit/sacred/words.js: what is written on a temple's stones and posts, by rule: a date in its era name
// with the year's sexagenary sign, a donor (a place, a house name and a man's name, or a confraternity), the words of
// dedication. Every glyph here is in Shippori Mincho (checked with fontTools; inscribe.js renders them).
//
// Eras (gengo) with their first Gregorian year (the year an era began counts as its year 1, written 元).
export const ERAS = [
  ['元禄', 1688], ['宝永', 1704], ['正徳', 1711], ['享保', 1716], ['元文', 1736], ['寛保', 1741], ['延享', 1744], ['寛延', 1748],
  ['宝暦', 1751], ['明和', 1764], ['安永', 1772], ['天明', 1781], ['寛政', 1789], ['享和', 1801], ['文化', 1804], ['文政', 1818],
  ['天保', 1830], ['弘化', 1844], ['嘉永', 1848], ['安政', 1854], ['万延', 1860], ['文久', 1861], ['元治', 1864], ['慶応', 1865],
  ['明治', 1868], ['大正', 1912], ['昭和', 1926], ['平成', 1989], ['令和', 2019],
];
const STEM = '甲乙丙丁戊己庚辛壬癸', BRANCH = '子丑寅卯辰巳午未申酉戌亥';
const DIG = '〇一二三四五六七八九';
export function kanjiNum(n) {
  if (n <= 0) return '〇';
  if (n < 10) return DIG[n];
  if (n < 20) return '十' + (n % 10 ? DIG[n % 10] : '');
  if (n < 100) return DIG[Math.floor(n / 10)] + '十' + (n % 10 ? DIG[n % 10] : '');
  return String(n);
}
export function eraOf(year) {
  let e = ERAS[0];
  for (const x of ERAS) if (x[1] <= year) e = x;
  const n = year - e[1] + 1;
  return { era: e[0], n, text: e[0] + (n === 1 ? '元' : kanjiNum(n)) + '年' };
}
export const eto = year => STEM[((year - 4) % 10 + 10) % 10] + BRANCH[((year - 4) % 12 + 12) % 12];
const MONTHS = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
// a dedication date as carved: era year (and, before Meiji, the sign of the year), month, an auspicious day
export function dateText(year, R, { eto: withEto = null } = {}) {
  const e = eraOf(year), m = MONTHS[Math.floor(R() * 12)];
  const day = R() < 0.7 ? '吉日' : R() < 0.5 ? '吉祥日' : kanjiNum(1 + Math.floor(R() * 28)) + '日';
  const sign = withEto ?? (year < 1873 && R() < 0.75);
  return { line1: e.text + (sign ? eto(year) : ''), line2: m + day, era: e };
}
const PLACES = ['大坂', '京', '伏見', '大津', '堺', '江戸', '浪華', '丹波', '近江', '大和'];
const HOUSES = ['伏見屋', '近江屋', '大和屋', '丹波屋', '河内屋', '山城屋', '播磨屋', '越後屋', '和泉屋', '紀伊國屋', '大坂屋', '京屋'];
const NAMES = ['藤兵衛', '平右衛門', '善助', '治郎兵衛', '嘉七', '半兵衛', '庄兵衛', '甚右衛門', '五兵衛', '安兵衛', '市太郎', '清之丞', '吉蔵', '太七', '与兵衛', '作次郎'];
const GROUPS = ['村中', '講中', '若者中', '氏子中', '大坂講中', '京講中', '世話人中'];
const SURN = ['山田', '田中', '中村', '小林', '岡本', '藤原', '西村', '吉田', '松本', '井上', '木村', '山本', '中川', '森', '石田', '前田', '大西', '谷口', '上田', '北村'];
export function donor(R, year) {
  if (R() < 0.22) return { text: PLACES[Math.floor(R() * PLACES.length)] + GROUPS[Math.floor(R() * GROUPS.length)] };
  if (year >= 1875) return { text: SURN[Math.floor(R() * SURN.length)] + NAMES[Math.floor(R() * NAMES.length)].replace('兵衛', '吉').slice(0, 3) };
  return { text: PLACES[Math.floor(R() * PLACES.length)] + '\n' + HOUSES[Math.floor(R() * HOUSES.length)] + NAMES[Math.floor(R() * NAMES.length)] };
}
export const surname = R => SURN[Math.floor(R() * SURN.length)];
// the words of dedication on a lantern's front: 'offered', 'everlasting light', 'before the treasure (the deity)'
export const DEDICATION = ['奉献', '常夜燈', '献燈', '奉納', '御寶前'];
export const PLACE = { temple: '當山', rebuilt: '再建', repaired: '修復', mason: '石工' };

// a posthumous name (kaimyo): two characters of the name, its rank (shinji for a man, shinnyo for a woman; koji and
// daishi for the devout; doji for a child), with the Jodo Shin 'shaku' prefix on some
const KAI = '妙光清浄慈恵心誠道円寿春秋月雲松梅善信法蓮明照玄智徳静香雪花';
export function kaimyo(R) {
  const a = KAI[Math.floor(R() * KAI.length)], b = KAI[Math.floor(R() * KAI.length)];
  const rank = ['信士', '信女', '居士', '大姉', '童子', '禅定門', '禅定尼'][Math.floor(R() * R() * 7)];
  return (R() < 0.25 ? '釋' : '') + a + b + rank;
}
