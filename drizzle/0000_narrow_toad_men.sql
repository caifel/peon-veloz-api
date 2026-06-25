CREATE TABLE `donations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tournament_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'BOB' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`note` text,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `donations_user_id_idx` ON `donations` (`user_id`);--> statement-breakpoint
CREATE INDEX `donations_tournament_id_idx` ON `donations` (`tournament_id`);--> statement-breakpoint
CREATE TABLE `health_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tournament_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'BOB' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inscriptions_tournament_user_unique` ON `inscriptions` (`tournament_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `inscriptions_user_id_idx` ON `inscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `prizes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tournament_id` integer NOT NULL,
	`label` text NOT NULL,
	`rank` integer NOT NULL,
	`type` text NOT NULL,
	`amount` integer,
	`percentage` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "prize_type_check" CHECK(("prizes"."type" = 'fixed' AND "prizes"."amount" IS NOT NULL AND "prizes"."percentage" IS NULL) OR ("prizes"."type" = 'percentage' AND "prizes"."percentage" IS NOT NULL AND "prizes"."amount" IS NULL)),
	CONSTRAINT "rank_check" CHECK("prizes"."rank" > 0)
);
--> statement-breakpoint
CREATE INDEX `prizes_tournament_id_idx` ON `prizes` (`tournament_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`start_time` integer NOT NULL,
	`location` text,
	`online_url` text,
	`organizer_name` text,
	`system_of_play` text NOT NULL,
	`chess_variant` text DEFAULT 'standard' NOT NULL,
	`clock_time` integer NOT NULL,
	`clock_increment` integer DEFAULT 0 NOT NULL,
	`duration_in_minutes` integer NOT NULL,
	`description` text,
	`max_participants` integer,
	`registration_deadline` integer,
	`inscription_price_min` integer DEFAULT 0 NOT NULL,
	`inscription_price_max` integer DEFAULT 0 NOT NULL,
	`rounds` integer,
	`slug` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "rounds_check" CHECK(("tournaments"."system_of_play" IN ('swiss','round-robin') AND "tournaments"."rounds" IS NOT NULL) OR ("tournaments"."system_of_play" NOT IN ('swiss','round-robin') AND "tournaments"."rounds" IS NULL)),
	CONSTRAINT "price_range_check" CHECK("tournaments"."inscription_price_min" <= "tournaments"."inscription_price_max"),
	CONSTRAINT "price_min_check" CHECK("tournaments"."inscription_price_min" >= 0),
	CONSTRAINT "clock_time_check" CHECK("tournaments"."clock_time" > 0),
	CONSTRAINT "clock_increment_check" CHECK("tournaments"."clock_increment" >= 0),
	CONSTRAINT "duration_check" CHECK("tournaments"."duration_in_minutes" > 0),
	CONSTRAINT "max_participants_check" CHECK("tournaments"."max_participants" IS NULL OR "tournaments"."max_participants" > 0),
	CONSTRAINT "deadline_check" CHECK("tournaments"."registration_deadline" IS NULL OR "tournaments"."registration_deadline" < "tournaments"."start_time")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tournaments_slug_unique` ON `tournaments` (`slug`);--> statement-breakpoint
CREATE INDEX `tournaments_start_time_idx` ON `tournaments` (`start_time`);--> statement-breakpoint
CREATE INDEX `tournaments_system_of_play_idx` ON `tournaments` (`system_of_play`);--> statement-breakpoint
CREATE INDEX `tournaments_active_start_idx` ON `tournaments` (`is_active`,`start_time`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lichess_id` text NOT NULL,
	`lichess_username` text,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`role` text NOT NULL,
	`birth_date` text,
	`phone` text NOT NULL,
	`gender` text,
	`country_name` text,
	`state_name` text,
	`email` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "role_check" CHECK("users"."role" IN ('admin','member')),
	CONSTRAINT "gender_check" CHECK("users"."gender" IS NULL OR "users"."gender" IN ('male','female','other')),
	CONSTRAINT "birth_date_check" CHECK("users"."birth_date" IS NULL OR "users"."birth_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_lichess_id_unique` ON `users` (`lichess_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);