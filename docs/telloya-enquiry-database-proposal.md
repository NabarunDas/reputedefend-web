# Telloya Enquiry Database Schema Proposal

**Date:** 2026-11-01  
**Status:** Proposed - Awaiting Review  
**Depends On:** Phase 02B database changes

## Overview

This document proposes the additional database schema, RPC functions, and integration points required to support Telloya-specific enquiry handling. The proposal extends the existing `enquiries` table structure established in Phase 02B.

## Required Schema Changes

### 1. Enquiries Table Extensions

**Extend `enquiries` table to support Telloya product discriminator:**

```sql
-- Add product interest field to enquiries table
ALTER TABLE enquiries 
ADD COLUMN product_interest TEXT;

-- Add constraint to ensure valid product values
ALTER TABLE enquiries
ADD CONSTRAINT enquiries_product_interest_check 
CHECK (product_interest IS NULL OR product_interest IN ('TELLOYA', 'COMPLETE'));

-- Add Telloya-specific fields
ALTER TABLE enquiries
ADD COLUMN trade TEXT,
ADD COLUMN locations TEXT,
ADD COLUMN missed_call_problem TEXT,
ADD COLUMN phone_setup TEXT,
ADD COLUMN contact_preference TEXT;

-- Add index for product-based queries
CREATE INDEX idx_enquiries_product_interest 
ON enquiries(product_interest) 
WHERE product_interest IS NOT NULL;
```

### 2. Telloya Public Reference Format

**Create function to generate Telloya-specific reference numbers:**

```sql
-- Function to generate Telloya enquiry reference in format TY-YY-XXXXXX
CREATE OR REPLACE FUNCTION generate_telloya_reference()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  year_suffix TEXT;
  sequence_num INTEGER;
  reference TEXT;
  max_attempts INTEGER := 10;
  attempt INTEGER := 0;
BEGIN
  year_suffix := TO_CHAR(CURRENT_DATE, 'YY');
  
  LOOP
    -- Generate 6-digit random number
    sequence_num := 100000 + floor(random() * 900000)::INTEGER;
    reference := 'TY-' || year_suffix || '-' || sequence_num::TEXT;
    
    -- Check if reference already exists
    IF NOT EXISTS (
      SELECT 1 FROM enquiries WHERE public_reference = reference
    ) THEN
      RETURN reference;
    END IF;
    
    attempt := attempt + 1;
    IF attempt >= max_attempts THEN
      RAISE EXCEPTION 'Could not generate unique Telloya reference after % attempts', max_attempts;
    END IF;
  END LOOP;
END;
$$;
```

### 3. Create Telloya Enquiry RPC

**Create RPC function for Telloya enquiry persistence:**

```sql
CREATE OR REPLACE FUNCTION create_telloya_enquiry_v1(
  p_key TEXT,
  p_product_interest TEXT,
  p_business_name TEXT,
  p_country TEXT,
  p_trade TEXT,
  p_locations TEXT,
  p_website_url TEXT,
  p_full_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_missed_call_problem TEXT,
  p_phone_setup TEXT,
  p_contact_preference TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_enquiry_id UUID;
  v_public_ref TEXT;
  v_attempt_id UUID;
  v_status TEXT;
  v_send_ack BOOLEAN := TRUE;
BEGIN
  -- Validate product interest
  IF p_product_interest NOT IN ('TELLOYA', 'COMPLETE') THEN
    RETURN jsonb_build_object(
      'status', 'invalid',
      'error', 'Invalid product interest'
    );
  END IF;

  -- Check for existing submission with same key (idempotency)
  SELECT id, public_reference, status
  INTO v_enquiry_id, v_public_ref, v_status
  FROM enquiries
  WHERE submission_key = p_key
  AND created_at > NOW() - INTERVAL '24 hours';

  IF FOUND THEN
    -- Return existing enquiry
    RETURN jsonb_build_object(
      'status', 'existing',
      'id', v_enquiry_id,
      'public_reference', v_public_ref
    );
  END IF;

  -- Generate new enquiry ID and reference
  v_enquiry_id := gen_random_uuid();
  v_public_ref := generate_telloya_reference();
  v_attempt_id := gen_random_uuid();

  -- Insert new Telloya enquiry
  INSERT INTO enquiries (
    id,
    submission_key,
    public_reference,
    product_interest,
    business_name,
    country,
    trade,
    locations,
    website_url,
    full_name,
    email,
    phone,
    missed_call_problem,
    phone_setup,
    contact_preference,
    source,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_enquiry_id,
    p_key,
    v_public_ref,
    p_product_interest,
    p_business_name,
    p_country,
    p_trade,
    p_locations,
    NULLIF(p_website_url, ''),
    p_full_name,
    p_email,
    p_phone,
    NULLIF(p_missed_call_problem, ''),
    NULLIF(p_phone_setup, ''),
    NULLIF(p_contact_preference, ''),
    'telloya',
    'pending',
    NOW(),
    NOW()
  );

  -- Create notification attempt record
  INSERT INTO enquiry_notifications (
    id,
    enquiry_id,
    attempt_number,
    internal_status,
    customer_ack_status,
    created_at
  ) VALUES (
    v_attempt_id,
    v_enquiry_id,
    1,
    'pending',
    CASE WHEN v_send_ack THEN 'pending' ELSE 'skipped' END,
    NOW()
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'id', v_enquiry_id,
    'public_reference', v_public_ref,
    'attempt', v_attempt_id,
    'send_ack', v_send_ack
  );
END;
$$;
```

