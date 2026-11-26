import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { amountLabel, defaultMeal } from '../../components/helpers';
import { AuraRing } from '../../components/AuraRing';
import { useCountUp } from '../../components/motion';
import { Screen } from '../../components/Screen';
import { ExerciseCard } from '../../components/ExerciseCard';
import { FastingCard } from '../../components/FastingCard';
import { Macros } from '../../components/Macros';
import { StreakCard } from '../../components/StreakCard';
import { WaterCard } from '../../components/WaterCard';
import { resolveFood } from '../../foodSearch';
import { NutrientPanel } from '../../components/NutrientPanel';
import { useCoach } from '../../components/SmartTargetCard';
import { thisWeek } from '../../report';
import { burnedOn } from '../../exercise';
import { Entry, MEALS, microCoverage, portionsOf, scale, sum } from '../../foods';
import { clockText, entryMinutes } from '../../mealTime';
import { useNav } from '../../nav';
import { useStore } from '../../store';
import { carbsShown, dayBudget } from '../../targets';
import { useTheme } from '../../theme';
import { Bar, Card, Divider, Eyebrow, GhostButton, IconButton, num, Slash, Txt } from '../../ui';
import { addDays, dayTitle, int, longDate, r0, today } from '../../util';

export default function Diary() {
  const coachR = useCoach();
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const d = nav.date;
  const burned = burnedOn(store.exercise[d]);
  const T = dayBudget(store.profile, d, burned); // this weekday's targets, plus exercise if you count it
  const net = store.profile.netCarbs;
  const entries = store.entriesFor(d);
  const tot = sum(entries);
  const over = tot.kcal > T.kcal;
  const remaining = T.kcal - tot.kcal;
  const remainingShown = useCountUp(Math.round(Math.abs(remaining)));
  const kP = tot.p * 4, kC = tot.c * 4, kF = tot.f * 9, kS = kP + kC + kF || 1;
  const isToday = d === today();
  const isFuture = d > today();
  const lastDay = addDays(today(), 7); // plan up to a week ahead
  const yesterday = addDays(d, -1);
  const [dayMenu, setDayMenu] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const realCount = entries.filter((e) => !e.sample).length;
  const yCountAll = (store.days[yesterday] || []).filter((e) => !e.sample).length;

  const openEntry = (e: Entry) => {
    // Nutrients come from the entry itself; portions come from the original food when we still have it
    const own = { label: e.serving, g: e.sg || e.grams };
    const original = resolveFood(e.fid, store.profile.customFoods);
    const food = { id: e.fid ?? e.id, name: e.name, serving: own.label, g: own.g, n: scale({ g: e.grams || 1, n: e.n }, own.g), src: 'recent' as const, portions: original ? portionsOf(original) : undefined, micros: e.mx };
    nav.go({ type: 'detail', food, mode: 'edit', meal: e.meal, grams: e.grams, portion: own, entryId: e.id, sample: !!e.sample });
  };

  return (
    <Screen>
      {/* Date navigation */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        <IconButton label="Previous day" onPress={() => nav.setDate(addDays(d, -1))}>
          <Ionicons name="chevron-back" size={20} color={t.ink} />
        </IconButton>
        <Pressable onPress={() => nav.setDate(today())} style={{ alignItems: 'center' }} accessibilityHint="Jump to today">
          <Txt weight="display" size={21}>{dayTitle(d)}</Txt>
          <Txt size={13} color={isToday ? t.muted : t.accent} weight={isToday ? 'body' : 'bodyBold'}>
            {isToday ? longDate(d) : `${longDate(d)} · Back to today`}
          </Txt>
        </Pressable>
        <IconButton label="Next day" disabled={d >= lastDay} onPress={() => nav.setDate(addDays(d, 1))}>
          <Ionicons name="chevron-forward" size={20} color={t.ink} />
        </IconButton>
      </View>

      {/* Day options: copy, plan, clear */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: -6 }}>
        <Pressable onPress={() => { setDayMenu(!dayMenu); setConfirmClear(false); }} hitSlop={8} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 99, backgroundColor: dayMenu ? t.accentSoft : 'transparent' }}>
          <Ionicons name="ellipsis-horizontal-circle-outline" size={16} color={t.accent} />
          <Txt size={13} weight="bodyBold" color={t.accent}>Day options</Txt>
        </Pressable>
      </View>
      {dayMenu ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {([
            yCountAll && yesterday !== d ? ['copy-outline', `Copy ${dayTitle(yesterday).toLowerCase() === 'yesterday' ? 'yesterday' : dayTitle(yesterday)}’s food here (${yCountAll})`, () => { const n = store.copyDay(yesterday, d); nav.toast(`Copied ${n} item${n === 1 ? '' : 's'}`); setDayMenu(false); }] : null,
            realCount && d < lastDay ? ['calendar-outline', `Copy this day to ${dayTitle(addDays(d, 1)).toLowerCase() === 'tomorrow' ? 'tomorrow' : dayTitle(addDays(d, 1))}`, () => { const n = store.copyDay(d, addDays(d, 1)); nav.toast(`Copied ${n} item${n === 1 ? '' : 's'} to ${dayTitle(addDays(d, 1))}`); setDayMenu(false); }] : null,
            realCount && !isToday && d < today() ? ['today-outline', 'Copy this day to today', () => { const n = store.copyDay(d, today()); nav.toast(`Copied ${n} item${n === 1 ? '' : 's'} to today`); setDayMenu(false); }] : null,
            ['hourglass-outline', store.fasts.current ? 'Fasting timer (running)' : 'Fasting timer', () => { setDayMenu(false); router.push('/fasting'); }],
            ['flash-outline', 'Quick add calories', () => { setDayMenu(false); nav.go({ type: 'quick', meal: defaultMeal() }); }],
            ['calendar-number-outline', isFuture ? 'Back to today' : 'Plan tomorrow', () => { setDayMenu(false); nav.setDate(isFuture ? today() : addDays(today(), 1)); }],
            realCount ? ['trash-outline', confirmClear ? 'Tap again to clear this day' : 'Clear this day', () => { if (!confirmClear) return setConfirmClear(true); store.clearDay(d); nav.toast('Day cleared'); setDayMenu(false); setConfirmClear(false); }] : null,
          ].filter(Boolean) as [React.ComponentProps<typeof Ionicons>['name'], string, () => void][]).map(([icon, label, onPress], i) => (
            <Pressable key={label} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
              <Ionicons name={icon} size={19} color={icon === 'trash-outline' ? t.warn : t.accent} />
              <Txt size={14.5} weight="bodySemi" color={icon === 'trash-outline' ? t.warn : t.ink}>{label}</Txt>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {isFuture ? (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: t.accentSoft, borderColor: t.accent, borderWidth: 1, borderRadius: 14, padding: 12 }}>
          <Ionicons name="calendar" size={18} color={t.accent} />
          <Txt size={13.5} style={{ flex: 1 }}>Planning ahead. Foods you add here are marked as planned, and count as eaten once the day arrives. Edit or remove anything you don’t end up eating.</Txt>
        </View>
      ) : null}

      {isToday ? <StreakCard /> : null}

      {/* Assistant shortcut */}
      <Pressable
        onPress={() => nav.go({ type: 'assistant' })}
        accessibilityRole="button"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? t.surface2 : t.surface, borderColor: t.accent, borderWidth: 1, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14 })}
      >
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="sparkles" size={18} color={t.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt weight="bodyBold" size={15}>Tell Pantera what you ate</Txt>
          <Txt size={12.5} color={t.muted}>“2 eggs and toast”, “a chicken wrap with mayo”…</Txt>
        </View>
        <Pressable
          onPress={() => nav.go({ type: 'assistant', voice: true })}
          hitSlop={8}
          accessibilityLabel="Say what you ate"
          style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.accent : t.accentSoft })}
        >
          <Ionicons name="mic" size={20} color={t.accent} />
        </Pressable>
      </Pressable>

      {/* Weekly smart-target check-in */}
      {coachR.status === 'ready' && Math.abs(coachR.change) >= 50 && store.profile.coachSeen !== thisWeek() && isToday ? (
        <View style={{ backgroundColor: t.surface, borderColor: t.accent, borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="pulse" size={18} color={t.accent} />
            <Txt weight="bodyBold" size={15} style={{ flex: 1 }}>Weekly check-in</Txt>
            <Pressable onPress={() => store.setProfile({ coachSeen: thisWeek() })} hitSlop={10} accessibilityLabel="Dismiss for this week">
              <Ionicons name="close" size={18} color={t.faint} />
            </Pressable>
          </View>
          <Txt size={13.5} color={t.muted}>
            Based on your logging and weigh-ins, a daily target of <Txt size={13.5} weight="bodyHeavy" color={t.ink}>{int(coachR.suggested)} kcal</Txt> ({coachR.change > 0 ? '+' : '−'}{Math.abs(coachR.change)}) fits you better.
          </Txt>
          <GhostButton label="Review in Targets" onPress={() => { store.setProfile({ coachSeen: thisWeek() }); router.navigate('/targets'); }} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : null}

      {/* Energy summary */}
      <Card>
        <Eyebrow>Energy</Eyebrow>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <AuraRing fraction={tot.kcal / (T.kcal || 1)} over={over}>
            <Txt weight="displayHeavy" size={31} color={over ? t.warn : t.ink} style={num}>{int(remainingShown)}</Txt>
            <Txt size={12} color={t.muted}>{over ? 'kcal over' : 'kcal left'}</Txt>
          </AuraRing>
          <View style={{ flex: 1, gap: 10 }}>
            {[
              [isFuture ? 'Planned' : 'Eaten', int(tot.kcal)],
              ['Target', int(T.kcal)],
              ...(burned ? [['Exercise', `${store.profile.exerciseAddsCalories ? '+' : ''}${int(burned)}`]] : []),
              ['P / C / F', `${r0((kP / kS) * 100)}/${r0((kC / kS) * 100)}/${r0((kF / kS) * 100)}%`],
            ].map(([k, v]) => (
              <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt color={t.muted} size={14}>{k}</Txt>
                <Txt weight="bodyHeavy" size={14} style={num}>{v}</Txt>
              </View>
            ))}
          </View>
        </View>
        <View style={{ gap: 12, marginTop: 16 }}>
          {([['p', 'Protein', t.protein], ['c', net ? 'Net carbs' : 'Carbs', t.carbs], ['f', 'Fat', t.fat]] as const).map(([k, label, color]) => (
            <Pressable key={k} onPress={() => nav.go({ type: 'nutrient', k })} accessibilityRole="button" accessibilityHint="Shows where it came from" style={({ pressed }) => ({ gap: 6, opacity: pressed ? 0.6 : 1 })}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt size={14}>{label}</Txt>
                <Txt size={14} color={t.muted} style={num}>
                  <Txt weight="bodyHeavy" size={14}>{r0(k === 'c' ? carbsShown(tot, net) : tot[k])}</Txt> / {r0(T[k])} g
                </Txt>
              </View>
              <Bar value={k === 'c' ? carbsShown(tot, net) : tot[k]} max={T[k]} color={color} />
            </Pressable>
          ))}
        </View>
      </Card>

      {store.showSample && isToday ? (
        <View style={{ backgroundColor: t.accentSoft, borderColor: t.accent, borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 }}>
          <Txt size={14}>This is a sample day so you can see how Pantera works. It disappears when you log your first food.</Txt>
          <GhostButton label="Clear sample" onPress={() => { store.dismissSample(); nav.toast('Sample day cleared'); }} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : null}

      {/* Meals */}
      {MEALS.map(([key, label]) => {
        const list = entries.filter((e) => e.meal === key);
        const mt = sum(list);
        const yCount = (store.days[yesterday] || []).filter((e) => e.meal === key).length;
        return (
          <Card key={key} style={{ padding: 0, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Slash color={t.grad1} />
                <Txt weight="displaySemi" size={17}>{label}</Txt>
              </View>
              <Txt size={13} color={t.muted} style={num}>{int(mt.kcal)} kcal</Txt>
            </View>
            {list.length === 0 ? (
              <Txt size={13.5} color={t.faint} style={{ paddingHorizontal: 16, paddingBottom: 12 }}>Nothing logged yet.</Txt>
            ) : (
              list.map((e) => (
                <View key={e.id}>
                  <Divider />
                  <Pressable onPress={() => openEntry(e)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, gap: 12, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Txt weight="bodyBold" size={15}>{e.name}</Txt>
                        {isFuture ? (
                          <View style={{ backgroundColor: t.surface2, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 }}>
                            <Txt weight="bodyHeavy" size={9.5} color={t.muted} style={{ letterSpacing: 0.8 }}>PLANNED</Txt>
                          </View>
                        ) : null}
                        {e.sample ? (
                          <View style={{ backgroundColor: t.accentSoft, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 }}>
                            <Txt weight="bodyHeavy" size={9.5} color={t.accent} style={{ letterSpacing: 0.8 }}>SAMPLE</Txt>
                          </View>
                        ) : null}
                      </View>
                      <Txt size={12.5} color={t.muted}>
                        {amountLabel(e)}
                        {entryMinutes(e, d) !== null ? ` · ${clockText(entryMinutes(e, d)!)}` : ''}
                      </Txt>
                      <Macros n={e.n} />
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Txt weight="bodyHeavy" size={15} style={num}>{r0(e.n.kcal)}</Txt>
                      <Txt size={11} color={t.faint}>kcal</Txt>
                    </View>
                  </Pressable>
                </View>
              ))
            )}
            <Divider />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}>
              <Pressable onPress={() => nav.go({ type: 'add', meal: key })} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: t.line, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
                <Ionicons name="add" size={18} color={t.accent} />
                <Txt weight="bodyBold" color={t.accent} size={14}>Add food</Txt>
              </Pressable>
              <Pressable onPress={() => nav.go({ type: 'scan', meal: key })} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: t.line, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
                <Ionicons name="barcode-outline" size={18} color={t.accent} />
                <Txt weight="bodyBold" color={t.accent} size={14}>Scan</Txt>
              </Pressable>
              {list.some((e) => !e.sample) ? (
                <Pressable onPress={() => nav.go({ type: 'saveMeal', date: d, meal: key })} accessibilityLabel={`Save ${label} as a meal`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: t.line, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
                  <Ionicons name="bookmark-outline" size={17} color={t.accent} />
                  <Txt weight="bodyBold" color={t.accent} size={14}>Save meal</Txt>
                </Pressable>
              ) : null}
              {list.length === 0 && yCount > 0 ? (
                <GhostButton label={`Copy yesterday (${yCount})`} onPress={() => { const n = store.copyMeal(yesterday, d, key); if (n) nav.toast(`Copied ${n} item${n > 1 ? 's' : ''}`); }} style={{ paddingVertical: 9 }} />
              ) : null}
            </View>
          </Card>
        );
      })}

      <ExerciseCard date={d} />
      <WaterCard date={d} />
      {isToday ? <FastingCard /> : null}

      {/* Nutrients */}
      <Card>
        <Eyebrow>Nutrients, as % of daily value</Eyebrow>
        <NutrientPanel n={tot} coverage={microCoverage(entries)} targets={store.profile.nutrientTargets} onPick={(k) => nav.go({ type: 'nutrient', k })} />
      </Card>
    </Screen>
  );
}
