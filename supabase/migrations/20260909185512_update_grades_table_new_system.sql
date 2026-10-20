-- Add percentage grade columns to grades table
ALTER TABLE grades 
  ADD COLUMN IF NOT EXISTS prelim_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS semifinal_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS midterm_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS final_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS average_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS computed_equivalent NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS computed_remark TEXT,
  ADD COLUMN IF NOT EXISTS graded_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS graded_at TIMESTAMP WITH TIME ZONE;

-- Create function to calculate equivalent grade from percentage
CREATE OR REPLACE FUNCTION calculate_equivalent(percentage NUMERIC)
RETURNS NUMERIC(3,2) AS $$
BEGIN
  RETURN (
    SELECT equivalent 
    FROM grading_scale 
    WHERE percentage >= percentage_min AND percentage <= percentage_max
    AND is_passing = true
    ORDER BY equivalent ASC
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate remark from equivalent
CREATE OR REPLACE FUNCTION calculate_remark(percentage NUMERIC)
RETURNS TEXT AS $$
BEGIN
  RETURN (
    SELECT description 
    FROM grading_scale 
    WHERE percentage >= percentage_min AND percentage <= percentage_max
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-calculate average and equivalent
CREATE OR REPLACE FUNCTION update_grade_calculations()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate average percentage
  NEW.average_percentage = (
    COALESCE(NEW.prelim_percentage, 0) + 
    COALESCE(NEW.semifinal_percentage, 0) + 
    COALESCE(NEW.midterm_percentage, 0) + 
    COALESCE(NEW.final_percentage, 0)
  ) / NULLIF(
    (CASE WHEN NEW.prelim_percentage IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW.semifinal_percentage IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW.midterm_percentage IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW.final_percentage IS NOT NULL THEN 1 ELSE 0 END), 0
  );
  
  -- Calculate equivalent from average
  IF NEW.average_percentage IS NOT NULL THEN
    NEW.computed_equivalent = calculate_equivalent(NEW.average_percentage);
    NEW.computed_remark = calculate_remark(NEW.average_percentage);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS grade_calculation_trigger ON grades;
CREATE TRIGGER grade_calculation_trigger
  BEFORE INSERT OR UPDATE ON grades
  FOR EACH ROW
  EXECUTE FUNCTION update_grade_calculations();
