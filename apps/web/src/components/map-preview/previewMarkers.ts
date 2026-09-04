import { Marker, Popup, type Map as MapLibreMapInstance } from "maplibre-gl";
import type { MapPreviewPoint } from "./mapPreviewPoints";

export type MapPreviewPointKey = MapPreviewPoint["key"];

export interface PreviewMarkerPool {
  reconcile(points: readonly MapPreviewPoint[], activePointKey: MapPreviewPointKey | null): void;
  destroy(): void;
}

interface MarkerEntry {
  point: MapPreviewPoint;
  readonly element: HTMLButtonElement;
  readonly marker: Marker;
  readonly popup: Popup;
  readonly onClick: (event: MouseEvent) => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
  readonly onPopupClose: () => void;
}

function popupContent(point: MapPreviewPoint) {
  const content = document.createElement("section");
  content.className = "map-preview-popup-detail";

  const name = document.createElement("strong");
  name.className = "map-preview-popup-detail__name";
  name.textContent = point.name;

  const detail = document.createElement("span");
  detail.className = "map-preview-popup-detail__meta";
  detail.textContent = point.detail;

  const distance = document.createElement("span");
  distance.className = "map-preview-popup-detail__distance";
  distance.textContent = `중심에서 ${Math.round(point.distance)}m`;

  content.append(name, detail, distance);
  return content;
}

function setPointAttributes(entry: MarkerEntry, point: MapPreviewPoint) {
  entry.point = point;
  entry.element.setAttribute("aria-label", point.accessibleName);
  entry.element.dataset.pointKey = point.key;
  entry.element.dataset.mode = point.mode;
  entry.element.dataset.markerShape = point.mode === "bus" ? "circle" : "diamond";
  if (!entry.element.hasAttribute("aria-pressed")) {
    entry.element.setAttribute("aria-pressed", "false");
    entry.element.dataset.active = "false";
  }
  entry.element.classList.toggle("map-preview-marker--bus", point.mode === "bus");
  entry.element.classList.toggle("map-preview-marker--subway", point.mode === "subway");
  entry.marker.setLngLat([point.coordinates[0], point.coordinates[1]]);
  entry.popup.setLngLat([point.coordinates[0], point.coordinates[1]]);
}

function sameDetail(left: MapPreviewPoint, right: MapPreviewPoint) {
  return (
    left.name === right.name && left.detail === right.detail && left.distance === right.distance
  );
}

