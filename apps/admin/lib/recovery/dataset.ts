/**
 * Deterministic synthetic dataset for migration and recovery rehearsals.
 *
 * Nothing here is customer data. Every identifier is derived from the fixed
 * `5e5e5e5e` prefix, every email address uses the reserved `.invalid` TLD,
 * every telephone number comes from the Ofcom drama range, and every provider
 * reference is a visibly synthetic string rather than a Stripe or Google
 * identifier. The dataset is reproducible: seeding twice from the same schema
 * produces byte-identical rows, which is what makes the recovery fingerprint
 * meaningful.
 *
 * The dataset is never seeded into a live database. It exists to give a
 * rebuilt schema something to verify against.
 */

export const rehearsalMarker = "SYNTHETIC_REHEARSAL_DATASET_V1"

/** Shared prefix for every synthetic row, so rehearsal data is recognisable at a glance. */
export const rehearsalIdPrefix = "5e5e5e5e"

function syntheticId(slot: number): string {
  return `${rehearsalIdPrefix}-0000-4000-8000-${String(slot).padStart(12, "0")}`
}

export const rehearsalIds = {
  adminUser: syntheticId(1),
  customerA: syntheticId(10),
  customerB: syntheticId(11),
  businessA: syntheticId(20),
  businessB: syntheticId(21),
  locationA: syntheticId(30),
  locationB: syntheticId(31),
  enquiry: syntheticId(40),
  monitoringRequest: syntheticId(45),
  caseA: syntheticId(50),
  evidenceRequestFulfilled: syntheticId(60),
  evidenceRequestOpen: syntheticId(61),
  documentA: syntheticId(70),
  documentB: syntheticId(71),
  versionAccepted: syntheticId(80),
  versionPending: syntheticId(81),
  pack: syntheticId(90),
  packItem: syntheticId(91),
  customerAction: syntheticId(100),
  outboxPromoted: syntheticId(110),
  outboxPending: syntheticId(111),
  jobSucceeded: syntheticId(120),
  jobRetry: syntheticId(121),
  jobDeadLetter: syntheticId(122),
  jobLeaseExpired: syntheticId(123),
  communication: syntheticId(130),
  conversation: syntheticId(140),
  conversationMessage: syntheticId(141),
  discountSnapshot: syntheticId(150),
  quote: syntheticId(151),
  quoteVersion: syntheticId(152),
  quoteAcceptance: syntheticId(153),
  serviceOrder: syntheticId(154),
  quoteAction: syntheticId(155),
  guardDiscountSnapshot: syntheticId(160),
  guardQuote: syntheticId(161),
  guardQuoteVersion: syntheticId(162),
  guardQuoteAcceptance: syntheticId(163),
  guardQuoteAction: syntheticId(164),
  guardServiceOrder: syntheticId(165),
  guardCoverage: syntheticId(170),
  guardSchedule: syntheticId(171),
  guardRotaAssignment: syntheticId(172),
  guardObligation: syntheticId(173),
  guardAttempt: syntheticId(174),
  guardObservation: syntheticId(175),
  guardAlert: syntheticId(176),
  settingVersion: syntheticId(180),
  privacyRequest: syntheticId(181),
  operationalIncident: syntheticId(182),
} as const

/** The bucket a rehearsal pretends to hold evidence in. It is never a real bucket. */
export const rehearsalBucket = "synthetic-rehearsal-evidence"

export function rehearsalStorageKey(caseId: string, documentId: string, versionId: string): string {
  return `cases/${caseId}/documents/${documentId}/versions/${versionId}`
}

/** Deterministic submission keys, so an intake retry can be replayed exactly. */
export const rehearsalSubmissionKeys = {
  enquiry: syntheticId(200),
  case: syntheticId(201),
  monitoring: syntheticId(202),
  commandRequest: syntheticId(203),
} as const

const id = rehearsalIds
const acceptedKey = rehearsalStorageKey(id.caseA, id.documentA, id.versionAccepted)
const pendingKey = rehearsalStorageKey(id.caseA, id.documentB, id.versionPending)

/**
 * The session token hash is a synthetic 64-character hex constant. It is not a
 * token: it is the hash column value a rehearsal needs so operator RPCs can be
 * exercised. No token it corresponds to exists.
 */
export const rehearsalSessionTokenHash = "5e".repeat(32)

