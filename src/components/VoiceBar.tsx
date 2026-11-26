import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useTheme } from '../theme';
import { GhostButton, Txt } from '../ui';
import { Arrive, Pressy, Pulse } from './motion';

/** Shown while recording: everything heard so far, and one big button to finish. */
export function VoiceBar({ text, finishing, onDone, onCancel }: { text: string; finishing: boolean; onDone: () => void; onCancel: () => void }) {
  const t = useTheme();
  const scroller = useRef<ScrollView>(null);
  return (
    <Arrive style={{ gap: 12 }}>
      <ScrollView
        ref={scroller}
        style={{ maxHeight: 170 }}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
        accessibilityLiveRegion="polite"
      >
        <Txt size={18} weight="bodySemi" color={text ? t.ink : t.muted} style={{ lineHeight: 26 }}>
          {text || 'Listening… say everything you ate.'}
        </Txt>
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <GhostButton label="Cancel" onPress={onCancel} />
        <Txt size={13} color={t.muted} style={{ flex: 1, textAlign: 'right' }}>
          {finishing ? 'Getting your last words…' : 'Pause whenever you like.\nTap when you’re done.'}
        </Txt>
        <View style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
          {finishing ? null : <Pulse color={t.grad1} />}
          <Pressy
            onPress={onDone}
            disabled={finishing}
            accessibilityRole="button"
            accessibilityLabel="Finish recording"
            style={{ width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: t.grad1 }}
          >
            {finishing ? <ActivityIndicator color={t.onGrad} /> : <Ionicons name="checkmark" size={30} color={t.onGrad} />}
          </Pressy>
        </View>
      </View>
    </Arrive>
  );
}
