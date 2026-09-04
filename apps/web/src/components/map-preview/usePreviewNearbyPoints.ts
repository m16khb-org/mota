import { useCallback, useEffect, useRef, useState } from "react";
import {
	fetchNearbyStops,
	fetchNearbySubwayStations,
} from "../../api/client";
import type { BusStop } from "../../domain/bus";
import type { SubwayStation } from "../../domain/subway";

export interface PreviewCenter {
	readonly lat: number;
	readonly lng: number;
}

export type PreviewCatalogStatus = "loading" | "success" | "empty" | "error";

export interface PreviewCatalogState<T> {
	readonly items: readonly T[];
	readonly status: PreviewCatalogStatus;
	readonly error: unknown | null;
	readonly retry: () => void;
}

export interface PreviewNearbyPoints {
	readonly bus: PreviewCatalogState<BusStop>;
	readonly subway: PreviewCatalogState<SubwayStation>;
}

type CatalogState<T> = Omit<PreviewCatalogState<T>, "retry">;

const INITIAL_BUS_STATE: CatalogState<BusStop> = {
	items: [],
	status: "loading",
	error: null,
};

const INITIAL_SUBWAY_STATE: CatalogState<SubwayStation> = {
	items: [],
	status: "loading",
	error: null,
};

export function usePreviewNearbyPoints(
	center: PreviewCenter,
): PreviewNearbyPoints {
	const latIdentity = center.lat.toFixed(6);
	const lngIdentity = center.lng.toFixed(6);
	const centerRef = useRef<PreviewCenter>({
		lat: Number(latIdentity),
		lng: Number(lngIdentity),
	});
	centerRef.current = {
		lat: Number(latIdentity),
		lng: Number(lngIdentity),
	};

	const [busState, setBusState] =
		useState<CatalogState<BusStop>>(INITIAL_BUS_STATE);
	const [subwayState, setSubwayState] =
		useState<CatalogState<SubwayStation>>(INITIAL_SUBWAY_STATE);
	const busControllerRef = useRef<AbortController | null>(null);
	const subwayControllerRef = useRef<AbortController | null>(null);
	const busGenerationRef = useRef(0);
	const subwayGenerationRef = useRef(0);

	const loadBus = useCallback((targetCenter: PreviewCenter) => {
		busControllerRef.current?.abort();
		const controller = new AbortController();
		busControllerRef.current = controller;
		const generation = busGenerationRef.current + 1;
		busGenerationRef.current = generation;
		setBusState((current) => ({
			...current,
			status: "loading",
			error: null,
		}));

		void fetchNearbyStops(targetCenter, 800, controller.signal).then(
			(items) => {
				if (
					controller.signal.aborted ||
					busGenerationRef.current !== generation
				) {
					return;
				}
				setBusState({
					items,
					status: items.length === 0 ? "empty" : "success",
					error: null,
				});
			},
			(error: unknown) => {
				if (
					controller.signal.aborted ||
					busGenerationRef.current !== generation
				) {
					return;
				}
				setBusState((current) => ({
					...current,
					status: "error",
					error,
				}));
			},
		);
	}, []);

	const loadSubway = useCallback((targetCenter: PreviewCenter) => {
		subwayControllerRef.current?.abort();
		const controller = new AbortController();
		subwayControllerRef.current = controller;
		const generation = subwayGenerationRef.current + 1;
		subwayGenerationRef.current = generation;
		setSubwayState((current) => ({
			...current,
			status: "loading",
			error: null,
		}));

		void fetchNearbySubwayStations(targetCenter, 3000, controller.signal).then(
			(items) => {
				if (
					controller.signal.aborted ||
					subwayGenerationRef.current !== generation
				) {
					return;
				}
				setSubwayState({
					items,
					status: items.length === 0 ? "empty" : "success",
					error: null,
				});
			},
			(error: unknown) => {
				if (
					controller.signal.aborted ||
					subwayGenerationRef.current !== generation
				) {
					return;
				}
				setSubwayState((current) => ({
					...current,
					status: "error",
					error,
				}));
			},
		);
	}, []);

	useEffect(() => {
		const targetCenter = {
			lat: Number(latIdentity),
			lng: Number(lngIdentity),
		};
		loadBus(targetCenter);
		loadSubway(targetCenter);

		return () => {
			busControllerRef.current?.abort();
			subwayControllerRef.current?.abort();
		};
	}, [latIdentity, lngIdentity, loadBus, loadSubway]);

	const retryBus = useCallback(() => {
		loadBus(centerRef.current);
	}, [loadBus]);

	const retrySubway = useCallback(() => {
		loadSubway(centerRef.current);
	}, [loadSubway]);

	return {
		bus: { ...busState, retry: retryBus },
		subway: { ...subwayState, retry: retrySubway },
	};
}