const identity = `insert into auth.users values('${id.adminUser}','operator@rehearsal.invalid',now(),null,null);
alter table public.admin_identity disable trigger admin_identity_protect;
insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${id.adminUser}',true)
  on conflict (singleton) do update set auth_user_id = excluded.auth_user_id, enabled = true;
alter table public.admin_identity enable trigger admin_identity_protect;
insert into public.admin_sessions(token_hash,auth_user_id,created_at) values('${rehearsalSessionTokenHash}','${id.adminUser}',now());`

const records = `insert into public.customers(id,full_name,email,phone) values
  ('${id.customerA}','Rehearsal Customer One','customer.one@rehearsal.invalid','+447700900001'),
  ('${id.customerB}','Rehearsal Customer Two','customer.two@rehearsal.invalid','+447700900002');
insert into public.businesses(id,display_name,website_url) values
  ('${id.businessA}','Rehearsal Business One','https://one.rehearsal.invalid'),
  ('${id.businessB}','Rehearsal Business Two','https://two.rehearsal.invalid');
insert into public.locations(id,business_id,country) values
  ('${id.locationA}','${id.businessA}','GB'),
  ('${id.locationB}','${id.businessB}','GB');
insert into public.business_memberships(customer_id,business_id,status,verified_at,verified_by,evidence) values
  ('${id.customerA}','${id.businessA}','verified',now(),'${id.adminUser}','Synthetic rehearsal evidence of control.'),
  ('${id.customerB}','${id.businessB}','verified',now(),'${id.adminUser}','Synthetic rehearsal evidence of control.');`

const intake = `insert into public.enquiries(id,submission_key,fingerprint,source,payload,status,internal_status,ack_status)
  values('${id.enquiry}','${rehearsalSubmissionKeys.enquiry}',md5('${rehearsalMarker}'),'contact',
    jsonb_build_object('marker','${rehearsalMarker}','email','enquiry@rehearsal.invalid'),'new','SKIPPED','SKIPPED');
insert into public.monitoring_requests(id,submission_key,customer_id,business_id,location_id,status,number_of_locations,terms_accepted_at,intake_snapshot)
  values('${id.monitoringRequest}','${rehearsalSubmissionKeys.monitoring}','${id.customerB}','${id.businessB}','${id.locationB}','REQUESTED',1,now(),
    jsonb_build_object('marker','${rehearsalMarker}'));
insert into public.cases(id,public_ref,case_type,status,customer_id,business_id,location_id,source,issue_description,submission_key,intake_snapshot,work_stage,service_track)
  values('${id.caseA}','PR-26-RHRSL2','PROFILE_RECOVERY','UNDER_REVIEW','${id.customerA}','${id.businessA}','${id.locationA}','GET_HELP',
    'Synthetic rehearsal case used to prove recovery, not a real customer issue.','${rehearsalSubmissionKeys.case}',
    jsonb_build_object('marker','${rehearsalMarker}'),'EVIDENCE_COLLECTION','MANAGED');`

// A document may only be attached to an open request, so the request is
// fulfilled after the document that satisfies it exists.
const evidence = `insert into public.evidence_requests(id,case_id,title,request_text,status,created_by) values
  ('${id.evidenceRequestFulfilled}','${id.caseA}','Synthetic proof of control','Upload the synthetic rehearsal document.','OPEN','${id.adminUser}'),
  ('${id.evidenceRequestOpen}','${id.caseA}','Synthetic outstanding request','This request stays open for rehearsal.','OPEN','${id.adminUser}');
insert into public.case_documents(id,case_id,evidence_request_id,title,created_by) values
  ('${id.documentA}','${id.caseA}','${id.evidenceRequestFulfilled}','Synthetic accepted document','${id.adminUser}'),
  ('${id.documentB}','${id.caseA}',null,'Synthetic pending document','${id.adminUser}');
insert into public.case_document_versions(
    id,document_id,version_number,original_filename,declared_content_type,declared_size_bytes,
    storage_provider,storage_bucket,storage_key,upload_status,scan_status,scan_checked_at,
    validation_status,validated_at,review_status,reviewed_by,reviewed_at,customer_visible,created_by,uploaded_at)
  values
  ('${id.versionAccepted}','${id.documentA}',1,'synthetic-accepted.pdf','application/pdf',20480,
    'S3','${rehearsalBucket}','${acceptedKey}','UPLOADED','NO_THREATS_FOUND',now(),
    'VALID',now(),'ACCEPTED','${id.adminUser}',now(),true,'${id.adminUser}',now()),
  ('${id.versionPending}','${id.documentB}',1,'synthetic-pending.pdf','application/pdf',10240,
    'S3','${rehearsalBucket}','${pendingKey}','PENDING_UPLOAD','PENDING',null,
    'PENDING',null,'UNREVIEWED',null,null,false,'${id.adminUser}',null);
update public.evidence_requests set status = 'FULFILLED', fulfilled_at = now() where id = '${id.evidenceRequestFulfilled}';
insert into public.case_prepared_packs(id,case_id,pack_number,status,created_by)
  values('${id.pack}','${id.caseA}',1,'DRAFT','${id.adminUser}');
insert into public.case_prepared_pack_items(id,pack_id,document_id,version_id,position,document_title,original_filename,content_type,size_bytes,added_by)
  values('${id.packItem}','${id.pack}','${id.documentA}','${id.versionAccepted}',1,'Synthetic accepted document','synthetic-accepted.pdf','application/pdf',20480,'${id.adminUser}');
update public.case_prepared_packs
  set status = 'APPROVED', approval_note = 'Synthetic rehearsal pack approved for recovery testing.', approved_by = '${id.adminUser}', approved_at = now()
  where id = '${id.pack}';`