export function createPreviewMarkerPool(
  map: MapLibreMapInstance,
  onActivePointChange: (key: MapPreviewPointKey | null) => void,
): PreviewMarkerPool {
  const entries = new Map<MapPreviewPointKey, MarkerEntry>();
  const container = map.getContainer();
  const suppressedPopupClose = new Set<MapPreviewPointKey>();
  let activeKey: MapPreviewPointKey | null = null;
  let restoreFocusKey: MapPreviewPointKey | null = null;
  let focusFrame: number | null = null;
  let destroyed = false;

  const syncActiveAttributes = () => {
    for (const [key, entry] of entries) {
      const active = key === activeKey;
      entry.element.setAttribute("aria-pressed", String(active));
      entry.element.dataset.active = String(active);
      entry.element.classList.toggle("is-active", active);
    }
  };

  const closeActive = () => {
    if (activeKey === null) return;
    const key = activeKey;
    const entry = entries.get(key);
    activeKey = null;
    restoreFocusKey = null;
    if (entry?.popup.isOpen()) {
      suppressedPopupClose.add(key);
      entry.popup.remove();
      suppressedPopupClose.delete(key);
    }
    syncActiveAttributes();
  };

  const open = (key: MapPreviewPointKey, notify: boolean) => {
    const entry = entries.get(key);
    if (!entry) return;
    if (activeKey !== key) closeActive();
    activeKey = key;
    syncActiveAttributes();
    if (!entry.popup.isOpen()) {
      entry.popup.setLngLat([entry.point.coordinates[0], entry.point.coordinates[1]]).addTo(map);
    }
    if (notify) onActivePointChange(key);
  };

  const scheduleFocusRestore = (key: MapPreviewPointKey) => {
    if (focusFrame !== null) cancelAnimationFrame(focusFrame);
    focusFrame = requestAnimationFrame(() => {
      focusFrame = null;
      const element = entries.get(key)?.element;
      if (element?.isConnected) element.focus();
    });
  };

  const createEntry = (point: MapPreviewPoint): MarkerEntry => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "map-preview-marker";
    element.style.inlineSize = "44px";
    element.style.blockSize = "44px";
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      element.style.transitionDuration = "1ms";
    }

    const marker = new Marker({ element });
    const popup = new Popup({
      closeButton: true,
      closeOnClick: true,
      focusAfterOpen: true,
      className: "map-preview-popup",
      offset: 22,
    }).setDOMContent(popupContent(point));
    let entry: MarkerEntry;
    const onClick = (event: MouseEvent) => {
      event.stopPropagation();
      open(entry.point.key, true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      open(entry.point.key, true);
    };
    const onPopupClose = () => {
      const key = entry.point.key;
      if (suppressedPopupClose.has(key) || activeKey !== key) return;
      activeKey = null;
      syncActiveAttributes();
      onActivePointChange(null);
      if (restoreFocusKey === key) scheduleFocusRestore(key);
      restoreFocusKey = null;
    };
    entry = { point, element, marker, popup, onClick, onKeyDown, onPopupClose };
    element.addEventListener("click", onClick);
    element.addEventListener("keydown", onKeyDown);
    popup.on("close", onPopupClose);
    setPointAttributes(entry, point);
    marker.addTo(map);
    return entry;
  };

  const removeEntry = (entry: MarkerEntry) => {
    const key = entry.point.key;
    if (activeKey === key) closeActive();
    entry.element.removeEventListener("click", entry.onClick);
    entry.element.removeEventListener("keydown", entry.onKeyDown);
    entry.popup.off("close", entry.onPopupClose);
    entry.popup.remove();
    entry.marker.remove();
    entries.delete(key);
  };

  const onContainerKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || activeKey === null) return;
    const entry = entries.get(activeKey);
    if (!entry?.popup.isOpen()) return;
    event.preventDefault();
    const popupElement = entry.popup.getElement();
    restoreFocusKey = popupElement.contains(document.activeElement) ? activeKey : null;
    entry.popup.remove();
  };

  const onContainerClick = (event: MouseEvent) => {
    if (activeKey === null) return;
    const entry = entries.get(activeKey);
    if (!entry?.popup.isOpen()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const popupElement = entry.popup.getElement();
    if (popupElement.contains(target) && target.closest(".maplibregl-popup-close-button")) {
      restoreFocusKey = popupElement.contains(document.activeElement) ? activeKey : null;
    }
  };

  container.addEventListener("keydown", onContainerKeyDown);
  container.addEventListener("click", onContainerClick, true);

  return {
    reconcile(points, requestedActiveKey) {
      if (destroyed) return;
      const requestedKeys = new Set(points.map((point) => point.key));
      for (const [key, entry] of [...entries]) {
        if (!requestedKeys.has(key)) removeEntry(entry);
      }

      for (const [index, point] of points.entries()) {
        const existing = entries.get(point.key);
        if (existing) {
          const detailChanged = !sameDetail(existing.point, point);
          setPointAttributes(existing, point);
          if (detailChanged) {
            existing.popup.setDOMContent(popupContent(point));
          }
          existing.element.style.zIndex = String(index + 1);
          continue;
        }
        const created = createEntry(point);
        created.element.style.zIndex = String(index + 1);
        entries.set(point.key, created);
      }

      if (requestedActiveKey !== null && !entries.has(requestedActiveKey)) {
        closeActive();
        onActivePointChange(null);
        return;
      }
      if (requestedActiveKey === null) closeActive();
      else open(requestedActiveKey, false);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      container.removeEventListener("keydown", onContainerKeyDown);
      container.removeEventListener("click", onContainerClick, true);
      if (focusFrame !== null) {
        cancelAnimationFrame(focusFrame);
        focusFrame = null;
      }
      for (const entry of [...entries.values()]) removeEntry(entry);
    },
  };
}
