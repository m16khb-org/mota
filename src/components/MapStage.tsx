import {
  CircleDot,
  Crosshair,
  Info,
  LocateFixed,
  Navigation,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchNearbyStops,
  fetchNearbySubwayStations,
  isServiceAreaError,
} from "../api/client";
import type { BusStop, CommuteDirection } from "../domain/bus";
import type { SubwayStation } from "../domain/subway";
import type { CommutePlace } from "../hooks/useCommuteStops";
import { MapCanvas } from "./MapCanvas";

interface Point {
  readonly lat: number;
  readonly lng: number;
}

interface StageStopSearch {
  readonly loading: boolean;
  readonly notice: string | null;
  readonly isError: boolean;
}

const IDLE_SEARCH: StageStopSearch = {
  loading: false,
  notice: null,
  isError: false,
};

interface MapStageProps {
  readonly direction: CommuteDirection;
  readonly place: CommutePlace | null;
  readonly selectedStop: BusStop | null;
  /** Station whose detail is open in the rail; mirrors the marker state. */
  readonly selectedSubwayStationId: SubwayStation["id"] | null;
  /** Anchor-derived map center (selected stop, else first station, else the
   * default Seoul center); App owns the derivation. */
  readonly center: Point;
  /** Increments when the place manager asks for a stage search on desktop. */
  readonly searchRequest: number;
  readonly isDesktop: boolean;
  readonly onSelectStop: (stopId: BusStop["id"]) => void;
  readonly onSelectSubway: (station: SubwayStation) => void;
  /** Saves a discovered nearby stop into the active place (App owns the
   * mutation and the save announcement). */
  readonly onSaveStop: (stop: BusStop) => void;
  /** Saves a discovered nearby subway station into the active place. */
  readonly onSaveSubwayStation: (station: SubwayStation) => void;
}

