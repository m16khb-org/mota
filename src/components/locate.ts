/**
 * Shared 현위치 (locate-me) boundary for the map pickers and the stage.
 *
 * The browser geolocation API happily satisfies a request with a cached or
 * network-based (Wi-Fi/cell) fix whose accuracy radius can span hundreds of
 * meters to kilometers — centered on a landmark the user is NOT standing at.
 * Accepting such a fix silently pans the map to a wrong location, so every
 * caller goes through this gate instead of `getCurrentPosition` directly.
 */

/** Fixes worse than this are rejected: the nearby-stop search radius is
 * 800 m, so a center off by more than this misleads stop picking. */
const MAX_LOCATE_ACCURACY_METERS = 200;

const LOCATE_TIMEOUT_MS = 8_000;

export type LocateResult =
  | {
      readonly kind: "located";
      readonly lat: number;
      readonly lng: number;
      /** 95% confidence radius in meters, as reported by the platform. */
      readonly accuracy: number;
    }
  | { readonly kind: "unsupported" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "inaccurate"; readonly accuracy: number };

export function requestCurrentPosition(): Promise<LocateResult> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ kind: "unsupported" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (!Number.isFinite(accuracy) || accuracy > MAX_LOCATE_ACCURACY_METERS) {
          resolve({ kind: "inaccurate", accuracy: Number.isFinite(accuracy) ? accuracy : Number.POSITIVE_INFINITY });
          return;
        }
        resolve({ kind: "located", lat: latitude, lng: longitude, accuracy });
      },
      () => resolve({ kind: "unavailable" }),
      {
        enableHighAccuracy: true,
        timeout: LOCATE_TIMEOUT_MS,
        // Never accept a cached fix: it can be where the user WAS a minute
        // ago, not where they are now.
        maximumAge: 0,
      },
    );
  });
}

/** Maps a rejected fix to user-facing Korean copy; callers pair it with
 * their own retry affordance. */
export function locateFailureNotice(result: LocateResult): string | null {
  switch (result.kind) {
    case "located":
      return null;
    case "unsupported":
      return "이 브라우저에서는 현재 위치를 사용할 수 없습니다.";
    case "unavailable":
      return "현재 위치를 확인하지 못했습니다. 위치 권한을 확인한 뒤 다시 시도해 주세요.";
    case "inaccurate": {
      const meters = result.accuracy;
      const described = Number.isFinite(meters)
        ? `약 ${Math.round(meters)}m라`
        : "매우 넓어";
      return `현재 위치의 오차 범위가 ${described} 정확한 위치를 잡지 못했어요. 창가나 실외에서 다시 시도해 주세요.`;
    }
  }
}
