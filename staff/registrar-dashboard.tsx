import { renderToStaticMarkup } from 'react-dom/server';
import DashboardView, {
  RegistrarClearanceDetails, RegistrarClearanceQueue, RegistrarOfferOptions, RegistrarOfferRows,
  RegistrarProspectusRows, RegistrarStudentRows, RegistrarSummerOptions,
} from './registrar-dashboard-view';
import { mountDashboard } from '../shared/dashboard-workspace';
import { saveClearanceNote } from '../shared/clearance-note';

Object.assign(window, {
  saveClearanceNote,
  renderRegistrarClearanceQueue: (props: Parameters<typeof RegistrarClearanceQueue>[0]) => renderToStaticMarkup(<RegistrarClearanceQueue {...props} />),
  renderRegistrarClearanceDetails: (props: Parameters<typeof RegistrarClearanceDetails>[0]) => renderToStaticMarkup(<RegistrarClearanceDetails {...props} />),
  renderRegistrarStudentRows: (props: Parameters<typeof RegistrarStudentRows>[0]) => renderToStaticMarkup(<RegistrarStudentRows {...props} />),
  renderRegistrarOfferRows: (props: Parameters<typeof RegistrarOfferRows>[0]) => renderToStaticMarkup(<RegistrarOfferRows {...props} />),
  renderRegistrarOfferOptions: (props: Parameters<typeof RegistrarOfferOptions>[0]) => renderToStaticMarkup(<RegistrarOfferOptions {...props} />),
  renderRegistrarProspectusRows: (props: Parameters<typeof RegistrarProspectusRows>[0]) => renderToStaticMarkup(<RegistrarProspectusRows {...props} />),
  renderRegistrarSummerOptions: (props: Parameters<typeof RegistrarSummerOptions>[0]) => renderToStaticMarkup(<RegistrarSummerOptions {...props} />),
});

mountDashboard(<DashboardView />);
