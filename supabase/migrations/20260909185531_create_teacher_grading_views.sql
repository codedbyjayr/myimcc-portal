-- Create view for teachers to see their assigned subjects
CREATE OR REPLACE VIEW teacher_assigned_subjects AS
SELECT 
  ta.teacher_id,
  p.full_name as teacher_name,
  p.email as teacher_email,
  co.id as offering_id,
  co.code as course_code,
  co.title as course_title,
  co.units,
  co.schedule,
  co.program,
  co.year,
  co.semester,
  co.school_year,
  ta.academic_year,
  ta.semester as assignment_semester,
  ta.is_active
FROM teacher_assignments ta
JOIN profiles p ON ta.teacher_id = p.id
JOIN course_offerings co ON ta.offering_id = co.id
WHERE ta.is_active = true;

-- Create view for teachers to see students in their assigned subjects
CREATE OR REPLACE VIEW teacher_subject_students AS
SELECT 
  ta.teacher_id,
  p.full_name as teacher_name,
  co.id as offering_id,
  co.code as course_code,
  co.title as course_title,
  e.student_id,
  st.full_name as student_name,
  st.student_no,
  st.email as student_email,
  st.year_level,
  st.section,
  e.status as enrollment_status,
  e.enrolled_at,
  g.id as grade_id,
  g.prelim_percentage,
  g.semifinal_percentage,
  g.midterm_percentage,
  g.final_percentage,
  g.average_percentage,
  g.computed_equivalent,
  g.computed_remark,
  g.graded_by,
  g.graded_at
FROM teacher_assignments ta
JOIN profiles p ON ta.teacher_id = p.id
JOIN course_offerings co ON ta.offering_id = co.id
JOIN enrollments e ON co.id = e.offering_id
JOIN profiles st ON e.student_id = st.id
LEFT JOIN grades g ON e.student_id = g.student_id AND e.offering_id = g.offering_id
WHERE ta.is_active = true
AND st.role = 'student'
AND st.status = 'approved';

-- Create view for dropdown selection (teachers' subjects for grading)
CREATE OR REPLACE VIEW teacher_subject_dropdown AS
SELECT DISTINCT
  ta.teacher_id,
  co.id as offering_id,
  co.code || ' - ' || co.title as display_name,
  co.code,
  co.title,
  co.semester,
  co.school_year,
  co.schedule,
  COUNT(DISTINCT e.student_id) as enrolled_students_count
FROM teacher_assignments ta
JOIN course_offerings co ON ta.offering_id = co.id
LEFT JOIN enrollments e ON co.id = e.offering_id
WHERE ta.is_active = true
GROUP BY ta.teacher_id, co.id, co.code, co.title, co.semester, co.school_year, co.schedule
ORDER BY co.code;
