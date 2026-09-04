import type { TransitMapNetwork, TransitVehicle } from "@mota/contracts/transit-map";
import {
  compileRoutes,
  offsetCoordinate,
  projectOnPath,
  routeKey,
  type Coordinate,
  type RouteCollection,
} from "./transitGeometry";

interface Part {
  readonly name: string;
  readonly width: number;
  readonly length: number;
  readonly base: number;
  readonly height: number;
  readonly color: string;
  readonly right?: number;
  readonly forward?: number;
}

// Deliberately legible schematic dimensions, not surveyed building footprints.
const STATION: readonly Part[] = [
  { name: "platform", width: 22, length: 44, base: 0, height: 1, color: "#62625d" },
  { name: "hall", width: 16, length: 32, base: 1, height: 7, color: "#f7f7f3" },
  { name: "roof", width: 20, length: 38, base: 7, height: 8.5, color: "#c7f000" },
  { name: "entrance", width: 8, length: 4, base: 1, height: 5, color: "#0b0b0b", forward: 17 },
  { name: "sign", width: 9, length: 2, base: 8.5, height: 11, color: "#0b0b0b", forward: 10 },
];
const STOP: readonly Part[] = [
  { name: "platform", width: 6, length: 12, base: 0, height: 0.4, color: "#62625d" },
  {
    name: "post-left",
    width: 0.7,
    length: 0.7,
    base: 0.4,
    height: 4.5,
    color: "#0b0b0b",
    right: -2,
    forward: -4,
  },
  {
    name: "post-right",
    width: 0.7,
    length: 0.7,
    base: 0.4,
    height: 4.5,
    color: "#0b0b0b",
    right: -2,
    forward: 4,
  },
  { name: "shelter", width: 6, length: 11, base: 4.5, height: 5.2, color: "#c7f000" },
  {
    name: "sign-post",
    width: 0.5,
    length: 0.5,
    base: 0,
    height: 6,
    color: "#0b0b0b",
    right: 2,
    forward: 5,
  },
  { name: "sign", width: 1, length: 2, base: 5, height: 7, color: "#c7f000", right: 2, forward: 5 },
];

function vehicleParts(mode: TransitVehicle["mode"]): readonly Part[] {
  const width = mode === "bus" ? 4 : 5;
  const length = mode === "bus" ? 14 : 30;
  return [
    { name: "chassis", width, length: length - 1, base: 0.3, height: 1, color: "#0b0b0b" },
    {
      name: "body",
      width,
      length,
      base: 1,
      height: 3,
      color: mode === "bus" ? "#155eef" : "#f7f7f3",
    },
    {
      name: "windows",
      width: width + 0.1,
      length: length - 2,
      base: 3,
      height: 4.2,
      color: "#0b0b0b",
    },
    {
      name: "roof",
      width,
      length,
      base: 4.2,
      height: 4.8,
      color: mode === "bus" ? "#155eef" : "#c7f000",
    },
    {
      name: "front",
      width: width - 0.5,
      length: 0.8,
      base: 1.5,
      height: 2.5,
      color: "#c7f000",
      forward: length / 2,
    },
  ];
}
const VEHICLE_PARTS = { bus: vehicleParts("bus"), subway: vehicleParts("subway") };

function model(center: Coordinate, heading: number, properties: object, parts: readonly Part[]) {
  return parts.map((part) => {
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ] as const;
    return {
      type: "Feature" as const,
      properties: {
        ...properties,
        anchorLng: center[0],
        anchorLat: center[1],
        part: part.name,
        base: part.base,
        height: part.height,
        color: part.color,
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          corners.map(([x, y]) =>
            offsetCoordinate(
              center,
              (x * part.width) / 2 + (part.right ?? 0),
              (y * part.length) / 2 + (part.forward ?? 0),
              heading,
            ),
          ),
        ],
      },
    };
  });
}

export function staticModels(
  features:
    | TransitMapNetwork["subway"]["stations"]["features"]
    | TransitMapNetwork["bus"]["stops"]["features"],
  routes: RouteCollection,
  kind: "station" | "stop",
) {
  const paths = compileRoutes(routes);
  return {
    type: "FeatureCollection" as const,
    features: features.flatMap((feature) => {
      const keys = feature.properties.routeIds.map(routeKey);
      let nearest = { distance: Number.POSITIVE_INFINITY, bearing: 0 };
      for (const path of paths) {
        if (!path.keys.some((key) => keys.includes(key))) continue;
        const candidate = projectOnPath(feature.geometry.coordinates, path);
        if (candidate.distance < nearest.distance) nearest = candidate;
      }
      return model(
        feature.geometry.coordinates,
        nearest.distance < 400 ? nearest.bearing : 0,
        feature.properties,
        kind === "station" ? STATION : STOP,
      );
    }),
  };
}

export function vehicleModels(vehicles: readonly TransitVehicle[]) {
  return {
    type: "FeatureCollection" as const,
    features: vehicles.flatMap(({ coordinates, ...properties }) =>
      model(coordinates, properties.bearing, properties, VEHICLE_PARTS[properties.mode]),
    ),
  };
}
