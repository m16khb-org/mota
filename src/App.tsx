import { BusFront, CircleDot, Info, Navigation } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchArrivals } from "./api/client";
import { ArrivalList } from "./components/ArrivalList";
import { CommuteSwitch } from "./components/CommuteSwitch";
import { MapCanvas } from "./components/MapCanvas";
import { MapPicker } from "./components/MapPicker";
import { StopSummary } from "./components/StopSummary";
import type { BusArrival, BusStop, CommuteDirection } from "./domain/bus";
import { useCommuteStops } from "./hooks/useCommuteStops";

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
  const { stops, setStop } = useCommuteStops();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [arrivalState, setArrivalState] = useState<ArrivalState>(EMPTY_ARRIVALS);
  const [saveAnnouncement, setSaveAnnouncement] = useState("");
  const selectedStop = stops[direction];
  const mapCenter = selectedStop
    ? { lat: selectedStop.lat, lng: selectedStop.lng }
    : DEFAULT_MAP_CENTER;

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

  const saveStop = (stop: BusStop) => {
    setStop(direction, stop);
    setSaveAnnouncement(
      `${stop.name} 정류장을 ${direction === "company" ? "회사로" : "집으로"} 가는 정류장으로 저장했습니다.`,
    );
    setPickerOpen(false);
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
        <header className="brand-header">
          <div className="brand-mark" aria-hidden="true">
            <BusFront />
          </div>
          <div>
            <span>서울 출퇴근</span>
            <h1>내 버스</h1>
          </div>
        </header>

        <CommuteSwitch value={direction} onChange={setDirection} />

        <div
          id="commute-panel"
          className="rail-scroll"
          role="tabpanel"
          aria-labelledby={`commute-tab-${direction}`}
        >
          <StopSummary
            direction={direction}
            stop={selectedStop}
            onEdit={() => setPickerOpen(true)}
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
            stops={selectedStop ? [selectedStop] : []}
            selectedStop={selectedStop}
            onCenterChange={ignoreMapCenterChange}
            onSelect={() => setPickerOpen(true)}
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
          <button className="stage-action" type="button" onClick={() => setPickerOpen(true)}>
            <Navigation aria-hidden="true" />
            {selectedStop ? "지도에서 정류장 변경" : "지도 열기"}
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

      {pickerOpen ? (
        <MapPicker
          initialStop={selectedStop}
          onClose={() => setPickerOpen(false)}
          onSave={saveStop}
        />
      ) : null}
    </main>
  );
}
