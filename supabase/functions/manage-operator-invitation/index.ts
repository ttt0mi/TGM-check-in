import { withSupabase } from "@supabase/server";
import { authenticatedOperator, failure, HttpError, json, readJson, sha256Hex, uuid } from "../_shared/tgm.ts";
import { invitationEmailConfig, sendInvitationEmail } from "../_shared/invitation-email.ts";
import type { Database } from "../_shared/database.ts";

type Invitation = { id: string; email: string; role: "admin" | "receptionist";
  location_id: string | null; accepted_at: string | null; revoked_at: string | null };

export default {
  fetch: withSupabase<Database>({ auth: "user" }, async (req, ctx) => {
    try {
      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
      const operator = await authenticatedOperator(ctx);
      if (operator.role !== "admin") throw new HttpError(403, "Admin access required");
      const body = await readJson(req, 4096);
      const invitationId = uuid(body.invitation_id, "invitation");
      if (body.action !== "resend" && body.action !== "revoke") throw new HttpError(400, "Invalid action");
      if (body.action === "revoke") {
        const { error } = await operator.service.rpc("tgm_revoke_operator_invitation",
          { p_actor_id: operator.userId, p_invitation_id: invitationId });
        if (error) throw new HttpError(409, "Invitation cannot be revoked in its current state", "invitation_conflict");
        return json({ status: "revoked" });
      }
      const config = invitationEmailConfig();
      const { data: list, error: listError } = await operator.service.rpc(
        "tgm_list_organization_invitations", { p_actor_id: operator.userId });
      if (listError) throw listError;
      const invitation = (list as Invitation[]).find(item => item.id === invitationId);
      if (!invitation || invitation.accepted_at || invitation.revoked_at) throw new HttpError(409, "Invitation unavailable");
      const { data: organization, error: organizationError } = await operator.service
        .from("organizations").select("name").eq("id", operator.organizationId).single();
      if (organizationError || !organization) throw organizationError || new Error("Organization unavailable");
      let branchName: string | null = null;
      if (invitation.location_id) {
        const { data: branch, error: branchError } = await operator.service
          .from("locations").select("name").eq("id", invitation.location_id)
          .eq("organization_id", operator.organizationId).eq("is_active", true).single();
        if (branchError || !branch) throw new HttpError(409, "Branch unavailable");
        branchName = branch.name;
      }
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)),
        byte => byte.toString(16).padStart(2, "0")).join("");
      const tokenHash = `\\x${await sha256Hex(token)}`;
      const { error: rotateError } = await operator.service.rpc("tgm_rotate_operator_invitation",
        { p_actor_id: operator.userId, p_invitation_id: invitationId, p_token_hash: tokenHash });
      if (rotateError) throw new HttpError(409, "Invitation cannot be resent in its current state", "invitation_conflict");
      let status: "sent" | "unknown" = "unknown";
      let providerId: string | null = null;
	  let errorCode = "provider_outcome_unknown";
      try {
        const delivery = await sendInvitationEmail(config, {
          invitationId, token, email: invitation.email, organization: organization.name,
          role: invitation.role, branch: branchName,
        });
        status = delivery.status;
		if (delivery.status === "sent") providerId = delivery.providerId;
		else errorCode = delivery.errorCode;
      } catch { /* A formatting failure after rotation remains unknown. */ }
      const { error: markError } = await operator.service.rpc("tgm_mark_operator_invitation_delivery",
        { p_invitation_id: invitationId, p_status: status, p_provider_id: providerId ?? undefined,
          p_error: status === "unknown" ? errorCode : undefined });
      if (markError) throw markError;
      if (status !== "sent") throw new HttpError(503, "Email outcome is uncertain. Review before resending.");
      return json({ invitation_id: invitationId, delivery_status: status, expires_in_days: 7 });
    } catch (error) { return failure(error); }
  }),
};
