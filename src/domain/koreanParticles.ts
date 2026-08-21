/** Korean particle helpers: choose the correct particle form based on the
 * final jamo (batchim) of the preceding noun phrase.
 *
 * Hangul syllables are U+AC00–U+D7A3; `(code - 0xAC00) % 28 === 0` means
 * the syllable ends in a vowel (no batchim). */

function hasBatchim(name: string): boolean {
  const last = name.charCodeAt(name.length - 1);
  return last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
}

function endsWithRieul(name: string): boolean {
  const last = name.charCodeAt(name.length - 1);
  return last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 === 8;
}

/** 을/를 — object particle. */
export function koreanObjectParticle(name: string): string {
  return hasBatchim(name) ? "을" : "를";
}

/** 와/과 — "with/and" particle. */
export function koreanWithParticle(name: string): string {
  return hasBatchim(name) ? "과" : "와";
}

/** 으로/로 — direction/means particle. ㄹ-final and vowel-final take 로. */
export function koreanDirectionParticle(name: string): string {
  return endsWithRieul(name) || !hasBatchim(name) ? "로" : "으로";
}

/** 이/가 — subject particle. */
export function koreanSubjectParticle(name: string): string {
  return hasBatchim(name) ? "이" : "가";
}
