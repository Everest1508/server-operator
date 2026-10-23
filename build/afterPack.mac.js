const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// electron-builder's own packaging step invalidates (and on macOS 26+
// "Tahoe" corrupts) the prebuilt Electron Framework's original Apple
// signature. Running this before the DMG/zip is created — instead of
// after, when it would be too late — replaces the Framework binary with
// the untouched copy from node_modules and re-signs the whole bundle
// ad-hoc so Gatekeeper/AMFI see a valid (if untrusted) signature instead
// of none at all. See docs/README "macOS: Code Signing Workarounds".
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const projectDir = context.packager.projectDir;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);

  const pristineFramework = path.join(
    projectDir, 'node_modules', 'electron', 'dist', 'Electron.app',
    'Contents', 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Electron Framework'
  );
  const bundledFramework = path.join(
    appPath, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Electron Framework'
  );

  if (fs.existsSync(pristineFramework) && fs.existsSync(bundledFramework)) {
    fs.copyFileSync(pristineFramework, bundledFramework);
    console.log('[afterPack] Restored pristine Electron Framework binary');
  } else {
    console.warn('[afterPack] Skipped Framework restore — pristine copy not found at', pristineFramework);
  }

  const entitlements = path.join(projectDir, 'build', 'entitlements.mac.plist');
  // Release builds: set SIGN_IDENTITY ("Developer ID Application: Name (TEAMID)")
  // plus APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID to sign and
  // notarize. Without SIGN_IDENTITY we fall back to ad-hoc (dev builds).
  const identity = process.env.SIGN_IDENTITY || '-';
  const release = identity !== '-';
  if (release && !identity.startsWith('Developer ID Application:')) {
    throw new Error(`[afterPack] SIGN_IDENTITY must be a "Developer ID Application" certificate (got "${identity}"); Apple rejects others at notarization`);
  }
  const run = (cmd, args) => {
    const r = spawnSync(cmd, args, { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`[afterPack] ${cmd} ${args[0]} failed (${r.status})`);
  };
  const codesign = (target, extra = []) => run('codesign', [
    '--force', '--sign', identity, '--options', 'runtime',
    ...(release ? ['--timestamp'] : []),
    '--entitlements', entitlements, ...extra, target,
  ]);

  if (release) {
    // --deep misses loose dylibs/helpers (e.g. Electron's Libraries/*.dylib, ShipIt) and
    // notarization rejects any unsigned or untimestamped Mach-O. Sign every Mach-O file,
    // then the nested bundles, innermost first, then the app itself.
    const machO = [];
    const bundles = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) {
          if (/\.(framework|app)$/.test(e.name)) bundles.push(p);
          walk(p);
        } else if (e.isFile()) {
          const fd = fs.openSync(p, 'r');
          const head = Buffer.alloc(4);
          fs.readSync(fd, head, 0, 4, 0);
          fs.closeSync(fd);
          const magic = head.toString('hex');
          if (['cffaedfe', 'cafebabe', 'feedfacf'].includes(magic)) machO.push(p);
        }
      }
    };
    walk(appPath);
    const deepestFirst = (a, b) => b.split(path.sep).length - a.split(path.sep).length;
    for (const f of machO.sort(deepestFirst)) codesign(f);
    for (const b of bundles.sort(deepestFirst)) codesign(b);
    codesign(appPath);
  } else {
    codesign(appPath, ['--deep']);
  }
  console.log(`[afterPack] ${release ? 'Developer ID' : 'Ad-hoc'} signed`, appPath);

  if (!release) return;

  const zip = path.join(context.appOutDir, 'notarize.zip');
  run('ditto', ['-c', '-k', '--keepParent', appPath, zip]);
  const creds = [
    '--apple-id', process.env.APPLE_ID,
    '--password', process.env.APPLE_APP_SPECIFIC_PASSWORD,
    '--team-id', process.env.APPLE_TEAM_ID,
  ];
  const sub = spawnSync('xcrun', ['notarytool', 'submit', zip, '--wait', ...creds], { encoding: 'utf8' });
  process.stdout.write(sub.stdout || '');
  process.stderr.write(sub.stderr || '');
  if (!/status: Accepted/.test(sub.stdout || '')) {
    const id = /id: ([0-9a-f-]{36})/.exec(sub.stdout || '')?.[1];
    throw new Error(`[afterPack] notarization not accepted${id ? `; see: xcrun notarytool log ${id}` : ''}`);
  }
  fs.rmSync(zip);
  run('xcrun', ['stapler', 'staple', appPath]);
  console.log('[afterPack] Notarized and stapled', appPath);
};
