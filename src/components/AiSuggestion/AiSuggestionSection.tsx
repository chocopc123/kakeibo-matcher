import { Clock, Settings, Sparkles } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import {
	type AiReviewHistory,
	type AiSuggestion,
	useGeminiAssist,
	getApiKey,
} from "../../hooks/useGeminiAssist";
import type { ComparisonResult } from "../../types";
import AiApiKeyModal from "../AiApiKeyModal/AiApiKeyModal";
import AiHistoryPanel from "./AiHistoryPanel";
import AiReviewDashboard from "./AiReviewDashboard";

interface AiSuggestionSectionProps {
	result: ComparisonResult;
	aiMatched: AiSuggestion[];
	setAiMatched: React.Dispatch<React.SetStateAction<AiSuggestion[]>>;
	// For Storybook / Testing
	initialSuggestions?: AiSuggestion[];
	initialHistory?: AiReviewHistory[];
	initialLoading?: boolean;
	initialError?: string | null;
	onScan?: (
		householdOnly: ComparisonResult["householdOnly"],
		cardOnly: ComparisonResult["cardOnly"],
	) => Promise<AiSuggestion[]>;
}

const AiSuggestionSection: React.FC<AiSuggestionSectionProps> = ({
	result,
	aiMatched,
	setAiMatched,
	initialSuggestions = [],
	initialHistory = [],
	initialLoading = false,
	initialError = null,
	onScan,
}) => {
	const [aiSuggestions, setAiSuggestions] =
		useState<AiSuggestion[]>(initialSuggestions);
	const [aiHistory, setAiHistory] = useState<AiReviewHistory[]>(initialHistory);
	const [showAiDashboard, setShowAiDashboard] = useState(false);
	const [showAiHistory, setShowAiHistory] = useState(false);
	const [showApiKeyModal, setShowApiKeyModal] = useState(false);
	const {
		analyzeUnmatched: hookAnalyze,
		isLoading: hookIsLoading,
		error: hookError,
	} = useGeminiAssist();

	const analyzeUnmatched = onScan || hookAnalyze;

	const isLoading = hookIsLoading || initialLoading;
	const aiError = hookError || initialError;

	useEffect(() => {
		// resultが変わった時にリセットする（linter回避のため参照）
		void result;

		// 初回レンダリング時かつStorybook等から初期値が与えられている場合はリセットしない
		if (
			initialSuggestions.length > 0 ||
			initialHistory.length > 0 ||
			initialLoading ||
			initialError
		)
			return;

		setAiSuggestions([]);
		setAiHistory([]);
		setShowAiDashboard(false);
		setShowAiHistory(false);
	}, [
		result,
		initialSuggestions.length,
		initialHistory.length,
		initialLoading,
		initialError,
	]); // resultが変わった時（新しいファイルをアップロードした時など）にリセットする

	const handleAiScan = async (forceRescan = false) => {
		if (!forceRescan && aiSuggestions.length > 0) {
			setShowAiDashboard(true);
			return;
		}

		const apiKey = getApiKey();
		if (!apiKey) {
			setShowApiKeyModal(true);
			return;
		}

		const suggestions = await analyzeUnmatched(
			result.householdOnly,
			result.cardOnly,
		);

		const matchedHouseIndices = new Set(
			aiMatched.flatMap((m) => m.householdIndices),
		);
		const matchedCardIndices = new Set(aiMatched.flatMap((m) => m.cardIndices));

		// 既に承認されたものを除外
		const newSuggestions = suggestions.filter(
			(s) =>
				!s.householdIndices.some((idx) => matchedHouseIndices.has(idx)) &&
				!s.cardIndices.some((idx) => matchedCardIndices.has(idx)),
		);

		setAiSuggestions(newSuggestions);
		if (newSuggestions.length > 0) {
			setShowAiDashboard(true);
		} else if (!aiError) {
			alert("AIが提案できるマッチングが見つかりませんでした。");
		}
	};

	const handleApproveSuggestion = (suggestion: AiSuggestion) => {
		setAiHistory((prev) => [
			{ suggestion, action: "approve", timestamp: Date.now() },
			...prev,
		]);
		setAiMatched((prev) => [...prev, suggestion]);
		setAiSuggestions((prev) => {
			// 今回承認したものを除外
			let next = prev.filter((s) => s.id !== suggestion.id);
			// 承認されたものと競合(インデックスの重複)する他の候補も除外
			next = next.filter((s) => {
				const hasHConflict = s.householdIndices.some((idx) =>
					suggestion.householdIndices.includes(idx),
				);
				const hasCConflict = s.cardIndices.some((idx) =>
					suggestion.cardIndices.includes(idx),
				);
				return !hasHConflict && !hasCConflict;
			});

			if (next.length === 0) setShowAiDashboard(false);
			return next;
		});
	};

	const handleRejectSuggestion = (suggestion: AiSuggestion) => {
		setAiHistory((prev) => [
			{ suggestion, action: "reject", timestamp: Date.now() },
			...prev,
		]);
		setAiSuggestions((prev) => {
			const next = prev.filter((s) => s.id !== suggestion.id);
			if (next.length === 0) setShowAiDashboard(false);
			return next;
		});
	};

	const handleUndoAiAction = (historyItem: AiReviewHistory) => {
		setAiHistory((prev) =>
			prev.filter((h) => h.suggestion.id !== historyItem.suggestion.id),
		);

		if (historyItem.action === "approve") {
			setAiMatched((prev) =>
				prev.filter((m) => m.id !== historyItem.suggestion.id),
			);
		}

		setAiSuggestions((prev) => [historyItem.suggestion, ...prev]);
	};

	if (result.householdOnly.length === 0 && result.cardOnly.length === 0) {
		return null;
	}

	return (
		<>
			<div
				style={{
					marginTop: "2rem",
					display: "flex",
					justifyContent: "center",
					gap: "1rem",
					alignItems: "flex-start",
					flexWrap: "wrap",
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
						<button
							type="button"
							onClick={() => handleAiScan(false)}
							disabled={isLoading}
							className="btn-ai"
						>
							<Sparkles size={20} className="sparkle-icon" />
							{isLoading
								? "AIが分析中..."
								: aiSuggestions.length > 0
									? `AIの提案を確認 (${aiSuggestions.length}件)`
									: "Gemini AIで未照合項目をスキャン"}
						</button>
						<button
							type="button"
							onClick={() => setShowApiKeyModal(true)}
							style={{
								background: "none",
								border: "none",
								cursor: "pointer",
								padding: "0.5rem",
								color: "#666",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
							title="APIキー設定"
						>
							<Settings size={20} />
						</button>
					</div>
					{aiSuggestions.length > 0 && (
						<button
							type="button"
							onClick={() => handleAiScan(true)}
							disabled={isLoading}
							style={{
								background: "none",
								border: "none",
								color: "#666",
								textDecoration: "underline",
								marginTop: "0.5rem",
								cursor: "pointer",
								fontSize: "0.9rem",
							}}
						>
							最初から再スキャンする
						</button>
					)}
					{aiError && aiError !== "API_KEY_MISSING" && (
						<p
							style={{
								color: "red",
								marginTop: "0.5rem",
								fontSize: "0.9rem",
							}}
						>
							{aiError}
						</p>
					)}
				</div>

				{aiHistory.length > 0 && (
					<button
						type="button"
						onClick={() => setShowAiHistory(true)}
						className="btn-ai"
						style={{
							background: "white",
							color: "#333",
							border: "1px solid #ccc",
							boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
						}}
					>
						<Clock
							size={20}
							className="sparkle-icon"
							style={{ color: "#666" }}
						/>
						履歴を確認 ({aiHistory.length}件)
					</button>
				)}
			</div>

			{showAiDashboard && (
				<AiReviewDashboard
					suggestions={aiSuggestions}
					householdOnly={result.householdOnly}
					cardOnly={result.cardOnly}
					onApprove={handleApproveSuggestion}
					onReject={handleRejectSuggestion}
					onClose={() => setShowAiDashboard(false)}
				/>
			)}
			{showAiHistory && (
				<AiHistoryPanel
					history={aiHistory}
					householdOnly={result.householdOnly}
					cardOnly={result.cardOnly}
					onUndo={handleUndoAiAction}
					onClose={() => setShowAiHistory(false)}
				/>
			)}

			<AiApiKeyModal
				isOpen={showApiKeyModal}
				onClose={() => setShowApiKeyModal(false)}
				onSave={() => {
					// ユーザーがAPIキーを保存したらスキャンを実行する
					handleAiScan(true);
				}}
			/>
		</>
	);
};

export default AiSuggestionSection;
