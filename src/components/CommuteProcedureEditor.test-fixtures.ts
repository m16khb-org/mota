import { busStopSchema } from "../domain/bus";
import {
  busCommuteFavoriteSchema,
  subwayCommuteFavoriteSchema,
} from "../domain/commute";
import { subwayStationSchema } from "../domain/subway";
import type { CommutePlace } from "../hooks/useCommuteStops";

export const companyStop = busStopSchema.parse({
  id: "124000454",
  arsId: "25014",
  name: "천호역 정류장",
  lat: 37.5379,
  lng: 127.1255,
  distanceMeters: 151,
});

export const companyStation = subwayStationSchema.parse({
  id: "osm-node-5801572034",
  name: "천호역",
  line: "5·8호선",
  lat: 37.5385,
  lng: 127.1234,
  distanceMeters: 228,
});

export const companyBusFavorite = busCommuteFavoriteSchema.parse({
  id: "fav-company-bus",
  kind: "bus",
  stopId: companyStop.id,
  arsId: companyStop.arsId,
  routeId: "100100574",
  routeName: "341",
  direction: "강동공영차고지",
  accessMinutes: 5,
});

export const companySubwayFavorite = subwayCommuteFavoriteSchema.parse({
  id: "fav-company-subway",
  kind: "subway",
  stationId: companyStation.id,
  apiStationName: "천호",
  subwayId: "1005",
  updnLine: "상행",
  lineName: "5호선",
  trainLineNm: "방화행",
  accessMinutes: 4,
});

export const homeStop = busStopSchema.parse({
  id: "124000455",
  arsId: "25015",
  name: "집앞 정류장",
  lat: 37.538,
  lng: 127.126,
  distanceMeters: 121,
});

export const homeBusFavorite = busCommuteFavoriteSchema.parse({
  id: "fav-home-bus",
  kind: "bus",
  stopId: homeStop.id,
  arsId: homeStop.arsId,
  routeId: "100100575",
  routeName: "342",
  direction: "집앞",
  accessMinutes: 5,
});

export function createPlace(input: {
  readonly id: string;
  readonly name: string;
  readonly stops: CommutePlace["stops"];
  readonly subwayStations: CommutePlace["subwayStations"];
  readonly favorites: CommutePlace["favorites"];
}): CommutePlace {
  return {
    id: input.id,
    name: input.name,
    stops: input.stops,
    subwayStations: input.subwayStations,
    selectedStopId: input.stops[0]?.id ?? null,
    procedures: [],
    favorites: input.favorites,
    activeProcedureId: null,
    location: null,
  };
}

export const companyPlace = createPlace({
  id: "company-place",
  name: "회사",
  stops: [companyStop],
  subwayStations: [companyStation],
  favorites: [companyBusFavorite, companySubwayFavorite],
});

export const homePlace = createPlace({
  id: "home-place",
  name: "집",
  stops: [homeStop],
  subwayStations: [],
  favorites: [homeBusFavorite],
});
