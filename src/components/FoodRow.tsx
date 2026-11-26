import Ionicons from '@expo/vector-icons/Ionicons';
import { Macros } from './Macros';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { rowBadge } from '../foodIndex/labels';
import { Food, scale } from '../foods';
import { canQuickAdd, QuickAmount } from '../quickAdd';
import { highlight } from '../search';
import { useTheme } from '../theme';
import { num, Txt, useGradId } from '../ui';
import { r0 } from '../util';
import { Burst, Pressy } from './motion';

export function Badge({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'accent' | 'warn' }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: tone === 'accent' ? t.accentSoft : tone === 'warn' ? t.warnSoft : t.surface2, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 }}>
      <Txt weight="bodyHeavy" size={9.5} color={tone === 'accent' ? t.accent : tone === 'warn' ? t.warn : t.muted} style={{ letterSpacing: 0.8 }}>
        {label}
      </Txt>
    </View>
  );
}

/** The round + that logs a food in one tap, with its burst. */
function AddButton({ food, amount, onAdd }: { food: Food; amount: QuickAmount; onAdd: () => void }) {
  const t = useTheme();
  const gid = useGradId();
  const [added, setAdded] = useState(0);
  return (
    <View style={{ width: 44, height: 44, overflow: 'visible' }}>
      <Pressy
        onPress={() => {
          setAdded((n) => n + 1);
          onAdd();
        }}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Add ${food.name}, ${r0(amount.kcal)} calories`}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Svg width={44} height={44} style={{ position: 'absolute' }}>
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={t.grad1} />
              <Stop offset="1" stopColor={t.grad2} />
            </LinearGradient>
          </Defs>
          <Circle cx={22} cy={22} r={22} fill={`url(#${gid})`} />
        </Svg>
        <Ionicons name="add" size={24} color={t.onGrad} />
      </Pressy>
      <Burst trigger={added} label={`+${r0(amount.kcal)} kcal`} />
    </View>
  );
}

/**
 * One food in a list: name, brand, amount, calories and macros. With `quick`, the numbers are for the
 * amount that the + button will log.
 */
export function FoodRow({ food, matched, onPress, starred, quick, onQuickAdd }: {
  food: Food;
  matched?: Set<string>;
  onPress: () => void;
  starred?: boolean;
  quick?: QuickAmount;
  onQuickAdd?: () => void;
}) {
  const t = useTheme();
  const parts = matched ? highlight(food.name, matched) : [{ text: food.name, hit: false }];
  const badge = rowBadge(food);
  const serving = quick ? quick.portion.label : food.serving;
  const grams = quick ? quick.grams : food.g;
  const n = quick ? scale(food, quick.grams) : food.n;
  const count = quick ? quick.grams / (quick.portion.g || 1) : 1;
  const times = Math.abs(count - 1) < 0.01 || quick?.portion.g === 1 ? '' : `${Math.round(count * 100) / 100} × `;
  const amountText = quick?.portion.g === 1 ? `${r0(grams)} g` : `${times}${serving}${/\bg\)?$/.test(serving) ? '' : ` (${r0(grams)} g)`}`;
  const addable = !!quick && !!onQuickAdd && canQuickAdd(food);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${food.name}, ${r0(n.kcal)} calories per ${amountText}`}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, gap: 12, backgroundColor: pressed ? t.surface2 : 'transparent', borderRadius: 12 })}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Txt size={15} weight="bodySemi" numberOfLines={2}>
            {parts.map((p, i) => (
              <Txt key={i} size={15} weight={p.hit ? 'bodyHeavy' : 'bodySemi'}>
                {p.text}
              </Txt>
            ))}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {starred ? <Ionicons name="star" size={12} color={t.carbs} accessibilityLabel="Favorite" /> : null}
            {badge ? <Badge label={badge} tone={food.flagged ? 'warn' : food.src === 'online' ? 'accent' : 'muted'} /> : null}
            {food.brand ? (
              <Txt size={12.5} color={t.accent} weight="bodyBold" numberOfLines={1} style={{ flexShrink: 1 }}>
                {food.brand}
              </Txt>
            ) : null}
          </View>
          <Txt size={12.5} color={t.muted} numberOfLines={1}>
            {quick?.usual ? `Last time: ${amountText}` : amountText}
          </Txt>
          <Macros n={n} unknown={food.unknown} />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt weight="display" size={17} style={num}>{r0(n.kcal)}</Txt>
          <Txt size={11} color={t.faint}>kcal</Txt>
        </View>
      </Pressable>
      {addable && quick && onQuickAdd ? <AddButton food={food} amount={quick} onAdd={onQuickAdd} /> : null}
    </View>
  );
}
