import { ArrowDown, ArrowRight, ArrowUp, RefreshCw } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import type { SubwayArrival } from "../domain/subway";
import { subwayEtaDisplay } from "../domain/subwayEta";
import { useElapsedSeconds } from "../hooks/useElapsedSeconds";

interface SubwayArrivalListProps {
	readonly stationName: string;
	readonly preferredLine?: string;
	readonly arrivals: readonly SubwayArrival[];
	readonly loading: boolean;
	readonly error: string | null;
	readonly updatedAt: string | null;
	readonly onRefresh: () => void;
}

interface DirectionOption {
	readonly key: string;
	readonly line: string;
	readonly updnLine: string;
}

function directionKey(arrival: SubwayArrival): string {
	return `${arrival.subwayId}:${arrival.updnLine}`;
}

function formatEta(seconds: number | null): string {
	if (seconds === null) {
		return "정보 없음";
	}
	if (seconds < 60) {
		return "곧 도착";
	}
	return `${Math.floor(seconds / 60)}분`;
}

function formatUpdatedAt(value: string): string {
	return new Intl.DateTimeFormat("ko-KR", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "Asia/Seoul",
	}).format(new Date(value));
}

function rowElapsedSeconds(
	generatedAt: string,
	updatedAt: string | null,
	elapsedSeconds: number,
): number {
	if (updatedAt === null) {
		return elapsedSeconds;
	}
	const rowDelaySeconds = Math.max(
		0,
		Math.floor(
			(new Date(updatedAt).getTime() - new Date(generatedAt).getTime()) /
			1_000,
		),
	);
	return elapsedSeconds + rowDelaySeconds;
}

function DirectionIcon({ updnLine }: { readonly updnLine: string }) {
	if (updnLine.includes("상행")) {
		return <ArrowUp aria-hidden="true" />;
	}
	if (updnLine.includes("하행")) {
		return <ArrowDown aria-hidden="true" />;
	}
	return <ArrowRight aria-hidden="true" />;
}

