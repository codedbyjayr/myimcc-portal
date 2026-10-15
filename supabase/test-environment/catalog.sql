-- Synthetic catalog for ycziiezfrwnzouilutum only.
INSERT INTO public.clearance_departments(code,name,icon) VALUES
('cashier','Test Cashier','💳'),('library','Test Library','📚'),('registrar','Test Registrar','📄')
ON CONFLICT(code) DO NOTHING;
INSERT INTO public.academic_years(label,start_date,end_date,is_active)
VALUES ('2026-2027','2026-06-01','2027-05-31',true);
INSERT INTO public.departments(code,name) VALUES ('TEST-IT','Test Computing Department');
INSERT INTO public.rooms(name,building,capacity,type) VALUES ('TEST-101','Demo Building',30,'classroom');
INSERT INTO public.courses(code,title,year_level,semester,lec_units,lab_units)
VALUES ('TEST101','Test Software Fundamentals',1,1,3,0),('TEST102','Test Data Fundamentals',1,1,3,0);
INSERT INTO public.course_offerings(code,title,units,program,year,semester,school_year)
VALUES ('TEST101','Test Software Fundamentals',3,'BSIT',1,'1st Semester','2026-2027'),
       ('TEST102','Test Data Fundamentals',3,'BSIT',1,'1st Semester','2026-2027');
INSERT INTO public.sections(name,program,year_level,academic_year_id)
SELECT 'TEST-1A','BSIT','1st Year',id FROM public.academic_years WHERE label='2026-2027';
INSERT INTO public.faq_articles(category,question,answer,keywords) VALUES
('Test environment','Is this the real school portal?','This is a test environment. All demonstration records are fictional.','test demo sandbox');
INSERT INTO public.announcements(content)
VALUES ('TEST ENVIRONMENT: use fictional information only. This project is separate from the main portal.');
