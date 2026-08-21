import { useState } from "react";
import { ArrivalList } from "./components/ArrivalList";
import { BrandHeader } from "./components/BrandHeader";
import { CommuteEta } from "./components/CommuteEta";
import { CommutePlaceManager } from "./components/CommutePlaceManager";
import { CommuteProcedureEditor } from "./components/CommuteProcedureEditor";
import { CommuteSwitch } from "./components/CommuteSwitch";
import { FavoriteDepartures } from "./components/FavoriteDepartures";
import { MapPicker } from "./components/MapPicker";
import { MapStage } from "./components/MapStage";
import { SubwayArrivalList } from "./components/SubwayArrivalList";
import { SubwayPicker } from "./components/SubwayPicker";
import type { BusStop, CommuteDirection } from "./domain/bus";
import type {
  CommuteFavorite,
  CommuteFavoriteId,
  CommuteProcedureId,
} from "./domain/commute";
import type { SubwayStation } from "./domain/subway";
import {
  koreanDirectionParticle,
  koreanObjectParticle,
} from "./domain/koreanParticles";
import type {
  CommuteFavoriteInput,
  CommuteProcedureInput,
} from "./hooks/useCommuteProcedures";
import { useCommuteDailyLive } from "./hooks/useCommuteDailyLive";
import { useArrivalDetail } from "./hooks/useArrivalDetail";
import { getActivePlace, getActiveProcedure, getActiveStop, useCommuteStops } from "./hooks/useCommuteStops";
import { useMediaQuery } from "./hooks/useMediaQuery";

const DEFAULT_MAP_CENTER = { lat: 37.5366, lng: 127.1253 };
const NO_FAVORITES: readonly CommuteFavorite[] = [];

export function App() {
  const isDesktop = useMediaQuery("(min-width: 960px)");
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
    addProcedure,
    editProcedure,
    removeProcedure,
    reorderProcedure,
    selectProcedure,
    pinFavorite,
    unpinFavorite,
    updateFavorite,
  } = useCommuteStops();
  const [pickerMode, setPickerMode] = useState<"bus" | "subway" | null>(null);
  const [saveAnnouncement, setSaveAnnouncement] = useState("");
  const [selectedStation, setSelectedStation] = useState<SubwayStation | null>(
    null,
  );
  const [editorTarget, setEditorTarget] = useState<
    "new" | CommuteProcedureId | null
  >(null);
  const [stageSearchRequest, setStageSearchRequest] = useState(0);

  const collection = commutes[direction];
  const activePlace = getActivePlace(collection);
  const selectedStop = getActiveStop(activePlace);
  const mapAnchor =
    selectedStop ?? activePlace?.subwayStations[0] ?? null;
  const mapCenter = mapAnchor
    ? { lat: mapAnchor.lat, lng: mapAnchor.lng }
    : DEFAULT_MAP_CENTER;
  const activeProcedure = getActiveProcedure(activePlace);
  const favorites = activePlace?.favorites ?? NO_FAVORITES;
  const readyProcedure =
    activeProcedure?.kind === "ready" ? activeProcedure : null;

  const live = useCommuteDailyLive(activeProcedure, favorites);
  const { busDetail, subwayDetail, refreshBusDetail, refreshSubwayDetail } =
    useArrivalDetail({
      selectedStop,
      selectedStation,
      live: {
        queries: live.queries,
        snapshots: live.snapshots,
        refresh: live.refresh,
      },
    });

  const handleDirectionChange = (next: CommuteDirection) => {
    setDirection(next);
    setSelectedStation(null);
  };

  const handleSelectStation = (station: SubwayStation) => {
    setSelectedStation((current) =>
      current?.id === station.id ? null : station,
    );
  };

  const saveNearbySubwayStation = (station: SubwayStation) => {
    if (!activePlace) {
      return;
    }
    saveSubwayStations([station]);
  };

  
