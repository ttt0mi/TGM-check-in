const visitTypes: Record<string, string> = {
	school: "School",
	business: "Business",
	counselling: "Counselling",
	travels: "Travel",
	vendors: "Vendor",
	other: "Other",
};

const statuses: Record<string, string> = {
	pending_reception_review: "Needs reception review",
	pending_host_acknowledgement: "Waiting for host",
	host_approved_awaiting_reception: "Ready for admission",
	approved_on_site: "On site",
	checked_out: "Checked out",
	declined: "Declined by host",
	cancelled: "Cancelled",
	auto_closed: "Closed automatically",
};

const events: Record<string, string> = {
	created: "Visit created",
	reception_approved: "Reception review completed",
	host_email_sent: "Host email sent",
	host_email_failed: "Host email failed",
	host_approved: "Host approved",
	host_declined: "Host declined",
	admitted: "Visitor admitted",
	checked_out: "Visitor checked out",
	cancelled: "Visit cancelled",
	auto_closed: "Visit closed automatically",
	visit_edited: "Visit details edited",
	checkout_corrected: "Checkout corrected",
};

export const visitTypeLabel = (value: string) => visitTypes[value] ?? "Other";
export const visitStatusLabel = (value: string) => statuses[value] ?? "Visit updated";
export const visitEventLabel = (value: string) => events[value] ?? "Visit updated";
