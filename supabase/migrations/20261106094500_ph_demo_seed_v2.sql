-- ph_demo_seed_v2: same as ph_demo_seed, but only six items start below their reorder level
-- (v1 left 24 of 40 low, which hides the signal in a demo).
--
-- ph_demo_seed: one-click demo data for the "Galmee Pharmacy Demo" tenant.
--
-- Why a function and not a plain INSERT script: the demo tenant must belong to a real
-- auth user (Alpha signs up in the app and names the pharmacy "Galmee Pharmacy Demo").
-- The owner then taps "Load demo data" once. Runs as the caller (security invoker), so
-- RLS keeps every row inside the caller's own tenant, and stock and money go through the
-- core RPCs (receive_stock, record_sale).
--
-- Guards: caller must be the owner, the tenant must be named exactly
-- 'Galmee Pharmacy Demo' with vertical 'pharmacy', and must have no items yet.
-- All names are fictional; phone numbers use the unassigned 0900 000 1xx range.

create or replace function public.ph_load_demo_data()
returns integer
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_tenant uuid := private.current_tenant();
  v_role user_role := private.current_app_role();
  v_item uuid;
  v_ids uuid[] := '{}';
  v_prices numeric[] := '{}';
  v_customers uuid[] := '{}';
  r jsonb;
  c jsonb;
  i int := 0;
  k int;
  v_items jsonb := $j$[
    ["Paracetamol 500mg tablets","ፓራሲታሞል 500 ሚ.ግ","Paaraasitaamool 500mg","Analgesic","strip",15,9,40,20,-1],
    ["Amoxicillin 500mg capsules","አሞክሲሲሊን 500 ሚ.ግ","Amoksisiliin 500mg","Antibiotic","strip",45,30,30,12,1],
    ["ORS sachet","ኦ.አር.ኤስ","ORS","Rehydration","sachet",10,6,50,15,2],
    ["Ibuprofen 400mg tablets","አይቡፕሮፌን 400 ሚ.ግ","Ibuprofeen 400mg","Analgesic","strip",25,15,30,25,-1],
    ["Metronidazole 250mg tablets","ሜትሮኒዳዞል 250 ሚ.ግ","Metroonidaazool 250mg","Antibiotic","strip",30,18,25,18,-2],
    ["Ciprofloxacin 500mg tablets","ሲፕሮፍሎክሳሲን 500 ሚ.ግ","Siproofloksaasiin 500mg","Antibiotic","strip",60,40,20,8,3],
    ["Cotrimoxazole 480mg tablets","ኮትሪሞክሳዞል 480 ሚ.ግ","Kootrimoksaazool 480mg","Antibiotic","strip",35,22,20,6,-1],
    ["Zinc sulfate 20mg tablets","ዚንክ 20 ሚ.ግ","Ziinkii 20mg","Supplement","strip",40,25,20,22,-1],
    ["Ferrous sulfate + folic acid","አይረን ፎሊክ አሲድ","Ayireenii fi foolik asiidii","Supplement","strip",30,18,25,30,-1],
    ["Vitamin C 500mg tablets","ቫይታሚን ሲ 500 ሚ.ግ","Vitaamina C 500mg","Supplement","strip",20,12,20,28,4],
    ["Artemether-lumefantrine 20/120","አርቴሜተር ሉሜፋንትሪን","Arteemeterii-lumefaantiriinii","Antimalarial","pack",120,85,15,10,-2],
    ["Albendazole 400mg tablet","አልቤንዳዞል 400 ሚ.ግ","Albendaazool 400mg","Antiparasitic","tablet",15,8,30,40,-1],
    ["Mebendazole 100mg tablets","ሜቤንዳዞል 100 ሚ.ግ","Mebendaazool 100mg","Antiparasitic","strip",25,14,20,16,5],
    ["Omeprazole 20mg capsules","ኦሜፕራዞል 20 ሚ.ግ","Omeepraazool 20mg","Gastro","strip",50,32,20,14,-1],
    ["Antacid suspension 200ml","አንታሲድ ሽሮፕ","Antaasiidii dhangala'aa","Gastro","bottle",80,55,10,9,-2],
    ["Amlodipine 5mg tablets","አምሎዲፒን 5 ሚ.ግ","Amloodiipiin 5mg","Cardio","strip",40,24,20,15,-1],
    ["Enalapril 5mg tablets","ኢናላፕሪል 5 ሚ.ግ","Enaalapriil 5mg","Cardio","strip",45,28,15,4,-1],
    ["Metformin 500mg tablets","ሜትፎርሚን 500 ሚ.ግ","Metfoormiin 500mg","Diabetes","strip",35,20,25,20,-1],
    ["Glibenclamide 5mg tablets","ግሊቤንክላማይድ 5 ሚ.ግ","Gliibenklaamaayid 5mg","Diabetes","strip",30,18,15,12,6],
    ["Salbutamol inhaler 100mcg","ሳልቡታሞል ኢንሄለር","Salbutaamool inheelarii","Respiratory","inhaler",250,180,8,5,-1],
    ["Cough syrup 100ml","የሳል ሽሮፕ","Qoricha qufaa 100ml","Respiratory","bottle",90,60,10,11,1],
    ["Chlorphenamine 4mg tablets","ክሎርፊናሚን 4 ሚ.ግ","Kloorfenaamiin 4mg","Allergy","strip",15,8,20,24,-1],
    ["Cetirizine 10mg tablets","ሴትሪዚን 10 ሚ.ግ","Setiriziin 10mg","Allergy","strip",30,17,15,13,-2],
    ["Diclofenac 50mg tablets","ዳይክሎፌናክ 50 ሚ.ግ","Daayiklofenaak 50mg","Analgesic","strip",20,11,25,3,-1],
    ["Tetracycline eye ointment","ቴትራሳይክሊን የዓይን ቅባት","Dibata ijaa tetraasayikliin","Eye","tube",35,20,10,14,7],
    ["Gentamicin eye drops","ጀንታማይሲን የዓይን ጠብታ","Copha ijaa jentaamaayisiin","Eye","bottle",60,38,8,7,-1],
    ["Clotrimazole cream 20g","ክሎትሪማዞል ክሬም","Kireemii kloorimaazool","Skin","tube",55,34,10,12,-1],
    ["Hydrocortisone cream 1%","ሃይድሮኮርቲዞን ክሬም","Kireemii haayidrokortizoon","Skin","tube",65,40,8,9,8],
    ["Povidone-iodine 10% 100ml","ፖቪዶን አዮዲን","Poovidoon ayoodiinii","First aid","bottle",75,48,10,10,-1],
    ["Gauze bandage 10cm","ፋሻ 10 ሳ.ሜ","Faashaa 10cm","First aid","roll",20,11,30,45,-1],
    ["Adhesive plaster roll","ፕላስተር","Pilaasterii","First aid","roll",35,20,15,6,-1],
    ["Surgical gloves (pair)","የቀዶ ጥገና ጓንት","Gubbaa harkaa","First aid","pair",15,8,50,120,-1],
    ["Disposable syringe 5ml","ሲሪንጅ 5 ሚ.ሊ","Lilmoo 5ml","First aid","piece",8,4,100,180,-1],
    ["Oral contraceptive pills","የወሊድ መከላከያ ክኒን","Kinniinii ittisa ulfaa","Family planning","cycle",30,18,20,25,-2],
    ["Condoms (pack of 3)","ኮንዶም","Kondomii","Family planning","pack",15,8,30,60,-1],
    ["Prenatal multivitamin","የእርግዝና ቫይታሚን","Vitaamina ulfaa","Supplement","bottle",180,120,6,8,-1],
    ["Paracetamol syrup 120mg/5ml","ፓራሲታሞል ሽሮፕ","Paaraasitaamool dhangala'aa","Analgesic","bottle",45,28,15,17,2],
    ["Amoxicillin suspension 125mg/5ml","አሞክሲሲሊን ሽሮፕ","Amoksisiliin dhangala'aa","Antibiotic","bottle",70,46,12,5,-2],
    ["Doxycycline 100mg capsules","ዶክሲሳይክሊን 100 ሚ.ግ","Doksiisaayikliin 100mg","Antibiotic","strip",40,25,15,11,-1],
    ["Normal saline 0.9% 500ml","ኖርማል ሳላይን","Saalaayinii normaalii","IV fluids","bag",65,42,10,13,-1]
  ]$j$;
  -- [name_en, name_am, name_om, category, unit, price, cost, reorder_level, qty, expiry_band]
  -- expiry_band: 1..8 = expires within 30 days (days = band * 3), -2 = within 31-89 days,
  --              -1 = 6-24 months away.
  v_customer_list jsonb := $j$[
    ["Almaz Bekele","0900000101",3000],["Tesfaye Guta","0900000102",2000],
    ["Hawi Lemma","0900000103",1500],["Dereje Abdi","0900000104",5000],
    ["Meseret Kebede","0900000105",2500],["Chaltu Dida","0900000106",2000],
    ["Yonas Haile","0900000107",4000],["Bontu Gemechu","0900000108",1000],
    ["Kedir Aman","0900000109",3000],["Selam Tadesse","0900000110",2000],
    ["Lensa Bayisa","0900000111",1500],["Abdi Jemal","0900000112",3500],
    ["Tigist Alemu","0900000113",2000],["Gemechis Tolera","0900000114",2500],
    ["Hirut Mengistu","0900000115",1000]
  ]$j$;
  v_expiry date;
  v_band int;
