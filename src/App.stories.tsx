import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import * as XLSX from "xlsx";
import App from "./App";
import type { AiSuggestion } from "./hooks/useGeminiAssist";
import type { ComparisonResult } from "./types";

// 統合テスト用のモックデータ
const mockBaseResult: ComparisonResult = {
	householdTotal: 8300,
	cardTotal: 7300,
	diff: 1000,
	householdOnly: [
		{
			日付: "2026/02/01",
			資産: "財布",
			"収入/支出": "支出",
			分類: "食費",
			小分類: "外食",
			内容: "アマゾン",
			"金額(￥)": 1500,
		},
		{
			日付: "2026/02/05",
			資産: "クレジットカード",
			"収入/支出": "支出",
			分類: "日用品",
			小分類: "雑貨",
			内容: "セブンイレブン",
			"金額(￥)": 500,
		},
		{
			日付: "2026/02/10",
			資産: "クレジットカード",
			"収入/支出": "支出",
			分類: "食費",
			小分類: "弁当",
			内容: "唐揚げ弁当",
			"金額(￥)": 800,
		},
	],
	cardOnly: [
		{ 利用日: "2026/02/02", 店名: "AMAZON.CO.JP", 支払金額: 1420 },
		{ 利用日: "2026/02/06", 店名: "ｾﾌﾞﾝ-ｲﾚﾌﾞﾝ", 支払金額: 495 },
		{ 利用日: "2026/02/11", 店名: "ﾎｶﾎｶﾍﾞﾝﾄｳ", 支払金額: 800 },
	],
	discrepancies: [],
};

const mockAiSuggestions: AiSuggestion[] = [
	{
		id: "ai-1",
		householdIndices: [0],
		cardIndices: [0],
		reason: "金額にわずかな差がありますが、店名が一致しています。",
		confidence: "High",
	},
	{
		id: "ai-2",
		householdIndices: [1],
		cardIndices: [1],
		reason: "店名が類似しており、金額がほぼ一致しています。",
		confidence: "Medium",
	},
];

const meta: Meta<typeof App> = {
	title: "App/IntegrationTests",
	component: App,
	args: {
		initialResult: mockBaseResult,
		onAiScan: fn(async () => mockAiSuggestions),
	},
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * アプリケーション全体でのデータ照合フローをテストする
 */
export const FullFlow: Story = {
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		localStorage.setItem("GEMINI_API_KEY", "mock_key");

		// 1. 解析結果画面（テーブル）が表示されていることを確認
		await expect(canvas.getByText("家計簿合計")).toBeInTheDocument();
		await expect(canvas.getByText("アマゾン")).toBeInTheDocument();

		// 2. AIスキャンボタンを探してクリック
		const scanBtn = await canvas.findByRole("button", {
			name: /Gemini AIで未照合項目をスキャン/i,
		});
		await userEvent.click(scanBtn);

		// 3. AI分析が呼ばれ、ダッシュボードが表示されるのを待つ
		await expect(args.onAiScan).toHaveBeenCalled();
		await expect(
			await canvas.findByText("AI サポートレビュー"),
		).toBeInTheDocument();

		// 4. アマゾンを承認
		const approveBtn = await canvas.findByRole("button", { name: /承認する/i });
		await userEvent.click(approveBtn);

		// 5. アマゾンが結果テーブルから消えることを確認
		await waitFor(() => {
			expect(canvas.queryByText("アマゾン")).not.toBeInTheDocument();
		});

		// 6. ダッシュボードに「セブンイレブン」が表示されていることを確認
		const dashboardContainer = (
			await canvas.findByText("AI サポートレビュー")
		).closest(".ai-dashboard") as HTMLElement;
		const dashboard = within(dashboardContainer);
		await expect(dashboard.getByText("セブンイレブン")).toBeInTheDocument();
		localStorage.removeItem("GEMINI_API_KEY");
	},
};

