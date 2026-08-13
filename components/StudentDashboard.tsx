'react';

import { useEffect, useState } from 'react';
import { fetchStudentDashboard, StudentDashboardData } from '../lib/student';

interface Props {
    studentId: string;
}

export default function StudentDashboard({ studentId }: Props) {
    const [data, setData] = useState<StudentDashboardData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            try {
                const result = await fetchStudentDashboard(studentId);
                setData(result);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        if (studentId) loadData();
    }, [studentId]);

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading student dashboard...</div>;
    }

    if (!data || !data.profile) {
        return <div className="p-8 text-center text-red-500">Failed to load student record.</div>;
    }

    const { profile, currentSemester, enrolledCourses, clearances, activities } = data;

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-8 bg-gray-50 min-h-screen">

            {/* HEADER / PROFILE OVERVIEW */}
            <div className="bg-white rounded-xl shadow-sm p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Welcome, Student #{profile.student_no}</h1>
                    <p className="text-gray-500 text-sm">{profile.program} — {profile.year_level} ({profile.section})</p>
                </div>
                <div className="flex gap-4">
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
                        <span className="text-xs text-blue-600 font-medium block">Current GWA</span>
                        <span className="text-xl font-bold text-blue-900">{currentSemester?.gwa ?? 'N/A'}</span>
                    </div>
                    <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-center">
                        <span className="text-xs text-purple-600 font-medium block">Outstanding Balance</span>
                        <span className="text-xl font-bold text-purple-900">₱{currentSemester?.balance?.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* ENROLLED SUBJECTS & GRADES TABLE */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4">
                        Enrolled Subjects ({currentSemester?.school_year} — {currentSemester?.semester})
                    </h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-200 text-xs text-gray-400 uppercase">
                                    <th className="pb-3">Code</th>
                                    <th className="pb-3">Title</th>
                                    <th className="pb-3">Units</th>
                                    <th className="pb-3">Midterm</th>
                                    <th className="pb-3">Predicted</th>
                                    <th className="pb-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                                {enrolledCourses.map((course) => (
                                    <tr key={course.id} className="hover:bg-gray-50">
                                        <td className="py-3 font-semibold text-gray-800">{course.code}</td>
                                        <td className="py-3 text-gray-600">{course.title}</td>
                                        <td className="py-3 text-gray-500">{course.units}</td>
                                        <td className="py-3 text-gray-700 font-medium">{course.grade?.midterm ?? '—'}</td>
                                        <td className="py-3 text-indigo-600 font-medium">
                                            {course.grade?.ai_predicted_grade ? `${course.grade.ai_predicted_grade} (${course.grade.ai_predicted_equivalent})` : '—'}
                                        </td>
                                        <td className="py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${course.grade?.remark === 'Passed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                {course.grade?.remark ?? 'Ongoing'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* SIDEBAR: CLEARANCE & ACTIVITY LOGS */}
                <div className="space-y-8">

                    {/* CLEARANCE STATUS */}
                    <div className="bg-white rounded-xl shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Clearance Status</h2>
                        <div className="space-y-3">
                            {clearances.map((item) => (
                                <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl">{item.icon}</span>
                                        <div>
                                            <p className="text-sm font-medium text-gray-800">{item.department_name}</p>
                                            <p className="text-xs text-gray-500">{item.note}</p>
                                        </div>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${item.status === 'cleared' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                        }`}>
                                        {item.status === 'cleared' ? 'Cleared' : 'Pending'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* RECENT ACTIVITIES */}
                    <div className="bg-white rounded-xl shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Recent Activity</h2>
                        <ul className="space-y-3">
                            {activities.map((act) => (
                                <li key={act.id} className="flex items-start gap-3 text-sm">
                                    <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: act.color || '#3B82F6' }} />
                                    <p className="text-gray-600">{act.description}</p>
                                </li>
                            ))}
                        </ul>
                    </div>

                </div>
            </div>
        </div>
    );
}