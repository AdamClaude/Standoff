// Original mobster archetypes. Visuals are drawn client-side (SVG busts and 3D models) from these specs.

export type Extra =
  | 'moustache' | 'cigar' | 'monocle' | 'scar' | 'goldtooth' | 'earring' | 'pearls' | 'bowtie'
  | 'shades' | 'stubble' | 'carnation' | 'toothpick' | 'chain' | 'eyepatch' | 'goatee' | 'lipstick' | 'ring';

export interface Character {
  id: string;
  name: string;
  nameAr: string;
  tagline: string;
  color: string;        // suit colour
  pinstripe: boolean;
  shirt: string;
  tie: string;
  hat: 'fedora' | 'bowler' | 'cap' | 'beret' | 'none' | 'top' | 'bandana' | 'shades';
  hatColor: string;
  band: string;         // hat band
  hair: string;
  hairStyle: 'slick' | 'bob' | 'bald' | 'curly';
  skin: string;
  build: number;        // 0.9 skinny … 1.35 heavy
  extra: Extra;         // the signature detail (also used by the 2D portrait)
  extras: Extra[];      // everything worn in 3D
}

export const CHARACTERS: Character[] = [
  { id: 'rico', name: 'Rico "Razor" Russo', nameAr: 'ريكو "الموس" روسو', tagline: 'Shaves with the same blade he settles debts with.',
    color: '#1d1b22', pinstripe: true, shirt: '#e9e2d0', tie: '#8f1d16', hat: 'fedora', hatColor: '#141217', band: '#8f1d16',
    hair: '#16110e', hairStyle: 'slick', skin: '#c9906a', build: 1.05, extra: 'scar', extras: ['scar', 'stubble', 'carnation', 'ring'] },
  { id: 'dolores', name: 'Donna Dolores', nameAr: 'دونا دولوريس', tagline: 'Runs the family. Counts the money twice.',
    color: '#5a1222', pinstripe: false, shirt: '#1a1418', tie: '#e2b23a', hat: 'none', hatColor: '#000', band: '#000',
    hair: '#1b1210', hairStyle: 'bob', skin: '#e4b08b', build: 0.95, extra: 'pearls', extras: ['pearls', 'earring', 'lipstick', 'ring'] },
  { id: 'sal', name: 'Sal "The Butcher" Benedetto', nameAr: 'سال "الجزار" بينيديتو', tagline: 'Owns a deli. Nobody buys the sausage.',
    color: '#e6dcc4', pinstripe: false, shirt: '#1d1b22', tie: '#e6dcc4', hat: 'fedora', hatColor: '#ece4d0', band: '#1d1b22',
    hair: '#2a2420', hairStyle: 'bald', skin: '#e0a882', build: 1.35, extra: 'moustache', extras: ['moustache', 'goldtooth', 'chain', 'ring'] },
  { id: 'mags', name: 'Nicky "Two-Times" Moretti', nameAr: 'نيكي "مرّتين" موريتي', tagline: 'Says everything twice. Shoots once.',
    color: '#1c2638', pinstripe: true, shirt: '#d9d4c8', tie: '#1d1b22', hat: 'fedora', hatColor: '#4a4d55', band: '#111',
    hair: '#1a1410', hairStyle: 'slick', skin: '#d6a07a', build: 0.95, extra: 'shades', extras: ['shades', 'toothpick', 'stubble'] },
  { id: 'knuckles', name: 'Knuckles Calabrese', nameAr: 'نكلز كالابريزي', tagline: 'Thinks with his hands. Thinks a lot.',
    color: '#3b2b20', pinstripe: false, shirt: '#16131a', tie: '#16131a', hat: 'cap', hatColor: '#4a3a2c', band: '#4a3a2c',
    hair: '#141010', hairStyle: 'curly', skin: '#a8714c', build: 1.3, extra: 'scar', extras: ['scar', 'stubble', 'chain'] },
  { id: 'prof', name: 'Lou "The Ledger" Caruso', nameAr: 'لو "الدفتر" كاروسو', tagline: 'Keeps the books. Cooks them too.',
    color: '#45474e', pinstripe: true, shirt: '#ece6d6', tie: '#2a4b7a', hat: 'bowler', hatColor: '#1a1a1e', band: '#1a1a1e',
    hair: '#5a5650', hairStyle: 'slick', skin: '#ecc7a4', build: 0.9, extra: 'monocle', extras: ['monocle', 'bowtie', 'moustache'] },
  { id: 'smoky', name: 'Carmine "Smoky" Bianchi', nameAr: 'كارمين "الدخان" بيانكي', tagline: 'Chews toothpicks till he earns the Boss cigar.',
    color: '#2e241e', pinstripe: true, shirt: '#e2d9c4', tie: '#6b4a1a', hat: 'fedora', hatColor: '#5a4030', band: '#1a1410',
    hair: '#241a14', hairStyle: 'slick', skin: '#b98260', build: 1.2, extra: 'moustache', extras: ['toothpick', 'moustache', 'stubble', 'ring'] },
  { id: 'dapper', name: 'Johnny Cufflinks', nameAr: 'جوني الأزرار', tagline: 'Best dressed man at every funeral.',
    color: '#101418', pinstripe: false, shirt: '#e8e4dc', tie: '#b8862a', hat: 'shades', hatColor: '#000', band: '#000',
    hair: '#0e0b0a', hairStyle: 'slick', skin: '#c48a62', build: 1.0, extra: 'bowtie', extras: ['shades', 'chain', 'carnation', 'ring'] },
  { id: 'bandit', name: 'Rosa "Bella" Ferrante', nameAr: 'روزا "بيلا" فيرانتي', tagline: 'Smiles sweetly. Aims for the knees.',
    color: '#7a1a1a', pinstripe: true, shirt: '#16131a', tie: '#16131a', hat: 'beret', hatColor: '#16131a', band: '#16131a',
    hair: '#3a1a10', hairStyle: 'bob', skin: '#ddab86', build: 0.9, extra: 'earring', extras: ['earring', 'lipstick'] },
  { id: 'vinnie', name: 'Vinnie Nine-Lives', nameAr: 'فيني ذو الأرواح التسع', tagline: 'Been shot eight times. Feeling lucky.',
    color: '#3a3d40', pinstripe: false, shirt: '#cfc8b8', tie: '#4a1a1a', hat: 'fedora', hatColor: '#2a2c30', band: '#6b1a1a',
    hair: '#2a2420', hairStyle: 'curly', skin: '#d9a47c', build: 1.1, extra: 'scar', extras: ['eyepatch', 'goatee', 'stubble', 'scar'] },
];

export const BOT_NAMES = ['Fat Tony', 'Bones', 'Lefty', 'The Duke', 'Nails', 'Velvet', 'Ace', 'Fingers', 'Mouse', 'Pearl'];

export function characterById(id: string): Character {
  return CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];
}
