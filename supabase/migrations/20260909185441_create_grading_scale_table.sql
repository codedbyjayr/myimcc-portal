CREATE TABLE grading_scale (
  id SERIAL PRIMARY KEY,
  equivalent NUMERIC(3,2) UNIQUE NOT NULL,
  percentage_min NUMERIC(5,2) NOT NULL,
  percentage_max NUMERIC(5,2) NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  is_passing BOOLEAN DEFAULT true
);

-- Insert the grading scale data
INSERT INTO grading_scale (equivalent, percentage_min, percentage_max, description, category, is_passing) VALUES
(1.00, 96.00, 100.00, 'Excellent / Superior', 'Highest marks', true),
(1.25, 94.00, 95.00, 'Excellent / Superior', 'Highest marks', true),
(1.50, 92.00, 93.00, 'Very Good', 'Very Good', true),
(1.75, 89.00, 91.00, 'Very Good', 'Very Good', true),
(2.00, 86.00, 88.00, 'Good', 'Good', true),
(2.25, 83.00, 85.00, 'Good', 'Good', true),
(2.50, 80.00, 82.00, 'Satisfactory / Fair', 'Satisfactory', true),
(2.75, 76.00, 79.00, 'Satisfactory / Fair', 'Satisfactory', true),
(3.00, 75.00, 75.00, 'Passing', 'Minimum passing', true),
(4.00, 0.00, 74.00, 'Conditional / Incomplete', 'Conditional', false),
(5.00, 0.00, 74.00, 'Failed', 'Failing', false);

-- Enable RLS
ALTER TABLE grading_scale ENABLE ROW LEVEL SECURITY;

-- Everyone can read the grading scale
CREATE POLICY "All users can read grading scale" ON grading_scale
  FOR SELECT USING (true);
