-- Drop the foreign key constraint that references students table
ALTER TABLE clearance_status DROP CONSTRAINT IF EXISTS clearance_status_student_id_fkey;

-- Add new foreign key constraint to reference profiles table instead
ALTER TABLE clearance_status 
  ADD CONSTRAINT clearance_status_student_id_fkey 
  FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
