import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { defaultMeal } from '../components/helpers';
import { useKeyboardHeight, useRevealField } from '../components/keyboard';
import { Draft, DraftCard, RevealField, useDraftLog } from '../components/MealReview';
import { ModalHeader } from '../components/Screen';
import { buildPersonalIndex } from '../foodSearch';
import { PhotoFailure, readPhoto } from '../meal/photo';
import { discardPhoto, Photo, preparePhoto } from '../meal/photoImage';
import { failureText, noticeFor, providerName } from '../meal/photoText';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Card, GhostButton, PrimaryButton, Txt } from '../ui';
import { int, newId, today } from '../util';

type Step =
  | { kind: 'camera'; problem?: string }
  | { kind: 'preparing' }
  | { kind: 'preview'; photo: Photo }
  | { kind: 'reading'; photo: Photo }
  | { kind: 'failed'; photo: Photo; reason: PhotoFailure }
  | { kind: 'result'; photo: Photo };

const KEY_PAGE = 'https://aistudio.google.com/apikey';

export default function PhotoMeal() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const { scroller: pageRef, content, reveal } = useRevealField(kb);
  const presetMeal = nav.payload('photo')?.meal;
  const prof = store.profile;
  const provider = prof.aiProvider;
  const key = (provider === 'meta' ? prof.metaKey : prof.geminiKey).trim();
  const who = providerName(provider);
  const agreed = !!prof.photoNoticeFor?.includes(provider);

  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>({ kind: 'camera' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [torch, setTorch] = useState(false);
  const cam = useRef<CameraView>(null);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false); // a photo is being taken or picked
  const alive = useRef(true);
  const temps = useRef<string[]>([]);
  const drafts = useDraftLog();
  const personal = useMemo(() => buildPersonalIndex(store.profile.customFoods, store.recentFoods(), 'all', store.profile.favorites), [store]);

  // Leaving the screen stops any request and removes the temporary copies
  useEffect(() => {
    alive.current = true;
    const files = temps.current;
    return () => {
      alive.current = false;
      request.current?.abort();
      files.forEach(discardPhoto);
    };
  }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const retake = () => {
    request.current?.abort();
    temps.current.forEach(discardPhoto);
    temps.current.length = 0;
    setDraft(null);
    setStep({ kind: 'camera' });
  };

  const bring = async (get: () => Promise<{ uri: string; width: number; height: number } | null>, problem: string) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const source = await get();
      if (!source || !alive.current) return;
      temps.current.push(source.uri);
      setTorch(false);
      setStep({ kind: 'preparing' });
      const photo = await preparePhoto(source);
      temps.current.push(photo.uri);
      if (alive.current) setStep({ kind: 'preview', photo });
      else discardPhoto(photo.uri);
    } catch {
      if (alive.current) setStep({ kind: 'camera', problem });
    } finally {
      busy.current = false;
    }
  };
  const take = () =>
    bring(async () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const shot = await cam.current?.takePictureAsync({ quality: 0.8, shutterSound: false });
      if (!shot) throw new Error('no photo');
      return shot;
    }, 'Couldn’t take the photo. Try again, or choose one from your gallery.');
  const pick = () =>
    bring(async () => {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      return r.canceled ? null : r.assets[0];
    }, 'Couldn’t open that picture. Try another one.');

  const send = async (photo: Photo) => {
    request.current?.abort();
    const ctrl = new AbortController();
    request.current = ctrl;
    setStep({ kind: 'reading', photo });
    const r = await readPhoto(photo.base64, personal, { key, provider }, ctrl.signal).catch(() => ({ ok: false as const, reason: 'bad_response' as const }));
    // Cancelled, replaced by another photo, or the screen was closed
    if (!alive.current || ctrl.signal.aborted) return;
    if (!r.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setStep({ kind: 'failed', photo, reason: r.reason });
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setDraft({
      id: newId(),
      items: r.items,
      meal: presetMeal ?? defaultMeal(),
      date: nav.date > today() ? today() : nav.date,
      source: 'photo',
      note: 'Amounts are estimates from the photo. Tap a food to check or change it.',
      status: 'open',
    });
    setStep({ kind: 'result', photo });
  };
  const cancel = (photo: Photo) => {
    request.current?.abort();
    setStep({ kind: 'preview', photo });
  };

  const meal = presetMeal ?? defaultMeal();
  const otherWays = (
    <View style={{ gap: 8 }}>
      <Txt size={12.5} weight="bodyBold" color={t.muted}>Or log it another way</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <GhostButton label="Say or type it" onPress={() => nav.go({ type: 'assistant', meal }, { replace: true })} />
        <GhostButton label="Search foods" onPress={() => nav.go({ type: 'add', meal }, { replace: true })} />
        <GhostButton label="Scan a barcode" onPress={() => nav.go({ type: 'scan', meal }, { replace: true })} />
      </View>
    </View>
  );
  const page = (children: React.ReactNode) => (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader title="Photo of your meal" onClose={close} />
      <ScrollView ref={pageRef} innerViewRef={content} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: (kb || insets.bottom) + 32 }} keyboardShouldPersistTaps="handled">
        <RevealField.Provider value={reveal}>{children}</RevealField.Provider>
      </ScrollView>
    </View>
  );

  // ---------- no key, or AI turned off: nothing is photographed or sent ----------
  if (!key) {
    return page(
      <>
        <Card style={{ gap: 12 }}>
          <Ionicons name="key-outline" size={36} color={t.accent} />
          <Txt weight="display" size={21}>Photo logging needs your own AI key</Txt>
          <Txt size={14.5} color={t.muted}>Your phone can’t recognise meals by itself, so an AI service reads the photo under your own account. Everything else in Pantera works without a key.</Txt>
          <Txt size={14} color={t.ink}>1. Tap “Get a free key” and sign in with a Google account.{'\n'}2. Create an API key and copy it.{'\n'}3. In Settings, under Assistant AI boost, paste it and tap Save.</Txt>
          <Txt size={12.5} color={t.faint}>Google’s keys are for people 18 or older. The free key isn’t allowed in the European Economic Area, Switzerland or the United Kingdom; a paid key is needed there.</Txt>
          <PrimaryButton label="Get a free key" onPress={() => Linking.openURL(KEY_PAGE).catch(() => nav.toast('Open aistudio.google.com in your browser'))} />
          <GhostButton label="Open Settings" onPress={() => router.push('/settings')} />
        </Card>
        {otherWays}
      </>,
    );
  }
  if (!prof.aiEnabled) {
    return page(
      <>
        <Card style={{ gap: 12 }}>
          <Txt weight="display" size={21}>AI help is turned off</Txt>
          <Txt size={14.5} color={t.muted}>Photo logging sends the photo to {who} with your key. Turn AI help on to use it.</Txt>
          <PrimaryButton label="Turn on AI help" onPress={() => store.setAi({ aiEnabled: true })} />
        </Card>
        {otherWays}
      </>,
    );
  }
  // ---------- before the first photo ----------
  if (!agreed) {
    const notice = noticeFor(provider);
    return page(
      <>
        <Card style={{ gap: 12 }}>
          <Ionicons name="shield-checkmark-outline" size={36} color={t.accent} />
          <Txt weight="display" size={21}>Before your first photo</Txt>
          {notice.points.map((p) => (
            <View key={p} style={{ flexDirection: 'row', gap: 8 }}>
              <Txt size={14.5} color={t.accent}>•</Txt>
              <Txt size={14} style={{ flex: 1 }}>{p}</Txt>
            </View>
          ))}
          <PrimaryButton label={notice.accept} onPress={() => store.setProfile({ photoNoticeFor: [...(prof.photoNoticeFor ?? []), provider] })} />
          <GhostButton label="Not now" onPress={close} />
        </Card>
        {otherWays}
      </>,
    );
  }

  // ---------- what was found ----------
  if (step.kind === 'result' && draft) {
    return page(
      <>
        <Image source={{ uri: step.photo.uri }} style={{ width: '100%', height: 180, borderRadius: 16, backgroundColor: t.surface2 }} resizeMode="cover" accessibilityLabel="Your photo" />
        <DraftCard
          draft={draft}
          personal={personal}
          onUpdate={setDraft}
          onLog={() => {
            const next = drafts.log(draft);
            setDraft(next);
            nav.toast(`Logged ${int(next.logged?.kcal ?? 0)} kcal`);
          }}
          onUndo={() => {
            setDraft(drafts.undo(draft));
            nav.toast('Removed from diary');
          }}
        />
        {draft.status === 'logged' ? <PrimaryButton label="Done" onPress={nav.done} /> : null}
        <GhostButton label={draft.status === 'logged' ? 'Photograph something else' : 'Take another photo'} onPress={retake} />
      </>,
    );
  }

  // ---------- check, send, wait ----------
  if (step.kind === 'preview' || step.kind === 'reading' || step.kind === 'failed') {
    const photo = step.photo;
    const failed = step.kind === 'failed' ? failureText(step.reason, provider) : null;
    return page(
      <>
        <Image source={{ uri: photo.uri }} style={{ width: '100%', aspectRatio: Math.max(0.75, photo.width / photo.height || 1), borderRadius: 16, backgroundColor: t.surface2 }} resizeMode="contain" accessibilityLabel="Your photo" />
        {step.kind === 'preview' ? (
          <>
            <PrimaryButton label="Find foods" onPress={() => send(photo)} />
            <Txt size={12.5} color={t.faint} style={{ textAlign: 'center' }}>Sends this photo to {who} with your key.</Txt>
            <GhostButton label="Use a different photo" onPress={retake} />
          </>
        ) : null}
        {step.kind === 'reading' ? (
          <Card style={{ gap: 12, alignItems: 'center' }}>
            <ActivityIndicator color={t.accent} />
            <Txt weight="bodyBold" size={15}>Looking at your photo…</Txt>
            <Txt size={12.5} color={t.muted}>This can take up to a minute.</Txt>
            <GhostButton label="Cancel" onPress={() => cancel(photo)} />
          </Card>
        ) : null}
        {failed ? (
          <>
            <Card style={{ gap: 10 }}>
              <Txt weight="displaySemi" size={17} color={t.warn}>{failed.title}</Txt>
              <Txt size={14} color={t.muted}>{failed.detail}</Txt>
              {failed.retry ? <PrimaryButton label="Try again" onPress={() => send(photo)} /> : null}
              {failed.settings ? <GhostButton label="Open Settings" onPress={() => router.push('/settings')} /> : null}
              <GhostButton label="Use a different photo" onPress={retake} />
            </Card>
            {otherWays}
          </>
        ) : null}
      </>,
    );
  }

  // ---------- camera ----------
  const preparing = step.kind === 'preparing';
  const canShoot = !!permission?.granted;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader
        title="Photo of your meal"
        onClose={close}
        right={
          canShoot ? (
            <Pressable onPress={() => setTorch((v) => !v)} hitSlop={8} accessibilityLabel={torch ? 'Turn off flashlight' : 'Turn on flashlight'}>
              <Ionicons name={torch ? 'flash' : 'flash-outline'} size={22} color={torch ? t.accent : t.ink} />
            </Pressable>
          ) : undefined
        }
      />
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {canShoot && !preparing ? <CameraView ref={cam} style={{ flex: 1 }} facing="back" enableTorch={torch} /> : null}
        {preparing ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={t.accent} size="large" />
          </View>
        ) : null}
        {!canShoot && !preparing && permission ? (
          <View style={{ flex: 1, backgroundColor: t.bg, padding: 24, justifyContent: 'center', gap: 14 }}>
            <Ionicons name="camera-outline" size={44} color={t.accent} />
            <Txt weight="display" size={21}>Allow the camera, or choose a picture</Txt>
            {permission.canAskAgain ? <PrimaryButton label="Allow camera" onPress={requestPermission} /> : <PrimaryButton label="Open phone settings" onPress={() => Linking.openSettings()} />}
          </View>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12, gap: 10, borderTopWidth: 1, borderTopColor: t.line }}>
        {step.kind === 'camera' && step.problem ? <Txt size={13.5} weight="bodyBold" color={t.warn}>{step.problem}</Txt> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={pick} disabled={preparing} accessibilityLabel="Choose from gallery" style={({ pressed }) => ({ width: 84, alignItems: 'center', gap: 3, opacity: pressed || preparing ? 0.6 : 1 })}>
            <Ionicons name="images-outline" size={28} color={t.accent} />
            <Txt size={12} weight="bodyBold" color={t.accent}>Gallery</Txt>
          </Pressable>
          <Pressable
            onPress={take}
            disabled={!canShoot || preparing}
            accessibilityLabel="Take photo"
            style={({ pressed }) => ({ width: 70, height: 70, borderRadius: 35, borderWidth: 4, borderColor: t.accent, alignItems: 'center', justifyContent: 'center', opacity: !canShoot || pressed ? 0.5 : 1 })}
          >
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: t.accent }} />
          </Pressable>
          <View style={{ width: 84 }} />
        </View>
        <Txt size={12} color={t.faint} style={{ textAlign: 'center' }}>Fit the whole plate in. Nothing is sent until you tap Find foods.</Txt>
      </View>
    </View>
  );
}