begin
  if v_tenant is null then raise exception 'not_signed_in'; end if;
  if v_role is distinct from 'owner' then raise exception 'owner_only'; end if;
  if not exists (
    select 1 from tenants
    where id = v_tenant and name = 'Galmee Pharmacy Demo' and vertical = 'pharmacy'
  ) then
    raise exception 'not_demo_tenant';
  end if;
  if exists (select 1 from items where tenant_id = v_tenant) then
    raise exception 'demo_already_loaded';
  end if;

  -- 40 items, each with one or two batches
  for r in select value from jsonb_array_elements(v_items) loop
    i := i + 1;
    insert into items (name_en, name_am, name_om, category, unit, price, cost, reorder_level, sku, tracks_expiry)
    values (r->>0, r->>1, r->>2, r->>3, r->>4, (r->>5)::numeric, (r->>6)::numeric, (r->>7)::numeric,
            '29' || lpad(i::text, 11, '0'), true)
    returning id into v_item;
    v_ids := v_ids || v_item;
    v_prices := v_prices || (r->>5)::numeric;

    v_band := (r->>9)::int;
    v_expiry := case
      when v_band > 0 then current_date + v_band * 3
      when v_band = -2 then current_date + 40 + (i % 45)
      else current_date + 180 + (i * 13) % 540
    end;
    -- older (earlier-expiring) batch first, then a fresh batch, except for six items
    -- left below their reorder level so the low-stock list has something to show
    perform receive_stock(v_item, (r->>8)::numeric, (r->>6)::numeric,
                          'D' || lpad(i::text, 3, '0') || '-A', v_expiry);
    if i not in (7, 17, 19, 24, 31, 38) then
      perform receive_stock(v_item, (r->>7)::numeric * 2, (r->>6)::numeric,
                            'D' || lpad(i::text, 3, '0') || '-B', current_date + 400 + (i * 7) % 300);
    end if;
  end loop;

  -- 15 credit customers
  for c in select value from jsonb_array_elements(v_customer_list) loop
    insert into customers (name, phone, credit_limit, notes)
    values (c->>0, c->>1, (c->>2)::numeric, 'Demo customer (fictional)')
    returning id into v_item;
    v_customers := v_customers || v_item;
  end loop;

  -- Credit sales for 12 of the 15 customers (some partly paid), via core record_sale.
  for k in 1..12 loop
    perform record_sale(
      jsonb_build_array(
        jsonb_build_object('item_id', v_ids[1 + (k * 7) % 40], 'qty', 1 + k % 3, 'price', v_prices[1 + (k * 7) % 40]),
        jsonb_build_object('item_id', v_ids[1 + (k * 11) % 40], 'qty', 1, 'price', v_prices[1 + (k * 11) % 40])
      ),
      v_customers[k],
      case when k % 3 = 0 then 20 else 0 end,
      'cash',
      'demo-credit-' || k,
      current_date + (k % 4) * 7
    );
  end loop;

  -- A few paid sales so the day is not empty (cash and Telebirr).
  for k in 1..8 loop
    perform record_sale(
      jsonb_build_array(
        jsonb_build_object('item_id', v_ids[1 + (k * 5) % 40], 'qty', 1 + k % 2, 'price', v_prices[1 + (k * 5) % 40])
      ),
      null,
      v_prices[1 + (k * 5) % 40] * (1 + k % 2),
      case when k % 3 = 0 then 'telebirr'::pay_method else 'cash'::pay_method end,
      'demo-cash-' || k,
      null
    );
  end loop;

  return i;
end;
$$;

revoke all on function public.ph_load_demo_data() from public, anon;
grant execute on function public.ph_load_demo_data() to authenticated;

comment on function public.ph_load_demo_data() is
  'Galmee Pharmacy: loads fictional demo items, batches, customers and sales into the caller''s tenant. Owner only; tenant must be named "Galmee Pharmacy Demo" and empty.';