const customerAction = `insert into public.customer_actions(id,customer_id,business_id,location_id,case_id,kind,status,secret_hash,expected_email_snapshot,expires_at,created_by)
  values('${id.customerAction}','${id.customerA}','${id.businessA}','${id.locationA}','${id.caseA}','CASE_ACCESS','OPEN',
    md5('${rehearsalMarker}:case-access') || md5('${rehearsalMarker}:case-access-2'),
    'customer.one@rehearsal.invalid',now() + interval '7 days','${id.adminUser}');`

const jobs = `insert into admin_private.job_outbox(id,event_key,topic,aggregate_type,aggregate_id,payload,promoted_at) values
  ('${id.outboxPromoted}','rehearsal-outbox-promoted-0001','SYSTEM_HEALTH_PROBE','case','${id.caseA}',jsonb_build_object('marker','${rehearsalMarker}'),now()),
  ('${id.outboxPending}','rehearsal-outbox-pending-0001','SYSTEM_HEALTH_PROBE','case','${id.caseA}',jsonb_build_object('marker','${rehearsalMarker}'),null);
insert into admin_private.jobs(id,outbox_id,job_type,idempotency_key,payload,status,scheduled_at,attempts,max_attempts,completed_at,dead_lettered_at,lease_owner,lease_token,claimed_at,lease_expires_at,last_error) values
  ('${id.jobSucceeded}','${id.outboxPromoted}','SYSTEM_HEALTH_PROBE','rehearsal-outbox-promoted-0001',jsonb_build_object('marker','${rehearsalMarker}'),'SUCCEEDED',now() - interval '2 hours',1,5,now() - interval '1 hour',null,null,null,null,null,null),
  ('${id.jobRetry}',null,'SYSTEM_HEALTH_PROBE','rehearsal-job-retry-0001',jsonb_build_object('marker','${rehearsalMarker}'),'RETRY',now() + interval '5 minutes',2,5,null,null,null,null,null,null,'synthetic retry reason'),
  ('${id.jobDeadLetter}',null,'SYSTEM_HEALTH_PROBE','rehearsal-job-dead-0001',jsonb_build_object('marker','${rehearsalMarker}'),'DEAD_LETTER',now() - interval '1 day',5,5,null,now() - interval '1 hour',null,null,null,null,'synthetic dead letter reason'),
  ('${id.jobLeaseExpired}',null,'SYSTEM_HEALTH_PROBE','rehearsal-job-lease-0001',jsonb_build_object('marker','${rehearsalMarker}'),'RUNNING',now() - interval '3 hours',1,5,null,null,'rehearsal-worker','${syntheticId(900)}',now() - interval '2 hours',now() - interval '1 hour',null);
insert into admin_private.job_worker_heartbeats(worker_name,environment,last_started_at,last_completed_at,last_success_at,expected_interval_seconds,late_after_seconds)
  values('rehearsal-worker','rehearsal',now() - interval '1 hour',now() - interval '55 minutes',now() - interval '55 minutes',86400,93600);
insert into admin_private.job_command_receipts(request_id,actor_id,fingerprint,response)
  values('${rehearsalSubmissionKeys.commandRequest}','${id.adminUser}',md5('${rehearsalMarker}:probe'),jsonb_build_object('status','success','marker','${rehearsalMarker}'));`

