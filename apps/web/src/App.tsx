import { useMemo, useState } from "react";
import {
  MAX_SELECTED_BUS_STOPS,
  type CommuteContext,
} from "@mota/contracts/transit-settings";
import { ArrivalList } from "./components/ArrivalList";
import { BrandHeader } from "./components/BrandHeader";
import { CommuteContextSelector } from "./components/CommuteContextSelector";
import { MapStage } from "./components/MapStage";
import { SubwayArrivalList } from "./components/SubwayArrivalList";
import {
  TransitPointSelector,
  type TransitMode,
} from "./components/TransitPointSelector";
import type { BusStop } from "./domain/bus";
import type { SubwayStation } from "./domain/subway";
import { useArrivalDetail } from "./hooks/useArrivalDetail";
import { useAuthSession } from "./hooks/useAuthSession";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useTransitSelections } from "./hooks/useTransitSelections";

const DEFAULT_MAP_CENTER = { lat: 37.5366, lng: 127.1253 };

export function App() {
  const isDesktop = useMediaQuery("(min-width: 960px)");
  const session = useAuthSession();
  const [commute, setCommute] = useState<CommuteContext>("toWork");
  const [mode, setMode] = useState<TransitMode>("bus");
  const [searchMode, setSearchMode] = useState<TransitMode | null>(null);
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
  const activeSelections = selections.commutes[commute];
  const commuteLabel = commute === "toWork" ? "출근" : "퇴근";

  const stopsById = useMemo(
    () =>
      new Map(
        activeSelections.busStops.map((stop) => [stop.id, stop]),
      ),
    [activeSelections.busStops],
  );
  const selectedStops = activeSelections.selectedBusStopIds.flatMap(
    (stopId) => {
    const stop = stopsById.get(stopId);
    return stop ? [stop] : [];
    },
  );
  const selectedStation =
    activeSelections.subwayStations.find(
      (station) =>
        station.id === activeSelections.selectedSubwayStationId,
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

  const closeSearch = () => {
    setSearchMode(null);
    queueMicrotask(() => {
      document.getElementById("point-search-trigger")?.focus();
    });
  };

  const saveStops = (stops: readonly BusStop[]) => {
    addBusStops(commute, stops);
    const first = stops[0];
    if (first !== undefined) {
      setSaveAnnouncement(
        `${commuteLabel}에 ${first.name} 정류장을 선택했습니다.`,
      );
    }
    setMode("bus");
    closeSearch();
  };

  const saveStations = (stations: readonly SubwayStation[]) => {
    addSubwayStations(commute, stations);
    const first = stations[0];
    if (first !== undefined) {
      setSaveAnnouncement(
        `${commuteLabel}에 ${first.name}역을 선택했습니다.`,
      );
    }
    setMode("subway");
    closeSearch();
  };

  const toggleStopSelection = (stopId: BusStop["id"]) => {
    const isSelected =
      activeSelections.selectedBusStopIds.includes(stopId);
    const stopName = stopsById.get(stopId)?.name ?? "정류장";
    if (
      !isSelected &&
      activeSelections.selectedBusStopIds.length >=
        MAX_SELECTED_BUS_STOPS
    ) {
      setSaveAnnouncement(
        `정류장은 최대 ${MAX_SELECTED_BUS_STOPS}곳까지 함께 볼 수 있어요.`,
      );
      return;
    }
    toggleBusStop(commute, stopId);
    setSaveAnnouncement(
      isSelected
        ? `${commuteLabel}의 ${stopName} 정류장 선택을 해제했어요.`
        : `${commuteLabel}에서 ${stopName} 정류장을 함께 보게 했어요.`,
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
        <BrandHeader
          session={session}
          syncStatus={syncStatus}
          onLogout={session.logout}
        />
        <div className="rail-scroll">
          <CommuteContextSelector
            activeContext={commute}
            commutes={selections.commutes}
            onChange={(nextCommute) => {
              setSearchMode(null);
              setCommute(nextCommute);
              setSaveAnnouncement(
                `${nextCommute === "toWork" ? "출근" : "퇴근"} 설정을 보고 있어요.`,
              );
            }}
          />
          <TransitPointSelector
            mode={mode}
            busStops={activeSelections.busStops}
            subwayStations={activeSelections.subwayStations}
            selectedBusStopIds={activeSelections.selectedBusStopIds}
            selectedSubwayStationId={
              activeSelections.selectedSubwayStationId
            }
            searching={searchMode === mode}
            onModeChange={(nextMode) => {
              setSearchMode(null);
              setMode(nextMode);
            }}
            onAdd={() =>
              setSearchMode((current) =>
                current === mode ? null : mode,
              )
            }
            onSelectBusStop={toggleStopSelection}
            onSelectSubwayStation={(stationId) => {
              selectSubwayStation(commute, stationId);
              setMode("subway");
            }}
            onRemoveBusStop={(stopId) =>
              removeBusStop(commute, stopId)
            }
            onRemoveSubwayStation={(stationId) =>
              removeSubwayStation(commute, stationId)
            }
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
        stops={activeSelections.busStops}
        subwayStations={activeSelections.subwayStations}
        selectedStops={selectedStops}
        selectedSubwayStation={selectedStation}
        center={mapCenter}
        isDesktop={isDesktop}
        searchMode={searchMode}
        onCancelSearch={closeSearch}
        onSaveBusStops={saveStops}
        onSaveSubwayStations={saveStations}
        onSelectStop={(stop) => {
          toggleStopSelection(stop.id);
        }}
        onSelectSubwayStation={(station) => {
          selectSubwayStation(commute, station.id);
          setMode("subway");
        }}
      />
    </main>
  );
}
