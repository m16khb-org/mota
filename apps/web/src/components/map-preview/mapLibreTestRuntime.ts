import { vi } from "vitest";

type Listener = (event: Record<string, unknown>) => void;

export const mapInstances: MockMap[] = [];
export const navigationControls: MockNavigationControl[] = [];
export const markerInstances: MockMarker[] = [];
export const popupInstances: MockPopup[] = [];
export const workerUrls: string[] = [];
let constructorFailure: Error | null = null;

export class MockNavigationControl {
  readonly options: Record<string, unknown>;

  constructor(options: Record<string, unknown> = {}) {
    this.options = options;
    navigationControls.push(this);
  }
}

export class MockMap {
  readonly options: Record<string, unknown>;
  readonly listeners = new Map<string, Set<Listener>>();
  readonly canvasContainer = document.createElement("div");
  center = { lng: 127.1253, lat: 37.5366 };
  zoom = 15;
  pitch = 42;
  bearing = -20;
  buildingLayer: object | undefined = { id: "building-3d" };
  removed = false;
  readonly addControl = vi.fn();
  readonly removeControl = vi.fn();
  readonly resize = vi.fn();
  readonly jumpTo = vi.fn((options: { center?: readonly [number, number] }) => {
    if (options.center) {
      this.center = { lng: options.center[0], lat: options.center[1] };
    }
    this.emit("moveend");
    return this;
  });
  readonly remove = vi.fn(() => {
    this.removed = true;
  });

  constructor(options: Record<string, unknown>) {
    if (constructorFailure) throw constructorFailure;
    this.options = options;
    const center = options.center as readonly [number, number] | undefined;
    if (center) this.center = { lng: center[0], lat: center[1] };
    (options.container as HTMLElement).appendChild(this.canvasContainer);
    mapInstances.push(this);
  }

  on(type: string, listener: Listener) {
    let listeners = this.listeners.get(type);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(type, listeners);
    }
    listeners.add(listener);
    return this;
  }

  off(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
    return this;
  }

  emit(type: string, event: Record<string, unknown> = {}) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener({ type, target: this, ...event });
    }
  }

  getCenter() {
    return this.center;
  }

  getZoom() {
    return this.zoom;
  }

  getPitch() {
    return this.pitch;
  }

  getBearing() {
    return this.bearing;
  }

  getContainer() {
    return this.options.container as HTMLElement;
  }

  getCanvasContainer() {
    return this.canvasContainer;
  }

  getLayer(id: string) {
    return id === "building-3d" ? this.buildingLayer : undefined;
  }

  listenerCount() {
    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }
}

export class MockMarker {
  readonly options: { readonly element?: HTMLElement };
  readonly element: HTMLElement;
  coordinates: readonly [number, number] | null = null;
  map: MockMap | null = null;
  removed = false;
  readonly setLngLat = vi.fn((coordinates: readonly [number, number]) => {
    this.coordinates = coordinates;
    return this;
  });
  readonly addTo = vi.fn((map: MockMap) => {
    this.map = map;
    this.removed = false;
    map.getCanvasContainer().appendChild(this.element);
    return this;
  });
  readonly remove = vi.fn(() => {
    this.removed = true;
    this.map = null;
    this.element.remove();
    return this;
  });

  constructor(options: { readonly element?: HTMLElement } = {}) {
    this.options = options;
    this.element = options.element ?? document.createElement("div");
    markerInstances.push(this);
  }

  getElement() {
    return this.element;
  }
}

export class MockPopup {
  readonly options: Record<string, unknown>;
  readonly listeners = new Map<string, Set<() => void>>();
  coordinates: readonly [number, number] | null = null;
  content: Node | null = null;
  map: MockMap | null = null;
  element: HTMLElement | null = null;
  readonly setLngLat = vi.fn((coordinates: readonly [number, number]) => {
    this.coordinates = coordinates;
    return this;
  });
  readonly setDOMContent = vi.fn((content: Node) => {
    this.content = content;
    if (this.element) this.mountContent();
    return this;
  });
  readonly addTo = vi.fn((map: MockMap) => {
    this.remove();
    this.map = map;
    this.element = document.createElement("div");
    this.element.className = "maplibregl-popup";
    this.mountContent();
    map.getCanvasContainer().appendChild(this.element);
    this.emit("open");
    this.element
      .querySelector<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])")
      ?.focus();
    return this;
  });
  readonly remove = vi.fn(() => {
    const wasOpen = this.map !== null;
    this.element?.remove();
    this.element = null;
    this.map = null;
    if (wasOpen) this.emit("close");
    return this;
  });

  constructor(options: Record<string, unknown> = {}) {
    this.options = options;
    popupInstances.push(this);
  }

  on(type: string, listener: () => void) {
    let listeners = this.listeners.get(type);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(type, listeners);
    }
    listeners.add(listener);
    return this;
  }

  off(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
    return this;
  }

  isOpen() {
    return this.map !== null;
  }

  getElement() {
    if (!this.element) throw new Error("Popup is not open");
    return this.element;
  }

  listenerCount() {
    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }

  private emit(type: string) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  private mountContent() {
    if (!this.element || !this.content) return;
    this.element.replaceChildren(this.content);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "maplibregl-popup-close-button";
    close.setAttribute("aria-label", "팝업 닫기");
    close.addEventListener("click", () => this.remove());
    this.element.appendChild(close);
  }
}

export function resetMapLibreRuntime() {
  mapInstances.length = 0;
  navigationControls.length = 0;
  markerInstances.length = 0;
  popupInstances.length = 0;
  workerUrls.length = 0;
  constructorFailure = null;
}

export function setWorkerUrl(value: string) {
  workerUrls.push(value);
}

export function failMapConstructionWith(error: Error) {
  constructorFailure = error;
}

export interface ResizeObserverDouble {
  readonly callback: ResizeObserverCallback;
  readonly observe: ReturnType<typeof vi.fn>;
  readonly disconnect: ReturnType<typeof vi.fn>;
}

export const resizeObservers: ResizeObserverDouble[] = [];

export function installResizeObserver() {
  resizeObservers.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      readonly callback: ResizeObserverCallback;
      readonly observe = vi.fn();
      readonly unobserve = vi.fn();
      readonly disconnect = vi.fn();

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        resizeObservers.push(this);
      }
    },
  );
}

export function installAnimationFrames() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => callbacks.delete(id)),
  );
  return {
    pending: () => callbacks.size,
    flush() {
      const queued = [...callbacks.entries()];
      callbacks.clear();
      for (const [, callback] of queued) callback(0);
    },
  };
}