const messaging = `insert into public.communications(id,case_id,communication_type,recipient,subject,status,metadata)
  values('${id.communication}','${id.caseA}','CASE_RECEIVED_CUSTOMER','customer.one@rehearsal.invalid','Synthetic rehearsal acknowledgement','PENDING',
    jsonb_build_object('marker','${rehearsalMarker}'));
insert into public.conversations(id,state,case_id,customer_id,business_id,location_id,reply_alias,subject,needs_attention)
  values('${id.conversation}','OPEN','${id.caseA}','${id.customerA}','${id.businessA}','${id.locationA}',md5('${rehearsalMarker}:alias'),'Synthetic rehearsal conversation',false);
insert into public.conversation_messages(id,conversation_id,kind,import_status,body_text,received_at,sender_address,subject,created_by)
  values('${id.conversationMessage}','${id.conversation}','PHONE_NOTE','IMPORTED','Synthetic rehearsal phone note recorded for recovery testing.',now(),null,'Synthetic rehearsal conversation','${id.adminUser}');`

function commerceChain(options: {
  snapshot: string
  quote: string
  version: string
  acceptance: string
  order: string
  action: string
  serviceCode: string
  serviceName: string
  paymentModel: string
  orderState: string
  quoteRef: string
  orderRef: string
  amount: number
  locationId: string
  caseId: string | null
}): string {
  const caseColumn = options.caseId ? `'${options.caseId}'` : "null"
  // A quote version is only acceptable while it is OFFERED, so the chain
  // follows the real sequence: offer, accept, then record the acceptance.
  return `insert into public.quote_discount_snapshots(id,location_id,coverage_basis,coverage_status,coverage_type,paid_vs_included,service_code,policy_id,discount_bps,qualification_result,reason_code,standard_amount_minor,discount_amount_minor,discounted_subtotal_minor,recorded_by,source)
  values('${options.snapshot}','${options.locationId}','NONE','UNKNOWN','NONE','UNPROVEN','${options.serviceCode}','NONE',0,'NOT_QUALIFIED','SYNTHETIC_REHEARSAL',${options.amount},0,${options.amount},'${id.adminUser}','ADMIN_RECORDED');
insert into public.quotes(id,public_ref,customer_id,business_id,location_id,case_id,current_version_id,status,created_by)
  values('${options.quote}','${options.quoteRef}','${id.customerA}','${id.businessA}','${options.locationId}',${caseColumn},null,'ACCEPTED','${id.adminUser}');
insert into public.quote_versions(id,quote_id,version_number,status,customer_id,business_id,location_id,case_id,service_code,price_version_id,service_name,payment_model,
    scope_text,exclusions_text,success_definition,standard_amount_minor,discount_policy_id,discount_bps,discount_amount_minor,quoted_subtotal_minor,
    tax_behaviour,tax_amount_minor,total_amount_minor,currency,discount_snapshot_id,valid_until,payment_timing_text,terms_reference,created_by,offered_at,offered_by)
  select '${options.version}','${options.quote}',1,'OFFERED','${id.customerA}','${id.businessA}','${options.locationId}',${caseColumn},'${options.serviceCode}',p.id,'${options.serviceName}','${options.paymentModel}',
    'Synthetic rehearsal scope text for recovery testing.','Synthetic rehearsal exclusions text.','Synthetic rehearsal success definition.',${options.amount},'NONE',0,0,${options.amount},
    'UNCONFIRMED',0,${options.amount},'GBP','${options.snapshot}',now() + interval '30 days','Synthetic rehearsal payment timing statement for tests.','Synthetic rehearsal terms reference.','${id.adminUser}',now(),'${id.adminUser}'
  from public.price_versions p where p.service_code = '${options.serviceCode}' and p.status = 'APPROVED' order by p.effective_from limit 1;
update public.quotes set current_version_id = '${options.version}' where id = '${options.quote}';
insert into public.customer_actions(id,customer_id,business_id,location_id,case_id,kind,status,secret_hash,expected_email_snapshot,expires_at,created_by,completed_at,quote_version_id)
  values('${options.action}','${id.customerA}','${id.businessA}','${options.locationId}',${caseColumn},'QUOTE_ACCEPTANCE','COMPLETED',
    md5('${rehearsalMarker}:${options.action}') || md5('${rehearsalMarker}:${options.action}:2'),
    'customer.one@rehearsal.invalid',now() + interval '7 days','${id.adminUser}',now(),'${options.version}');
insert into public.quote_acceptances(id,quote_id,quote_version_id,customer_action_id,accepted_by_auth_user_id,accepted_email_snapshot,total_amount_minor,currency,tax_behaviour,tax_amount_minor)
  values('${options.acceptance}','${options.quote}','${options.version}','${options.action}','${id.adminUser}','customer.one@rehearsal.invalid',${options.amount},'GBP','NOT_APPLICABLE',0);
update public.quote_versions set status = 'ACCEPTED' where id = '${options.version}';
insert into public.service_orders(id,public_ref,quote_id,quote_version_id,quote_acceptance_id,customer_id,business_id,location_id,case_id,service_code,amount_minor,currency,payment_model,tax_behaviour,tax_amount_minor,state,accepted_at)
  values('${options.order}','${options.orderRef}','${options.quote}','${options.version}','${options.acceptance}','${id.customerA}','${id.businessA}','${options.locationId}',${caseColumn},'${options.serviceCode}',${options.amount},'GBP','${options.paymentModel}','NOT_APPLICABLE',0,'${options.orderState}',now());`
}

