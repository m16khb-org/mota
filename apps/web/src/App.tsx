import { useMemo, useState } from "react";
import { MAX_SELECTED_BUS_STOPS, type CommuteContext } from "@mota/contracts/transit-settings";
import { Map as MapIcon } from "lucide-react";
import { ArrivalList } from "./components/ArrivalList";
import { BrandHeader } from "./components/BrandHeader";
import { CommuteContextSelector } from "./components/CommuteContextSelector";
import { MapStage } from "./components/MapStage";
import { TransitPointSelector } from "./components/TransitPointSelector";
import type { BusStop } from "./domain/bus";
import { useArrivalDetail } from "./hooks/useArrivalDetail";
import { useAuthSession } from "./hooks/useAuthSession";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useTransitSelections } from "./hooks/useTransitSelections";

const DEFAULT_MAP_CENTER = { lat: 37.5366, lng: 127.1253 };

export function App() {
  const isDesktop = useMediaQuery("(min-width: 960px)");
  const session = useAuthSession();
  const [commute, setCommute] = useState<CommuteContext>("toWork");

  const [searchMode, setSearchMode] = useState<"bus" | null>(null);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [saveAnnouncement, setSaveAnnouncement] = useState("");
  const { selections, addBusStops, toggleBusStop, removeBusStop, syncStatus } =
    useTransitSelections(session);
  const activeSelections = selections.commutes[commute];
  const commuteLabel = commute === "toWork" ? "출근" : "퇴근";

  const stopsById = useMemo(
    () => new Map(activeSelections.busStops.map((stop) => [stop.id, stop])),
    [activeSelections.busStops],
  );
  const selectedStops = activeSelections.selectedBusStopIds.flatMap((stopId) => {
    const stop = stopsById.get(stopId);
    return stop ? [stop] : [];
  });
  const { busDetail, refreshBusDetail } = useArrivalDetail({ selectedStops });
  const mapAnchor = selectedStops[0] ?? null;
  const mapCenter = mapAnchor ? { lat: mapAnchor.lat, lng: mapAnchor.lng } : DEFAULT_MAP_CENTER;

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
      setSaveAnnouncement(`${commuteLabel}에 ${first.name} 정류장을 선택했습니다.`);
    }
    closeSearch();
  };

  const toggleStopSelection = (stopId: BusStop["id"]) => {
    const isSelected = activeSelections.selectedBusStopIds.includes(stopId);
    const stopName = stopsById.get(stopId)?.name ?? "정류장";
    if (!isSelected && activeSelections.selectedBusStopIds.length >= MAX_SELECTED_BUS_STOPS) {
      setSaveAnnouncement(`정류장은 최대 ${MAX_SELECTED_BUS_STOPS}곳까지 함께 볼 수 있어요.`);
      return;
    }
    toggleBusStop(commute, stopId);
    setSaveAnnouncement(
      isSelected
        ? `${commuteLabel}의 ${stopName} 정류장 선택을 해제했어요.`
        : `${commuteLabel}에서 ${stopName} 정류장을 함께 보게 했어요.`,
    );
  };

  return (
    <main className="app-shell">
      <p className="sr-only" aria-live="polite" data-testid="save-announcement">
        {saveAnnouncement}
      </p>

      <aside className="control-rail">
        <BrandHeader session={session} syncStatus={syncStatus} onLogout={session.logout} />
        {!isDesktop && !mobileMapOpen && searchMode === null ? (
          <button className="mobile-map-open" type="button" onClick={() => setMobileMapOpen(true)}>
            <MapIcon aria-hidden="true" />
            지도 열기
          </button>
        ) : null}
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
            busStops={activeSelections.busStops}
            selectedBusStopIds={activeSelections.selectedBusStopIds}
            searching={searchMode !== null}
            onAdd={() => setSearchMode((current) => (current === null ? "bus" : null))}
            onSelectBusStop={toggleStopSelection}
            onRemoveBusStop={(stopId) => removeBusStop(commute, stopId)}
          />

          {selectedStops.length === 0 ? (
            <section className="arrivals" aria-labelledby="bus-arrival-empty-title">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">곧 오는 순서</span>
                  <h2 id="bus-arrival-empty-title">다음 버스</h2>
                </div>
              </div>
              <p className="arrival-empty">정류장을 고르면 가장 빠른 버스 3대를 보여드려요.</p>
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
          )}
        </div>
      </aside>

      {isDesktop || mobileMapOpen || searchMode !== null ? (
        <MapStage
          stops={activeSelections.busStops}
          selectedStops={selectedStops}
          center={mapCenter}
          isDesktop={isDesktop}
          searchMode={searchMode}
          onCloseMobileMap={() => setMobileMapOpen(false)}
          onCancelSearch={closeSearch}
          onSaveBusStops={saveStops}
          onSelectStop={(stop) => {
            toggleStopSelection(stop.id);
          }}
        />
      ) : null}
    </main>
  );
}
