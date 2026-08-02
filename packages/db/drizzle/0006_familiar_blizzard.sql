CREATE TABLE "as_org" (
	"as_number" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"org_name" text NOT NULL,
	"source" text DEFAULT 'peeringdb' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
