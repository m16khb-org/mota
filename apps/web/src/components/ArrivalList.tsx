import { Accessibility, ArrowRight, Gauge, RefreshCw } from "lucide-react";
import { useId } from "react";
import type { BusArrival } from "../domain/bus";

interface ArrivalListProps {
	readonly stopName: string | null;
	readonly arrivals: readonly BusArrival[];
	readonly loading: boolean;
	readonly error: string | null;
	readonly updatedAt: string | null;
	readonly hasStop: boolean;
	readonly onRefresh: () => void;
}

function formatEta(seconds: number | null, fallback: string): string {
	if (seconds === null) {
		return fallback;
	}
	if (seconds < 60) {
		return "곧 도착";
	}
	return `${Math.floor(seconds / 60)}분`;
}

function formatArrivalMessage(message: string): string {
	return message
		.replace(/(\d+)\s*분\s*후/g, "$1분 후")
		.replace(/(\d+)\s*초\s*후/g, "$1초 후");
}

function formatUpdatedAt(value: string): string {
	return new Intl.DateTimeFormat("ko-KR", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "Asia/Seoul",
	}).format(new Date(value));
}

export function ArrivalList({
	stopName,
	arrivals,
	loading,
	error,
	updatedAt,
	hasStop,
	onRefresh,
}: ArrivalListProps) {
	const titleId = useId();
	const refreshLabel =
		stopName === null
			? "버스 도착정보 새로고침"
			: `${stopName} 버스 도착정보 새로고침`;
	return (
		<section
			className="arrivals"
			aria-labelledby={titleId}
			data-arrival-state={
				error
					? "error"
					: loading
						? "loading"
						: arrivals.length > 0
							? "ready"
							: hasStop
								? "empty"
								: "idle"
			}
		>
			<div className="section-heading">
				<div>
					<span className="eyebrow">곧 오는 순서</span>
					<h2 id={titleId}>
						{stopName === null ? "다음\u00a0버스" : `${stopName} 다음\u00a0버스`}
					</h2>
				</div>
				{hasStop ? (
					<button
						className="refresh-button"
						type="button"
						onClick={onRefresh}
						disabled={loading}
						aria-label={refreshLabel}
					>
						<RefreshCw aria-hidden="true" />
						<span>새로고침</span>
					</button>
				) : null}
			</div>

			<p className="refresh-status" aria-live="polite">
				{loading
					? "도착 정보를 새로 받고 있어요."
					: updatedAt
						? `${formatUpdatedAt(updatedAt)}에 새로 받았어요.`
						: "정류장을 고르면 가장 빠른 버스 3대를 보여드려요."}
			</p>

			{error ? (
				<div className="arrival-error" role="alert" data-state="error">
					<p>{error}</p>
					<button type="button" onClick={onRefresh}>
						다시 시도
					</button>
				</div>
			) : null}

			{!loading && hasStop && !error && arrivals.length === 0 ? (
				<p className="arrival-empty" data-state="empty">
					지금 도착 예정인 버스가 없어요. 잠시 후 다시 확인해 주세요.
				</p>
			) : null}

			{loading && arrivals.length === 0 ? (
				<div className="arrival-skeleton" aria-hidden="true" data-state="loading">
					<span />
					<span />
					<span />
				</div>
			) : null}

			<div className="arrival-list">
				{arrivals.slice(0, 3).map((arrival, index) => (
					<article
						className={`arrival-row${index === 0 ? " is-primary" : ""}${arrival.first.seconds === null ? " is-inactive" : ""
							}`}
						data-route-type={arrival.routeType}
						key={`${arrival.routeId}-${arrival.direction}`}
					>
						<span className="arrival-route-band" aria-hidden="true" />
						<div className="arrival-card-content">
							<div className="route-identity-wrap">
								<span className="arrival-rank" aria-hidden="true">
									{index + 1}
								</span>
								<span className="sr-only">
									{index + 1}번째로 빠른 버스
								</span>
								<div className="route-identity">
									<span
										className="route-badge"
										data-route-type={arrival.routeType}
									>
										{arrival.routeName}
									</span>
									<strong>
										{arrival.direction} <ArrowRight aria-hidden="true" />
									</strong>
								</div>
							</div>
							<div className="arrival-meta">
								<span>{formatArrivalMessage(arrival.first.message)}</span>
								{arrival.lowFloor ? (
									<span title="저상버스">
										<Accessibility aria-hidden="true" /> 저상
									</span>
								) : null}
								{arrival.first.congestion ? (
									<span>
										<Gauge aria-hidden="true" /> {arrival.first.congestion}
									</span>
								) : null}
								{arrival.second ? (
									<span>다음 {formatArrivalMessage(arrival.second.message)}</span>
								) : null}
							</div>
							<div className="eta-block">
								<strong>
									{formatEta(arrival.first.seconds, arrival.first.message)}
								</strong>
							</div>
						</div>
					</article>
				))}
			</div>
		</section>
	);
}