export function MapStage({
  direction,
  place,
  selectedStop,
  selectedSubwayStationId,
  center,
  searchRequest,
  isDesktop,
  onSelectStop,
  onSelectSubway,
  onSaveStop,
  onSaveSubwayStation,
}: MapStageProps) {
  const [stageCenter, setStageCenter] = useState<Point>(center);
  const [locateCenter, setLocateCenter] = useState<Point | null>(null);
  const [nearbyStops, setNearbyStops] = useState<BusStop[]>([]);
  const [nearbyStations, setNearbyStations] = useState<SubwayStation[]>([]);
  const [stopSearch, setStopSearch] = useState<StageStopSearch>(IDLE_SEARCH);
  const searchSequence = useRef(0);
  const handledSearchRequest = useRef(searchRequest);

  const searchStageStops = useCallback(async () => {
    if (!place) {
      return;
    }
    const sequence = searchSequence.current + 1;
    searchSequence.current = sequence;
    setStopSearch({ loading: true, notice: null, isError: false });
    const [stopsResult, stationsResult] = await Promise.allSettled([
      fetchNearbyStops(stageCenter),
      fetchNearbySubwayStations(stageCenter),
    ]);
    if (searchSequence.current !== sequence) {
      return;
    }
    const stops = stopsResult.status === "fulfilled" ? stopsResult.value : [];
    const stations =
      stationsResult.status === "fulfilled" ? stationsResult.value : [];
    setNearbyStops(stops);
    setNearbyStations(stations);
    const total = stops.length + stations.length;
    const stopError = stopsResult.status === "rejected";
    const stationError = stationsResult.status === "rejected";
    if (total > 0) {
      const parts: string[] = [];
      if (stops.length > 0) parts.push(`정류장 ${stops.length}곳`);
      if (stations.length > 0) parts.push(`지하철역 ${stations.length}곳`);
      setStopSearch({
        loading: false,
        notice: `주변 ${parts.join(" · ")} · 마커를 눌러 추가하세요`,
        isError: false,
      });
    } else if (stopError || stationError) {
      const error = stopError
        ? (stopsResult as PromiseRejectedResult).reason
        : (stationsResult as PromiseRejectedResult).reason;
      setNearbyStops([]);
      setNearbyStations([]);
      setStopSearch({
        loading: false,
        notice: isServiceAreaError(error)
          ? "서울 서비스 범위 밖이에요. 지도를 서울 근처로 옮겨 주세요."
          : "이 주변에서 정류장·지하철역을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.",
        isError: true,
      });
    } else {
      setStopSearch({
        loading: false,
        notice: "이 주변에서 정류장·지하철역을 찾지 못했습니다. 지도를 옮겨 다시 시도해 주세요.",
        isError: true,
      });
    }
  }, [place, stageCenter]);

  const locateUser = () => {
    if (!navigator.geolocation) {
      setStopSearch({
        loading: false,
        notice: "이 브라우저에서는 현재 위치를 사용할 수 없습니다.",
        isError: true,
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        setLocateCenter({ lat: coords.latitude, lng: coords.longitude }),
      () =>
        setStopSearch({
          loading: false,
          notice: "현재 위치를 확인하지 못했습니다. 지도를 직접 옮겨 주세요.",
          isError: true,
        }),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 60_000 },
    );
  };

  useEffect(() => {
    if (searchRequest <= handledSearchRequest.current) {
      return;
    }
    handledSearchRequest.current = searchRequest;
    void searchStageStops();
  }, [searchRequest, searchStageStops]);

  return (
    <section className="map-stage" aria-label="선택한 통근 정류장 안내">
      <div className="stage-live-map">
        <MapCanvas
          center={locateCenter ?? center}
          stops={place?.stops ?? []}
          selectedStop={selectedStop}
          pendingStops={isDesktop ? nearbyStops : []}
          subwayStations={place?.subwayStations ?? []}
          pendingSubwayStations={isDesktop ? nearbyStations : []}
          selectedSubwayStationIds={
            selectedSubwayStationId === null ? [] : [selectedSubwayStationId]
          }
          onCenterChange={setStageCenter}
          onSelect={(stop) => onSelectStop(stop.id)}
          onAddPending={onSaveStop}
          onSelectSubway={onSelectSubway}
          onAddPendingSubway={onSaveSubwayStation}
        />
      </div>
      {isDesktop ? (
        <div className="stage-map-controls" data-testid="stage-map-controls">
          <div className="map-center-pin" aria-hidden="true">
            <Crosshair />
          </div>
          <div className="stage-search-tray">
            <div className="stage-search-actions">
              <button
                className="locate-button"
                type="button"
                onClick={locateUser}
                disabled={!place}
              >
                <LocateFixed aria-hidden="true" />
                현위치
              </button>
              <button
                className="primary-button compact"
                type="button"
                onClick={() => void searchStageStops()}
                disabled={stopSearch.loading || !place}
              >
                <Search aria-hidden="true" />
                {stopSearch.loading ? "찾는 중…" : "이 위치에서 찾기"}
              </button>
            </div>
            {stopSearch.notice ? (
              <p
                className={
                  stopSearch.isError
                    ? "stage-search-note is-error"
                    : "stage-search-note"
                }
                role={stopSearch.isError ? "alert" : "status"}
              >
                {stopSearch.notice}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="stage-copy">
        <span className="status-pill">
          <CircleDot aria-hidden="true" /> 서울 실시간 BIS
        </span>
        <p>{direction === "company" ? "집에서 회사까지" : "회사에서 집까지"}</p>
        <h2>
          {"정확한 정류장, "}
          <br />
          놓치지 않는 버스.
        </h2>
        <button
          className="stage-action"
          type="button"
          disabled={!place}
          onClick={() => void searchStageStops()}
        >
          <Navigation aria-hidden="true" />
          주변 정류장 찾기
        </button>
      </div>
      <div className="data-note">
        <Info aria-hidden="true" />
        <p>
          정류장 ARS 번호와 좌표를 함께 확인하세요.{" "}
          <span>반대편 정류장은 별개의 번호입니다.</span>
        </p>
      </div>
    </section>
  );
}