export function SubwayArrivalList({
	stationName,
	preferredLine,
	arrivals,
	loading,
	error,
	updatedAt,
	onRefresh,
}: SubwayArrivalListProps) {
	const elapsedSeconds = useElapsedSeconds(updatedAt);
	const directions = useMemo(() => {
		const options = new Map<string, DirectionOption>();
		for (const arrival of arrivals) {
			const key = directionKey(arrival);
			if (!options.has(key)) {
				options.set(key, {
					key,
					line: arrival.line,
					updnLine: arrival.updnLine,
				});
			}
		}
		return [...options.values()];
	}, [arrivals]);
	const [selectedDirection, setSelectedDirection] = useState<string | null>(
		null,
	);
	const directionGroups = useMemo(() => {
		const groups = new Map<string, DirectionOption[]>();
		for (const direction of directions) {
			const current = groups.get(direction.line) ?? [];
			groups.set(direction.line, [...current, direction]);
		}
		return [...groups.entries()];
	}, [directions]);
	const activeDirection = directions.some(
		(direction) => direction.key === selectedDirection,
	)
		? selectedDirection
		: (directions.find((direction) => direction.line === preferredLine)?.key ??
			directions[0]?.key ??
			null);
	const visibleArrivals =
		activeDirection === null
			? []
			: arrivals
				.filter((arrival) => directionKey(arrival) === activeDirection)
				.map((arrival) => ({
					arrival,
					eta: subwayEtaDisplay(
						arrival.seconds,
						arrival.message,
						rowElapsedSeconds(
							arrival.generatedAt,
							updatedAt,
							elapsedSeconds,
						),
					),
				}))
				.sort(
					(left, right) =>
						(left.eta.remainingSeconds ?? Number.POSITIVE_INFINITY) -
						(right.eta.remainingSeconds ?? Number.POSITIVE_INFINITY),
				)
				.slice(0, 3);
	const moveDirectionFocus = (
		event: KeyboardEvent<HTMLButtonElement>,
		currentKey: string,
	) => {
		const currentIndex = directions.findIndex(
			(direction) => direction.key === currentKey,
		);
		let nextIndex: number;
		switch (event.key) {
			case "ArrowRight":
			case "ArrowDown":
				nextIndex = (currentIndex + 1) % directions.length;
				break;
			case "ArrowLeft":
			case "ArrowUp":
				nextIndex = (currentIndex - 1 + directions.length) % directions.length;
				break;
			case "Home":
				nextIndex = 0;
				break;
			case "End":
				nextIndex = directions.length - 1;
				break;
			default:
				return;
		}
		const nextDirection = directions[nextIndex];
		if (nextDirection === undefined) {
			return;
		}
		event.preventDefault();
		setSelectedDirection(nextDirection.key);
		document.getElementById(`direction-tab-${nextDirection.key}`)?.focus();
	};

	return (
		<section className="arrivals" aria-labelledby="subway-arrival-title">
			<div className="section-heading">
				<div>
					<span className="eyebrow">곧 오는 순서</span>
					<h2 id="subway-arrival-title">{stationName} 다음 열차</h2>
				</div>
				<button
					className="refresh-button"
					type="button"
					onClick={onRefresh}
					disabled={loading}
					aria-label="지하철 도착정보 새로고침"
				>
					<RefreshCw aria-hidden="true" />
					<span>새로고침</span>
				</button>
			</div>

			<p className="refresh-status" aria-live="polite">
				{loading
					? "도착 정보를 새로 받고 있어요."
					: updatedAt
						? `${formatUpdatedAt(updatedAt)}에 새로 받았어요.`
						: "역을 고르면 방향별 가까운 열차 3대를 보여드려요."}
			</p>

			{directions.length > 0 ? (
				<div
					className="direction-tabs"
					role="tablist"
					aria-label="지하철 방향 선택"
				>
					{directionGroups.map(([line, options]) => (
						<div className="direction-group" role="presentation" key={line}>
							<span className="direction-line">{line}</span>
							<div className="direction-options" role="presentation">
								{options.map((direction) => (
									<button
										key={direction.key}
										id={`direction-tab-${direction.key}`}
										type="button"
										role="tab"
										aria-label={`${direction.line} ${direction.updnLine}`}
										aria-selected={activeDirection === direction.key}
										tabIndex={activeDirection === direction.key ? 0 : -1}
										onClick={() => setSelectedDirection(direction.key)}
										onKeyDown={(event) =>
											moveDirectionFocus(event, direction.key)
										}
									>
										<DirectionIcon updnLine={direction.updnLine} />
										{direction.updnLine}
									</button>
								))}
							</div>
						</div>
					))}
				</div>
			) : null}

			{error ? (
				<div className="arrival-error" role="alert">
					<p>{error}</p>
					<button type="button" onClick={onRefresh}>
						다시 시도
					</button>
				</div>
			) : null}

			{!loading && !error && arrivals.length === 0 ? (
				<p className="arrival-empty">
					지금 도착 예정인 열차가 없어요. 잠시 후 다시 확인해 주세요.
				</p>
			) : null}

			{loading && arrivals.length === 0 ? (
				<div className="arrival-skeleton" aria-hidden="true">
					<span />
					<span />
					<span />
				</div>
			) : null}

			<div className="arrival-list">
				{visibleArrivals.map(({ arrival, eta }, index) => {
					return (
						<article
							className={`arrival-row is-subway${eta.remainingSeconds === null ? " is-inactive" : ""
								}`}
							key={`${arrival.id}-${arrival.direction}-${arrival.message}`}
						>
							<div className="route-identity-wrap">
								<span className="arrival-rank" aria-hidden="true">
									{index + 1}
								</span>
								<span className="sr-only">
									{index + 1}번째로 빠른 열차
								</span>
								<div className="route-identity">
									<span className="subway-line-badge">{arrival.line}</span>
									<span className="subway-direction">{arrival.direction}</span>
								</div>
							</div>
							<div className="arrival-meta">
								<span>{arrival.trainStatus}</span>
								{arrival.isLastTrain ? <span>막차</span> : null}
							</div>
							<div className="eta-block">
								<strong>{formatEta(eta.remainingSeconds)}</strong>
								<span>{eta.message}</span>
								{arrival.location ? (
									<small>{arrival.location} 부근</small>
								) : null}
							</div>
						</article>
					);
				})}
			</div>
		</section>
	);
}
