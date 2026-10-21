create index assisted_submission_keys_actor_id_idx
  on tgm_private.assisted_submission_keys (actor_id);

create index operator_invitations_invited_by_idx
  on tgm_private.operator_invitations (invited_by);

create index operator_invitations_accepted_by_idx
  on tgm_private.operator_invitations (accepted_by);

create index operator_invitations_location_organization_idx
  on tgm_private.operator_invitations (location_id, organization_id);
