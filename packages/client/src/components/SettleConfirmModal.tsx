export interface SettleConfirmPayload {
  fromUserId: string;
  toUserId: string;
  amount: number;
  fromName: string;
  toName: string;
}

interface Props {
  confirm: SettleConfirmPayload;
  currency?: string;
  onCancel: () => void;
  /** Records the payment against the frozen plan leg. */
  onConfirm: (c: SettleConfirmPayload) => Promise<void>;
}

/**
 * Settle-leg confirmation dialog — guards against mis-tapping a frozen plan
 * leg. Extracted from GroupDetail 2026-09-23.
 */
export default function SettleConfirmModal({ confirm, currency, onCancel, onConfirm }: Props) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Confirm settlement</h3>
        <p className="text-sm text-gray-700 mb-2">
          You're about to record that
        </p>
        <p className="text-base font-semibold text-gray-900 mb-1">
          {confirm.fromName} pays {confirm.toName}
        </p>
        <p className="text-2xl font-bold text-gray-900 mb-4 tabular-nums">
          {confirm.amount.toFixed(2)} {currency}
        </p>
        <p className="text-xs text-gray-500 mb-6">
          This records a real payment and strikes the frozen leg. Make sure the money has actually changed hands.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              const c = confirm;
              onCancel();
              await onConfirm(c);
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md"
          >
            Confirm payment
          </button>
        </div>
      </div>
    </div>
  );
}
