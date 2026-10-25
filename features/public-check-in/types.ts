export type PublicDirectory = {
	organization: { name: string };
	location: { name: string; address: string | null; timezone: string };
	departments: {
		id: string;
		name: string;
		staff: { id: string; name: string }[];
	}[];
};

export type VisitorVisit = {
	status: string;
	visitor_display_name: string;
	organization_name: string;
	branch_name: string;
	host_name: string | null;
	admitted_at: string | null;
	time_out: string | null;
	self_checkout_available: false;
};
