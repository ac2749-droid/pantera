import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { emptyNutrients, Food, NK } from '../foods';
import { LabelReading, labelQuality, parseLabel } from '../label';
import { aiLabel } from '../meal/ai';
import { LabelInfo, useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { GhostButton, PrimaryButton, Txt } from '../ui';

type Status = { kind: 'ready' } | { kind: 'reading'; step: string } | { kind: 'failed'; reason: string };

// On-device text recognition (Google ML Kit). Loaded lazily so the web preview still works.
async function readTextOnPhone(uri: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const mod = await import('expo-text-extractor');
    if (!mod.isSupported) return null;
    const blocks = await mod.extractTextFromImage(uri);
    return blocks.join('\n');
  } catch {
    return null;
  }
}

/** AI reading where available, with any gaps filled from the phone's own reading. */
function combine(ai: (LabelReading & { name?: string }) | null, phone: LabelReading | null): (LabelReading & { name?: string; source: 'ai' | 'phone' }) | null {
  if (ai && phone) {
    const values = { ...phone.values, ...ai.values };
    const found = Array.from(new Set([...ai.found, ...phone.found]));
    return { ...ai, values, found, estimated: phone.estimated.filter((k) => !ai.found.includes(k)), servingG: ai.servingG ?? phone.servingG, servingLabel: ai.servingLabel ?? phone.servingLabel, source: 'ai' };
  }
  if (ai) return { ...ai, source: 'ai' };
  if (phone && phone.found.length >= 2) return { ...phone, source: 'phone' };
  return null;
}

export default function LabelScan() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const p = nav.payload('label');
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'ready' });
  const cam = useRef<CameraView>(null);
  const prof = store.profile;
  const aiKey = prof.aiProvider === 'meta' ? prof.metaKey : prof.geminiKey;
  const useAi = prof.aiEnabled && !!aiKey.trim();

  // Back to the food form, keeping whatever was already typed
  const backToForm = (prefill?: Partial<Food>, fromLabel?: LabelInfo) =>
    nav.go({ type: 'form', food: p?.food, prefill: prefill ?? p?.prefill, returnMeal: p?.returnMeal, pick: p?.pick, fromLabel }, { replace: true });
  const close = () => backToForm();

  const capture = async () => {
    if (!cam.current || status.kind === 'reading') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStatus({ kind: 'reading', step: 'Taking photo…' });
    try {
      const photo = await cam.current.takePictureAsync({ quality: 0.6, base64: useAi, shutterSound: false });
      if (!photo?.uri) throw new Error('no photo');
      setTorch(false);
      setStatus({ kind: 'reading', step: useAi ? 'Reading the label with AI…' : 'Reading the label…' });
      const [text, ai] = await Promise.all([readTextOnPhone(photo.uri), useAi && photo.base64 ? aiLabel(photo.base64, aiKey, prof.aiProvider) : Promise.resolve(null)]);
      const phone = text ? parseLabel(text) : null;
      const r = combine(ai, phone);
      if (!r) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setStatus({
          kind: 'failed',
          reason: text === null && !useAi ? 'Text recognition isn’t available on this phone right now. It may need Google Play services to finish setting up, which needs internet the first time.' : 'Couldn’t read the numbers on that label. Try again closer, straight on, with good light and no glare.',
        });
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const n = emptyNutrients();
      NK.forEach((k) => (n[k] = r.values[k] ?? (p?.prefill?.n?.[k] ?? 0)));
      const prefill: Partial<Food> = {
        ...p?.prefill,
        name: p?.prefill?.name || p?.food?.name || r.name || '',
        serving: r.servingLabel || p?.prefill?.serving || p?.food?.serving || '1 serving',
        g: r.servingG ?? p?.prefill?.g ?? p?.food?.g,
        n,
        source: 'Nutrition label',
      };
      const q = labelQuality(r);
      backToForm(prefill, { found: r.found, estimated: r.estimated, note: q.note, source: r.source, servingFound: !!r.servingG });
    } catch {
      setStatus({ kind: 'failed', reason: 'Couldn’t take the photo. Try again.' });
    }
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 24, paddingTop: insets.top + 24, justifyContent: 'center', gap: 16 }}>
        <Ionicons name="camera-outline" size={44} color={t.accent} />
        <Txt weight="display" size={22}>Allow camera to read labels</Txt>
        <Txt color={t.muted} size={15}>Pantera takes one photo of the Nutrition Facts panel and reads the numbers into a new food for you.</Txt>
        {permission.canAskAgain ? <PrimaryButton label="Allow camera" onPress={requestPermission} /> : <PrimaryButton label="Open settings" onPress={() => Linking.openSettings()} />}
        <GhostButton label="Type it in instead" onPress={close} />
      </View>
    );
  }

  const reading = status.kind === 'reading';
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} />

      <View style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable onPress={close} accessibilityLabel="Close" style={styles.round}>
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
        <Txt weight="displaySemi" size={16} color="#fff">Scan nutrition label</Txt>
        <Pressable onPress={() => setTorch((v) => !v)} accessibilityLabel={torch ? 'Turn off flashlight' : 'Turn on flashlight'} style={[styles.round, torch && { backgroundColor: t.accent }]}>
          <Ionicons name={torch ? 'flash' : 'flash-outline'} size={22} color={torch ? '#0B0720' : '#fff'} />
        </Pressable>
      </View>

      {/* Tall frame shaped like a Nutrition Facts panel */}
      <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 70, bottom: insets.bottom + 210, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: '72%', height: '100%', maxHeight: 520 }}>
          {[
            { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
            { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
            { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 },
            { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 },
          ].map((s, i) => (
            <View key={i} style={[{ position: 'absolute', width: 38, height: 38, borderColor: '#3EE7FF' }, s]} />
          ))}
        </View>
      </View>

      <View style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 12, backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 }}>
        {status.kind === 'failed' ? (
          <>
            <Txt weight="bodyBold" size={15} color={t.warn}>{status.reason}</Txt>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <GhostButton label="Type it in" onPress={close} style={{ flex: 1 }} />
              <PrimaryButton label="Try again" onPress={() => setStatus({ kind: 'ready' })} style={{ flex: 1 }} />
            </View>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="bodyBold" size={15}>{reading ? status.step : 'Fit the Nutrition Facts inside the frame'}</Txt>
                <Txt size={13} color={t.muted}>{reading ? 'This takes a few seconds.' : 'Hold the phone straight on, fill the frame, avoid glare.'}</Txt>
              </View>
              <Pressable
                onPress={capture}
                disabled={reading}
                accessibilityLabel="Take photo of the label"
                style={({ pressed }) => ({ width: 66, height: 66, borderRadius: 33, borderWidth: 4, borderColor: t.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
              >
                {reading ? <ActivityIndicator color={t.accent} /> : <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: t.accent }} />}
              </Pressable>
            </View>
            <Txt size={12} color={t.faint}>{useAi ? 'Read with your AI key, checked against the phone’s own text reading.' : 'Read on your phone. Nothing is uploaded.'}</Txt>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
});
