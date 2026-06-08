import type { Meta, StoryObj } from "@storybook/react";
import { type ComponentProps, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { AiSuggestion } from "../../hooks/useGeminiAssist";
import type { ComparisonResult } from "../../types";
import AiSuggestionSection from "./AiSuggestionSection";
import "../../index.css";

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

const mockSuggestions: AiSuggestion[] = [
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

const meta: Meta<typeof AiSuggestionSection> = {
	title: "Components/AiSuggestion/AiSuggestionSection",
	component: AiSuggestionSection,
	tags: ["autodocs"],
	argTypes: {
		initialLoading: { control: "boolean" },
		initialError: { control: "text" },
	},
	args: {
		onScan: fn(async () => mockSuggestions),
	},
	decorators: [
		(Story) => {
			return (
				<div
					style={{
						padding: "2rem",
						backgroundColor: "#f8f9fa",
						minHeight: "300px",
					}}
				>
					<Story />
				</div>
			);
		},
	],
};

export default meta;
type Story = StoryObj<typeof AiSuggestionSection>;

const Wrapper = (args: ComponentProps<typeof AiSuggestionSection>) => {
	const [aiMatched, setAiMatched] = useState<AiSuggestion[]>(
		args.aiMatched || [],
	);
	return (
		<AiSuggestionSection
			{...args}
			aiMatched={aiMatched}
			setAiMatched={setAiMatched}
		/>
	);
};

export const PreScan: Story = {
	render: (args) => <Wrapper {...args} />,
	args: {
		result: mockBaseResult,
		initialLoading: false,
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		localStorage.setItem("GEMINI_API_KEY", "mock_key");

		const scanBtn = await canvas.findByRole("button", {
			name: /スキャン/i,
		});
		await userEvent.click(scanBtn);

		// スキャン実行(onScan)が呼ばれたことを確認
		await waitFor(
			() => {
				expect(args.onScan).toHaveBeenCalled();
			},
			{ timeout: 3000 },
		);

		// ダッシュボードHeadingが表示されることを確認
		await waitFor(
			async () => {
				const heading = await canvas.findByRole("heading", {
					name: /AI サポートレビュー/i,
				});
				expect(heading).toBeInTheDocument();
			},
			{ timeout: 5000 },
		);
		localStorage.removeItem("GEMINI_API_KEY");
	},
};

export const Scanning: Story = {
	render: (args) => <Wrapper {...args} />,
	args: {
		result: mockBaseResult,
		initialLoading: true,
	},
};

export const PostScan: Story = {
	render: (args) => <Wrapper {...args} />,
	args: {
		result: mockBaseResult,
		initialSuggestions: [
			...mockSuggestions,
			{
				id: "ai-3",
				householdIndices: [2],
				cardIndices: [2],
				reason: "金額が完全に一致しています。",
				confidence: "High",
			},
		],
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		localStorage.setItem("GEMINI_API_KEY", "mock_key");

		// ダッシュボードを開く
		const checkBtn = await canvas.findByText(/AIの提案を確認/i);
		await userEvent.click(checkBtn);

		// 1件目を却下 (3 -> 2). 132 FALSE をカバー
		const rejectBtn1 = await canvas.findByRole("button", { name: /却下する/i });
		await userEvent.click(rejectBtn1);

		// 2件目を承認 (2 -> 1). 120 FALSE をカバー
		const approveBtn2 = await canvas.findByRole("button", {
			name: /承認する/i,
		});
		await userEvent.click(approveBtn2);

		// 3件目が表示されるのを待つ
		await waitFor(() => {
			expect(
				canvas.getByText("金額が完全に一致しています。"),
			).toBeInTheDocument();
		});

		// 3件目を承認 (1 -> 0). 120 TRUE をカバー
		const approveBtn3 = await canvas.findByRole("button", {
			name: /承認する/i,
		});
		await userEvent.click(approveBtn3);

		// 再度ダッシュボードを開いて閉じる (coverage for onClose)
		const scanBtn = await canvas.findByText(/Gemini AIで未照合項目をスキャン/i);
		await userEvent.click(scanBtn);
		await waitFor(() => {
			expect(canvas.getByText("AI サポートレビュー")).toBeInTheDocument();
		});
		const closeBtn = await canvas.findByLabelText("閉じる");
		await userEvent.click(closeBtn);
		await waitFor(() => {
			expect(canvas.queryByText("AI サポートレビュー")).not.toBeInTheDocument();
		});
		localStorage.removeItem("GEMINI_API_KEY");
	},
};

export const RejectAll: Story = {
	render: (args) => <Wrapper {...args} />,
	args: {
		result: mockBaseResult,
		initialSuggestions: [mockSuggestions[0]],
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const checkBtn = await canvas.findByText(/AIの提案を確認/i);
		await userEvent.click(checkBtn);

		const rejectBtn = await canvas.findByRole("button", { name: /却下する/i });
		await userEvent.click(rejectBtn);

		await waitFor(() => {
			expect(canvas.queryByText("AI サポートレビュー")).not.toBeInTheDocument();
		});
	},
};

export const NoSuggestionsFound: Story = {
	render: (args) => <Wrapper {...args} />,
	args: {
		result: mockBaseResult,
		onScan: fn(async () => []),
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// alertをモック
		const originalAlert = window.alert;
		const alertMock = fn();
		window.alert = alertMock;
		localStorage.setItem("GEMINI_API_KEY", "mock_key");

		const scanBtn = await canvas.findByText(/Gemini AIで未照合項目をスキャン/i);
		await userEvent.click(scanBtn);

		await waitFor(() => {
			expect(alertMock).toHaveBeenCalledWith(
				"AIが提案できるマッチングが見つかりませんでした。",
			);
		});
		window.alert = originalAlert;
		localStorage.removeItem("GEMINI_API_KEY");
	},
};

export const Rescan: Story = {
	render: (args) => <Wrapper {...args} />,
	args: {
		result: mockBaseResult,
		initialSuggestions: mockSuggestions,
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		localStorage.setItem("GEMINI_API_KEY", "mock_key");

		// 再スキャンボタンをクリック
		const rescanBtn = await canvas.findByText(/最初から再スキャンする/i);
		await userEvent.click(rescanBtn);

		// ダッシュボードが表示されることを確認
		await waitFor(() => {
			expect(canvas.getByText("AI サポートレビュー")).toBeInTheDocument();
		});
		localStorage.removeItem("GEMINI_API_KEY");
	},
};

export const WithHistory: Story = {
	render: (args) => <Wrapper {...args} />,
	args: {
		result: mockBaseResult,
		initialHistory: [
			{
				suggestion: mockSuggestions[0],
				action: "approve",
				timestamp: Date.now(),
			},
		],
		aiMatched: [mockSuggestions[0]],
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		// 履歴パネルを開く
		const historyBtn = await canvas.findByText(/履歴を確認/i);
		await userEvent.click(historyBtn);

		// 閉じるボタンをクリック (coverage for onClose)
		const closeBtn = await canvas.findByLabelText("閉じる");
		await userEvent.click(closeBtn);
		await waitFor(() => {
			expect(canvas.queryByText("AI サポート履歴")).not.toBeInTheDocument();
		});

		// 再度開く
		await userEvent.click(historyBtn);

		// 取り消すボタンをクリック
		const undoBtn = await canvas.findByRole("button", { name: /取り消す/i });
		await userEvent.click(undoBtn);

		// 履歴パネルが空になり閉じることを確認
		await waitFor(() => {
			expect(canvas.queryByText("AI サポート履歴")).not.toBeInTheDocument();
		});
	},
};

export const UndoRejection: Story = {
	render: (args) => <Wrapper {...args} />,
	args: {
		result: mockBaseResult,
		initialHistory: [
			{
				suggestion: mockSuggestions[0],
				action: "reject",
				timestamp: Date.now(),
			},
		],
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		// 履歴パネルを開く
		const historyBtn = await canvas.findByText(/履歴を確認/i);
		await userEvent.click(historyBtn);

		// 取り消すボタンをクリック
		const undoBtn = await canvas.findByRole("button", { name: /取り消す/i });
		await userEvent.click(undoBtn);

		// 履歴パネルが空になり閉じることを確認
		await waitFor(() => {
			expect(canvas.queryByText("AI サポート履歴")).not.toBeInTheDocument();
		});
	},
};

export const UseRealHook: Story = {
	render: (args) => <Wrapper {...args} />,
	args: {
		result: mockBaseResult,
		onScan: undefined, // hookAnalyze を使うようにする
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const scanBtn = await canvas.findByText(/Gemini AIで未照合項目をスキャン/i);
		await userEvent.click(scanBtn);
		// 実際にはAPIキーがないためエラーになるはず(VITE_GEMINI_API_KEY依存)
	},
};

export const ErrorState: Story = {
	render: (args) => <Wrapper {...args} />,
	args: {
		result: mockBaseResult,
		initialError: "想定外のエラーが発生しました。",
		onScan: fn(async () => []),
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const scanBtn = await canvas.findByText(/Gemini AIで未照合項目をスキャン/i);
		await userEvent.click(scanBtn);
		// エラー状態なのでalertは出ないはず
		await expect(
			canvas.queryByText("想定外のエラーが発生しました。"),
		).toBeInTheDocument();
	},
};

export const EmptyResult: Story = {
	render: (args) => <Wrapper {...args} />,
	args: {
		result: {
			householdTotal: 0,
			cardTotal: 0,
			diff: 0,
			householdOnly: [],
			cardOnly: [],
			discrepancies: [],
		},
	},
};
