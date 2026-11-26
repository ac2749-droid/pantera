/** What photo logging says about privacy and about things going wrong. Kept apart so it can be tested. */
import type { AiProvider } from './ai';
import type { PhotoFailure } from './photo';

export const providerName = (p: AiProvider) => (p === 'meta' ? 'Meta' : 'Google');

/** Shown before the first photo, and again if you switch provider. Keep in step with docs/privacy-policy-draft.md. */
export function noticeFor(provider: AiProvider): { points: string[]; accept: string } {
  if (provider === 'meta') {
    return {
      points: [
        'The photo goes to Meta, under your own key, only when you tap Find foods.',
        'Meta handles it under the terms of your account there, and charges your account for each photo.',
        'Leave faces, documents and anything private out of the picture.',
        'Pantera shrinks the photo and removes its location data before sending, and keeps no copy.',
      ],
      accept: 'I understand, continue',
    };
  }
  return {
    points: [
      'The photo goes to Google (Gemini), under your own key, only when you tap Find foods.',
      'With a free key, Google may use your photos and its answers to improve its products, and people may review them. With a paid key it doesn’t, though it keeps them for a while to check for misuse.',
      'Leave faces, documents and anything private out of the picture.',
      'Google’s keys are for people 18 or older.',
      'In the European Economic Area, Switzerland and the United Kingdom, the free key isn’t allowed. You need a paid key there.',
      'Pantera shrinks the photo and removes its location data before sending, and keeps no copy.',
    ],
    accept: 'I’m 18 or older, continue',
  };
}

export type FailureText = {
  title: string;
  detail: string;
  retry?: boolean; // sending the same photo again may work
  settings?: boolean; // the fix is in Settings
};

export function failureText(reason: PhotoFailure, provider: AiProvider): FailureText {
  const who = providerName(provider);
  switch (reason) {
    case 'network':
      return { title: `Couldn’t reach ${who}`, detail: 'Check your internet connection and try again. It may also have taken too long.', retry: true };
    case 'rate_limit':
      return { title: 'Your AI limit is used up for now', detail: 'Keys allow a limited number of requests a minute and a day. Wait a while and try again, or log this meal another way.', retry: true };
    case 'bad_key':
      return { title: 'Your key was rejected', detail: 'Open Settings, paste the key again and test it.', retry: true, settings: true };
    case 'no_credit':
      return provider === 'meta'
        ? { title: 'Your Meta account is out of credit', detail: 'Add credit at dev.meta.ai, or switch to Google in Settings.', retry: true, settings: true }
        : { title: 'Google wants billing on this key', detail: 'Check the key’s plan at aistudio.google.com, or use another key.', retry: true, settings: true };
    case 'region':
      return { title: 'This key can’t be used where you are', detail: 'Google needs a paid key in the European Economic Area, Switzerland and the United Kingdom, and isn’t offered in some countries.', settings: true };
    case 'overloaded':
      return { title: `${who} is busy right now`, detail: 'Try again in a moment.', retry: true };
    case 'blocked':
      return { title: `${who} wouldn’t read this photo`, detail: 'Try another photo that shows just the food.' };
    case 'no_food':
      return { title: 'No food found in this photo', detail: 'Get closer, use good light, and fit the whole plate in.' };
    case 'cancelled':
      return { title: 'Stopped', detail: 'The photo wasn’t read.', retry: true };
    case 'bad_response':
      return { title: 'The answer didn’t make sense', detail: 'Try again, or take a clearer photo.', retry: true };
  }
}
