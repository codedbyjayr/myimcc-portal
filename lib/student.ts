import { createClient } from '@supabase/supabase-js';

// Initialize your Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface StudentDashboardData {
    profile: any;
    currentSemester: any;
    enrolledCourses: any[];
    clearances: any[];
    activities: any[];
}

export async function fetchStudentDashboard(studentId: string): Promise<StudentDashboardData> {
    const [
        { data: profile, error: profileErr },
        { data: semesterData, error: semErr },
        { data: enrollments, error: enrollErr },
        { data: clearances, error: clearanceErr },
        { data: activities, error: actErr }
    ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', studentId).single(),
        supabase.from('student_semesters').select('*').eq('student_id', studentId).eq('is_current', true).single(),
        supabase.from('enrollments')
            .select(`
        id,
        status,
        course_offerings (
          id,
          code,
          title,
          units,
          schedule,
          instructor_name,
          fee
        )
      `)
            .eq('student_id', studentId),
        supabase.from('clearances').select('*').eq('student_id', studentId),
        supabase.from('activities').select('*').eq('student_id', studentId).order('created_at', { ascending: false })
    ]);

    if (profileErr || semErr || enrollErr || clearanceErr || actErr) {
        console.error('Error fetching dashboard data:', { profileErr, semErr, enrollErr, clearanceErr, actErr });
    }

    // Fetch corresponding grades for enrolled offerings
    const offeringIds = enrollments?.map((e: any) => e.course_offerings.id) || [];
    const { data: grades } = await supabase
        .from('grades')
        .select('*')
        .eq('student_id', studentId)
        .in('offering_id', offeringIds);

    // Combine offerings with grade records
    const enrolledCourses = (enrollments || []).map((item: any) => {
        const courseGrade = grades?.find((g: any) => g.offering_id === item.course_offerings.id);
        return {
            ...item.course_offerings,
            enrollment_status: item.status,
            grade: courseGrade || null,
        };
    });

    return {
        profile,
        currentSemester: semesterData,
        enrolledCourses,
        clearances: clearances || [],
        activities: activities || [],
    };
}