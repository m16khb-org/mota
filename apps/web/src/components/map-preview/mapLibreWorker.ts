import MapLibreWorker from "maplibre-gl/dist/maplibre-gl-worker.mjs";

type MapLibreWorkerScope = ConstructorParameters<typeof MapLibreWorker>[0] & {
  worker?: MapLibreWorker;
};

const workerScope = self as unknown as MapLibreWorkerScope;
workerScope.worker ??= new MapLibreWorker(workerScope);
