// Original gangster archetypes. Visuals are drawn client-side as SVG from these specs.

export interface Character {
  id: string;
  name: string;
  nameAr: string;
  tagline: string;
  color: string;      // suit / accent colour
  hat: 'fedora' | 'bowler' | 'cap' | 'beret' | 'none' | 'top' | 'bandana' | 'shades';
  skin: string;
  extra: 'moustache' | 'scar' | 'pearls' | 'cigar' | 'bowtie' | 'goldtooth' | 'monocle' | 'earring';
}

export const CHARACTERS: Character[] = [
  { id: 'rico', name: 'Rico "Two-Tone"', nameAr: 'ريكو', tagline: 'Never wears one colour twice.', color: '#c0392b', hat: 'fedora', skin: '#d9a77c', extra: 'moustache' },
  { id: 'dolores', name: 'Big Dolores', nameAr: 'دولوريس الكبيرة', tagline: 'Counts the money twice.', color: '#8e44ad', hat: 'none', skin: '#b07a52', extra: 'pearls' },
  { id: 'sal', name: 'Slick Sal', nameAr: 'سال الزلق', tagline: 'Smiles with his teeth.', color: '#2c3e50', hat: 'bowler', skin: '#f0c8a0', extra: 'goldtooth' },
  { id: 'mags', name: 'Mags Moretti', nameAr: 'ماغز موريتي', tagline: 'Talks soft. Shoots first.', color: '#16a085', hat: 'beret', skin: '#e8b48f', extra: 'earring' },
  { id: 'knuckles', name: 'Knuckles', nameAr: 'نكلز', tagline: 'Thinks with his hands.', color: '#d35400', hat: 'cap', skin: '#8d5a3b', extra: 'scar' },
  { id: 'prof', name: 'The Professor', nameAr: 'البروفيسور', tagline: 'Has a plan. Has three.', color: '#7f8c8d', hat: 'top', skin: '#f3d2b3', extra: 'monocle' },
  { id: 'smoky', name: 'Smoky Jo', nameAr: 'سموكي جو', tagline: 'Never seen without a cigar.', color: '#27ae60', hat: 'fedora', skin: '#6b4430', extra: 'cigar' },
  { id: 'dapper', name: 'Dapper Dan', nameAr: 'دان الأنيق', tagline: 'Bow tie, bad intentions.', color: '#2980b9', hat: 'shades', skin: '#c68e63', extra: 'bowtie' },
  { id: 'bandit', name: 'Lola Bandida', nameAr: 'لولا باندِيدا', tagline: 'Was here first.', color: '#e84393', hat: 'bandana', skin: '#dba57a', extra: 'earring' },
  { id: 'vinnie', name: 'Vinnie Nine-Lives', nameAr: 'فيني ذو الأرواح التسع', tagline: 'Been shot. Didn\'t take.', color: '#b8860b', hat: 'bowler', skin: '#e1b38a', extra: 'scar' },
];

export const BOT_NAMES = ['Tiny', 'Bones', 'Lefty', 'Duke', 'Nails', 'Velvet', 'Ace', 'Fingers', 'Mouse', 'Pearl'];

export function characterById(id: string): Character {
  return CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];
}
