import assert from 'node:assert/strict';
import test from 'node:test';

import { createVoiceSession, joinHeard } from '../../src/voiceSession';

const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

function setup(over: Partial<Parameters<typeof createVoiceSession>[0]> = {}) {
  const calls: string[] = [];
  const done: string[] = [];
  const errors: string[] = [];
  const interrupted: string[] = [];
  let live = { listening: false, finishing: false, text: '' };
  const session = createVoiceSession({
    speech: {
      start: (continuous) => calls.push(continuous ? 'start' : 'start:once'),
      stop: () => calls.push('stop'),
      abort: () => calls.push('abort'),
    },
    onChange: (state) => (live = state),
    onDone: (text) => done.push(text),
    onError: (code) => errors.push(code),
    onInterrupted: (text, code) => interrupted.push(`${text}|${code}`),
    restartMs: 5, settleMs: 10, finishMs: 40, endAfterErrorMs: 10, maxMs: 2000, quietRounds: 3,
    ...over,
  });
  return { session, calls, done, errors, interrupted, live: () => live };
}

test('it keeps listening through pauses until the mic is tapped again', async () => {
  const { session, calls, done, live } = setup();
  session.begin();
  session.result(['I had 2 fried eggs'], true);
  session.result(['and 1'], false);
  assert.equal(live().text, 'I had 2 fried eggs and 1');
  await wait(60); // a long pause: nothing is sent
  assert.deepEqual(done, []);
  session.result(['and 1 pita'], true);
  assert.equal(live().listening, true);
  session.finish();
  session.ended();
  assert.deepEqual(done, ['I had 2 fried eggs and 1 pita']);
  assert.deepEqual(calls, ['start', 'stop']);
  assert.equal(live().listening, false);
});

test('when the phone stops listening on its own, it starts again and keeps what was said', async () => {
  const { session, calls, done } = setup();
  session.begin();
  session.result(['two eggs'], false);
  session.ended(); // the recognizer gave up without a final answer
  await wait(20);
  assert.deepEqual(calls, ['start', 'start']);
  session.result(['a banana'], true);
  session.finish();
  session.ended();
  assert.deepEqual(done, ['two eggs, a banana']);
});

test('silence errors restart quietly; only long silence gives up', async () => {
  const { session, calls, errors, done } = setup();
  session.begin();
  for (let i = 0; i < 2; i++) {
    session.failed('no-speech');
    session.ended();
    await wait(15);
  }
  assert.deepEqual([errors, done, calls.length], [[], [], 3]);
  session.failed('no-speech');
  session.ended();
  await wait(15);
  assert.deepEqual(errors, ['no-speech']);
  assert.equal(calls.length, 3);
});

test('after very long silence the words are handed back to check, not sent', async () => {
  const { session, done, errors, interrupted } = setup();
  session.begin();
  session.result(['oatmeal'], true);
  for (let i = 0; i < 4; i++) {
    session.ended();
    await wait(15);
  }
  assert.deepEqual([done, errors, interrupted], [[], [], ['oatmeal|no-speech']]);
});

/** The recognizer refuses to start, `times` times in a row. */
async function refuse(session: ReturnType<typeof setup>['session'], code: string, times: number) {
  for (let i = 0; i < times; i++) {
    session.failed(code);
    session.ended();
    await wait(110);
  }
}

test('a busy phone is waited for: the rest of the sentence is still heard', async () => {
  const { session, done, interrupted, calls } = setup();
  session.begin();
  session.result(['I had 2 fried eggs'], true);
  session.ended();
  await wait(15);
  await refuse(session, 'busy', 3);
  assert.deepEqual([done, interrupted], [[], []]);
  assert.ok(!calls.includes('start:once')); // still listening continuously
  session.result(['and 1 pita'], true);
  session.finish();
  session.ended();
  assert.deepEqual(done, ['I had 2 fried eggs and 1 pita']);
});

test('restarts wait longer each time the phone refuses', async () => {
  const { session, calls } = setup({ restartMs: 40 });
  session.begin();
  session.failed('busy');
  session.ended();
  await wait(60);
  assert.equal(calls.length, 2);
  session.failed('busy');
  session.ended();
  await wait(50); // the second wait is twice as long
  assert.equal(calls.length, 2);
  await wait(60);
  assert.equal(calls.length, 3);
  session.cancel();
});

