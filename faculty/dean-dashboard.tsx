import { renderToStaticMarkup } from 'react-dom/server';
import DashboardView, { DeanEnrollmentStats, DeanFlaggedCourses, DeanOverviewBars, DeanPerformanceStats } from './dean-dashboard-view';
import { CourseList, GradeRows, GradeHistoryMessage, GradeHistoryRows, GradeHistorySummary } from './gradebook-view';
import { AssignmentRows, InstructorField, OfferingFields, WorkloadRows, offeringFields } from './dean-schedule-view';
import { ClearanceDetails, RecordDetails, StudentPicker } from './dean-records-view';
import { mountDashboard } from '../shared/dashboard-workspace';
import { saveClearanceNote } from '../shared/clearance-note';

Object.assign(window, {
  renderDeanCourseList: (props: Parameters<typeof CourseList>[0]) => renderToStaticMarkup(<CourseList {...props} />),
  renderDeanEnrollmentStats: (props: Parameters<typeof DeanEnrollmentStats>[0]) => renderToStaticMarkup(<DeanEnrollmentStats {...props} />),
  renderDeanOverviewBars: (props: Parameters<typeof DeanOverviewBars>[0]) => renderToStaticMarkup(<DeanOverviewBars {...props} />),
  renderDeanPerformanceStats: (props: Parameters<typeof DeanPerformanceStats>[0]) => renderToStaticMarkup(<DeanPerformanceStats {...props} />),
  renderDeanFlaggedCourses: (props: Parameters<typeof DeanFlaggedCourses>[0]) => renderToStaticMarkup(<DeanFlaggedCourses {...props} />),
  saveClearanceNote,
  renderDeanClearanceDetails: (props: Parameters<typeof ClearanceDetails>[0]) => renderToStaticMarkup(<ClearanceDetails {...props} />),
  renderDeanRecordDetails: (props: Parameters<typeof RecordDetails>[0]) => renderToStaticMarkup(<RecordDetails {...props} />),
  renderDeanStudentPicker: (props: Parameters<typeof StudentPicker>[0]) => renderToStaticMarkup(<StudentPicker {...props} />),
  deanOfferingFields: offeringFields,
  renderDeanWorkloadRows: (props: Parameters<typeof WorkloadRows>[0]) => renderToStaticMarkup(<WorkloadRows {...props} />),
  renderDeanAssignmentRows: (props: Parameters<typeof AssignmentRows>[0]) => renderToStaticMarkup(<AssignmentRows {...props} />),
  renderDeanOfferingFields: (props: Parameters<typeof OfferingFields>[0]) => renderToStaticMarkup(<OfferingFields {...props} />),
  renderDeanInstructorField: (props: Parameters<typeof InstructorField>[0]) => renderToStaticMarkup(<InstructorField {...props} />),
  renderDeanGradeRows: (props: Parameters<typeof GradeRows>[0]) => renderToStaticMarkup(<GradeRows {...props} dean />),
  renderDeanHistoryMessage: (props: Parameters<typeof GradeHistoryMessage>[0]) => renderToStaticMarkup(<GradeHistoryMessage {...props} />),
  renderDeanHistoryRows: (props: Parameters<typeof GradeHistoryRows>[0]) => renderToStaticMarkup(<GradeHistoryRows {...props} />),
  renderDeanHistorySummary: (props: Parameters<typeof GradeHistorySummary>[0]) => renderToStaticMarkup(<GradeHistorySummary {...props} dean />),
});

mountDashboard(<DashboardView />);
