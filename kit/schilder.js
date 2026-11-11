// Ladenschilder (05.11.2026): ein Bildatlas mit erfundenen Läden in der Sprache des Landes (Bäckerei, Apotheke, Café ...), keine echten Marken. Jedes Haus mit Läden bekommt daraus
// seine Schilder, nachts leuchten sie. Wechselt man in ein Land mit anderer Sprache, wird der Atlas neu gezeichnet. Ohne Browser (Prüfstände) nur die Zellen, kein Bild.
import * as THREE from 'three';

const SPRACHE = { DE: 'de', AT: 'de', CH: 'de', LU: 'de', LI: 'de', FR: 'fr', BE: 'fr', MC: 'fr', ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', EC: 'es', GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es', PT: 'pt', BR: 'pt', AO: 'pt', MZ: 'pt', IT: 'it', SM: 'it', VA: 'it', NL: 'nl', TR: 'tr', RU: 'ru', UA: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru', PL: 'pl', CZ: 'pl', SK: 'pl',
  MA: 'ar', DZ: 'ar', TN: 'ar', LY: 'ar', EG: 'ar', SA: 'ar', AE: 'ar', QA: 'ar', KW: 'ar', BH: 'ar', OM: 'ar', YE: 'ar', JO: 'ar', SY: 'ar', LB: 'ar', IQ: 'ar', PS: 'ar', SD: 'ar', JP: 'ja', CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh', SG: 'zh', KR: 'ko', IN: 'hi', TH: 'th' };
const WOERTER = {
  de: ['BÄCKEREI', 'APOTHEKE', 'FRISEUR', 'IMBISS', 'SPÄTI', 'BLUMEN', 'OPTIKER', 'CAFÉ', 'KIOSK', 'DÖNER', 'PIZZERIA', 'BUCHLADEN', 'SCHUHE', 'MODE', 'WEINHANDEL', 'FAHRRÄDER', 'METZGEREI', 'SPIELWAREN', 'ELEKTRO', 'REISEBÜRO', 'BANK', 'TABAK', 'GEMÜSE', 'WÄSCHEREI', 'SCHREIBWAREN', 'KONDITOREI', 'ASIA MARKT', 'BIOLADEN', 'JUWELIER', 'FOTO', 'GETRÄNKE', 'BURGER', 'BOUTIQUE', 'GALERIE', 'FEINKOST', 'ANTIQUITÄTEN'],
  en: ['BAKERY', 'PHARMACY', 'BARBER', 'DELI', 'COFFEE', 'DINER', 'PIZZA', 'BOOKS', 'SHOES', 'FASHION', 'LIQUOR', 'BIKES', 'BUTCHER', 'TOYS', 'ELECTRONICS', 'TRAVEL', 'BANK', 'LAUNDRY', 'GROCERY', 'TATTOO', 'NAILS', 'FLOWERS', 'NOODLES', 'BURGERS', 'THRIFT', 'JEWELRY', 'OPTICIAN', 'TACOS', 'BAGELS', 'MARKET', 'SUSHI', 'PAWN SHOP'],
  fr: ['BOULANGERIE', 'PHARMACIE', 'COIFFEUR', 'TABAC', 'CAFÉ', 'BISTROT', 'PÂTISSERIE', 'LIBRAIRIE', 'FLEURISTE', 'BOUCHERIE', 'ÉPICERIE', 'FROMAGERIE', 'CHAUSSURES', 'MODE', 'BRASSERIE', 'OPTIQUE', 'BANQUE', 'LAVERIE', 'CRÊPERIE', 'BIJOUTERIE', 'CAVE À VINS', 'PRESSE', 'KEBAB', 'PIZZA', 'VÉLOS', 'JOUETS', 'RESTAURANT', 'PRIMEUR', 'SALON', 'BOUTIQUE', 'MARCHÉ', 'THÉ'],
  es: ['PANADERÍA', 'FARMACIA', 'PELUQUERÍA', 'BAR', 'CAFETERÍA', 'TIENDA', 'ZAPATERÍA', 'LIBRERÍA', 'FLORES', 'CARNICERÍA', 'FRUTERÍA', 'TAQUERÍA', 'RESTAURANTE', 'MODA', 'ÓPTICA', 'BANCO', 'LAVANDERÍA', 'JOYERÍA', 'ESTANCO', 'PIZZERÍA', 'HELADOS', 'MERCADO', 'BICICLETAS', 'JUGUETES', 'CERVECERÍA', 'PASTELERÍA', 'FERRETERÍA', 'PAPELERÍA', 'TAPAS', 'VINOS', 'ELECTRÓNICA', 'VIAJES'],
  pt: ['PADARIA', 'FARMÁCIA', 'BARBEARIA', 'BAR', 'LANCHONETE', 'MERCADO', 'SAPATARIA', 'LIVRARIA', 'FLORES', 'AÇOUGUE', 'SORVETES', 'RESTAURANTE', 'MODA', 'ÓTICA', 'BANCO', 'LAVANDERIA', 'JOALHERIA', 'PIZZARIA', 'CAFÉ', 'BICICLETAS', 'BRINQUEDOS', 'CONFEITARIA', 'FERRAGENS', 'PAPELARIA', 'VINHOS', 'SALÃO', 'PASTELARIA', 'TABACARIA', 'FRUTAS', 'CHURRASCO', 'VIAGENS', 'ELETRÔNICOS'],
  it: ['PANIFICIO', 'FARMACIA', 'BARBIERE', 'BAR', 'GELATERIA', 'PIZZERIA', 'TABACCHI', 'TRATTORIA', 'LIBRERIA', 'FIORI', 'MACELLERIA', 'ALIMENTARI', 'SCARPE', 'MODA', 'OTTICA', 'BANCA', 'LAVANDERIA', 'GIOIELLERIA', 'PASTICCERIA', 'ENOTECA', 'BICICLETTE', 'GIOCATTOLI', 'RISTORANTE', 'CAFFÈ', 'OSTERIA', 'FERRAMENTA', 'CARTOLERIA', 'SALUMERIA', 'FRUTTA', 'EDICOLA', 'ELETTRONICA', 'VIAGGI'],
  nl: ['BAKKERIJ', 'APOTHEEK', 'KAPPER', 'SNACKBAR', 'KOFFIE', 'BLOEMEN', 'OPTICIEN', 'CAFÉ', 'KIOSK', 'PIZZERIA', 'BOEKHANDEL', 'SCHOENEN', 'MODE', 'SLIJTERIJ', 'FIETSEN', 'SLAGERIJ', 'SPEELGOED', 'REISBUREAU', 'BANK', 'WASSERETTE', 'KAASWINKEL', 'GROENTE', 'JUWELIER', 'TOKO', 'BRASSERIE', 'PATATZAAK', 'DROGIST', 'MARKT', 'HARING', 'SUSHI', 'WIJN', 'ELEKTRO'],
  tr: ['FIRIN', 'ECZANE', 'BERBER', 'KEBAP', 'KAHVE', 'ÇİÇEKÇİ', 'OPTİK', 'BAKKAL', 'LOKANTA', 'KİTAPÇI', 'AYAKKABI', 'GİYİM', 'KASAP', 'OYUNCAK', 'ELEKTRONİK', 'BANKA', 'KUYUMCU', 'PASTANE', 'BÖREK', 'MANAV', 'TEKEL', 'ÇAY EVİ', 'DÖNER', 'PİDE', 'MARKET', 'SEYAHAT', 'TERZİ', 'BİSİKLET', 'KIRTASİYE', 'SÜTLÜ TATLI', 'MEYHANE', 'BALIK'],
  ru: ['АПТЕКА', 'ПЕКАРНЯ', 'КАФЕ', 'ПАРИКМАХЕРСКАЯ', 'ПРОДУКТЫ', 'ЦВЕТЫ', 'ОПТИКА', 'КНИГИ', 'ОБУВЬ', 'ОДЕЖДА', 'БАНК', 'МЯСО', 'ИГРУШКИ', 'ЭЛЕКТРОНИКА', 'РЕСТОРАН', 'СТОЛОВАЯ', 'ПИЦЦА', 'ЧАЙ', 'РЫНОК', 'ЮВЕЛИР', 'ХИМЧИСТКА', 'ТАБАК', 'ВИНО', 'БУЛОЧНАЯ', 'КОНДИТЕРСКАЯ', 'ОВОЩИ', 'ШАУРМА', 'БАР', 'ПИВО', 'ТУРЫ', 'РЕМОНТ', 'МАГАЗИН'],
  pl: ['PIEKARNIA', 'APTEKA', 'FRYZJER', 'KAWIARNIA', 'KWIATY', 'OPTYK', 'KSIĘGARNIA', 'BUTY', 'MODA', 'MIĘSNY', 'ZABAWKI', 'ELEKTRONIKA', 'BANK', 'PRALNIA', 'WARZYWA', 'JUBILER', 'CUKIERNIA', 'PIZZERIA', 'KEBAB', 'SKLEP', 'ROWERY', 'RESTAURACJA', 'BAR', 'PIWO', 'WINO', 'TYTOŃ', 'PAPIERNICZY', 'BISTRO', 'PIEROGI', 'TARG', 'BIURO PODRÓŻY', 'KIOSK'],
  ar: ['صيدلية', 'مخبز', 'مقهى', 'حلاق', 'مطعم', 'سوبر ماركت', 'زهور', 'نظارات', 'مكتبة', 'أحذية', 'أزياء', 'جزار', 'ألعاب', 'إلكترونيات', 'بنك', 'مغسلة', 'مجوهرات', 'حلويات', 'بيتزا', 'شاورما', 'خضار', 'سوق', 'شاي', 'عطور', 'خياط', 'فلافل', 'بقالة', 'دراجات', 'سفريات', 'قرطاسية', 'تصوير', 'توابل'],
  ja: ['カフェ', '薬局', 'ラーメン', '寿司', '居酒屋', 'コンビニ', '花屋', '眼鏡', '本屋', '靴', '洋服', '肉屋', 'おもちゃ', '電器店', '銀行', 'クリーニング', '宝石', 'ケーキ', 'うどん', '焼肉', '八百屋', '市場', 'お茶', '美容室', '自転車', '文具', 'カレー', 'パン屋', 'そば', 'カラオケ', '旅行', '魚屋'],
  zh: ['餐厅', '药店', '茶馆', '超市', '书店', '花店', '眼镜', '鞋店', '服装', '肉店', '玩具', '电器', '银行', '洗衣', '珠宝', '蛋糕', '面馆', '火锅', '水果', '市场', '咖啡', '理发', '自行车', '文具', '饺子', '面包', '小吃', '烧烤', '旅行社', '酒家', '海鲜', '便利店'],
  ko: ['카페', '약국', '치킨', '식당', '편의점', '꽃집', '안경', '서점', '신발', '옷가게', '정육점', '장난감', '전자', '은행', '세탁소', '보석', '빵집', '국수', '과일', '시장', '미용실', '자전거', '문구', '김밥', '고기', '호프', '노래방', '여행사', '분식', '떡집', '해물', '슈퍼'],
  hi: ['दवाखाना', 'चाय', 'मिठाई', 'भोजनालय', 'किराना', 'फूल', 'चश्मा', 'किताबें', 'जूते', 'कपड़े', 'खिलौने', 'बैंक', 'गहने', 'सब्ज़ी', 'बाज़ार', 'नाई', 'साइकिल', 'दर्जी', 'मसाले', 'फल', 'समोसा', 'बेकरी', 'स्टेशनरी', 'इलेक्ट्रॉनिक्स', 'यात्रा', 'पान', 'लस्सी', 'ढाबा', 'कैफे', 'मोबाइल', 'फोटो', 'डेयरी'],
  th: ['ร้านกาแฟ', 'ร้านยา', 'ร้านอาหาร', 'ตลาด', 'ดอกไม้', 'แว่นตา', 'หนังสือ', 'รองเท้า', 'เสื้อผ้า', 'ของเล่น', 'ธนาคาร', 'ซักรีด', 'ทอง', 'เบเกอรี่', 'ผลไม้', 'ตัดผม', 'จักรยาน', 'ก๋วยเตี๋ยว', 'ข้าวมัน', 'นวด', 'ชา', 'มือถือ', 'เครื่องเขียน', 'ปิ้งย่าง', 'อาหารทะเล', 'ไอศกรีม', 'ส้มตำ', 'ท่องเที่ยว', 'ขนมปัง', 'ร้านค้า', 'บาร์', 'ผัดไทย'],
};
const GRUND = [['#1f4a3a', '#f3e9cf'], ['#7a1f24', '#f7efe0'], ['#1d3557', '#f1faee'], ['#f2c14e', '#23201a'], ['#efe9dc', '#2b2a27'], ['#101214', '#f4d58d'], ['#3a2a20', '#f0dcb0'], ['#e8604c', '#fff7ea'], ['#2a9d8f', '#ffffff'], ['#f7f7f2', '#c1272d'], ['#5a2a82', '#fff2d8'], ['#0f6db5', '#ffffff'], ['#d9d4c7', '#1b4d3e'], ['#26262b', '#ffffff'], ['#b5651d', '#fff4e0'], ['#008a5e', '#fffbe6']];
const SP = 8, ZE = 16;   // 8 Spalten, 16 Reihen, je 256 mal 64
let _tex = null, _spr = null;
export const atlasMat = { tex: null };
export const spracheVon = iso => SPRACHE[iso] || 'en';
export function schilderSprache(iso) { const s = SPRACHE[iso] || 'en'; zeichne(s); return s; }
function zeichne(spr) {
  if (typeof document === 'undefined' || _spr === spr) return; _spr = spr;
  const W = 2048, H = 1024, c = _tex?.image || document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const woerter = WOERTER[spr]; let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const serif = ['Georgia, "Times New Roman", serif', '"Helvetica Neue", Arial, sans-serif', 'Avenir, "Trebuchet MS", sans-serif', 'Impact, "Arial Black", sans-serif', '"Palatino", serif'];
  for (let i = 0; i < SP * ZE; i++) {
    const x = (i % SP) * 256, y = Math.floor(i / SP) * 64, wort = woerter[i % woerter.length], [bg, fg] = GRUND[Math.floor(r() * GRUND.length)];
    g.fillStyle = bg; g.fillRect(x, y, 256, 64);
    if (r() < 0.4) { g.strokeStyle = fg; g.lineWidth = 2; g.strokeRect(x + 5, y + 5, 246, 54); }
    if (r() < 0.2) { g.fillStyle = fg; g.globalAlpha = 0.14; for (let k = 0; k < 16; k += 2) g.fillRect(x + k * 16, y, 16, 64); g.globalAlpha = 1; }
    const schrift = serif[Math.floor(r() * serif.length)], kursiv = r() < 0.15 ? 'italic ' : '', fett = r() < 0.7 ? 'bold ' : '';
    let px = 42; g.font = `${kursiv}${fett}${px}px ${schrift}`; const b = g.measureText(wort).width; if (b > 226) { px = Math.floor(px * 226 / b); g.font = `${kursiv}${fett}${px}px ${schrift}`; }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(wort, x + 128, y + 33);
  }
  if (_tex) _tex.needsUpdate = true;
  else { _tex = new THREE.CanvasTexture(c); _tex.colorSpace = THREE.SRGBColorSpace; _tex.anisotropy = 4; _tex.generateMipmaps = true; _tex.minFilter = THREE.LinearMipmapLinearFilter; atlasMat.tex = _tex; }
}
export function atlasTextur() { if (!_tex) zeichne(_spr || 'en'); return _tex; }
// Schild als Fläche auf einer Fassade (f: Fassade): u0..u1, v0..v1, Abstand w. Zelle aus dem festen Zufall R
// Läden je Kiez in Berlin (Wunsch Nr. 87): drei von vier Schildern aus der Liste des Ortsteils (kit/kieze.js), sonst frei aus dem Atlas.
// Kreuzberg, Neukölln und Wedding Späti, Imbiss und Döner, Charlottenburg und Schöneberg Mode, Juwelier und Boutiquen, Villenviertel Bäcker und Apotheke
const KIEZ_LAEDEN = {
  kreuzberg: ['SPÄTI', 'IMBISS', 'DÖNER', 'KIOSK', 'GEMÜSE', 'FRISEUR', 'ASIA MARKT', 'GETRÄNKE', 'BURGER', 'CAFÉ', 'PIZZERIA', 'TABAK', 'WÄSCHEREI', 'FAHRRÄDER'],
  wedding: ['SPÄTI', 'IMBISS', 'DÖNER', 'KIOSK', 'GEMÜSE', 'FRISEUR', 'GETRÄNKE', 'TABAK', 'WÄSCHEREI', 'ASIA MARKT', 'PIZZERIA', 'BÄCKEREI'],
  friedrichshain: ['SPÄTI', 'CAFÉ', 'BURGER', 'IMBISS', 'FAHRRÄDER', 'GETRÄNKE', 'BIOLADEN', 'DÖNER', 'PIZZERIA', 'BUCHLADEN', 'FRISEUR', 'KIOSK', 'GALERIE'],
  prenzlberg: ['CAFÉ', 'BIOLADEN', 'BUCHLADEN', 'SPIELWAREN', 'FAHRRÄDER', 'WEINHANDEL', 'MODE', 'FRISEUR', 'KONDITOREI', 'BLUMEN', 'SPÄTI', 'BÄCKEREI', 'BOUTIQUE', 'FEINKOST'],
  mitte: ['CAFÉ', 'MODE', 'SCHUHE', 'BOUTIQUE', 'GALERIE', 'BUCHLADEN', 'OPTIKER', 'WEINHANDEL', 'JUWELIER', 'BURGER', 'SPÄTI', 'FOTO', 'REISEBÜRO', 'BANK'],
  edel: ['MODE', 'BOUTIQUE', 'SCHUHE', 'JUWELIER', 'WEINHANDEL', 'FEINKOST', 'GALERIE', 'ANTIQUITÄTEN', 'OPTIKER', 'BUCHLADEN', 'CAFÉ', 'KONDITOREI', 'BLUMEN', 'APOTHEKE'],
  villen: ['BÄCKEREI', 'APOTHEKE', 'BLUMEN', 'METZGEREI', 'OPTIKER', 'CAFÉ', 'SCHREIBWAREN', 'WEINHANDEL', 'BIOLADEN', 'BANK', 'KONDITOREI', 'BUCHLADEN', 'FEINKOST'],
  vorstadt: ['BÄCKEREI', 'APOTHEKE', 'BLUMEN', 'METZGEREI', 'FRISEUR', 'OPTIKER', 'SCHREIBWAREN', 'BANK', 'REISEBÜRO', 'GETRÄNKE', 'KIOSK', 'IMBISS'],
  ostplatte: ['KIOSK', 'BÄCKEREI', 'APOTHEKE', 'FRISEUR', 'ASIA MARKT', 'GETRÄNKE', 'TABAK', 'BANK', 'IMBISS', 'BLUMEN', 'GEMÜSE', 'DÖNER'],
  westsiedlung: ['KIOSK', 'BÄCKEREI', 'APOTHEKE', 'FRISEUR', 'IMBISS', 'DÖNER', 'GETRÄNKE', 'TABAK', 'BANK', 'GEMÜSE', 'BLUMEN', 'SPÄTI'],
};
// Zelle eines Schilds: ein Zufallswert (feste Zahl an Aufrufen), im Kiez mit 75 % aus der Liste, die Gestaltung (eine von bis zu vier Zellen je Wort) aus dem Rest
function schildZelle(r, kiez) {
  const L = kiez && _spr === 'de' ? KIEZ_LAEDEN[kiez] : null; if (!L || r >= 0.75) return Math.floor((L ? (r - 0.75) / 0.25 : r) * SP * ZE) % (SP * ZE);
  const W = WOERTER.de, q = r / 0.75 * L.length, wi = W.indexOf(L[Math.floor(q)]); if (wi < 0) return Math.floor(r * SP * ZE);
  const n = Math.ceil((SP * ZE - wi) / W.length); return wi + W.length * Math.min(n - 1, Math.floor((q % 1) * n));
}
export function ladenSchild(f, u0, u1, v0, v1, w, R) {
  if (f.bau.leer) return;
  const p = f.bau.part('ladenschild'), z = schildZelle(R(), f.bau.kiez), cu = (z % SP) / SP, cv = 1 - (Math.floor(z / SP) + 1) / ZE, du = 1 / SP, dv = 1 / ZE, e = 0.002;
  const a = f.P(u0, v0, w), b = f.P(u1, v0, w), c = f.P(u1, v1, w), d = f.P(u0, v1, w), n = f.n;
  // Blick von außen: u läuft nach rechts (siehe Fassade), Textur also so herum
  const ua = cu + e, ub = cu + du - e, va = cv + e, vb = cv + dv - e;
  for (const [q, s, t] of [[a, ua, va], [b, ub, va], [c, ub, vb], [a, ua, va], [c, ub, vb], [d, ua, vb]]) { p.pos.push(q.x, q.y, q.z); p.nor.push(n.x, n.y, n.z); p.uv.push(s, t); }
}
