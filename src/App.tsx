import { CircleDot, Info, Navigation } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchArrivals } from "./api/client";
import { ArrivalList } from "./components/ArrivalList";
import { BrandHeader } from "./components/BrandHeader";
import { CommutePlaceManager } from "./components/CommutePlaceManager";
import { CommuteSwitch } from "./components/CommuteSwitch";
import { MapCanvas } from "./components/MapCanvas";
import { MapPicker } from "./components/MapPicker";
import { SubwayPicker } from "./components/SubwayPicker";
import type { BusArrival, BusStop, CommuteDirection } from "./domain/bus";
import type { SubwayStation } from "./domain/subway";
import { getActivePlace, getActiveStop, useCommuteStops } from "./hooks/useCommuteStops";

interface ArrivalState {
  readonly arrivals: readonly BusArrival[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly updatedAt: string | null;
}
const EMPTY_ARRIVALS: ArrivalState = {
  arrivals: [],
  loading: false,
  error: null,
  updatedAt: null,
};
const DEFAULT_MAP_CENTER = { lat: 37.5366, lng: 127.1253 };
const ignoreMapCenterChange = () => {};

export function App() {
  const [direction, setDirection] = useState<CommuteDirection>("company");
  const {
    commutes,
    addPlace,
    renamePlace,
    removePlace,
    selectPlace,
    addStop,
    removeStop,
    selectStop,
    addSubwayStations,
    removeSubwayStation,
    addRouteOption,
    removeRouteOption,
    selectRouteOption,
  } = useCommuteStops();
  const [pickerMode, setPickerMode] = useState<"bus" | "subway" | null>(null);
  const [arrivalState, setArrivalState] = useState<ArrivalState>(EMPTY_ARRIVALS);
  const [saveAnnouncement, setSaveAnnouncement] = useState("");
  const collection = commutes[direction];
  const activePlace = getActivePlace(collection);
  const selectedStop = getActiveStop(activePlace);
  const mapAnchor = selectedStop ?? activePlace?.subwayStations[0] ?? null;
  const mapCenter = mapAnchor ? { lat: mapAnchor.lat, lng: mapAnchor.lng } : DEFAULT_MAP_CENTER;

  const refreshArrivals = useCallback(async () => {
    if (!selectedStop) {
      return;
    }

    setArrivalState((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await fetchArrivals(selectedStop.arsId);
      setArrivalState({
        arrivals: result.arrivals,
        loading: false,
        error: null,
        updatedAt: result.updatedAt,
      });
    } catch {
      setArrivalState((current) => ({
        ...current,
        loading: false,
        error: "도착 정보를 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.",
      }));
    }
  }, [selectedStop]);

  useEffect(() => {
    if (selectedStop) {
      void refreshArrivals();
    } else {
      setArrivalState(EMPTY_ARRIVALS);
    }
  }, [refreshArrivals, selectedStop]);

  const saveStops = (stops: readonly BusStop[]) => {
    if (!activePlace) {
      return;
    }
    for (const stop of stops) {
      addStop(direction, activePlace.id, stop);
    }
    setSaveAnnouncement(
      `${stops.map((stop) => stop.name).join(", ")} ${stops.length}개 정류장을 ${
        activePlace.name
      }에 저장했습니다.`,
    );
    setPickerMode(null);
  };

  const saveSubwayStations = (stations: readonly SubwayStation[]) => {
    if (!activePlace) {
      return;
    }
    addSubwayStations(direction, activePlace.id, stations);
    setSaveAnnouncement(
      `${stations.map((station) => station.name).join(", ")} ${
        stations.length
      }개 지하철역을 ${activePlace.name} 경로에 저장했습니다.`,
    );
    setPickerMode(null);
  };

  return (
    <main className="app-shell">
      <p
        className="sr-only"
        aria-live="polite"
        data-testid="save-announcement"
      >
        {saveAnnouncement}
      </p>
      <aside className="control-rail">
        <BrandHeader />

        <CommuteSwitch value={direction} onChange={setDirection} />

        <div
          id="commute-panel"
          className="rail-scroll"
          role="tabpanel"
          aria-labelledby={`commute-tab-${direction}`}
        >
          <CommutePlaceManager
            key={`${direction}-${activePlace?.id ?? "empty"}`}
            direction={direction}
            collection={collection}
            activePlace={activePlace}
            onAddPlace={(name) => {
              addPlace(direction, name);
              setSaveAnnouncement(`${name} 장소를 추가했습니다.`);
            }}
            onRenamePlace={(placeId, name) => {
              renamePlace(direction, placeId, name);
              setSaveAnnouncement(`${name}으로 장소 이름을 변경했습니다.`);
            }}
            onRemovePlace={(placeId) => {
              removePlace(direction, placeId);
              setSaveAnnouncement(`${activePlace?.name ?? "선택한 장소"}를 삭제했습니다.`);
            }}
            onSelectPlace={(placeId) => selectPlace(direction, placeId)}
            onAddStop={() => setPickerMode("bus")}
            onAddSubway={() => setPickerMode("subway")}
            onRemoveStop={(stopId) => {
              const stop = activePlace?.stops.find((item) => item.id === stopId);
              if (activePlace) {
                removeStop(direction, activePlace.id, stopId);
                setSaveAnnouncement(
                  `${stop?.name ?? "선택한 정류장"} 정류장을 삭제했습니다.`,
                );
              }
            }}
            onSelectStop={(stopId) =>
              activePlace && selectStop(direction, activePlace.id, stopId)
            }
            onRemoveSubway={(stationId) => {
              if (activePlace) {
                removeSubwayStation(direction, activePlace.id, stationId);
                setSaveAnnouncement("지하철역을 경로에서 삭제했습니다.");
              }
            }}
            onAddRoute={(stopId, stationId) =>
              activePlace &&
              addRouteOption(direction, activePlace.id, stopId, stationId)
            }
            onRemoveRoute={(optionId) =>
              activePlace &&
              removeRouteOption(direction, activePlace.id, optionId)
            }
            onSelectRoute={(optionId) =>
              activePlace &&
              selectRouteOption(direction, activePlace.id, optionId)
            }
          />
          <ArrivalList
            arrivals={arrivalState.arrivals}
            loading={arrivalState.loading}
            error={arrivalState.error}
            updatedAt={arrivalState.updatedAt}
            hasStop={Boolean(selectedStop)}
            onRefresh={() => void refreshArrivals()}
          />
        </div>
      </aside>

      <section className="map-stage" aria-label="선택한 통근 정류장 안내">
        <div className="stage-live-map">
          <MapCanvas
            center={mapCenter}
            stops={activePlace?.stops ?? []}
            selectedStop={selectedStop}
            subwayStations={activePlace?.subwayStations ?? []}
            onCenterChange={ignoreMapCenterChange}
            onSelect={(stop) =>
              activePlace && selectStop(direction, activePlace.id, stop.id)
            }
            onSelectSubway={(station) =>
              setSaveAnnouncement(`${station.name} 지하철역 경로 지점입니다.`)
            }
          />
        </div>
        <div className="stage-copy">
          <span className="status-pill">
            <CircleDot aria-hidden="true" /> 서울 실시간 BIS
          </span>
          <p>{direction === "company" ? "집에서 회사까지" : "회사에서 집까지"}</p>
          <h2>
            정확한 정류장,
            <br />
            놓치지 않는 버스.
          </h2>
          <button
            className="stage-action"
            type="button"
            disabled={!activePlace}
            onClick={() => setPickerMode("bus")}
          >
            <Navigation aria-hidden="true" />
            지도에서 정류장 추가
          </button>
        </div>
        <div className="data-note">
          <Info aria-hidden="true" />
          <p>
            정류장 ARS 번호와 좌표를 함께 확인하세요.
            <span>반대편 정류장은 별개의 번호입니다.</span>
          </p>
        </div>
      </section>

      {pickerMode === "bus" && activePlace ? (
        <MapPicker
          initialStop={null}
          onClose={() => setPickerMode(null)}
          onSave={saveStops}
        />
      ) : null}
      {pickerMode === "subway" && activePlace ? (
        <SubwayPicker
          initialCenter={mapCenter}
          onClose={() => setPickerMode(null)}
          onSave={saveSubwayStations}
        />
      ) : null}
    </main>
  );
}
