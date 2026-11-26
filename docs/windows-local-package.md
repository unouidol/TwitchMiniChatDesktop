# Local Windows package

This is an unsigned local development candidate, not a published release.
Use Node 24.22.3 and bundled npm 11.19.1 on Windows x64.

```powershell
npm run make -- --platform=win32 --arch=x64
```

The protected application is
`out/twitchminichatdesktop-win32-x64/TMC-desktop.exe`.
Keep its complete directory together; the executable is not a standalone file.
The Squirrel installer is
`out/make/squirrel.windows/x64/TMC-desktop-Setup.exe`.
Making these files does not install, upload or publish them. The current icon
remains Electron's default; signing and final branding are separate work.

Executable/product descriptions use TMC desktop, while package name/productName
remain unchanged to preserve the existing profile identity. Packaged runtime
diagnostics use Electron's application version. Packaged startup does not read
`local.properties` from the working directory. Environment configuration remains
supported; no backend/history secret is embedded or copied into the package.

## Installer shortcuts and event lifecycle

The Windows PE ProductName is **TMC desktop (installata)**. Squirrel uses this
metadata to name the Desktop and Start Menu shortcuts; the distinct label avoids
replacing the existing TMC desktop development links. The shortcut targets the
stable executable stub in the per-user installation root, not an app-version
directory that becomes obsolete on an upgrade. Internal package/productName and
profile locations remain unchanged.

Main handles install/update/uninstall events before normal service/window startup.
One bounded updater process receives explicit `Desktop,StartMenu` locations;
normal services do not run during these events. The app exits only after updater
completion, with non-success for spawn/exit/deadline failures. Obsolete versions
exit directly; first-run and ordinary launches retain normal startup. The old
electron-squirrel-startup helper/types and its exclusive dependencies were removed
because early quit and intermittent event completion were observed with it.

After making a package, `npm run test:squirrel` copies the unmodified protected
app to a marked workspace fixture and replaces only the sibling Update.exe with
a delayed .NET Framework boundary executable. The test requires Windows x64's
Framework64 v4 compiler. It verifies actual install/update/uninstall/obsolete
event timing and arguments, excludes normal preference initialization, confirms
fixture processes exit and removes only the verified profile/app copy. This test
does not write real shortcuts and is not proof of a real installation by itself.

On 2026-11-24 an explicitly authorized silent installer check upgraded the user's
existing installation to 1.1.0-dev.19 without opening the app. Starting with the
installed Desktop link absent, Squirrel created both Desktop and Start Menu links
to the standard per-user stable launcher. Both development link hashes remained
unchanged; installed ASAR matched the protected package, and no app was left open.
This establishes shortcut creation on this host, not a clean-machine or real-login
acceptance test. SQUIRREL_TEMP was found to also redirect the installation root;
it must not be used merely to isolate logs in a standard-location installer check.

## Protected-artifact smoke test

Provision the checksum-pinned ChromeDriver using the existing
[E2E instructions](../CONTRIBUTING.md#explicit-verified-chromedriver), then run:

```powershell
$env:TMC_E2E_DRIVER_PATH = 'C:\absolute\path\to\verified\chromedriver.exe'
npm run test:packaged
```

An optional absolute executable path may follow `--`. The test launches the
actual unmodified Forge executable/ASAR with its production fuses intact. It
owns the application process before attaching ChromeDriver to a local ephemeral
renderer-debugging endpoint; normal application launch requires no debugging
arguments. It creates a marked profile in ignored `.test-build/`, passes
Electron's native `--user-data-dir` and starts from an empty working directory.
Inherited TMC/Electron configuration is removed from child environments and
backend/OAuth startup is directed to a local unused endpoint. No real login,
synthetic credentials, chat connection or remote player is started.

Checks cover the production ASAR file allowlist, configured security fuses,
file-based UI/CSS/preload/IPC, empty accounts, first-launch login guidance, modal
opening/closing, isolated preference writes and a full process restart. Captures
and structured results remain in `.test-build/packaged-smoke-*/`. When a driver
is attached, failure diagnostics retain local welcome/auth dialog visibility,
welcome error text and a screenshot from the isolated profile. Diagnostic capture
does not replace the primary failure or change timeouts. Cleanup attempts
all owned releases, retains primary and cleanup errors, confirms no matching
profile-owned processes remain and removes only the verified profile. A profile
is retained if process release cannot be established. `--fail-after-app-spawn`
deliberately fails the test to exercise cleanup before WebDriver attaches.
`--fail-driver-spawn` exercises driver startup rejection after the app is running.

The app does not request authenticated history until main reports an active
session; login/account events continue through the existing channel controller.
This test does not replace the full synthetic Electron scenario, prove OS-wide
network isolation, or establish installer installation/upgrade/uninstallation,
clean-machine compatibility, real OAuth/PCG/video, offline recovery or signing.
Those acceptance checks remain separate; do not install automatically into a
user's authenticated profile as part of this smoke test.
