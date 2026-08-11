-- VL Body Lab CMS — field-level rebuild
-- Run this once in the VL Body Lab Supabase project's SQL Editor
-- (project zwdlxwlftafurspzjrxw — independent from Echelon and iamzamiyah).
--
-- This replaces the earlier "announcement feed" CMS (brand_content_items /
-- brand_media_assets), which had zero live rows and didn't let the operator
-- edit the site's actual existing headlines, prices, and link text. This
-- version lets every real content block on the live site be edited directly,
-- prefilled with its current text, from the admin console.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Retire the old announcement-feed schema, if it exists in this project
--    (CASCADE drops any dependent policies/triggers along with the table —
--    safe even if these objects were never created here).
-- ---------------------------------------------------------------------------
drop table if exists public.brand_content_items cascade;
drop table if exists public.brand_media_assets cascade;
drop function if exists public.is_vl_body_lab_admin();

-- ---------------------------------------------------------------------------
-- 2. Admin allow-list
-- ---------------------------------------------------------------------------
create table if not exists public.vl_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

insert into public.vl_admins (email) values
  ('vlbodylab@gmail.com'),
  ('luther.casimir@gmail.com')
on conflict (email) do nothing;

create or replace function public.is_vl_body_lab_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.vl_admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_vl_body_lab_admin() from public;
grant execute on function public.is_vl_body_lab_admin() to authenticated;

alter table public.vl_admins enable row level security;
drop policy if exists "VL operators view admins" on public.vl_admins;
create policy "VL operators view admins" on public.vl_admins for select to authenticated
using ((select public.is_vl_body_lab_admin()));

