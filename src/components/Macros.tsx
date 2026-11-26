import { Nutrients, NutrientKey } from '../foods';
import { useStore } from '../store';
import { carbsShown } from '../targets';
import { MacroText } from '../ui';

/** The P / C / F line of a food. Carbs leave fiber out when you've chosen net carbs. */
export function Macros({ n, size, unknown }: { n: Pick<Nutrients, 'p' | 'c' | 'f' | 'fib'>; size?: number; unknown?: NutrientKey[] }) {
  const { profile } = useStore();
  return <MacroText p={n.p} c={carbsShown(n, profile.netCarbs)} f={n.f} size={size} unknown={unknown} />;
}