const commerce = commerceChain({
  snapshot: id.discountSnapshot,
  quote: id.quote,
  version: id.quoteVersion,
  acceptance: id.quoteAcceptance,
  order: id.serviceOrder,
  action: id.quoteAction,
  serviceCode: "MANAGED_RELAUNCH",
  serviceName: "Synthetic Managed Relaunch",
  paymentModel: "SUCCESS_FEE",
  orderState: "ACCEPTED_SUCCESS_FEE",
  quoteRef: "QT-26-RHRSL2",
  orderRef: "SO-26-RHRSL2",
  amount: 50000,
  locationId: id.locationA,
  caseId: id.caseA,
})

const guardCommerce = commerceChain({
  snapshot: id.guardDiscountSnapshot,
  quote: id.guardQuote,
  version: id.guardQuoteVersion,
  acceptance: id.guardQuoteAcceptance,
  order: id.guardServiceOrder,
  action: id.guardQuoteAction,
  serviceCode: "RELAUNCH_GUARD",
  serviceName: "Synthetic Relaunch Guard",
  paymentModel: "RECURRING_MONTHLY",
  orderState: "ACCEPTED_RECURRING",
  quoteRef: "QT-26-RHRSL3",
  orderRef: "SO-26-RHRSL3",
  amount: 2900,
  locationId: id.locationA,
  caseId: null,
})

const guard = `insert into public.guard_coverages(id,customer_id,business_id,location_id,service_order_id,coverage_basis,coverage_origin,state,activated_at)
  values('${id.guardCoverage}','${id.customerA}','${id.businessA}','${id.locationA}','${id.guardServiceOrder}','DIRECT_GUARD','DIRECT_GUARD','ACTIVE',now() - interval '10 days');
insert into public.guard_billing(coverage_id,billing_state,entitlement_source,paid_through_at)
  values('${id.guardCoverage}','CURRENT','PROVIDER',now() + interval '20 days');
insert into public.guard_check_schedule_versions(id,morning_start,morning_end,evening_start,evening_end,effective_from,status,created_by,approved_at,approved_by)
  values('${id.guardSchedule}','08:00','11:00','17:00','20:00',current_date - 30,'APPROVED','${id.adminUser}',now() - interval '30 days','${id.adminUser}');
insert into public.guard_rota_assignments(id,coverage_id,assignee_auth_user_id,created_by)
  values('${id.guardRotaAssignment}','${id.guardCoverage}','${id.adminUser}','${id.adminUser}');
insert into public.guard_check_obligations(id,coverage_id,customer_id,business_id,location_id,service_date,window_code,schedule_version_id,rota_assignment_id,coverage_basis,timezone,local_start,local_end,window_start_utc,window_end_utc,state,completed_at,attempt_count)
  values('${id.guardObligation}','${id.guardCoverage}','${id.customerA}','${id.businessA}','${id.locationA}',current_date - 1,'MORNING','${id.guardSchedule}','${id.guardRotaAssignment}','DIRECT_GUARD','Europe/London','08:00','11:00',
    admin_private.guard_local_window_utc_v1(current_date - 1,'08:00','Europe/London'),
    admin_private.guard_local_window_utc_v1(current_date - 1,'11:00','Europe/London'),
    'COMPLETED',now() - interval '22 hours',1);
insert into public.guard_check_attempts(id,obligation_id,attempt_number,actor_id,started_at,finished_at,outcome)
  values('${id.guardAttempt}','${id.guardObligation}',1,'${id.adminUser}',now() - interval '23 hours',now() - interval '22 hours','COMPLETED');
insert into public.guard_check_observations(id,obligation_id,attempt_id,coverage_id,location_id,observed_at,capture_method,profile_availability,location_identified,classification,comparison_status,change_codes,attention_candidate)
  values('${id.guardObservation}','${id.guardObligation}','${id.guardAttempt}','${id.guardCoverage}','${id.locationA}',now() - interval '22 hours','MANUAL','UNAVAILABLE',false,'PROFILE_UNAVAILABLE','SKIPPED',array['PROFILE_UNAVAILABLE'],true);
insert into public.guard_alerts(id,coverage_id,customer_id,business_id,location_id,first_observation_id,latest_observation_id,first_observed_at,latest_observed_at,issue_codes)
  values('${id.guardAlert}','${id.guardCoverage}','${id.customerA}','${id.businessA}','${id.locationA}','${id.guardObservation}','${id.guardObservation}',now() - interval '22 hours',now() - interval '22 hours',array['PROFILE_UNAVAILABLE']);`

