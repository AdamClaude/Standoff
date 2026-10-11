import type { ClientView } from '@standoff/engine';
import { PAINTING_VALUES, POWER_TEXT } from '@standoff/engine';
import { getLang, powerName, t } from '../i18n';

const PHASES_EN = [
  ['The loot', 'The loot spills out of the heist bag one piece at a time, and the Boss cigar lands in the middle. Whoever grabs the cigar in the split is Boss next heist.'],
  ['Load and aim', 'One secret countdown: each gangster picks a bullet (BANG or CLICK) and a rival to aim at. You get 3 BANGs and 5 CLICKs for the whole game, one per heist. When the count ends every aim is revealed at once; bullets stay hidden until the showdown. No target by then means your gun stays down.'],
  ['Boss’s call', 'The Boss may order one gangster to aim at someone else — or switch his own aim.'],
  ['Hold or hit the floor', 'Second countdown. Hitting the floor keeps you safe but out of the split. Hesitate and you stay standing.'],
  ['Showdown', 'Shooters still standing fire at targets still standing. A BANG wounds — but nobody takes more than one wound per heist, however many guns hit them. Three wounds and you’re out.'],
  ['The split', 'From the Boss, going clockwise, everyone still standing and unhurt grabs one item at a time until the crate is empty.'],
];
const PHASES_AR = [
  ['الغنيمة', 'تخرج الغنائم من كيس السرقة واحدة تلو الأخرى، ويهبط سيجار الزعيم في الوسط. من يأخذ السيجار في القسمة يصبح الزعيم في العملية القادمة.'],
  ['لقّم وصوّب', 'عدّ تنازلي سرّي: كل واحد يختار رصاصة (طلقة أو فارغة) ومنافسًا يصوّب عليه. لديك 3 طلقات و5 فارغات للعبة كلها. عند نهاية العدّ تظهر كل التصويبات معًا، وتبقى الرصاصات مخفية حتى المواجهة. من لم يختر هدفًا يبقى مسدسه منخفضًا.'],
  ['كلمة الزعيم', 'يمكن للزعيم أن يأمر واحدًا بالتصويب على غيره — أو يغيّر تصويبه هو.'],
  ['اصمد أو انحنِ', 'عدّ تنازلي ثانٍ. الانحناء يحميك لكنه يخرجك من القسمة. إن ترددت تبقى واقفًا.'],
  ['المواجهة', 'يكشف الواقفون الذين أهدافهم واقفة. الطلقة تجرح، لكن لا أحد يأخذ أكثر من جرح واحد في العملية مهما أصابته المسدسات. ثلاثة جروح وتخرج.'],
  ['القسمة', 'من الزعيم مع عقارب الساعة، يأخذ كل واقف سليم غنيمة واحدة بالدور حتى يفرغ الصندوق.'],
];

export function Rules({ v, onClose }: { v: ClientView; onClose: () => void }) {
  const phases = getLang() === 'ar' ? PHASES_AR : PHASES_EN;
  const powers = v.players.filter(p => p.power).map(p => p.power!);
  return (
    <aside className="sheet rules" role="dialog" aria-label={t('rules')}>
      <div className="sheet-body">
        <header className="sheet-head">
          <h2>{t('rules')}</h2>
          <button className="btn-link" onClick={onClose}>{t('close')}</button>
        </header>
        <ol className="rules-phases">
          {phases.map(([h, d]) => <li key={h}><b>{h}</b> {d}</li>)}
        </ol>
        <h3>{t('paintings')}</h3>
        <table className="paint-table">
          <tbody>
            <tr>{PAINTING_VALUES.slice(1).map((_, i) => <th key={i}>{i + 1}</th>)}</tr>
            <tr>{PAINTING_VALUES.slice(1).map((val, i) => <td key={i}>{val / 1000}k</td>)}</tr>
          </tbody>
        </table>
        <p className="small">
          {getLang() === 'ar'
            ? 'النقود: 15×5k، 15×10k، 10×20k. ألماس: 5×1k، 3×5k، 1×10k؛ صاحب أكثر عدد من الألماس يربح 60k (التعادل = لا أحد). 3 مخازن، 2 إسعاف. فقط الأحياء يُحسبون. التعادل يُكسر بأكثر الجروح.'
            : 'Cash: 15×5k, 15×10k, 10×20k. Diamonds: 5×1k, 3×5k, 1×10k; most diamonds (by count) earns a 60k bonus (tie = nobody). 3 clips, 2 first-aid kits. Only the living score. Ties go to whoever took more wounds. House rules: if the Boss dies the cigar passes clockwise; if nobody makes the split, that heist’s loot is lost.'}
        </p>
        {powers.length > 0 && (
          <>
            <h3>{t('powers')}</h3>
            <dl className="powers-list">
              {powers.map(p => <div key={p}><dt>{powerName(p)}</dt><dd>{POWER_TEXT[p]}</dd></div>)}
            </dl>
          </>
        )}
      </div>
    </aside>
  );
}
