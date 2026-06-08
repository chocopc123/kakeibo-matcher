import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HouseholdRecord } from "../types";
import { type AiSuggestion, useGeminiAssist } from "./useGeminiAssist";

const { generateContentMock, getGenerativeModelMock } = vi.hoisted(() => ({
	generateContentMock: vi.fn(),
	getGenerativeModelMock: vi.fn(),
}));

vi.mock("@google/generative-ai", () => {
	class GoogleGenerativeAI {
		getGenerativeModel = getGenerativeModelMock;
	}
	return { GoogleGenerativeAI };
});

getGenerativeModelMock.mockReturnValue({
	generateContent: generateContentMock,
});

describe("useGeminiAssist", () => {
	const mockHouseholdData: HouseholdRecord[] = [
		{
			日付: "2023-08-01",
			資産: "財布",
			"収入/支出": "支出",
			分類: "食費",
			小分類: "食料品",
			内容: "スーパー",
			"金額(￥)": 1000,
		},
	];
	const mockCardData = [
		{ 利用日: "2023-08-01", 店名: "スーパーマルエツ", 支払金額: 1000 },
	];

	beforeEach(() => {
		vi.stubEnv("VITE_GEMINI_API_KEY", "test-api-key");
		vi.clearAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("初期状態が正しいこと", () => {
		const { result } = renderHook(() => useGeminiAssist());
		expect(result.current.isLoading).toBe(false);
		expect(result.current.error).toBe(null);
	});

	it("APIキーが設定されていない場合にエラーを返すこと", async () => {
		vi.stubEnv("VITE_GEMINI_API_KEY", "");
		const { result } = renderHook(() => useGeminiAssist());

		let suggestions: AiSuggestion[] = [];
		await act(async () => {
			suggestions = await result.current.analyzeUnmatched(
				mockHouseholdData,
				mockCardData,
			);
		});

		expect(suggestions).toEqual([]);
		expect(result.current.error).toBe(
			"API_KEY_MISSING",
		);
	});

	it("入力データが空の場合に空配列を返すこと (Household空)", async () => {
		const { result } = renderHook(() => useGeminiAssist());
		let suggestions: AiSuggestion[] = [];
		await act(async () => {
			suggestions = await result.current.analyzeUnmatched([], mockCardData);
		});
		expect(suggestions).toEqual([]);
	});

	it("入力データが空の場合に空配列を返すこと (Card空)", async () => {
		const { result } = renderHook(() => useGeminiAssist());
		let suggestions: AiSuggestion[] = [];
		await act(async () => {
			suggestions = await result.current.analyzeUnmatched(
				mockHouseholdData,
				[],
			);
		});
		expect(suggestions).toEqual([]);
	});

	it("正常系: APIが正しいJSONを返す場合に suggestions を返すこと", async () => {
		const mockResponse = {
			matches: [
				{
					householdIds: [0],
					cardIds: [0],
					reason: "一致しています",
					confidence: "High",
				},
			],
		};

		generateContentMock.mockResolvedValue({
			response: {
				text: () => JSON.stringify(mockResponse),
			},
		});

		const { result } = renderHook(() => useGeminiAssist());
		let suggestions: AiSuggestion[] = [];
		await act(async () => {
			suggestions = await result.current.analyzeUnmatched(
				mockHouseholdData,
				mockCardData,
			);
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].reason).toBe("一致しています");
		expect(suggestions[0].confidence).toBe("High");
		expect(result.current.isLoading).toBe(false);
		expect(result.current.error).toBe(null);
	});

	it("正常系: Markdown形式のレスポンスも正しくパースできること", async () => {
		const mockResponse = {
			matches: [
				{
					householdIds: [0],
					cardIds: [0],
					reason: "Markdownテスト",
					confidence: "Medium",
				},
			],
		};

		generateContentMock.mockResolvedValue({
			response: {
				text: () => `\`\`\`json\n${JSON.stringify(mockResponse)}\n\`\`\``,
			},
		});

		const { result } = renderHook(() => useGeminiAssist());
		let suggestions: AiSuggestion[] = [];
		await act(async () => {
			suggestions = await result.current.analyzeUnmatched(
				mockHouseholdData,
				mockCardData,
			);
		});

		expect(suggestions[0].reason).toBe("Markdownテスト");
	});

	it("正常系: APIが想定外の形式を返した場合に空配列を返すこと", async () => {
		generateContentMock.mockResolvedValue({
			response: {
				text: () => JSON.stringify({ wrong_key: [] }),
			},
		});

		const { result } = renderHook(() => useGeminiAssist());
		let suggestions: AiSuggestion[] = [];
		await act(async () => {
			suggestions = await result.current.analyzeUnmatched(
				mockHouseholdData,
				mockCardData,
			);
		});

		expect(suggestions).toEqual([]);
	});

	it("異常系: API呼び出しでエラーが発生した場合にエラーをセットすること", async () => {
		generateContentMock.mockRejectedValue(new Error("API Error"));

		const { result } = renderHook(() => useGeminiAssist());
		let suggestions: AiSuggestion[] = [];
		await act(async () => {
			suggestions = await result.current.analyzeUnmatched(
				mockHouseholdData,
				mockCardData,
			);
		});

		expect(suggestions).toEqual([]);
		expect(result.current.error).toBe("API Error");
		expect(result.current.isLoading).toBe(false);
	});

	it("異常系: AIが範囲外のインデックスを返した場合にそれらを除外すること", async () => {
		const mockResponse = {
			matches: [
				{
					householdIds: [0],
					cardIds: [0],
					reason: "有効なインデックス",
					confidence: "High",
				},
				{
					householdIds: [99], // 範囲外
					cardIds: [0],
					reason: "無効なインデックス",
					confidence: "Low",
				},
			],
		};

		generateContentMock.mockResolvedValue({
			response: {
				text: () => JSON.stringify(mockResponse),
			},
		});

		const { result } = renderHook(() => useGeminiAssist());
		let suggestions: AiSuggestion[] = [];
		await act(async () => {
			suggestions = await result.current.analyzeUnmatched(
				mockHouseholdData,
				mockCardData,
			);
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].reason).toBe("有効なインデックス");
	});

	it("異常系: 文字列のエラーが投げられた場合も正しく処理すること", async () => {
		generateContentMock.mockRejectedValue("String Error");

		const { result } = renderHook(() => useGeminiAssist());
		await act(async () => {
			await result.current.analyzeUnmatched(mockHouseholdData, mockCardData);
		});

		expect(result.current.error).toBe("String Error");
	});

	it("異常系: エラーメッセージが空の場合にデフォルトメッセージをセットすること", async () => {
		generateContentMock.mockRejectedValue(new Error(""));

		const { result } = renderHook(() => useGeminiAssist());
		await act(async () => {
			await result.current.analyzeUnmatched(mockHouseholdData, mockCardData);
		});

		expect(result.current.error).toBe("AIの推論中にエラーが発生しました。");
	});
});
