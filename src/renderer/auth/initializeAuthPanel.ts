import { appendLocalMessage } from '../chat/appendLocalMessage';
import { TMC_LOCAL_DIALOG_CHANGED_EVENT, isLocalDialogVisible } from '../dialogs/TmcLocalDialog';
import { notifyAuthLoggedIn } from '../chat/TmcChannelChatController';
import type { StartTwitchLoginResult, FinalizeTwitchLoginResult } from '../../shared/auth/TmcAuthModels';

export const TMC_AUTH_DIALOG_CHANGED_EVENT = TMC_LOCAL_DIALOG_CHANGED_EVENT;

type LoginStep = 'intro' | 'opening' | 'code' | 'submitting';

/** Owns the local login dialog for the lifetime of this renderer document. */
export async function initializeAuthPanel(): Promise<void> {
  const trigger = document.querySelector<HTMLButtonElement>('[data-tmc-auth-login]');
  const dialog = document.querySelector<HTMLDialogElement>('[data-tmc-auth-dialog]');
  const start = document.querySelector<HTMLButtonElement>('[data-tmc-auth-start]');
  const haveCode = document.querySelector<HTMLButtonElement>('[data-tmc-auth-have-code]');
  const close = document.querySelector<HTMLButtonElement>('[data-tmc-auth-close]');
  const paste = document.querySelector<HTMLButtonElement>('[data-tmc-auth-paste]');
  const restart = document.querySelector<HTMLButtonElement>('[data-tmc-auth-restart]');
  const complete = document.querySelector<HTMLButtonElement>('[data-tmc-auth-finalize]');
  const code = document.querySelector<HTMLInputElement>('[data-tmc-auth-code]');
  const intro = document.querySelector<HTMLElement>('[data-tmc-auth-intro]');
  const form = document.querySelector<HTMLFormElement>('[data-tmc-auth-code-step]');
  const title = document.querySelector<HTMLElement>('[data-tmc-auth-title]');
  const description = document.querySelector<HTMLElement>('[data-tmc-auth-description]');
  const stepLabel = document.querySelector<HTMLElement>('[data-tmc-auth-step-label]');
  const feedback = document.querySelector<HTMLElement>('[data-tmc-auth-feedback]');
  const openError = document.querySelector<HTMLElement>('[data-tmc-auth-open-error]');
  if (!trigger || !dialog || !start || !haveCode || !close || !paste || !restart || !complete ||
      !code || !intro || !form || !title || !description || !stepLabel || !feedback || !openError) {
    throw new Error('Login dialog markup is incomplete.');
  }
  if (trigger.dataset.tmcAuthBound === 'true') return;
  trigger.dataset.tmcAuthBound = 'true';
  const lifetime = new AbortController();
  const listener = { signal: lifetime.signal };
  let step: LoginStep = 'intro';
  let flow = 0;
  let pasting = false;
  let disposed = false;

  function render(): void {
    const isCode = step === 'code' || step === 'submitting';
    intro.hidden = isCode;
    form.hidden = !isCode;
    stepLabel.textContent = isCode ? 'Step 2 of 2' : 'Step 1 of 2';
    title.textContent = isCode ? 'Paste your login code' : 'Log in to Twitch';
    description.textContent = isCode
      ? 'Finish signing in in your browser, copy the code, then paste it here.'
      : 'Continue in your browser. Then come back here with your login code.';
    start.disabled = step === 'opening';
    haveCode.disabled = step === 'opening';
    start.textContent = step === 'opening' ? 'Opening browser…' : 'Login with Twitch';
    close.disabled = step === 'submitting';
    code.disabled = step === 'submitting' || pasting;
    paste.disabled = step === 'submitting' || pasting;
    paste.textContent = pasting ? 'Pasting…' : 'Paste code';
    restart.disabled = step === 'submitting' || pasting;
    complete.disabled = step !== 'code' || pasting || !code.value.trim();
    complete.textContent = step === 'submitting' ? 'Signing in…' : 'Complete login';
    form.setAttribute('aria-busy', String(step === 'submitting'));
  }

  function message(text = '', error = false): void {
    feedback.textContent = text;
    feedback.dataset.error = String(error);
    code.setAttribute('aria-invalid', String(error));
  }

  function reset(): void {
    flow++;
    step = 'intro';
    pasting = false;
    code.value = '';
    delete dialog.dataset.opening;
    trigger.disabled = false;
    message();
    render();
    window.dispatchEvent(new Event(TMC_AUTH_DIALOG_CHANGED_EVENT));
  }

  function closeDialog(): void {
    if (step === 'submitting') return;
    if (dialog.open) dialog.close();
    reset();
    trigger.focus();
  }

  trigger.addEventListener('click', async () => {
    if (isLocalDialogVisible()) return;
    reset();
    const current = flow;
    dialog.dataset.opening = 'true';
    trigger.disabled = true;
    openError.hidden = true;
    try {
      // Native PCG surfaces paint above DOM dialogs; hide without unloading them.
      await Promise.all([window.tmc.pcg.hideView(), window.tmc.player.occlude({ hidden: true })]);
      if (disposed || current !== flow) return;
      dialog.showModal();
      delete dialog.dataset.opening;
      start.focus();
      window.dispatchEvent(new Event(TMC_AUTH_DIALOG_CHANGED_EVENT));
    } catch {
      if (disposed || current !== flow) return;
      reset();
      openError.textContent = 'Could not open login. Please try again.';
      openError.hidden = false;
      console.warn('[TMC Auth] Login dialog could not be opened.');
    } finally {
      if (!disposed && current === flow) trigger.disabled = false;
    }
  }, listener);

  start.addEventListener('click', async () => {
    if (step !== 'intro') return;
    const current = flow;
    step = 'opening';
    message();
    render();
    try {
      const result = await startTwitchLogin();
      if (disposed || current !== flow || !dialog.open) return;
      if (!result.started) throw new Error('Browser was not opened.');
      step = 'code';
      render();
      code.focus();
    } catch {
      if (disposed || current !== flow || !dialog.open) return;
      step = 'intro';
      message('The browser could not be opened. Please try again.', true);
      render();
      console.warn('[TMC Auth] Twitch login start failed.');
    }
  }, listener);

  haveCode.addEventListener('click', () => {
    if (step !== 'intro') return;
    step = 'code';
    message();
    render();
    code.focus();
  }, listener);

  paste.addEventListener('click', async () => {
    if (step !== 'code' || pasting) return;
    const current = flow;
    pasting = true;
    message();
    render();
    try {
      const text = await navigator.clipboard.readText();
      if (disposed || current !== flow || !dialog.open) return;
      code.value = text.trim();
      if (!code.value) message('The clipboard is empty. Copy the code from your browser first.');
    } catch {
      if (disposed || current !== flow || !dialog.open) return;
      message('Paste directly into the code field using your keyboard.');
    } finally {
      if (!disposed && current === flow && dialog.open) {
        pasting = false;
        render();
        code.focus();
      }
    }
  }, listener);

  code.addEventListener('input', () => {
    message();
    render();
  }, listener);

  restart.addEventListener('click', () => {
    if (step !== 'code' || pasting) return;
    flow++;
    step = 'intro';
    code.value = '';
    message();
    render();
    start.focus();
  }, listener);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (step !== 'code' || pasting) return;
    const token = code.value.trim();
    if (!token) {
      message('Paste your login code first.', true);
      code.focus();
      return;
    }
    const current = flow;
    step = 'submitting';
    message('Completing login. Please keep this window open.');
    render();
    try {
      const result = await finalizeTwitchLogin(token);
      if (disposed || current !== flow) return;
      if (!result.success) throw new Error('Login was not completed.');
      step = 'code';
      closeDialog();
      appendLocalMessage('system', `Logged in as ${result.username}.`);
      notifyAuthLoggedIn();
    } catch {
      if (disposed || current !== flow || !dialog.open) return;
      step = 'code';
      message('Could not complete login. Check the code and try again, or start again.', true);
      render();
      code.focus();
      console.warn('[TMC Auth] Twitch login finalize failed.');
    }
  }, listener);

  close.addEventListener('click', closeDialog, listener);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDialog();
  }, listener);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog();
  }, listener);
  dialog.addEventListener('close', () => {
    if (!dialog.open && dialog.dataset.opening !== 'true') reset();
  }, listener);
  window.addEventListener('pagehide', () => {
    disposed = true;
    flow++;
    code.value = '';
    lifetime.abort();
  }, { once: true });
  render();
}

async function startTwitchLogin(): Promise<StartTwitchLoginResult> {
  if (window.tmc.auth.startTwitchLogin) {
    return window.tmc.auth.startTwitchLogin({ source: 'main-window' });
  }
  return window.tmc.auth.openTwitchLogin({ slot: 0 });
}

async function finalizeTwitchLogin(loginToken: string): Promise<FinalizeTwitchLoginResult> {
  if (window.tmc.auth.finalizeLoginToken) return window.tmc.auth.finalizeLoginToken(loginToken);
  return window.tmc.auth.finalizeTwitchLogin({ loginToken });
}