### 4. Finish Notification RPC

**Create RPC to record notification delivery outcomes:**

```sql
CREATE OR REPLACE FUNCTION finish_telloya_enquiry_notification_v1(
  p_enquiry_id UUID,
  p_attempt_id UUID,
  p_internal_status TEXT,
  p_ack_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update notification attempt with delivery outcomes
  UPDATE enquiry_notifications
  SET 
    internal_status = p_internal_status,
    customer_ack_status = p_ack_status,
    completed_at = NOW()
  WHERE id = p_attempt_id
  AND enquiry_id = p_enquiry_id;

  -- Update enquiry timestamp
  UPDATE enquiries
  SET updated_at = NOW()
  WHERE id = p_enquiry_id;
END;
$$;
```

### 5. Admin Queue Support

**Add fields to support admin workflow:**

```sql
-- Add admin review fields to enquiries table
ALTER TABLE enquiries
ADD COLUMN reviewed_by UUID REFERENCES auth.users(id),
ADD COLUMN reviewed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN review_status TEXT,
ADD COLUMN review_notes TEXT,
ADD COLUMN converted_to_onboarding_id UUID;

-- Add constraint for review status
ALTER TABLE enquiries
ADD CONSTRAINT enquiries_review_status_check 
CHECK (review_status IS NULL OR review_status IN (
  'pending', 'in_review', 'approved', 'rejected', 'converted'
));

-- Create index for admin queue queries
CREATE INDEX idx_enquiries_review_status 
ON enquiries(review_status, created_at DESC) 
WHERE review_status IN ('pending', 'in_review');

-- Create index for converted enquiries
CREATE INDEX idx_enquiries_converted 
ON enquiries(converted_to_onboarding_id) 
WHERE converted_to_onboarding_id IS NOT NULL;
```

### 6. Enquiry Notifications Table

**Create table for tracking notification delivery:**

```sql
CREATE TABLE IF NOT EXISTS enquiry_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id UUID NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  internal_status TEXT NOT NULL DEFAULT 'pending',
  customer_ack_status TEXT NOT NULL DEFAULT 'pending',
  internal_message_id TEXT,
  customer_message_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT enquiry_notifications_internal_status_check 
    CHECK (internal_status IN ('pending', 'sent', 'failed', 'skipped')),
  CONSTRAINT enquiry_notifications_customer_ack_status_check 
    CHECK (customer_ack_status IN ('pending', 'sent', 'failed', 'skipped', 'suppressed'))
);

CREATE INDEX idx_enquiry_notifications_enquiry_id 
ON enquiry_notifications(enquiry_id, created_at DESC);

CREATE INDEX idx_enquiry_notifications_pending 
ON enquiry_notifications(created_at) 
WHERE internal_status = 'pending' OR customer_ack_status = 'pending';
```

## Required Environment Variables

```bash
# Telloya-specific configuration
TELLOYA_ENQUIRY_ENABLED=false  # Gate submissions until schema is deployed
TELLOYA_ADMIN_EMAIL=admin@profilerelaunch.com
TELLOYA_FROM_EMAIL=telloya@profilerelaunch.com
TELLOYA_FROM_NAME="Telloya by ProfileRelaunch"
```

## Email Templates

### Customer Acknowledgement Email

**Subject:** Your Telloya Enquiry - Reference {REFERENCE}

```
Hi {NAME},

Thank you for your enquiry about Telloya.

Your enquiry reference: {REFERENCE}

We have received your request for information about {PRODUCT} and the details you provided. Our team will review your enquiry and get in touch within 2 business days to discuss your requirements.

What happens next:
1. We review your business details and requirements
2. We contact you at {EMAIL} or {PHONE} to discuss pricing and suitability
3. If you decide to proceed, we help you set up call forwarding
4. We test the service before you go live

Telloya is an AI receptionist service operated by ProfileRelaunch Ltd.

If you have any questions in the meantime, please reply to this email.

Best regards,
The Telloya Team

---
This email was sent in response to your enquiry submitted at {SUBMISSION_TIME}.
If you did not submit this enquiry, please contact us immediately.
```

### Admin Notification Email

**Subject:** New Telloya Enquiry - {REFERENCE} - {PRODUCT}

