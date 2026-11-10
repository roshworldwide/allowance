// The `widgets` Studio property: Studio's built-in widgets plus ours, with ours first in the menu.
// createWidgets comes from ag-studio-react (not ag-studio) so React widget defaults apply.
// Docs: https://www.ag-grid.com/studio/archive/3.1.0/react/custom-widgets/

import type { AgCoreDefaultRegistry, AgWidgetsConfig } from 'ag-studio';
import { createWidgets } from 'ag-studio-react';
import type { ControlRoomRegistry } from '../registry';
import { allowanceRingDefinition } from './AllowanceRing';

/** Function form: Studio passes its defaults, so the built-in menu is kept. Pass by reference (module constant). */
export const controlRoomWidgets = (defaults: AgWidgetsConfig<AgCoreDefaultRegistry>): AgWidgetsConfig<ControlRoomRegistry> =>
  createWidgets<ControlRoomRegistry>({
    additionalTypes: [allowanceRingDefinition],
    menu: [{ label: 'ALLOWANCE', widgetIds: ['allowance-ring'] }, ...defaults.menu],
  });
