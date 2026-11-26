import Ionicons from '@expo/vector-icons/Ionicons';
import { Macros } from '../../components/Macros';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { defaultMeal } from '../../components/helpers';
import { Screen } from '../../components/Screen';
import { sum } from '../../foods';
import { FOOD_COUNT } from '../../foodIndex/foodCount';
import { useNav } from '../../nav';
import { useStore } from '../../store';
import { useTheme } from '../../theme';
import { Card, Eyebrow, GhostButton, num, PrimaryButton, Slash, Txt } from '../../ui';
import { r0 } from '../../util';

/** A list title with the Pantera slash. */
function Heading({ children, top }: { children: string; top?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: top ? 6 : 0 }}>
      <Slash color={t.grad1} />
      <Txt weight="display" size={18}>{children}</Txt>
    </View>
  );
}

export default function MyFoods() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const list = store.profile.customFoods.filter((f) => !f.recipe);
  const recipes = store.profile.customFoods.filter((f) => f.recipe);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <Txt weight="display" size={21}>My foods</Txt>
        <PrimaryButton label="New food" icon={<Ionicons name="add" size={18} color={t.onGrad} />} onPress={() => nav.go({ type: 'form' })} style={{ minWidth: 130 }} />
      </View>
      <Txt size={13.5} color={t.muted}>Foods, recipes and meals you save here show up first when you search.</Txt>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <Heading>Recipes</Heading>
        <Pressable onPress={() => nav.openRecipe()} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4 }} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={18} color={t.accent} />
          <Txt size={14} weight="bodyBold" color={t.accent}>New recipe</Txt>
        </Pressable>
      </View>
      {recipes.length === 0 ? (
        <Pressable onPress={() => nav.openRecipe()} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: t.line, backgroundColor: pressed ? t.surface2 : t.surface })}>
          <Ionicons name="restaurant-outline" size={24} color={t.accent} />
          <Txt size={13.5} color={t.muted} style={{ flex: 1 }}>Cook at home? Add the ingredients once, say how many servings it makes, and log a serving (or a weight) any time.</Txt>
        </Pressable>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {recipes.map((f, i) => (
            <Pressable
              key={f.id}
              onPress={() => nav.go({ type: 'detail', food: f, mode: 'add', meal: defaultMeal() })}
              accessibilityHint="Log this recipe"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}
            >
              <Ionicons name="restaurant" size={20} color={t.accent} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="bodyBold" size={15}>{f.name}</Txt>
                <Txt size={12.5} color={t.muted}>{f.recipe!.servings} {f.recipe!.servings === 1 ? 'serving' : 'servings'} · {f.recipe!.items.length} ingredients · {r0(f.n.kcal)} kcal per serving</Txt>
                <Macros n={f.n} />
              </View>
              <Pressable hitSlop={8} accessibilityLabel={`Share ${f.name}`} onPress={() => nav.go({ type: 'shareMeal', recipeId: f.id })} style={{ padding: 6 }}>
                <Ionicons name="share-social-outline" size={19} color={t.accent} />
              </Pressable>
              <Pressable hitSlop={8} accessibilityLabel={`Edit ${f.name}`} onPress={() => nav.openRecipe(f)} style={{ padding: 6 }}>
                <Ionicons name="create-outline" size={19} color={t.accent} />
              </Pressable>
            </Pressable>
          ))}
        </Card>
      )}

      <Heading top>Foods</Heading>

      {list.length === 0 ? (
        <Card style={{ gap: 12 }}>
          <Txt size={14} color={t.muted}>No foods yet. Scan a barcode or copy a nutrition label to add your first one.</Txt>
          <GhostButton label="Scan a barcode" onPress={() => nav.go({ type: 'scan', meal: defaultMeal() })} />
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {list.map((f, i) => (
            <Pressable
              key={f.id}
              onPress={() => nav.go({ type: 'form', food: f })}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}
            >
              <Ionicons name={f.barcode ? 'barcode-outline' : 'create-outline'} size={20} color={t.accent} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="bodyBold" size={15}>{f.name}</Txt>
                <Txt size={12.5} color={t.muted}>{[f.brand, f.serving, f.serving.includes(' g') ? null : `${r0(f.g)} g`].filter(Boolean).join(' · ')}</Txt>
                <Macros n={f.n} />
              </View>
              <Txt weight="bodyHeavy" size={14} style={num}>{r0(f.n.kcal)} kcal</Txt>
            </Pressable>
          ))}
        </Card>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        <Heading>Saved meals</Heading>
        <Pressable onPress={() => nav.go({ type: 'importMeal' })} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4 }} accessibilityRole="button">
          <Ionicons name="download-outline" size={17} color={t.accent} />
          <Txt size={14} weight="bodyBold" color={t.accent}>Import meal</Txt>
        </Pressable>
      </View>
      {store.profile.meals.length === 0 ? (
        <Card>
          <Txt size={13.5} color={t.muted}>Eat the same breakfast often? Log it once, then tap Save meal on that meal in your diary. Next time it’s one tap from Add food, and you can share it with friends.</Txt>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {store.profile.meals.map((m, i) => {
            const tot = sum(m.items);
            return (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
                <Ionicons name="albums-outline" size={20} color={t.accent} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt weight="bodyBold" size={15}>{m.name}</Txt>
                  <Txt size={12.5} color={t.muted} numberOfLines={2}>{m.items.map((x) => x.name).join(', ')}</Txt>
                  <Txt size={12.5} weight="bodyBold" style={num}>{r0(tot.kcal)} kcal · {m.items.length} {m.items.length === 1 ? 'item' : 'items'}</Txt>
                </View>
                <Pressable hitSlop={8} accessibilityLabel={`Share ${m.name}`} onPress={() => nav.go({ type: 'shareMeal', mealId: m.id })} style={{ padding: 6 }}>
                  <Ionicons name="share-social-outline" size={19} color={t.accent} />
                </Pressable>
                <Pressable
                  hitSlop={8}
                  accessibilityLabel={pendingDelete === m.id ? `Confirm delete ${m.name}` : `Delete ${m.name}`}
                  onPress={() => {
                    if (pendingDelete !== m.id) return setPendingDelete(m.id);
                    store.deleteMeal(m.id);
                    setPendingDelete(null);
                    nav.toast('Meal deleted');
                  }}
                  style={{ padding: 6 }}
                >
                  {pendingDelete === m.id ? <Txt size={12.5} weight="bodyHeavy" color={t.warn}>Delete?</Txt> : <Ionicons name="trash-outline" size={19} color={t.faint} />}
                </Pressable>
              </View>
            );
          })}
        </Card>
      )}

      <Heading top>Favorites</Heading>
      {store.profile.favorites.length === 0 ? (
        <Card>
          <Txt size={13.5} color={t.muted}>Tap the star on any food to keep it here. Favorites also rank first when you search.</Txt>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {store.profile.favorites.map((f, i) => (
            <Pressable
              key={f.id + f.name}
              onPress={() => nav.go({ type: 'detail', food: f, mode: 'add', meal: defaultMeal() })}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="bodyBold" size={15}>{f.name}</Txt>
                <Txt size={12.5} color={t.muted}>{[f.brand, f.serving].filter(Boolean).join(' · ')} · {r0(f.n.kcal)} kcal</Txt>
              </View>
              <Pressable hitSlop={8} accessibilityLabel={`Remove ${f.name} from favorites`} onPress={() => { store.toggleFavorite(f); nav.toast('Removed from favorites'); }} style={{ padding: 6 }}>
                <Ionicons name="star" size={20} color={t.carbs} />
              </Pressable>
            </Pressable>
          ))}
        </Card>
      )}
      <Card>
        <Eyebrow>Food database</Eyebrow>
        <Txt size={13.5} color={t.muted}>Search and barcode scanning use {FOOD_COUNT} foods kept on your phone, from USDA FoodData Central and Open Food Facts, so they work without a connection. AI and barcode keys are in Settings (gear, top right).</Txt>
      </Card>
    </Screen>
  );
}