```
New Telloya enquiry received:

Reference: {REFERENCE}
Product Interest: {PRODUCT}
Submission Time: {SUBMISSION_TIME}

Business Details:
- Name: {BUSINESS_NAME}
- Trade: {TRADE}
- Country: {COUNTRY}
- Locations: {LOCATIONS}
- Website: {WEBSITE_URL}

Contact Details:
- Name: {FULL_NAME}
- Email: {EMAIL}
- Phone: {PHONE}
- Contact Preference: {CONTACT_PREFERENCE}

Requirements:
- Missed Call Problem: {MISSED_CALL_PROBLEM}
- Phone Setup: {PHONE_SETUP}

View in Admin: {ADMIN_LINK}

---
This is an automated notification from the Telloya enquiry system.
```

## Integration Points

### 1. API Route Implementation

**File:** `apps/telloya/app/api/telloya/enquiry/route.ts`

```typescript
import { persistTelloyaEnquiry } from "@/lib/telloya/enquiry-intake"
import { consumePublicRateLimit } from "@/lib/enquiry-rate-limit"
import { readSubmissionKey } from "@/lib/cases/submission-key"

export async function POST(request: Request) {
  // ... validation ...
  
  // Check environment gate
  if (process.env.TELLOYA_ENQUIRY_ENABLED !== "true") {
    return NextResponse.json({
      ok: false,
      message: "Telloya enquiries are not currently available. Please check back soon."
    }, { status: 503 })
  }

  // Rate limiting
  const limit = await consumePublicRateLimit(request)
  if (!limit.ok) {
    return NextResponse.json({ ok: false, message: "Too many requests" }, { status: 429 })
  }

  // Idempotency key
  const submissionKey = readSubmissionKey(raw)
  if (!submissionKey) {
    return NextResponse.json({ ok: false, message: "Invalid submission" }, { status: 400 })
  }

  // Persist enquiry
  const result = await persistTelloyaEnquiry(data, submissionKey)
  return NextResponse.json(result)
}
```

### 2. Enquiry Persistence Service

**File:** `lib/telloya/enquiry-intake.ts`

```typescript
export async function persistTelloyaEnquiry(
  data: TelloyaEnquiryData,
  key: string
): Promise<TelloyaEnquiryResult> {
  // Call create_telloya_enquiry_v1 RPC
  // Send customer acknowledgement email
  // Send admin notification email
  // Return public reference
}
```

## Migration Strategy

1. **Phase 1: Schema Deployment**
   - Deploy table extensions
   - Deploy RPC functions
   - Deploy indexes
   - Verify no breaking changes to existing enquiries

2. **Phase 2: Email Template Setup**
   - Configure Resend templates
   - Test customer acknowledgement flow
   - Test admin notification flow

3. **Phase 3: Enable Feature**
   - Set `TELLOYA_ENQUIRY_ENABLED=true`
   - Monitor first submissions
   - Verify email delivery
   - Verify admin queue integration

4. **Phase 4: Production Verification**
   - Submit test enquiry
   - Verify database persistence
   - Verify email delivery
   - Verify admin workflow

## Rollback Plan

If issues arise:

1. Set `TELLOYA_ENQUIRY_ENABLED=false` (immediate)
2. Revert RPC functions if needed
3. Existing enquiries remain intact
4. No data loss risk

## Security Considerations

1. **RPC Security:**
   - Functions use `SECURITY DEFINER`
   - Row-level security policies apply
   - Admin-only access to review functions

2. **Rate Limiting:**
   - Reuse existing public API rate limits
   - IP-based throttling
   - Submission key uniqueness

3. **Data Protection:**
   - PII fields encrypted at rest
   - Email delivery via secure provider (Resend)
   - Audit trail for admin actions

4. **Idempotency:**
   - Submission keys prevent duplicates
   - 24-hour window for deduplication
   - No duplicate emails sent

## Testing Checklist

- [ ] Schema migrations apply cleanly
- [ ] RPC functions execute without errors
- [ ] Unique reference generation works
- [ ] Idempotency prevents duplicates
- [ ] Rate limiting blocks abuse
- [ ] Customer emails deliver correctly
- [ ] Admin emails deliver correctly
- [ ] Admin queue shows new enquiries
- [ ] Review workflow functions
- [ ] Conversion to onboarding links correctly

## Open Questions

1. **Admin Workflow Integration:**
   - How do admins convert enquiries to onboarding requests?
   - What approval workflow is needed?
   - Should we auto-create business/customer records?

2. **Onboarding Link:**
   - What is the schema for onboarding requests?
   - How do we link enquiry → onboarding → subscription?

3. **Email Delivery:**
   - Use shared Resend configuration or separate?
   - What sender address for Telloya?
   - Template management approach?

4. **Analytics:**
   - Track conversion funnel?
   - Product interest metrics?
   - Time to conversion?

## Notes

- This proposal extends Phase 02B enquiry infrastructure
- No changes to existing case intake flow
- Telloya enquiries are distinct from case submissions
- Admin workflow needs separate specification
- Email templates need design/copywriting review

---

**Prepared by:** Cursor Cloud Agent  
**Review Status:** Awaiting Phase 02B merge and stakeholder review  
**Next Steps:** Review → Refine → Implement → Test → Deploy
