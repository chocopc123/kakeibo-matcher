import type React from "react";
import { useState } from "react";
import "./AiApiKeyModal.css";

interface AiApiKeyModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: () => void;
}

const AiApiKeyModal: React.FC<AiApiKeyModalProps> = ({
	isOpen,
	onClose,
	onSave,
}) => {
	const [apiKey, setApiKey] = useState(
		() => localStorage.getItem("GEMINI_API_KEY") || "",
	);

	if (!isOpen) return null;

	const handleSave = () => {
		localStorage.setItem("GEMINI_API_KEY", apiKey.trim());
		onSave();
		onClose();
	};

	const handleDelete = () => {
		localStorage.removeItem("GEMINI_API_KEY");
		setApiKey("");
	};

	return (
		<div
			className="modal-overlay"
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
			role="dialog"
			aria-modal="true"
		>
			<div
				className="modal-content"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				role="document"
			>
				<h3>Gemini API キー設定</h3>
				<p>
					AI機能を利用するにはGoogle Gemini APIのキーが必要です。
					環境変数に設定されていない場合は、こちらに入力してください。
					キーはブラウザのローカルストレージに保存されます。
				</p>
				<input
					type="password"
					placeholder="AIzaSy..."
					value={apiKey}
					onChange={(e) => setApiKey(e.target.value)}
					className="api-key-input"
				/>
				<div className="modal-actions">
					<button
						type="button"
						className="btn-save"
						onClick={handleSave}
						disabled={!apiKey.trim()}
					>
						保存
					</button>
					<button
						type="button"
						className="btn-delete"
						onClick={handleDelete}
						disabled={!apiKey && !localStorage.getItem("GEMINI_API_KEY")}
					>
						削除
					</button>
					<button type="button" className="btn-cancel" onClick={onClose}>
						キャンセル
					</button>
				</div>
			</div>
		</div>
	);
};

export default AiApiKeyModal;
