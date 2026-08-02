import { z } from 'zod';

/**
 * PeeringDB API payloads (subset). Validates external input before it reaches
 * the ASN→org mapping. Docs: https://www.peeringdb.com/apidocs/
 *
 * We request only the fields we need via `?fields=`; unknown keys are ignored.
 */

export const peeringdbNetSchema = z.object({
  asn: z.number().int(),
  org_id: z.number().int(),
  name: z.string(),
});

export const peeringdbNetResponseSchema = z.object({
  data: z.array(peeringdbNetSchema),
});

export const peeringdbOrgSchema = z.object({
  id: z.number().int(),
  name: z.string(),
});

export const peeringdbOrgResponseSchema = z.object({
  data: z.array(peeringdbOrgSchema),
});

export type PeeringdbNet = z.infer<typeof peeringdbNetSchema>;
export type PeeringdbOrg = z.infer<typeof peeringdbOrgSchema>;
