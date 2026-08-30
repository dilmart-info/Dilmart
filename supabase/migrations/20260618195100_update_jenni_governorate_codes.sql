-- Update Jenni Governorate codes in public.governorates to match V2 API values

UPDATE public.governorates SET jenni_governorate_code = 'ANB' WHERE jenni_governorate_code = 'ANA';
UPDATE public.governorates SET jenni_governorate_code = 'BBL' WHERE jenni_governorate_code = 'BAB';
UPDATE public.governorates SET jenni_governorate_code = 'KRB' WHERE jenni_governorate_code = 'KAR';
UPDATE public.governorates SET jenni_governorate_code = 'SMH' WHERE jenni_governorate_code = 'SU';
UPDATE public.governorates SET jenni_governorate_code = 'MTH' WHERE jenni_governorate_code = 'MUT';
UPDATE public.governorates SET jenni_governorate_code = 'MYS' WHERE jenni_governorate_code = 'MAY';
UPDATE public.governorates SET jenni_governorate_code = 'SAH' WHERE jenni_governorate_code = 'SAL';
UPDATE public.governorates SET jenni_governorate_code = 'WST' WHERE jenni_governorate_code = 'WAS';
UPDATE public.governorates SET jenni_governorate_code = 'DOH' WHERE jenni_governorate_code = 'DAH';
