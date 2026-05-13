const statusStyles: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  recording: "bg-blue-100 text-blue-700",
  recorded: "bg-blue-100 text-blue-700",
  queued: "bg-yellow-100 text-yellow-700",
  transcribing: "bg-yellow-100 text-yellow-700",
  processing: "bg-yellow-100 text-yellow-700",
  editing: "bg-yellow-100 text-yellow-700",
  awaiting_approval: "bg-orange-100 text-orange-700",
  approved: "bg-green-100 text-green-700",
  posting: "bg-blue-100 text-blue-700",
  posted: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  not_posted_error: "bg-red-100 text-red-700",
  human_review: "bg-purple-100 text-purple-700",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  recording: "Recording",
  recorded: "Recorded",
  queued: "Queued",
  transcribing: "Transcribing",
  processing: "Processing",
  editing: "Editing",
  awaiting_approval: "Review",
  approved: "Approved",
  posting: "Posting",
  posted: "Posted",
  error: "Error",
  not_posted_error: "Post Failed",
  human_review: "Needs Human",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs font-medium uppercase tracking-wider ${
        statusStyles[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {statusLabels[status] ?? status}
    </span>
  );
}
