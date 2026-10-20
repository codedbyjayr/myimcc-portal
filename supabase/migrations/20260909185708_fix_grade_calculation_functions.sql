-- Update the calculate_equivalent function to handle edge cases
CREATE OR REPLACE FUNCTION calculate_equivalent(percentage NUMERIC)
RETURNS NUMERIC(3,2) AS $$
BEGIN
  IF percentage IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF percentage >= 96 THEN
    RETURN 1.00;
  ELSIF percentage >= 94 THEN
    RETURN 1.25;
  ELSIF percentage >= 92 THEN
    RETURN 1.50;
  ELSIF percentage >= 89 THEN
    RETURN 1.75;
  ELSIF percentage >= 86 THEN
    RETURN 2.00;
  ELSIF percentage >= 83 THEN
    RETURN 2.25;
  ELSIF percentage >= 80 THEN
    RETURN 2.50;
  ELSIF percentage >= 76 THEN
    RETURN 2.75;
  ELSIF percentage >= 75 THEN
    RETURN 3.00;
  ELSE
    RETURN 5.00;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Update the calculate_remark function
CREATE OR REPLACE FUNCTION calculate_remark(percentage NUMERIC)
RETURNS TEXT AS $$
BEGIN
  IF percentage IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF percentage >= 96 THEN
    RETURN 'Excellent / Superior';
  ELSIF percentage >= 94 THEN
    RETURN 'Excellent / Superior';
  ELSIF percentage >= 92 THEN
    RETURN 'Very Good';
  ELSIF percentage >= 89 THEN
    RETURN 'Very Good';
  ELSIF percentage >= 86 THEN
    RETURN 'Good';
  ELSIF percentage >= 83 THEN
    RETURN 'Good';
  ELSIF percentage >= 80 THEN
    RETURN 'Satisfactory / Fair';
  ELSIF percentage >= 76 THEN
    RETURN 'Satisfactory / Fair';
  ELSIF percentage >= 75 THEN
    RETURN 'Passing';
  ELSE
    RETURN 'Failed';
  END IF;
END;
$$ LANGUAGE plpgsql;
