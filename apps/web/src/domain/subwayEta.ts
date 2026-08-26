const ETA_EXPIRY_GRACE_SECONDS = 90;
const RELATIVE_ETA_MESSAGE = /\d+\s*(?:분|초).*후/;

export function subwayEtaDisplay(
  seconds: number | null,
  message: string,
  elapsedSeconds: number,
) {
  const expired =
    seconds !== null &&
    elapsedSeconds > seconds + ETA_EXPIRY_GRACE_SECONDS;
  return {
    remainingSeconds:
      seconds === null || expired
        ? null
        : Math.max(0, seconds - elapsedSeconds),
    message: expired
      ? "새로고침 필요"
      : seconds !== null && RELATIVE_ETA_MESSAGE.test(message)
        ? "도착 예상"
        : message,
  } as const;
}
