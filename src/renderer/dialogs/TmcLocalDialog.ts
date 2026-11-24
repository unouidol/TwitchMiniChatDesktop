export const TMC_LOCAL_DIALOG_CHANGED_EVENT = 'tmc:local-dialog-changed';
export function isLocalDialogVisible(): boolean {
  return !!document.querySelector('[data-tmc-auth-dialog][open], [data-tmc-auth-dialog][data-opening="true"], [data-tmc-welcome-dialog][open], [data-tmc-welcome-dialog][data-opening="true"]');
}
