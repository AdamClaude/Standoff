import { useState } from 'react';
import type { ClientView, Phase } from '@standoff/engine';
import { useApp } from '../net';
import { getLang } from '../i18n';

// Tutorial coaching: one tip per phase, shown the first time you reach it.
const TIPS_EN: Partial<Record<Phase, string>> = {
  LOOT_REVEAL: 'This is the haul for this heist. Tap any item to look closer. Paintings get much more valuable in sets.',
  LOAD: 'Pick a bullet and tap the rival you want to aim at, before the count ends. BANG wounds, CLICK does nothing. Nobody sees your choice until the count ends, then every gun is shown at once. You only get 3 BANGs all game.',
  BOSS_PRIVILEGE: 'The Boss can force one gangster to aim somewhere else. Usually used on whoever is aiming at the Boss. The Boss can also switch his own aim.',
  COURAGE: 'Hold your ground to share the loot, or hit the floor to stay safe and get nothing. Look at how many guns are on you, and how many BANGs each shooter has already fired.',
  SHOWDOWN: 'Guns go off. Anyone hit by a BANG takes one wound (never more per heist) and sits out the split. Three wounds and you are out.',
  SPLIT: 'Everyone standing takes turns picking one item, starting with the Boss. Grab the Boss cigar to be Boss next heist.',
};
const TIPS_AR: Partial<Record<Phase, string>> = {
  LOOT_REVEAL: 'هذه غنيمة الجولة. اضغط على أي غنيمة لتراها. اللوحات تصبح أثمن بكثير كمجموعة.',
  LOAD: 'اختر رصاصة واضغط على المنافس الذي تريد التصويب عليه قبل نهاية العدّ. الطلقة تجرح والفارغة لا تفعل شيئًا. لا أحد يرى اختيارك حتى ينتهي العدّ، ثم تظهر كل المسدسات معًا. لديك 3 طلقات فقط طوال اللعبة.',
  BOSS_PRIVILEGE: 'الزعيم يستطيع أن يجبر واحدًا على تغيير هدفه. غالبًا على من يصوّب على الزعيم. ويمكنه أيضًا تغيير تصويبه هو.',
  COURAGE: 'اصمد لتأخذ نصيبًا، أو انحنِ لتبقى سالمًا بلا شيء. انظر كم مسدسًا عليك وكم أطلق كل واحد منهم.',
  SHOWDOWN: 'تنطلق المسدسات. من تصيبه طلقة يُجرح ويخرج من القسمة. ثلاثة جروح وتخرج من اللعبة.',
  SPLIT: 'يأخذ الواقفون غنيمة بالدور بدءًا من الزعيم. سيجار الزعيم يجعلك الزعيم في الجولة القادمة.',
};

export function Coach({ v }: { v: ClientView }) {
  const tutorial = useApp(s => s.tutorial);
  const [seen, setSeen] = useState<Set<Phase>>(new Set());
  const tips = getLang() === 'ar' ? TIPS_AR : TIPS_EN;
  const tip = tips[v.phase];
  if (!tutorial || !tip || seen.has(v.phase) || v.round > 2) return null;
  return (
    <div className="coach" role="note">
      <p>{tip}</p>
      <button className="btn-link" onClick={() => setSeen(new Set([...seen, v.phase]))}>OK</button>
    </div>
  );
}