test('lasting errors hand back what was heard, or say why', async () => {
  const heard = setup();
  heard.session.begin();
  heard.session.result(['two eggs'], true);
  await refuse(heard.session, 'network', 6);
  assert.deepEqual([heard.done, heard.interrupted], [[], ['two eggs|network']]);

  const nothing = setup();
  nothing.session.begin();
  await refuse(nothing.session, 'network', 6);
  assert.deepEqual([nothing.errors, nothing.interrupted], [['network'], []]);
});

test('a final answer that never comes does not hang the button', async () => {
  const { session, calls, done } = setup();
  session.begin();
  session.result(['a bowl of rice'], false);
  session.finish();
  await wait(70);
  assert.deepEqual(done, ['a bowl of rice']);
  assert.deepEqual(calls, ['start', 'stop', 'abort']);
});

test('the final answer arriving after the tap is included, even without an end', async () => {
  const { session, done } = setup();
  session.begin();
  session.result(['two eggs and'], false);
  session.finish();
  session.result(['two eggs and toast'], true);
  await wait(25);
  assert.deepEqual(done, ['two eggs and toast']);
});

test('permission problems stop at once with their reason', () => {
  const { session, errors, calls } = setup();
  session.begin();
  session.failed('not-allowed');
  session.ended();
  assert.deepEqual([errors, calls], [['not-allowed'], ['start']]);
});

test('a phone that cannot listen continuously falls back to one phrase at a time', async () => {
  const { session, calls, errors } = setup();
  session.begin();
  await refuse(session, 'audio-capture', 2);
  assert.deepEqual(calls, ['start', 'start', 'start:once']);
  assert.deepEqual(errors, []);
  session.cancel();
});

test('an error with no end event is still handled', async () => {
  const { session, errors } = setup();
  session.begin();
  session.failed('not-allowed');
  await wait(25);
  assert.deepEqual(errors, ['not-allowed']);
});

test('it stops by itself after the longest allowed time, and hands the words back', async () => {
  const { session, calls, done, interrupted } = setup({ maxMs: 30 });
  session.begin();
  session.result(['soup'], false);
  await wait(90);
  assert.deepEqual([done, interrupted], [[], ['soup|too-long']]);
  assert.ok(calls.includes('stop'));
});

test('leaving the app hands the words back instead of sending them', () => {
  const { session, done, interrupted } = setup();
  session.begin();
  session.result(['two eggs and'], false);
  session.interrupt('left-app');
  session.ended();
  assert.deepEqual([done, interrupted], [[], ['two eggs and|left-app']]);
  session.begin(); // the next recording is a normal one again
  session.result(['toast'], true);
  session.finish();
  session.ended();
  assert.deepEqual(done, ['toast']);
});

test('cancelling sends nothing, and later events are ignored', async () => {
  const { session, calls, done, errors, live } = setup();
  session.begin();
  session.result(['pizza'], false);
  session.cancel();
  session.result(['pizza slice'], true);
  session.ended();
  await wait(60);
  assert.deepEqual([done, errors, live().listening], [[], [], false]);
  assert.deepEqual(calls, ['start', 'abort']);
});

test('the best of the recognizer’s guesses is used for finished phrases', () => {
  const { session, done } = setup({ choose: (guesses) => guesses.find((g) => g.includes('pita')) ?? guesses[0] });
  session.begin();
  session.result(['a whole wheat pizza', 'a whole wheat pita'], true);
  session.finish();
  session.ended();
  assert.deepEqual(done, ['a whole wheat pita']);
});

test('phrases are joined without repeating, with a break before a new amount', () => {
  assert.equal(joinHeard(['I had a whole wheat', 'pita bread']), 'I had a whole wheat pita bread');
  assert.equal(joinHeard(['2 fried eggs', '1 pita']), '2 fried eggs, 1 pita');
  assert.equal(joinHeard(['two eggs.', 'a coffee']), 'two eggs. a coffee');
  assert.equal(joinHeard(['two eggs', 'two eggs and toast']), 'two eggs and toast');
  assert.equal(joinHeard(['Two eggs.', 'two eggs and toast', 'a banana']), 'two eggs and toast, a banana');
  assert.equal(joinHeard(['', 'milk', '  ']), 'milk');
  assert.equal(joinHeard(['coffee', 'coffee cake']), 'coffee coffee cake'); // said twice, not a repeat
  assert.equal(joinHeard(['a burger', 'a burger']), 'a burger, a burger');
});
