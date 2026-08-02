CREATE TABLE "relays" (
	"fingerprint" text PRIMARY KEY NOT NULL,
	"nickname" text NOT NULL,
	"hashed_fingerprint" text,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"last_restarted" timestamp with time zone,
	"running" boolean DEFAULT true NOT NULL,
	"hibernating" boolean,
	"flags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"or_addresses" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"exit_addresses" text[] DEFAULT ARRAY[]::text[],
	"dir_address" text,
	"country" text,
	"country_name" text,
	"city_name" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"as_number" text,
	"as_name" text,
	"consensus_weight" integer DEFAULT 0 NOT NULL,
	"consensus_weight_fraction" numeric(10, 8),
	"guard_probability" numeric(10, 8),
	"middle_probability" numeric(10, 8),
	"exit_probability" numeric(10, 8),
	"measured" boolean,
	"advertised_bandwidth" bigint,
	"bandwidth_rate" bigint,
	"bandwidth_burst" bigint,
	"observed_bandwidth" bigint,
	"overload_general_timestamp" timestamp with time zone,
	"contact" text,
	"platform" text,
	"version" text,
	"recommended_version" boolean,
	"version_status" text,
	"effective_family" text[] DEFAULT ARRAY[]::text[],
	"alleged_family" text[] DEFAULT ARRAY[]::text[],
	"indirect_family" text[] DEFAULT ARRAY[]::text[],
	"verified_host_names" text[] DEFAULT ARRAY[]::text[],
	"unreachable_or_addresses" text[] DEFAULT ARRAY[]::text[],
	"consensus_fingerprint" text,
	"sources" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relay_history" (
	"time" timestamp with time zone NOT NULL,
	"fingerprint" text NOT NULL,
	"consensus_weight" integer NOT NULL,
	"running" boolean NOT NULL,
	"flags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"guard_probability" integer,
	"middle_probability" integer,
	"exit_probability" integer,
	"advertised_bandwidth" bigint,
	"country" text,
	"as_number" text,
	"consensus_fingerprint" text
);
--> statement-breakpoint
CREATE TABLE "concentration_snapshots" (
	"time" timestamp with time zone NOT NULL,
	"dimension" varchar(16) NOT NULL,
	"key" varchar(64) NOT NULL,
	"relay_count" integer NOT NULL,
	"guard_weight_pct" double precision,
	"middle_weight_pct" double precision,
	"exit_weight_pct" double precision,
	"consensus_weight_sum" integer,
	"hhi" double precision,
	"sources" text[] DEFAULT ARRAY[]::text[]
);
--> statement-breakpoint
CREATE TABLE "anomalies" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"type" varchar(64) NOT NULL,
	"severity" varchar(16) DEFAULT 'info' NOT NULL,
	"details" jsonb NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_instance" text,
	"sources" text[] DEFAULT ARRAY[]::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_log" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "federation_log_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"instance_id" text NOT NULL,
	"op" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"sig" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_peers" (
	"instance_id" text PRIMARY KEY NOT NULL,
	"uri" text NOT NULL,
	"pubkey" text NOT NULL,
	"contact" text,
	"trusted" boolean DEFAULT false NOT NULL,
	"last_sync_seq" bigint DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_status" jsonb,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"rule_id" text,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL,
	"delivered_to" text[] DEFAULT ARRAY[]::text[]
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"owner_id" text NOT NULL,
	"name" varchar(128) NOT NULL,
	"condition" jsonb NOT NULL,
	"channels" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_claims" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"operator_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"proof_type" varchar(32) NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"proof_metadata" text
);
--> statement-breakpoint
CREATE TABLE "operators" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"email" text NOT NULL,
	"display_name" varchar(128),
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operators_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_claims" ADD CONSTRAINT "operator_claims_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE cascade ON UPDATE no action;