const saveNearbyStop = (stop: BusStop) => {
    if (!activePlace || activePlace.stops.some((saved) => saved.id === stop.id)) {
      return;
    }
    addStop(direction, activePlace.id, stop);
    setSaveAnnouncement(
      `${stop.name} 정류장을 ${activePlace.name}에 저장했습니다.`,
    );
  };

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

  const editingProcedure =
    editorTarget === null || editorTarget === "new"
      ? null
      : (activePlace?.procedures.find(
          (procedure) => procedure.id === editorTarget,
        ) ?? null);

  const saveProcedure = (procedure: CommuteProcedureInput) => {
    if (!activePlace) {
      return;
    }
    if (editorTarget === "new") {
      addProcedure(direction, activePlace.id, procedure);
    } else if (editorTarget !== null) {
      editProcedure(direction, activePlace.id, editorTarget, procedure);
    }
    setEditorTarget(null);
    setSaveAnnouncement(`${procedure.name} 절차를 저장했습니다.`);
  };

  const editActiveProcedure = () => {
    if (readyProcedure !== null) {
      setEditorTarget(readyProcedure.id);
    }
  };

  const handlePinFavorite = (favorite: CommuteFavoriteInput) => {
    if (activePlace) {
      pinFavorite(direction, activePlace.id, favorite);
    }
  };

  const handleUnpinFavorite = (favoriteId: CommuteFavoriteId) => {
    if (activePlace) {
      unpinFavorite(direction, activePlace.id, favoriteId);
    }
  };

  const handleUpdateFavorite = (
    favoriteId: CommuteFavoriteId,
    favorite: CommuteFavoriteInput,
  ) => {
    if (activePlace) {
      updateFavorite(direction, activePlace.id, favoriteId, favorite);
    }
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

        <CommuteSwitch value={direction} onChange={handleDirectionChange} />

        <div
          id="commute-panel"
          className="rail-scroll"
          role="tabpanel"
          aria-labelledby={`commute-tab-${direction}`}
        >
          {readyProcedure && live.estimate !== null ? (
            <CommuteEta
              procedure={readyProcedure}
              result={live.estimate}
              refreshing={live.refreshing}
              onEditProcedure={editActiveProcedure}
              onRefresh={live.refresh}
            />
          ) : null}

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
              setSaveAnnouncement(`${name}${koreanDirectionParticle(name)} 장소 이름을 변경했습니다.`);
            }}
            onRemovePlace={(placeId) => {
              removePlace(direction, placeId);
              setSaveAnnouncement(`${activePlace?.name ?? "선택한 장소"}${koreanObjectParticle(activePlace?.name ?? "장소")} 삭제했습니다.`);
            }}
            onSelectPlace={(placeId) => {
              selectPlace(direction, placeId);
              setSelectedStation(null);
            }}
            onAddStop={() => {
              if (isDesktop) {
                setStageSearchRequest((current) => current + 1);
                return;
              }
              setPickerMode("bus");
            }}
            onAddSubway={() => {
              if (isDesktop) {
                setStageSearchRequest((current) => current + 1);
                return;
              }
              setPickerMode("subway");
            }}
            onRemoveStop={(stopId) => {
              const stop = activePlace?.stops.find((item) => item.id === stopId);
              if (activePlace) {
                removeStop(direction, activePlace.id, stopId);
                setSaveAnnouncement(
                  `${stop?.name ?? "선택한 정류장"} 정류장을 삭제했습니다.`,
                );
              }
            }}
            onSelectStop={(stopId) => {
              setSelectedStation(null);
              activePlace && selectStop(direction, activePlace.id, stopId);
            }}
            selectedSubwayStationId={selectedStation?.id ?? null}
            onSelectSubway={handleSelectStation}
            onRemoveSubway={(stationId) => {
              if (activePlace) {
                removeSubwayStation(direction, activePlace.id, stationId);
                if (selectedStation?.id === stationId) {
                  setSelectedStation(null);
                }
                setSaveAnnouncement("지하철역을 경로에서 삭제했습니다.");
              }
            }}
            onAddProcedure={() => setEditorTarget("new")}
            onEditProcedure={(procedureId) => setEditorTarget(procedureId)}
            onSelectProcedure={(procedureId) =>
              activePlace &&
              selectProcedure(direction, activePlace.id, procedureId)
            }
            onRemoveProcedure={(procedureId) => {
              if (activePlace) {
                removeProcedure(direction, activePlace.id, procedureId);
                setSaveAnnouncement("통근 절차를 삭제했습니다.");
              }
            }}
            onReorderProcedure={(procedureId, toIndex) =>
              activePlace &&
              reorderProcedure(direction, activePlace.id, procedureId, toIndex)
            }
          />

          {editorTarget !== null && activePlace ? (
            <CommuteProcedureEditor
              direction={direction}
              place={activePlace}
              procedure={editingProcedure}
              onSave={saveProcedure}
              onCancel={() => setEditorTarget(null)}
            />
          ) : null}

          <FavoriteDepartures
            favorites={favorites}
            snapshots={live.snapshots}
            now={live.now}
            onRefresh={live.refresh}
            onUpdateFavorite={handleUpdateFavorite}
            onUnpinFavorite={handleUnpinFavorite}
          />

          {selectedStation ? (
            <SubwayArrivalList
              stationName={selectedStation.name}
              arrivals={subwayDetail.arrivals}
              loading={subwayDetail.loading}
              error={subwayDetail.error}
              updatedAt={subwayDetail.updatedAt}
              onClose={() => setSelectedStation(null)}
              onRefresh={refreshSubwayDetail}
              favoriteControls={{
                station: selectedStation,
                apiStationName: selectedStation.name,
                favorites,
                onPinFavorite: handlePinFavorite,
                onUnpinFavorite: handleUnpinFavorite,
              }}
            />
          ) : (
            <ArrivalList
              arrivals={busDetail.arrivals}
              loading={busDetail.loading}
              error={busDetail.error}
              updatedAt={busDetail.updatedAt}
              hasStop={Boolean(selectedStop)}
              onRefresh={refreshBusDetail}
              {...(selectedStop
                ? {
                    favoriteControls: {
                      stop: selectedStop,
                      favorites,
                      onPinFavorite: handlePinFavorite,
                      onUnpinFavorite: handleUnpinFavorite,
                    },
                  }
                : {})}
            />
          )}
        </div>
      </aside>

      <MapStage
        key={`stage-${direction}-${activePlace?.id ?? "empty"}`}
        direction={direction}
        place={activePlace}
        selectedStop={selectedStop}
        selectedSubwayStationId={selectedStation?.id ?? null}
        center={mapCenter}
        searchRequest={stageSearchRequest}
        isDesktop={isDesktop}
        onSelectStop={(stopId) =>
          activePlace && selectStop(direction, activePlace.id, stopId)
        }
        onSelectSubway={handleSelectStation}
        onSaveStop={saveNearbyStop}
        onSaveSubwayStation={saveNearbySubwayStation}
      />

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
