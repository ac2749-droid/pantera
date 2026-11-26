import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge } from '../components/FoodRow';
import { defaultMeal } from '../components/helpers';
import { useKeyboardHeight, useRevealField } from '../components/keyboard';
import { Draft, DraftCard, RevealField, useDraftLog } from '../components/MealReview';
import { useVoice } from '../components/useVoice';
import { VoiceBar } from '../components/VoiceBar';
import { ModalHeader } from '../components/Screen';
import { buildPersonalIndex } from '../foodSearch';
import { readMeal } from '../meal';
import { bestGuess } from '../meal/guess';
import { useNav } from '../nav';
import { useStore } from '../store';
import { fonts, useTheme } from '../theme';
import { Txt } from '../ui';
import { addDays, int, newId, today } from '../util';
import { speechHints } from '../voiceHints';

type Msg = { id: string; role: 'user'; text: string } | { id: string; role: 'bot'; text?: string; draft?: Draft; examples?: string[] };

const EXAMPLES = ['2 eggs and toast with butter', 'a medium apple', 'wrap with 60 g chicken breast, lettuce, tomato and a tbsp of mayo', 'yesterday for dinner 2 slices of pepperoni pizza'];

const AI_NOTES: Record<string, string> = {
  bad_key: 'Your AI key was rejected, so I used the built-in reader. You can check the key in Settings.',
  rate_limit: 'The AI limit is used up for now, so I used the built-in reader.',
  no_credit: 'Your Meta account is out of credit, so I used the built-in reader. Add credit at dev.meta.ai or switch to Gemini in Settings.',
  network: 'Couldn’t reach the AI, so I used the built-in reader.',
  region: 'Your AI key can’t be used from this country, so I used the built-in reader. Google needs a paid key in some places.',
  overloaded: 'The AI is busy right now, so I used the built-in reader.',
  bad_response: 'The AI gave an unclear answer, so I used the built-in reader.',
};

