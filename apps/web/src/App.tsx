import { useMemo, useState } from "react";
import { MAX_SELECTED_BUS_STOPS } from "@mota/contracts/transit-settings";
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
import { useGatewaySession } from "./hooks/useGatewaySession";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useTransitSelections } from "./hooks/useTransitSelections";

const DEFAULT_MAP_CENTER = { lat: 37.5366, lng: 127.1253 };

export function App() {
  const isDesktop = useMediaQuery("(min-width: 960px)");
  const session = useGatewaySession();
  const [mode, setMode] = useState<TransitMode>("bus");
  const [pickerMode, setPickerMode] = useState<TransitMode | null>(null);
  const [saveAnnouncement, setSaveAnnouncement] = useState("");
  const {
    selections,
    addBusStops,
    addSubwayStations,
    toggleBusStop,
    selectSubwayStation,
    removeBusStop,
    removeSubwayStation,
    syncStatus,
  } = useTransitSelections(session);

  const stopsById = useMemo(
    () => new Map(selections.busStops.map((stop) => [stop.id, stop])),
    [selections.busStops],
  );
  const selectedStops = selections.selectedBusStopIds.flatMap((stopId) => {
    const stop = stopsById.get(stopId);
    return stop ? [stop] : [];
  });
  const selectedStation =
    selections.subwayStations.find(
      (station) => station.id === selections.selectedSubwayStationId,
    ) ?? null;
  const activeStops = mode === "bus" ? selectedStops : [];
  const activeStation = mode === "subway" ? selectedStation : null;
  const { busDetail, subwayDetail, refreshBusDetail, refreshSubwayDetail } =
    useArrivalDetail({
      selectedStops: activeStops,
      selectedStation: activeStation,
    });

  const firstSelectedStop = selectedStops[0] ?? null;
  const mapAnchor =
    mode === "bus"
      ? (firstSelectedStop ?? selectedStation)
      : (selectedStation ?? firstSelectedStop);
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

  const toggleStopSelection = (stopId: BusStop["id"]) => {
    const isSelected = selections.selectedBusStopIds.includes(stopId);
    const stopName = stopsById.get(stopId)?.name ?? "정류장";
    if (
      !isSelected &&
      selections.selectedBusStopIds.length >= MAX_SELECTED_BUS_STOPS
    ) {
      setSaveAnnouncement(
        `정류장은 최대 ${MAX_SELECTED_BUS_STOPS}곳까지 함께 볼 수 있어요.`,
      );
      return;
    }
    toggleBusStop(stopId);
    setSaveAnnouncement(
      isSelected
        ? `${stopName} 정류장 선택을 해제했어요.`
        : `${stopName} 정류장을 함께 보게 했어요.`,
    );
    setMode("bus");
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
        <BrandHeader session={session} syncStatus={syncStatus} />
        <div className="rail-scroll">
          <TransitPointSelector
            mode={mode}
            busStops={selections.busStops}
            subwayStations={selections.subwayStations}
            selectedBusStopIds={selections.selectedBusStopIds}
            selectedSubwayStationId={selections.selectedSubwayStationId}
            onModeChange={setMode}
            onAdd={() => setPickerMode(mode)}
            onSelectBusStop={toggleStopSelection}
            onSelectSubwayStation={(stationId) => {
              selectSubwayStation(stationId);
              setMode("subway");
            }}
            onRemoveBusStop={removeBusStop}
            onRemoveSubwayStation={removeSubwayStation}
          />

          {mode === "bus" ? (
            selectedStops.length === 0 ? (
              <section className="arrivals" aria-labelledby="bus-arrival-empty-title">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">곧 오는 순서</span>
                    <h2 id="bus-arrival-empty-title">다음 버스</h2>
                  </div>
                </div>
                <p className="arrival-empty">
                  정류장을 고르면 가장 빠른 버스 3대를 보여드려요.
                </p>
              </section>
            ) : (
              selectedStops.map((stop) => {
                const detail = busDetail(stop.id);
                return (
                  <ArrivalList
                    key={stop.id}
                    stopName={stop.name}
                    arrivals={detail.arrivals}
                    loading={detail.loading}
                    error={detail.error}
                    updatedAt={detail.updatedAt}
                    hasStop
                    onRefresh={refreshBusDetail}
                  />
                );
              })
            )
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
                  <span className="eyebrow">곧 오는 순서</span>
                  <h2 id="arrival-title">다음 열차</h2>
                </div>
              </div>
              <p className="arrival-empty">
                역을 고르면 방향별 가까운 열차 3대를 보여드려요.
              </p>
            </section>
          )}
        </div>
      </aside>

      <MapStage
        stops={selections.busStops}
        subwayStations={selections.subwayStations}
        selectedStops={selectedStops}
        selectedSubwayStation={selectedStation}
        center={mapCenter}
        isDesktop={isDesktop}
        onSelectStop={(stop) => {
          toggleStopSelection(stop.id);
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
