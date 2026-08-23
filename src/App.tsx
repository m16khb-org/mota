import { useState } from "react";
import { ArrivalList } from "./components/ArrivalList";
import { BrandHeader } from "./components/BrandHeader";
import { MapPicker } from "./components/MapPicker";
import { MapStage } from "./components/MapStage";
import { SubwayArrivalList } from "./components/SubwayArrivalList";
import { SubwayPicker } from "./components/SubwayPicker";
import {
  TransitPointSelector,
  type TransitMode,
} from "./components/TransitPointSelector";
import type { BusStop } from "./domain/bus";
import type { SubwayStation } from "./domain/subway";
import { useArrivalDetail } from "./hooks/useArrivalDetail";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useTransitSelections } from "./hooks/useTransitSelections";

const DEFAULT_MAP_CENTER = { lat: 37.5366, lng: 127.1253 };

export function App() {
  const isDesktop = useMediaQuery("(min-width: 960px)");
  const [mode, setMode] = useState<TransitMode>("bus");
  const [pickerMode, setPickerMode] = useState<TransitMode | null>(null);
  const [saveAnnouncement, setSaveAnnouncement] = useState("");
  const {
    selections,
    addBusStops,
    addSubwayStations,
    selectBusStop,
    selectSubwayStation,
    removeBusStop,
    removeSubwayStation,
  } = useTransitSelections();

  const selectedStop =
    selections.busStops.find(
      (stop) => stop.id === selections.selectedBusStopId,
    ) ?? null;
  const selectedStation =
    selections.subwayStations.find(
      (station) => station.id === selections.selectedSubwayStationId,
    ) ?? null;
  const activeStop = mode === "bus" ? selectedStop : null;
  const activeStation = mode === "subway" ? selectedStation : null;
  const { busDetail, subwayDetail, refreshBusDetail, refreshSubwayDetail } =
    useArrivalDetail({
      selectedStop: activeStop,
      selectedStation: activeStation,
    });

  const mapAnchor =
    mode === "bus"
      ? (selectedStop ?? selectedStation)
      : (selectedStation ?? selectedStop);
  const mapCenter = mapAnchor
    ? { lat: mapAnchor.lat, lng: mapAnchor.lng }
    : DEFAULT_MAP_CENTER;

  const saveStops = (stops: readonly BusStop[]) => {
    addBusStops(stops);
    const first = stops[0];
    if (first !== undefined) {
      setSaveAnnouncement(`${first.name} 정류장을 선택했습니다.`);
    }
    setMode("bus");
    setPickerMode(null);
  };

  const saveStations = (stations: readonly SubwayStation[]) => {
    addSubwayStations(stations);
    const first = stations[0];
    if (first !== undefined) {
      setSaveAnnouncement(`${first.name}역을 선택했습니다.`);
    }
    setMode("subway");
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
        <div className="rail-scroll">
          <TransitPointSelector
            mode={mode}
            busStops={selections.busStops}
            subwayStations={selections.subwayStations}
            selectedBusStopId={selections.selectedBusStopId}
            selectedSubwayStationId={selections.selectedSubwayStationId}
            onModeChange={setMode}
            onAdd={() => setPickerMode(mode)}
            onSelectBusStop={(stopId) => {
              selectBusStop(stopId);
              setMode("bus");
            }}
            onSelectSubwayStation={(stationId) => {
              selectSubwayStation(stationId);
              setMode("subway");
            }}
            onRemoveBusStop={removeBusStop}
            onRemoveSubwayStation={removeSubwayStation}
          />

          {mode === "bus" ? (
            <ArrivalList
              stopName={selectedStop?.name ?? null}
              arrivals={busDetail.arrivals}
              loading={busDetail.loading}
              error={busDetail.error}
              updatedAt={busDetail.updatedAt}
              hasStop={selectedStop !== null}
              onRefresh={refreshBusDetail}
            />
          ) : selectedStation !== null ? (
            <SubwayArrivalList
              key={selectedStation.id}
              stationName={selectedStation.name}
              arrivals={subwayDetail.arrivals}
              loading={subwayDetail.loading}
              error={subwayDetail.error}
              updatedAt={subwayDetail.updatedAt}
              onRefresh={refreshSubwayDetail}
            />
          ) : (
            <section className="arrivals" aria-labelledby="arrival-title">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">실시간 도착정보</span>
                  <h2 id="arrival-title">도착 예정</h2>
                </div>
              </div>
              <p className="arrival-empty">
                역을 선택하면 방향별 도착 정보가 표시됩니다.
              </p>
            </section>
          )}
        </div>
      </aside>

      <MapStage
        stops={selections.busStops}
        subwayStations={selections.subwayStations}
        selectedStop={selectedStop}
        selectedSubwayStation={selectedStation}
        center={mapCenter}
        isDesktop={isDesktop}
        onSelectStop={(stop) => {
          selectBusStop(stop.id);
          setMode("bus");
        }}
        onSelectSubwayStation={(station) => {
          selectSubwayStation(station.id);
          setMode("subway");
        }}
      />

      {pickerMode === "bus" ? (
        <MapPicker
          initialStop={null}
          onClose={() => setPickerMode(null)}
          onSave={saveStops}
        />
      ) : null}
      {pickerMode === "subway" ? (
        <SubwayPicker
          initialCenter={mapCenter}
          onClose={() => setPickerMode(null)}
          onSave={saveStations}
        />
      ) : null}
    </main>
  );
}
