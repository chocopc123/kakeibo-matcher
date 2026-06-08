import { GoogleGenerativeAI } from "@google/generative-ai";
import { useState } from "react";
import type { CardRecord, HouseholdRecord } from "../types";

export interface AiSuggestion {
	id: string;
	householdIndices: number[];
	cardIndices: number[];
	reason: string;
	confidence: "High" | "Medium" | "Low";
}

export interface AiReviewHistory {
	suggestion: AiSuggestion;
	action: "approve" | "reject";
	timestamp: number;
}

export const useGeminiAssist = () => {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const analyzeUnmatched = async (
		householdOnly: HouseholdRecord[],
		cardOnly: CardRecord[],
	): Promise<AiSuggestion[]> => {
		const apiKey =
			import.meta.env.VITE_GEMINI_API_KEY ||
			localStorage.getItem("GEMINI_API_KEY");
		if (!apiKey) {
			setError("API_KEY_MISSING");
			return [];
		}

		if (householdOnly.length === 0 || cardOnly.length === 0) {
			return [];
		}

		setIsLoading(true);
		setError(null);

		try {
			const genAI = new GoogleGenerativeAI(apiKey);
			const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

			const householdData = householdOnly.map((r, i) => ({
				id: i,
				date: r.日付,
				content: r.内容,
				amount: r["金額(￥)"],
			}));

			const cardData = cardOnly.map((r, i) => ({
				id: i,
				date: r.利用日,
				name: r.店名,
				amount: r.支払金額,
			}));

			const prompt = `あなたは家計簿とクレジットカード明細の照合アシスタントです。
以下の「家計簿の未照合項目（household）」と「カード明細の未照合項目（card）」から、同一の支払いである可能性が高いペアやグループを見つけてください。

判断基準:
1. 店名・内容の類似性（例: "Amazon" と "アマゾン"、"コンビニ" と "セブンイレブン" など）
2. 日付の近さ（カード明細の利用日が数日ずれることがあります）
3. 金額の微差や、ポイント利用による差額
4. 複数の家計簿項目が1つのカード明細で決済されている（1:N）ケース、またはその逆

出力フォーマットは以下のJSONのみを出力してください（Markdownのバッククォートなどは含めないでください）。
確信度(confidence)は、"High"(ほぼ確実)、"Medium"(可能性が高い)、"Low"(推測の域)のいずれかで指定してください。
{
  "matches": [
    {
      "householdIds": [0],
      "cardIds": [1],
      "reason": "店名が類似しており、日付が1日違いで金額が一致しているため",
      "confidence": "High"
    }
  ]
}

データ:
Households:
${JSON.stringify(householdData, null, 2)}

Cards:
${JSON.stringify(cardData, null, 2)}`;

			const result = await model.generateContent(prompt);
			const responseText = result.response.text();

			// JSON部分の抽出 (Markdownのバッククォートが含まれている場合を想定)
			const jsonMatch =
				responseText.match(/```json\n([\s\S]*?)\n```/) ||
				responseText.match(/```([\s\S]*?)```/);
			const parseTarget = jsonMatch ? jsonMatch[1] : responseText;

			const parsed = JSON.parse(parseTarget);

			interface RawAiMatch {
				householdIds: number[];
				cardIds: number[];
				reason: string;
				confidence: "High" | "Medium" | "Low";
			}

			if (parsed.matches && Array.isArray(parsed.matches)) {
				return (parsed.matches as RawAiMatch[])
					.filter((m) => {
						// インデックスが有効な範囲内にあるかチェック
						const hValid = m.householdIds.every(
							(id) => id >= 0 && id < householdOnly.length,
						);
						const cValid = m.cardIds.every(
							(id) => id >= 0 && id < cardOnly.length,
						);
						return hValid && cValid;
					})
					.map((m, idx) => ({
						id: `ai_match_${idx}_${Date.now()}`,
						householdIndices: m.householdIds,
						cardIndices: m.cardIds,
						reason: m.reason,
						confidence: m.confidence,
					}));
			}

			return [];
		} catch (err: unknown) {
			console.error("Gemini API Error:", err);
			const errorMessage = err instanceof Error ? err.message : String(err);
			setError(errorMessage || "AIの推論中にエラーが発生しました。");
			return [];
		} finally {
			setIsLoading(false);
		}
	};

	return { analyzeUnmatched, isLoading, error };
};
