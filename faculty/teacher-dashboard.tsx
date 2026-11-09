import { renderToStaticMarkup } from 'react-dom/server';
import DashboardView from './teacher-dashboard-view';
import { CourseList, GradeRows, GradeHistoryMessage, GradeHistoryRows, GradeHistorySummary } from './gradebook-view';
import { mountDashboard } from '../shared/dashboard-workspace';

Object.assign(window, {
  renderTeacherCourseList: (props: Parameters<typeof CourseList>[0]) => renderToStaticMarkup(<CourseList {...props} />),
  renderTeacherGradeRows: (props: Parameters<typeof GradeRows>[0]) => renderToStaticMarkup(<GradeRows {...props} />),
  renderTeacherHistoryMessage: (props: Parameters<typeof GradeHistoryMessage>[0]) => renderToStaticMarkup(<GradeHistoryMessage {...props} />),
  renderTeacherHistoryRows: (props: Parameters<typeof GradeHistoryRows>[0]) => renderToStaticMarkup(<GradeHistoryRows {...props} />),
  renderTeacherHistorySummary: (props: Parameters<typeof GradeHistorySummary>[0]) => renderToStaticMarkup(<GradeHistorySummary {...props} />),
});

mountDashboard(<DashboardView />);
