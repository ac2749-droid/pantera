import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createVoiceSession, VoiceState } from '../voiceSession';

const ERRORS: Record<string, string> = {
  'not-allowed': 'Pantera needs microphone permission. You can turn it on in your phone’s Settings → Apps → Pantera → Permissions.',
  'no-speech': 'I didn’t hear anything. Tap the mic, say what you ate, then tap again.',
  'speech-timeout': 'I didn’t hear anything. Tap the mic, say what you ate, then tap again.',
  network: 'Voice needs an internet connection right now. You can type instead.',
  'service-not-allowed': 'Speech recognition isn’t available. Make sure the Google app is installed and up to date.',
  'language-not-supported': 'Speech recognition isn’t available in this language on your phone.',
  busy: 'The microphone is busy. Try again in a moment.',
  'audio-capture': 'Couldn’t use the microphone. Try again.',
};
// A pause this long is still part of the same sentence on phones that only take one phrase at a time
const PATIENCE_MS = 6000;
const IDLE: VoiceState = { listening: false, finishing: false, text: '' };

type Options = {
  /** Words to listen out for, such as the foods you eat. */
  words?: string[];
  /** Picks among the recognizer's guesses. */
  choose?: (guesses: string[]) => string;
  /** Listening stopped without a tap (long quiet, trouble, leaving the app): the words so far, to check. */
  onInterrupted: (text: string) => void;
};

const buzz = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

/**
 * Speech-to-text with the phone's own recognizer (Google on Android), free and no key needed.
 * It listens from `start` until `stop`, however long you pause, then calls onFinal with everything said.
 */
export function useVoice(onFinal: (text: string) => void, options: Options) {
  const [live, setLive] = useState<VoiceState>(IDLE);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ onFinal, options });
  useEffect(() => {
    latest.current = { onFinal, options };
  });

  const session = useRef<ReturnType<typeof createVoiceSession> | null>(null);

  useEffect(() => {
    const made: ReturnType<typeof createVoiceSession> = createVoiceSession({
      speech: {
        start: (continuous) => {
          try {
            ExpoSpeechRecognitionModule.start({
              lang: 'en-US',
              interimResults: true,
              continuous,
              addsPunctuation: true,
              maxAlternatives: 5,
              contextualStrings: latest.current.options.words,
              androidIntentOptions: continuous
                ? undefined
                : { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: PATIENCE_MS, EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: PATIENCE_MS },
            });
          } catch {
            made.failed('service-not-allowed');
          }
        },
        stop: () => {
          try {
            ExpoSpeechRecognitionModule.stop();
          } catch {}
        },
        abort: () => {
          try {
            ExpoSpeechRecognitionModule.abort();
          } catch {}
        },
      },
      onChange: setLive,
      onDone: (text) => latest.current.onFinal(text),
      onError: (code) => setError(ERRORS[code] ?? 'Voice input stopped. Try again, or type instead.'),
      choose: (guesses) => latest.current.options.choose?.(guesses) ?? guesses[0],
      onInterrupted: (text) => {
        setError('I stopped listening early. Check your words before you use them.');
        latest.current.options.onInterrupted(text);
      },
    });
    session.current = made;
    // Leaving the app keeps what was said, for you to check when you come back
    const watch = AppState.addEventListener('change', (state) => {
      if (state === 'background') made.interrupt('left-app');
    });
    return () => {
      watch.remove();
      made.cancel();
      session.current = null;
    };
  }, []);

  // Moving to another screen turns the microphone off
  useFocusEffect(useCallback(() => () => session.current?.cancel(), []));

  // Every screen with a mic hears these; a session that isn't recording ignores them
  useSpeechRecognitionEvent('result', (e) => session.current?.result(e.results.map((r) => r.transcript), e.isFinal));
  useSpeechRecognitionEvent('end', () => session.current?.ended());
  useSpeechRecognitionEvent('error', (e) => session.current?.failed(e.error));

  const start = async () => {
    setError(null);
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setError(ERRORS['service-not-allowed']);
        return;
      }
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setError(ERRORS['not-allowed']);
        return;
      }
      buzz();
      session.current?.begin();
    } catch {
      setError('Voice input isn’t available on this phone. You can type instead.');
    }
  };
  const stop = () => {
    buzz();
    session.current?.finish();
  };

  return {
    listening: live.listening,
    /** Waiting for the last words after the second tap. */
    finishing: live.finishing,
    /** Everything heard so far. */
    partial: live.text,
    error,
    start,
    stop,
    cancel: () => session.current?.cancel(),
    clearError: () => setError(null),
  };
}
