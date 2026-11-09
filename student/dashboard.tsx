import { renderToStaticMarkup } from 'react-dom/server';
import DashboardView, { ClearanceCards, EnrollmentCourses, GradeInsight, GradeTerms, ProspectusContent, StudentGradeRows } from './dashboard-view';
import { mountDashboard } from '../shared/dashboard-workspace';
import { CorDocument, CorLoadMessage } from './cor-view';
import { BillingContent } from './billing-view';
import { StudentActivity, StudentSummary } from './summary-view';

Object.assign(window, {
  renderStudentClearanceCards: (props: Parameters<typeof ClearanceCards>[0]) => renderToStaticMarkup(<ClearanceCards {...props} />),
  renderEnrollmentCourses: (props: Parameters<typeof EnrollmentCourses>[0]) => renderToStaticMarkup(<EnrollmentCourses {...props} />),
  renderStudentGradeTerms: (props: Parameters<typeof GradeTerms>[0]) => renderToStaticMarkup(<GradeTerms {...props} />),
  renderStudentGradeRows: (props: Parameters<typeof StudentGradeRows>[0]) => renderToStaticMarkup(<StudentGradeRows {...props} />),
  renderStudentGradeInsight: (props: Parameters<typeof GradeInsight>[0]) => renderToStaticMarkup(<GradeInsight {...props} />),
  renderStudentProspectus: (props: Parameters<typeof ProspectusContent>[0]) => renderToStaticMarkup(<ProspectusContent {...props} />),
  renderStudentCor: (props: Parameters<typeof CorDocument>[0]) => renderToStaticMarkup(<CorDocument {...props} />),
  renderStudentCorStatus: (failed: boolean) => renderToStaticMarkup(<CorLoadMessage failed={failed} />),
  renderStudentBilling: (props: Parameters<typeof BillingContent>[0]) => renderToStaticMarkup(<BillingContent {...props} />),
  renderStudentSummary: (props: Parameters<typeof StudentSummary>[0]) => renderToStaticMarkup(<StudentSummary {...props} />),
  renderStudentActivity: (props: Parameters<typeof StudentActivity>[0]) => renderToStaticMarkup(<StudentActivity {...props} />),
});

mountDashboard(<DashboardView />);