-- ---------------------------------------------------------------------------
-- 3. Content items — one flexible row per editable text block
-- ---------------------------------------------------------------------------
create table if not exists public.vl_content_items (
  id uuid primary key default gen_random_uuid(),
  content_key text not null unique,
  section_name text not null,
  eyebrow text,
  title text,
  body text,
  cta_label text,
  cta_url text,
  published boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists vl_content_public_idx on public.vl_content_items (published, content_key);

create or replace function public.vl_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists vl_content_updated_at on public.vl_content_items;
create trigger vl_content_updated_at before update on public.vl_content_items
for each row execute procedure public.vl_set_updated_at();

alter table public.vl_content_items enable row level security;
drop policy if exists "Public reads published VL content" on public.vl_content_items;
create policy "Public reads published VL content" on public.vl_content_items for select to anon, authenticated
using (published = true);
drop policy if exists "VL operators manage content" on public.vl_content_items;
create policy "VL operators manage content" on public.vl_content_items for all to authenticated
using ((select public.is_vl_body_lab_admin())) with check ((select public.is_vl_body_lab_admin()));

grant select on public.vl_content_items to anon, authenticated;
grant insert, update, delete on public.vl_content_items to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Media items — swappable images for the Image Studio
--    target_filename matches the current hardcoded filename (e.g. "t1.jpg")
--    so a single replacement swaps every <img> and CSS background-image that
--    currently points at it, with no per-page wiring.
-- ---------------------------------------------------------------------------
create table if not exists public.vl_media_items (
  id uuid primary key default gen_random_uuid(),
  placement text not null,
  target_filename text,
  title text not null default 'VL Body Lab',
  caption text,
  alt_text text not null default 'VL Body Lab image',
  source_url text not null,
  storage_path text,
  published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vl_media_public_idx on public.vl_media_items (placement, published, sort_order, created_at desc);

drop trigger if exists vl_media_updated_at on public.vl_media_items;
create trigger vl_media_updated_at before update on public.vl_media_items
for each row execute procedure public.vl_set_updated_at();

alter table public.vl_media_items enable row level security;
drop policy if exists "Public reads published VL media" on public.vl_media_items;
create policy "Public reads published VL media" on public.vl_media_items for select to anon, authenticated
using (published = true);
drop policy if exists "VL operators manage media" on public.vl_media_items;
create policy "VL operators manage media" on public.vl_media_items for all to authenticated
using ((select public.is_vl_body_lab_admin())) with check ((select public.is_vl_body_lab_admin()));

grant select on public.vl_media_items to anon, authenticated;
grant insert, update, delete on public.vl_media_items to authenticated;

insert into storage.buckets (id, name, public)
values ('vl-body-lab-media', 'vl-body-lab-media', true)
on conflict (id) do update set public = true;

drop policy if exists "Public reads VL media files" on storage.objects;
create policy "Public reads VL media files" on storage.objects for select to anon, authenticated
using (bucket_id = 'vl-body-lab-media');
drop policy if exists "VL operators manage media files" on storage.objects;
create policy "VL operators manage media files" on storage.objects for all to authenticated
using (bucket_id = 'vl-body-lab-media' and (select public.is_vl_body_lab_admin()))
with check (bucket_id = 'vl-body-lab-media' and (select public.is_vl_body_lab_admin()));

-- ---------------------------------------------------------------------------
-- 5. Seed every current live content block, so nothing goes blank on deploy
-- ---------------------------------------------------------------------------
insert into public.vl_content_items (content_key, section_name, eyebrow, title, body, cta_label, cta_url) values
('home_hero_eyebrow', 'Home / Hero', null, null, 'Faith-led fitness · elevated living', null, null),
('home_hero_title', 'Home / Hero', null, 'Pretty in purpose.
Strong by design.', null, null, null),
('home_hero_body', 'Home / Hero', null, null, 'Training, fuel, and everyday essentials for the woman building her glow and her grit at the same time.', null, null),
('home_hero_cta', 'Home / Hero', null, null, null, 'Enter the lab', null),
('home_story_title', 'Home / Story', null, 'The story', null, null, null),
('home_story_body', 'Home / Story', null, null, 'VL Body Lab is where high-maintenance aesthetics meet high-performance training. Coach Niiy created this collective for women who refuse to choose between feeling beautiful and becoming powerful.', null, null),
('home_story_verse', 'Home / Story', null, null, '“Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.”', null, null),
('home_story_citation', 'Home / Story', null, null, 'Proverbs 3:5–6', null, null),
('home_lab_title', 'Home / The Lab', null, 'The Lab', null, null, null),
('home_lab_grit', 'Home / The Lab', null, 'Grit', 'Performance blueprints and training manuals built for purposeful progress.', 'Enter the gym →', null),
('home_lab_kitchen', 'Home / The Lab', null, 'In the kitchen', 'Lab-to-table meals to fuel your training and your everyday glow.', 'View recipes →', null),
('home_lab_smoothies', 'Home / The Lab', null, 'Smoothie bar', 'High-protein blends for recovery, energy, and the in-between.', 'Browse menu →', null),
('home_lab_snacks', 'Home / The Lab', null, 'Protein snacks', 'Quick, beautiful fuel for a full schedule and big goals.', 'See snacks →', null),
('home_shop_title', 'Home / VL Collective', null, 'VL Collective', null, null, null),
('home_shop_intro', 'Home / VL Collective', null, null, 'A soft-power uniform for the work in and out of the gym. Pick your color, add pieces to your bag, and send your order request when you’re ready.', null, null),
('home_product_zipup', 'Home / VL Collective', null, 'Princess Zip-Up', '$65.00', null, null),
('home_product_leggings', 'Home / VL Collective', null, 'Sculpt Leggings', '$55.00', null, null),
('home_product_bra', 'Home / VL Collective', null, 'VL Sports Bra', '$38.00', null, null),
('home_product_hat', 'Home / VL Collective', null, 'VL Trucker Hat', '$30.00', null, null),
('home_product_crop', 'Home / VL Collective', null, 'Aura Crop Tee', '$35.00', null, null),
('home_product_auralegging', 'Home / VL Collective', null, 'Aura Leggings', '$55.00', null, null),
('home_product_hoodie', 'Home / VL Collective', null, 'Rockstar Hoodie', '$65.00', null, null),
('home_etsy_title', 'Home / Etsy Drops', null, 'Etsy drops', null, null, null),
('home_etsy_intro', 'Home / Etsy Drops', null, null, 'The extras that make the VL lifestyle feel complete—made-to-order accessories and creator merch designed for your gym bag, commute, and everyday reset.', null, null),
('home_etsy_case', 'Home / Etsy Drops', null, 'VL phone case', 'Glossy, protective, and marked with the VL signature.', 'Request the Etsy link →', null),
('home_etsy_cardholder', 'Home / Etsy Drops', null, 'VL card holder', 'A refined carry piece for post-gym errands and everyday essentials.', 'Request the Etsy link →', null),
('home_etsy_headphones', 'Home / Etsy Drops', null, 'VL headphones', 'Creator mode, commute mode, locked-in workout mode.', 'Request the Etsy link →', null),
('home_essentials_title', 'Home / Essentials', null, 'The Essentials', null, null, null),
('home_essentials_note', 'Home / Essentials', null, null, 'Niiy’s current gym and lifestyle favorites. Some links may be affiliate links, which means VL Body Lab may earn a commission at no added cost to you.', null, null),
('home_essentials_preworkout', 'Home / Essentials', null, 'Pre-workout edit', 'High-energy picks for early lifts, long days, and locked-in Rockstar sessions.', 'Shop her TikTok →', 'https://www.tiktok.com/@vloneniiy'),
('home_essentials_gymbag', 'Home / Essentials', null, 'Gym bag non-negotiables', 'Hydration, straps, bands, and all the little things that make training smoother.', 'See the edit →', 'https://www.instagram.com/vloneniiy?igsh=MWR2ZzR5MzZhbmNlOA=='),
('home_essentials_recovery', 'Home / Essentials', null, 'Glow & recovery', 'Post-workout recovery and lifestyle favorites that keep the Princess energy intact.', 'Get the links →', 'https://www.tiktok.com/@vloneniiy'),
('home_creator_title', 'Home / Creator', null, 'Creator mode', null, null, null),
('home_creator_body', 'Home / Creator', null, null, 'Training clips, gym fits, faith-led routines, and the real work behind the glow. Follow the VL journey or bring your brand into the story.', null, null),
('home_creator_cta_watch', 'Home / Creator', null, null, null, 'Watch on TikTok', 'https://www.tiktok.com/@vloneniiy'),
('home_creator_cta_collab', 'Home / Creator', null, null, null, 'Work with Niiy', 'mailto:collab@vlbodylab.com?subject=VL%20Body%20Lab%20brand%20collaboration'),
('home_travel_title', 'Home / Travel', null, 'Travel & lifestyle', null, null, null),
('home_travel_feature_title', 'Home / Travel', null, 'Outside the gym', null, null, null),
('home_travel_feature_body', 'Home / Travel', null, null, 'Soft-life style, travel days, and the moments that make the work worth it.', null, null),
('home_travel_body', 'Home / Travel', null, null, 'VL is about more than the workout. Follow Niiy for packed-gym-to-airport routines, travel style, elevated self-care, and the behind-the-scenes of building a life you’re proud of.', null, null),
('home_travel_cta_follow', 'Home / Travel', null, null, null, 'Follow the journey', 'https://www.instagram.com/vloneniiy?igsh=MWR2ZzR5MzZhbmNlOA=='),
('home_travel_cta_collab', 'Home / Travel', null, null, null, 'Travel & lifestyle collabs', 'mailto:collab@vlbodylab.com?subject=VL%20Body%20Lab%20travel%20or%20lifestyle%20collaboration'),
('home_social_title', 'Home / Social', null, 'Tap in', null, null, null),
('home_contact_title', 'Home / Contact', null, 'Let''s connect', null, null, null),
('home_contact_body', 'Home / Contact', null, null, 'Coaching questions, merch inquiries, affiliate opportunities, or a brand partnership—send the details and we’ll get back to you.', null, null),
('home_contact_email', 'Home / Contact', null, 'collab@vlbodylab.com', null, null, 'mailto:collab@vlbodylab.com'),
('home_contact_location', 'Home / Contact', null, 'Apopka / Orlando, FL', null, null, null),
('home_footer_tagline', 'Home / Footer', null, null, 'Faith-led fitness, elevated lifestyle, and content made for women building a life they love.', null, null),
('grit_hero_eyebrow', 'Grit / Hero', null, null, 'The performance lab', null, null),
('grit_hero_title', 'Grit / Hero', null, 'Grit', null, null, null),
('grit_hero_body', 'Grit / Hero', null, null, 'Building the iconic VL silhouette through structured discipline.', null, null),
('grit_manual', 'Grit / Manual', 'Flagship blueprint', 'The Princess
Grit Manual', 'The definitive 12-week guide to high-performance aesthetic training.', 'Request the blueprint', null),
('grit_card_glutes_title', 'Grit / Cards', null, '01. Glute gains', null, null, null),
('grit_card_waist_title', 'Grit / Cards', null, '02. Snatched waist', null, null, null),
('grit_card_upper_title', 'Grit / Cards', null, '03. Upper body', null, null, null),
('kitchen_intro_eyebrow', 'Kitchen / Intro', null, null, 'Lab-to-table fuel', null, null),
('kitchen_intro_title', 'Kitchen / Intro', null, 'In the kitchen', null, null, null),
('kitchen_intro_body', 'Kitchen / Intro', null, null, 'Full meals and straightforward recipes designed to support your training, recovery, and everyday rhythm.', null, null),
('kitchen_card_salmon', 'Kitchen / Recipes', 'High protein', 'Salmon Power Bowl', 'Build your bowl with salmon, a grain you love, bright greens, and a creamy yogurt-based sauce.', null, null),
('kitchen_card_pasta', 'Kitchen / Recipes', 'Quick prep', 'Princess Pasta', 'Pair a high-protein pasta with lean protein, roasted vegetables, and a simple sauce for an easy win.', null, null),
('kitchen_card_breakfast', 'Kitchen / Recipes', 'Meal prep', 'Glow-Up Breakfast', 'Greek yogurt, berries, crunchy granola, and a scoop of protein—ready before the day gets loud.', null, null),
('kitchen_card_chicken', 'Kitchen / Recipes', 'Recovery', 'Chicken & Rice Plate', 'Keep it simple: seasoned chicken, jasmine rice, and a colorful vegetable for dependable fuel.', null, null),
('smoothies_intro_eyebrow', 'Smoothies / Intro', null, null, 'Post-workout recovery', null, null),
('smoothies_intro_title', 'Smoothies / Intro', null, 'Smoothie bar', null, null, null),
('smoothies_intro_body', 'Smoothies / Intro', null, null, 'High-protein blends for recovery, fuel, and a little softness in the routine.', null, null),
('smoothies_card_pb', 'Smoothies / Recipes', '30g protein', 'PB Banana Protein', 'Frozen banana, protein powder, peanut butter, milk, and ice. Blend until creamy.', null, null),
('smoothies_card_strawberry', 'Smoothies / Recipes', '28g protein', 'Strawberry Cream', 'Strawberries, Greek yogurt, protein powder, milk, and ice. Blend smooth.', null, null),
('smoothies_card_oat', 'Smoothies / Recipes', '25g protein', 'Protein Oat Bowl', 'Cook oats, then stir in protein powder with peanut butter and banana.', null, null),
('smoothies_card_milkshake', 'Smoothies / Recipes', '32g protein', 'Protein Milkshake', 'Cookies & cream protein, milk, and ice. Blend it thick; add whip if you want it.', null, null),
('snacks_intro_eyebrow', 'Snacks / Intro', null, null, 'Grab-and-go fuel', null, null),
('snacks_intro_title', 'Snacks / Intro', null, 'Protein snacks', null, null, null),
('snacks_intro_body', 'Snacks / Intro', null, null, 'Quick, satisfying options for the days you want to stay prepared without overthinking it.', null, null),
('snacks_card_yogurt', 'Snacks / Recipes', 'Sweet', 'Yogurt Bark', 'Greek yogurt, fruit, and a little granola—freeze, break, and keep it ready.', null, null),
('snacks_card_turkey', 'Snacks / Recipes', 'Savory', 'Turkey Roll-Ups', 'Turkey, a spread you love, crunchy vegetables, and a fast source of protein.', null, null),
('snacks_card_box', 'Snacks / Recipes', 'On the go', 'Protein Box', 'Pair a protein with fruit, something crunchy, and water before you head out.', null, null)
on conflict (content_key) do nothing;
