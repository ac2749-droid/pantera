/**
 * One voice recording, from the tap that starts it to the tap that finishes it. The phone's recognizer
 * stops whenever it likes (usually at the first pause), so this keeps what was heard and starts it again.
 */

export type SpeechPort = {
  /** `continuous`: keep going through pauses, where the phone supports it. */
  start(continuous: boolean): void;
  stop(): void;
  abort(): void;
};

export type VoiceState = { listening: boolean; finishing: boolean; text: string };

// Errors that only mean nobody spoke for a while
const QUIET = new Set(['no-speech', 'speech-timeout', 'nomatch']);
// Errors that starting again won't fix
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported']);
// A phone still closing its last session often refuses a few starts in a row, so waits double each time
const MOST_FAILURES = 6;
const LONGEST_WAIT = 16; // times the first wait
const CONTINUOUS_TRIES = 2; // refusals before giving up on continuous listening, if it never worked

const STARTS_AMOUNT = /^(?:\d|(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|half|another|some)\s)/i;
const plain = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

// A longer version of what was already heard. One word isn't enough to tell: "coffee", then "coffee cake".
const repeats = (longer: string, heard: string) => heard.includes(' ') && longer.startsWith(`${heard} `);

/** The phrases heard, as one sentence. Recognizers sometimes repeat earlier words, which are dropped. */
export function joinHeard(phrases: string[]): string {
  let kept: string[] = [];
  for (const phrase of phrases.map((p) => p.trim()).filter(Boolean)) {
    const now = plain(phrase);
    if (kept.length && repeats(now, plain(kept.join(' ')))) kept = [phrase]; // everything so far, and more
    else if (kept.length && repeats(now, plain(kept[kept.length - 1]))) kept[kept.length - 1] = phrase;
    else kept.push(phrase);
  }
  return kept.reduce((text, next) => {
    if (!text) return next;
    return `${text}${!/[,.;!?]$/.test(text) && STARTS_AMOUNT.test(next) ? ',' : ''} ${next}`;
  }, '');
}

export function createVoiceSession(options: {
  speech: SpeechPort;
  onChange: (state: VoiceState) => void;
  /** What was said, when the person finishes. */
  onDone: (text: string) => void;
  onError: (code: string) => void;
  /** Listening had to stop on its own: what was heard so far, to be checked before it is used. */
  onInterrupted: (text: string, code: string) => void;
  /** Picks among the recognizer's guesses for a finished phrase. */
  choose?: (guesses: string[]) => string;
  restartMs?: number;
  settleMs?: number;
  finishMs?: number;
  endAfterErrorMs?: number;
  maxMs?: number;
  quietRounds?: number;
}) {
  const {
    speech, onChange, onDone, onError, onInterrupted, choose = (guesses: string[]) => guesses[0],
    restartMs = 150, settleMs = 600, finishMs = 2500, endAfterErrorMs = 800, maxMs = 120_000, quietRounds = 8,
  } = options;

  let state: 'idle' | 'listening' | 'finishing' = 'idle';
  let phrases: string[] = [];
  let partial = ''; // the phrase still being spoken
  let continuous = true;
  let running = false; // the recognizer is on
  let heard = false; // something arrived since it was last started
  let quiet = 0;
  let failures = 0;
  let error: string | undefined;
  let cutShort: string | undefined; // why it is stopping, when the person didn't ask it to
  const timers: Partial<Record<'max' | 'restart' | 'finish' | 'error', ReturnType<typeof setTimeout>>> = {};

  const after = (name: keyof typeof timers, ms: number, run: () => void) => {
    clearTimeout(timers[name]);
    timers[name] = setTimeout(run, ms);
  };
  const clearTimers = () => Object.values(timers).forEach(clearTimeout);
  const text = () => joinHeard([...phrases, partial]);
  const changed = () => onChange({ listening: state !== 'idle', finishing: state === 'finishing', text: state === 'idle' ? '' : text() });

  const start = () => {
    running = true;
    heard = false;
    error = undefined;
    speech.start(continuous);
  };

  const keepPartial = () => {
    if (partial) phrases.push(partial);
    partial = '';
  };

  const conclude = (reason?: string, interrupted = false) => {
    if (state === 'idle') return;
    keepPartial();
    const said = joinHeard(phrases);
    state = 'idle';
    clearTimers();
    if (running) {
      running = false;
      speech.abort();
    }
    changed();
    if (!said) onError(reason ?? 'no-speech');
    else if (interrupted || cutShort) onInterrupted(said, cutShort ?? reason ?? 'no-speech');
    else onDone(said);
  };

  const ended = () => {
    if (state === 'idle' || !running) return;
    running = false;
    clearTimeout(timers.error);
    if (state === 'finishing') return conclude(error);
    keepPartial();
    const reason = error;
    let wait = restartMs;
    if (reason && !QUIET.has(reason)) {
      failures++;
      // Some phones can't listen continuously: try one phrase at a time before giving up
      const neverWorked = continuous && !phrases.length && reason !== 'not-allowed';
      if (neverWorked && (FATAL.has(reason) || failures >= CONTINUOUS_TRIES)) continuous = false;
      else if (FATAL.has(reason) || failures >= MOST_FAILURES) return conclude(reason, true);
      wait = restartMs * Math.min(LONGEST_WAIT, 2 ** (failures - 1));
    } else {
      quiet = heard ? 0 : quiet + 1;
      if (quiet >= quietRounds) return conclude(reason, true);
    }
    changed();
    after('restart', wait, start);
  };

  const finish = () => {
    if (state !== 'listening') return;
    state = 'finishing';
    clearTimeout(timers.restart);
    changed();
    if (!running) return conclude();
    speech.stop();
    // Don't leave the button spinning if the phone never answers
    after('finish', finishMs, () => conclude());
  };

  /** Stops for a reason other than the person's tap, so the words are handed back to be checked. */
  const interrupt = (why: string) => {
    if (state !== 'listening') return;
    cutShort = why;
    finish();
  };

  return {
    begin(): void {
      if (state !== 'idle') return;
      state = 'listening';
      phrases = [];
      partial = '';
      continuous = true;
      quiet = 0;
      failures = 0;
      cutShort = undefined;
      changed();
      after('max', maxMs, () => interrupt('too-long'));
      start();
    },
    finish,
    interrupt,
    cancel(): void {
      if (state === 'idle') return;
      state = 'idle';
      clearTimers();
      if (running) {
        running = false;
        speech.abort();
      }
      changed();
    },
    result(guesses: string[], final: boolean): void {
      if (state === 'idle') return;
      const said = ((final ? choose(guesses) : guesses[0]) ?? '').trim();
      if (!said) return;
      heard = true;
      quiet = 0;
      failures = 0;
      if (final) {
        phrases.push(said);
        partial = '';
      } else partial = said;
      changed();
      if (state === 'finishing' && final) after('finish', settleMs, () => conclude());
    },
    failed(code: string): void {
      if (state === 'idle' || !running || code === 'aborted') return;
      error = code;
      // The end event normally follows; if it doesn't, carry on without it
      after('error', endAfterErrorMs, ended);
    },
    ended,
  };
}
