import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, Share, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { amountLabel } from '../components/helpers';
import { QrCode } from '../components/QrCode';
import { ModalHeader } from '../components/Screen';
import { sum } from '../foods';
import { useNav } from '../nav';
import { encodeMeal, SharedMeal, shareMessage } from '../share';
import { useStore } from '../store';
import { carbsShown } from '../targets';
import { useTheme } from '../theme';
import { Card, Eyebrow, num, PrimaryButton, Txt } from '../ui';
import { int, r0 } from '../util';

export default function ShareMeal() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const payload = nav.payload('shareMeal');
  const saved = store.profile.meals.find((m) => m.id === payload?.mealId);
  const recipeFood = payload?.recipeId ? store.profile.customFoods.find((f) => f.id === payload.recipeId && f.recipe) : undefined;
  const meal: SharedMeal | undefined = recipeFood?.recipe
    ? { name: recipeFood.name, items: recipeFood.recipe.items, recipe: { servings: recipeFood.recipe.servings, cookedG: recipeFood.recipe.cookedG } }
    : saved;
  const title = meal?.recipe ? 'Share recipe' : 'Share meal';

  if (!meal) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ModalHeader title={title} onClose={nav.done} />
        <Txt size={14} color={t.muted} style={{ padding: 16 }}>This isn’t saved anymore.</Txt>
      </View>
    );
  }

  const tot = sum(meal.items);
  const code = encodeMeal(meal);
  const send = async () => {
    try {
      await Share.share({ message: shareMessage(meal, tot.kcal), title: `${meal.name} · Pantera` });
    } catch {
      nav.toast('Couldn’t open sharing');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader title={title} onClose={nav.done} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, alignItems: 'stretch' }}>
        <View style={{ gap: 2 }}>
          <Txt weight="display" size={22}>{meal.name}</Txt>
          <Txt size={13.5} color={t.muted} style={num}>
            {meal.recipe
              ? `${meal.recipe.servings} servings · ${int(tot.kcal / meal.recipe.servings)} kcal per serving · ${meal.items.length} ingredients`
              : `${int(tot.kcal)} kcal · P ${r0(tot.p)} g · C ${r0(carbsShown(tot, store.profile.netCarbs))} g · F ${r0(tot.f)} g · ${meal.items.length} ${meal.items.length === 1 ? 'item' : 'items'}`}
          </Txt>
        </View>

        <Card style={{ alignItems: 'center', gap: 12 }}>
          <Eyebrow>Friend is with you?</Eyebrow>
          <QrCode value={code} size={Math.min(width - 64, code.length > 1000 ? 360 : 280)} />
          <Txt size={13.5} color={t.muted} style={{ textAlign: 'center' }}>
            They open Pantera, tap the Scan button, and point it at this code.{code.length > 1400 ? ' This is a big meal, so turn your screen brightness up, or send it as a message instead.' : ''}
          </Txt>
        </Card>

        <Card style={{ gap: 10 }}>
          <Eyebrow>Friend is somewhere else?</Eyebrow>
          <Txt size={13.5} color={t.muted}>Send it by WhatsApp, text or email. They open Pantera → My foods → Import meal and paste your message.</Txt>
          <PrimaryButton label="Send as a message" icon={<Ionicons name="share-social" size={18} color={t.onGrad} />} onPress={send} />
        </Card>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {meal.items.map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Txt size={14} weight="bodyBold">{it.name}</Txt>
                <Txt size={12.5} color={t.muted}>{amountLabel(it)}</Txt>
              </View>
              <Txt size={13.5} weight="bodyHeavy" style={num}>{r0(it.n.kcal)}</Txt>
            </View>
          ))}
        </Card>
        <Txt size={12} color={t.faint} style={{ textAlign: 'center', paddingBottom: insets.bottom + 8 }}>
          Only the meal’s name, foods, amounts and nutrition are shared. Nothing else from your app.
        </Txt>
      </ScrollView>
    </View>
  );
}