/**
 * ファイルアップロードから比較実行、その後のAI分析フローをテストする
 */
export const FileUploadFlow: Story = {
	args: {
		initialResult: undefined,
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		localStorage.setItem("GEMINI_API_KEY", "mock_key");

		// 1. ファイル選択要素を取得
		// FileUpload コンポーネント内の隠し input 要素を探す
		const inputs = canvasElement.querySelectorAll('input[type="file"]');
		const householdInput = inputs[0] as HTMLInputElement;
		const cardInput = inputs[1] as HTMLInputElement;

		// 2. 実際のExcelデータを作成（資産名は HOUSEHOLD_ASSET_NAME = "Amazon MasterCard" に合わせる）
		const data = [
			{
				日付: 46023, // 2026/01/01 相当
				資産: "Amazon MasterCard",
				"収入/支出": "支出",
				分類: "食費",
				小分類: "外食",
				内容: "テストレストラン",
				"金額(￥)": 1200,
			},
		];
		const ws = XLSX.utils.json_to_sheet(data);
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
		const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

		const householdFile = new File([buf], "household.xlsx", {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});
		// カードCSVは空（ヘッダーのみ）にして家計簿データが householdOnly に残るようにする
		const cardFile = new File(["利用日,店名,支払金額"], "card.csv", {
			type: "text/csv",
		});

		// 3. ファイルをアップロード
		await userEvent.upload(householdInput, householdFile);
		await userEvent.upload(cardInput, cardFile);

		// 4. 比較ボタンをクリック
		const compareBtn = await canvas.findByRole("button", {
			name: /差分をチェックする/i,
		});
		await expect(compareBtn).not.toBeDisabled();
		await userEvent.click(compareBtn);

		// 5. 解析結果が表示されるのを待つ
		await expect(await canvas.findByText("家計簿合計")).toBeInTheDocument();
		await expect(canvas.getByText("テストレストラン")).toBeInTheDocument();

		// 6. AIスキャンを実行
		const scanBtn = await canvas.findByRole("button", {
			name: /Gemini AIで未照合項目をスキャン/i,
		});
		await userEvent.click(scanBtn);

		// 7. AI分析が呼ばれることを確認
		await expect(args.onAiScan).toHaveBeenCalled();
		localStorage.removeItem("GEMINI_API_KEY");
	},
};

/**
 * ファイル解析時のエラーハンドリングをテストする
 * 不正なExcelファイルをアップロードし、finally ブロックで
 * isProcessing が false に戻りボタンが再度有効になることを確認する
 * NOTE: catch 内の console.error/alert は XLSXがエラーを投げないため
 *       v8 ignore でカバレッジ対象外としている (App.tsx 参照)
 */
export const FileUploadError: Story = {
	args: {
		initialResult: undefined,
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		const inputs = canvasElement.querySelectorAll('input[type="file"]');
		const householdInput = inputs[0] as HTMLInputElement;
		const cardInput = inputs[1] as HTMLInputElement;

		// 不正な形式のファイルをアップロード（XLSXとして読み込むと失敗する）
		const invalidFile = new File(["corrupted content"], "test.xlsx", {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});
		const cardFile = new File(["利用日,店名,支払金額"], "test.csv", {
			type: "text/csv",
		});

		await userEvent.upload(householdInput, invalidFile);
		await userEvent.upload(cardInput, cardFile);

		const compareBtn = await canvas.findByRole("button", {
			name: /差分をチェックする/i,
		});

		// alert をモックに差し替え（テスト中の実際のダイアログ表示を防止）
		const originalAlert = window.alert;
		window.alert = fn();

		try {
			await userEvent.click(compareBtn);

			// finally ブロックで isProcessing が false に戻り、ボタンが再度有効になることを確認
			await waitFor(
				() => {
					expect(compareBtn).not.toBeDisabled();
				},
				{ timeout: 5000 },
			);
		} finally {
			window.alert = originalAlert;
		}
	},
};
