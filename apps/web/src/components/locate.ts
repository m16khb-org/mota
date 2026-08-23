/**
 * Shared 현위치 (locate-me) boundary for the map pickers and the stage.
 *
 * The platform's accuracy radius is NOT a reliable rejection signal: a fix
 * can be centered exactly right while reporting a conservative multi-
 * kilometer radius (IP-based fallback does this constantly). Rejecting on
 * radius broke locate entirely for such devices, so coarse fixes are
 * ACCEPTED and flagged: the map still pans, and the caller shows a soft
 * notice so the user knows to double-check the area.
 */

/** Fixes above this radius are flagged as coarse in the notice. */
const COARSE_LOCATE_ACCURACY_METERS = 200;

/** Fixes at or above this radius are almost certainly IP-based fallback
 * (no GPS/Wi-Fi source reached the browser): the center is the ISP's
 * registered area, not the user. No app-side retry can improve this — the
 * notice must point at device settings. */
const IP_FALLBACK_ACCURACY_METERS = 3_000;

const LOCATE_TIMEOUT_MS = 8_000;

export type LocateResult =
  | {
      readonly kind: "located";
      readonly lat: number;
      readonly lng: number;
      /** 95% confidence radius in meters, as reported by the platform. */
      readonly accuracy: number;
      /** True when the platform itself admits a wide radius. */
      readonly coarse: boolean;
    }
  | { readonly kind: "unsupported" }
  | { readonly kind: "unavailable" };

export function requestCurrentPosition(): Promise<LocateResult> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ kind: "unsupported" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const usable = Number.isFinite(accuracy);
        resolve({
          kind: "located",
          lat: latitude,
          lng: longitude,
          accuracy: usable ? accuracy : Number.POSITIVE_INFINITY,
          coarse: !usable || accuracy > COARSE_LOCATE_ACCURACY_METERS,
        });
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

/** Notice for a fix the platform flagged as wide. The map still moved; this
 * tells the user the center may be off. Null for precise fixes. */
export function locateCoarseNotice(result: LocateResult): string | null {
  if (result.kind !== "located" || !result.coarse) {
    return null;
  }
  const meters = result.accuracy;
  if (!Number.isFinite(meters) || meters >= IP_FALLBACK_ACCURACY_METERS) {
    return "기기가 대략적인 위치(IP 기반)만 알려주고 있어요. 기기 설정에서 위치 서비스를 켜고 브라우저에 정확한 위치 권한을 허용한 뒤 다시 시도해 주세요.";
  }
  const described =
    meters >= 1000
      ? `약 ${Math.round(meters / 1000)}km`
      : `약 ${Math.round(meters)}m`;
  return `위치 오차가 ${described} 있어요. 내 위치가 아니라면 지도를 직접 옮겨 주세요.`;
}

/** Notice for a locate that produced no fix at all. */
export function locateFailureNotice(result: LocateResult): string | null {
  switch (result.kind) {
    case "located":
      return null;
    case "unsupported":
      return "이 브라우저에서는 현재 위치를 사용할 수 없습니다.";
    case "unavailable":
      return "현재 위치를 확인하지 못했습니다. 위치 권한을 확인한 뒤 다시 시도해 주세요.";
  }
}
