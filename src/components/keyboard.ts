import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, ScrollView, TextInput, View } from 'react-native';

/**
 * Height of the on-screen keyboard (0 when hidden).
 *
 * Android draws apps edge to edge, so the system no longer shrinks the screen when the keyboard
 * opens. Screens use this value as bottom padding to keep inputs and buttons above the keyboard.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/**
 * Keeps the field being typed in near the top of a scrolling screen, so the keyboard doesn't cover it
 * or the results that appear under it. Give the ScrollView `scroller` as its ref and `content` as its
 * innerViewRef, and call `reveal` when a field gets the cursor.
 */
export function useRevealField(keyboard: number) {
  const scroller = useRef<ScrollView>(null);
  const content = useRef<View>(null as unknown as View); // the type innerViewRef asks for; empty until mounted
  const field = useRef<TextInput | null>(null);
  const show = useCallback(() => {
    const input = field.current;
    if (!input?.isFocused() || !content.current) return;
    input.measureLayout(content.current, (_x, y) => scroller.current?.scrollTo({ y: Math.max(0, y - 24), animated: true }), () => {});
  }, []);
  useEffect(() => {
    if (!keyboard) return;
    const id = setTimeout(show, 80); // once the space for the keyboard is in place
    return () => clearTimeout(id);
  }, [keyboard, show]);
  const reveal = useCallback(
    (input: TextInput | null) => {
      field.current = input;
      setTimeout(show, 80);
    },
    [show],
  );
  return { scroller, content, reveal };
}