// Settings are append-then-approve: a version is always inserted as a draft.
const operations = `insert into public.admin_setting_versions(id,setting_key,version,status,payload,effective_from,reason,created_by)
  values('${id.settingVersion}','SERVICE_HOURS',1,'DRAFT',
    jsonb_build_object(
      'timezone','Europe/London',
      'weekendPolicy','EXCLUDED',
      'bankHolidayPolicy','INCLUDED',
      'windows', jsonb_build_array(
        jsonb_build_object('day',1,'start','09:00','end','17:00'),
        jsonb_build_object('day',2,'start','09:00','end','17:00'),
        jsonb_build_object('day',3,'start','09:00','end','17:00'),
        jsonb_build_object('day',4,'start','09:00','end','17:00'),
        jsonb_build_object('day',5,'start','09:00','end','17:00'))),
    now() - interval '1 day','Synthetic rehearsal setting.','${id.adminUser}');
update public.admin_setting_versions
  set status = 'APPROVED', approved_at = now() - interval '1 day', approved_by = '${id.adminUser}', record_version = record_version + 1
  where id = '${id.settingVersion}';
insert into public.privacy_requests(id,kind,status,customer_id,subject_ref,created_by)
  values('${id.privacyRequest}','ACCESS','RECEIVED','${id.customerA}','synthetic-rehearsal','${id.adminUser}');
insert into public.operational_incidents(id,kind,severity,status,title,impact_summary,created_by)
  values('${id.operationalIncident}','OTHER','LOW','OPEN','Synthetic rehearsal incident','Synthetic rehearsal incident used only to prove recovery reporting.','${id.adminUser}');`

/**
 * The seed in dependency order. Each fragment is independently readable so a
 * rehearsal can report which domain failed to rebuild.
 */
export const rehearsalSeedFragments: readonly { domain: string; sql: string }[] = [
  { domain: "admin identity", sql: identity },
  { domain: "core records", sql: records },
  { domain: "intake", sql: intake },
  { domain: "evidence and packs", sql: evidence },
  { domain: "customer actions", sql: customerAction },
  { domain: "jobs and outbox", sql: jobs },
  { domain: "communications and conversations", sql: messaging },
  { domain: "commerce", sql: commerce },
  { domain: "guard commerce", sql: guardCommerce },
  { domain: "guard coverage and alerts", sql: guard },
  { domain: "settings, privacy and incidents", sql: operations },
]

export type SeedTarget = { exec(sql: string): Promise<unknown> }

export async function seedRehearsalDataset(db: SeedTarget): Promise<string[]> {
  const seeded: string[] = []
  for (const fragment of rehearsalSeedFragments) {
    try {
      await db.exec(fragment.sql)
    } catch (error) {
      throw new Error(`rehearsal seed failed in ${fragment.domain}: ${error instanceof Error ? error.message : String(error)}`)
    }
    seeded.push(fragment.domain)
  }
  return seeded
}