export default function Assistant() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const presetMeal = nav.payload('assistant')?.meal;
  const params = useLocalSearchParams<{ voice?: string }>();
  const startWithVoice = nav.payload('assistant')?.voice || params.voice === '1';
  const aiKey = store.profile.aiProvider === 'meta' ? store.profile.metaKey : store.profile.geminiKey;
  const hasAi = store.profile.aiEnabled && !!aiKey.trim();
  const kb = useKeyboardHeight();
  const { scroller, content, reveal } = useRevealField(kb);
  const drafts = useDraftLog();
  const typing = useRef(false); // the message box has the keyboard, not a field inside a card

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [spoke, setSpoke] = useState(false); // after using the mic, don't pop the keyboard up over the answer
  const [msgs, setMsgs] = useState<Msg[]>(() => [
    {
      id: 'intro',
      role: 'bot',
      text: 'Tell me what you ate and I’ll turn it into diary entries you can check before logging. Type it, tap the camera for a photo, or tap the mic, say it all, and tap again when you’re done.',
      examples: EXAMPLES,
    },
  ]);

  const personal = useMemo(() => buildPersonalIndex(store.profile.customFoods, store.recentFoods(), 'all', store.profile.favorites), [store]);
  const scrollDown = () => setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 80);
  useEffect(() => {
    if (kb && typing.current) setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
  }, [kb, scroller]);
  const lastSaid = [...msgs].reverse().find((m) => m.role === 'user')?.id;
  const updateDraft = (d: Draft) => setMsgs((m) => m.map((x) => (x.role === 'bot' && x.draft?.id === d.id ? { ...x, draft: d } : x)));

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput('');
    setMsgs((m) => [...m, { id: newId(), role: 'user', text }]);
    setBusy(true);
    scrollDown();
    try {
      const r = await readMeal(text, personal, { key: aiKey, enabled: store.profile.aiEnabled, provider: store.profile.aiProvider });
      if (!r.items.length) {
        setMsgs((m) => [...m, { id: newId(), role: 'bot', text: 'I couldn’t pick out any foods in that. Try something like “2 eggs and a slice of toast” or “a cup of rice with 5 oz salmon”.' }]);
      } else {
        const base = nav.date > today() ? today() : nav.date;
        const draft: Draft = {
          id: newId(),
          items: r.items,
          meal: r.meal ?? presetMeal ?? defaultMeal(),
          date: r.dayOffset ? addDays(today(), r.dayOffset) : base,
          source: r.source,
          note: r.aiProblem ? AI_NOTES[r.aiProblem] : undefined,
          status: 'open',
        };
        setMsgs((m) => [...m, { id: newId(), role: 'bot', draft }]);
      }
    } finally {
      setBusy(false);
      scrollDown();
    }
  };

  const log = (d: Draft) => {
    const next = drafts.log(d);
    updateDraft(next);
    nav.toast(`Logged ${int(next.logged?.kcal ?? 0)} kcal`);
  };
  const undo = (d: Draft) => {
    updateDraft(drafts.undo(d));
    nav.toast('Removed from diary');
  };

  const words = useMemo(
    () => speechHints([...store.profile.favorites, ...store.recentFoods(), ...store.profile.customFoods].map((f) => f.name)),
    [store],
  );
  const voice = useVoice((heard) => send(heard), { words, choose: (guesses) => bestGuess(guesses, personal), onInterrupted: (heard) => setInput((typed) => [typed.trim(), heard].filter(Boolean).join(' ')) });
  const voiceStart = useRef(voice.start);
  useEffect(() => {
    // Opened from the mic on the Diary: start listening right away
    if (startWithVoice) setTimeout(() => voiceStart.current(), 350);
  }, [startWithVoice]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader title="Assistant" onClose={nav.done} right={<Badge label={hasAi ? 'AI BOOST ON' : 'BUILT-IN'} tone={hasAi ? 'accent' : 'muted'} />} />
      <ScrollView ref={scroller} innerViewRef={content} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <RevealField.Provider value={reveal}>
        {msgs.map((m) =>
          m.role === 'user' ? (
            <Pressable
              key={m.id}
              onPress={() => setInput(m.text)}
              accessibilityHint="Puts these words back in the box so you can fix and resend them"
              style={({ pressed }) => ({ alignSelf: 'flex-end', maxWidth: '85%', opacity: pressed ? 0.8 : 1, gap: 3 })}
            >
              <View style={{ backgroundColor: t.accent, borderRadius: 18, borderBottomRightRadius: 6, paddingVertical: 10, paddingHorizontal: 14 }}>
                <Txt size={15} color={t.accentInk} weight="bodySemi">{m.text}</Txt>
              </View>
              {m.id === lastSaid ? <Txt size={11.5} color={t.faint} style={{ textAlign: 'right' }}>Wrong word? Tap to edit.</Txt> : null}
            </Pressable>
          ) : (
            <View key={m.id} style={{ gap: 10 }}>
              {m.text ? (
                <View style={{ alignSelf: 'flex-start', maxWidth: '92%', backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 18, borderBottomLeftRadius: 6, paddingVertical: 10, paddingHorizontal: 14, gap: 8 }}>
                  <Txt size={15}>{m.text}</Txt>
                  {m.id === 'intro' && !hasAi ? (
                    <Txt size={12.5} color={t.muted}>Want smarter reading of restaurant meals? Add an AI key in Settings (gear icon) → Assistant AI boost.</Txt>
                  ) : null}
                </View>
              ) : null}
              {m.examples ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {m.examples.map((e) => (
                    <Pressable key={e} onPress={() => send(e)} style={({ pressed }) => ({ maxWidth: '100%', borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: pressed ? t.surface2 : t.surface, paddingVertical: 7, paddingHorizontal: 12 })}>
                      <Txt size={13} color={t.accent} weight="bodyBold">{e}</Txt>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {m.draft ? <DraftCard draft={m.draft} personal={personal} onUpdate={updateDraft} onLog={() => log(m.draft!)} onUndo={() => undo(m.draft!)} /> : null}
            </View>
          ),
        )}
        </RevealField.Provider>
        {busy ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14 }}>
            <ActivityIndicator color={t.accent} size="small" />
            <Txt size={14} color={t.muted}>{hasAi ? 'Reading with AI…' : 'Reading…'}</Txt>
          </View>
        ) : null}
      </ScrollView>
      {voice.error ? (
        <Pressable onPress={voice.clearError} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.line }}>
          <Ionicons name="mic-off-outline" size={18} color={t.warn} />
          <Txt size={13} color={t.warn} weight="bodyBold" style={{ flex: 1 }}>{voice.error}</Txt>
          <Ionicons name="close" size={16} color={t.faint} />
        </Pressable>
      ) : null}
      <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: kb && !voice.listening ? kb + 10 : insets.bottom + 10, borderTopWidth: 1, borderTopColor: voice.listening ? t.grad1 : t.line, backgroundColor: t.bg }}>
        {voice.listening ? (
          <VoiceBar text={voice.partial} finishing={voice.finishing} onDone={voice.stop} onCancel={voice.cancel} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Tell me what you ate…"
              placeholderTextColor={t.faint}
              multiline
              onFocus={() => (typing.current = true)}
              onBlur={() => (typing.current = false)}
              autoFocus={!startWithVoice && !spoke}
              style={{ flex: 1, maxHeight: 120, minHeight: 46, borderWidth: 1, borderColor: input ? t.accent : t.line, borderRadius: 16, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, color: t.ink, backgroundColor: t.surface, fontFamily: fonts.bodySemi, fontSize: 16 }}
            />
            {!input.trim() ? (
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  nav.go({ type: 'photo', meal: presetMeal });
                }}
                disabled={busy}
                accessibilityLabel="Photo of your meal"
                style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accentSoft, borderWidth: 1, borderColor: t.accent, opacity: pressed ? 0.8 : 1 })}
              >
                <Ionicons name="camera" size={22} color={t.accent} />
              </Pressable>
            ) : null}
            {!input.trim() ? (
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setSpoke(true);
                  voice.start();
                }}
                disabled={busy}
                accessibilityLabel="Speak your meal"
                style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accentSoft, borderWidth: 1, borderColor: t.accent, opacity: pressed ? 0.8 : 1 })}
              >
                <Ionicons name="mic" size={22} color={t.accent} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => send()}
              disabled={!input.trim() || busy}
              accessibilityLabel="Send"
              style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: input.trim() && !busy ? t.accent : t.surface2, opacity: pressed ? 0.8 : 1 })}
            >
              <Ionicons name="arrow-up" size={22} color={input.trim() && !busy ? t.accentInk : t.faint} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
