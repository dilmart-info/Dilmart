-- Insert Regions for Baghdad
INSERT INTO public.regions (governorate_id, name, sort_order)
SELECT id, name, sort_order FROM (
  VALUES 
    ('المنصور', 1), ('اليرموك', 2), ('الحارثية', 3), ('القادسية', 4), ('الخضراء', 5), ('العامرية', 6), ('الغزالية', 7),
    ('الكرادة داخل', 10), ('الكرادة خارج', 11), ('الجادرية', 12), ('عرصات الهندية', 13), ('السبع قصور', 14),
    ('الدورة', 20), ('السيدية', 21), ('البياع', 22), ('حي العامل', 23), ('الجهاد', 24),
    ('الاعظمية', 30), ('الوزيرية', 31), ('القاهرة', 32), ('الكريعات', 33),
    ('زيونة', 40), ('شارع فلسطين', 41), ('الغدير', 42), ('بغداد الجديدة', 43), ('المشتل', 44), ('الأمين', 45),
    ('مدينة الصدر', 50), ('الشعب', 51), ('جميلة', 52), ('الطالبية', 53),
    ('الكاظمية', 60), ('الحرية', 61), ('الشعلة', 62), ('العطيفية', 63),
    ('حي الجامعة', 70), ('حي العدل', 71),
    ('الزعفرانية', 80), ('جسر ديالى', 81),
    ('ابو غريب', 90)
) AS v(name, sort_order),
(SELECT id FROM public.governorates WHERE name = 'بغداد') as g(id)
ON CONFLICT DO NOTHING;

-- Insert Regions for Basra (Example)
INSERT INTO public.regions (governorate_id, name, sort_order)
SELECT id, name, sort_order FROM (
  VALUES 
    ('العشار', 1), ('الجزائر', 2), ('الجنينة', 3), ('الطويسة', 4), ('المعقل', 5), ('الجبيلة', 6), ('خمسة ميل', 7),
    ('حي الحسين', 10), ('الخليج', 11), ('بريهة', 12), ('مناوي باشا', 13)
) AS v(name, sort_order),
(SELECT id FROM public.governorates WHERE name = 'البصرة') as g(id)
ON CONFLICT DO NOTHING;
