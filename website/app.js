/**
 * Resolves download buttons to the latest release assets on GitHub.
 * Edit REPO if your canonical repository differs.
 */
(function () {
  const REPO = 'everest1508/server-operator';
  const LATEST = `https://github.com/${REPO}/releases/latest`;
  const API = `https://api.github.com/repos/${REPO}/releases/latest`;

  function pickAssets(assets) {
    const names = assets.map((a) => a.name);
    const deb = assets.find((a) => a.name.endsWith('.deb'));
    const setup = assets.find((a) => /Setup\.exe$/i.test(a.name));
    const portable = assets.find(
      (a) =>
        /\.exe$/i.test(a.name) &&
        !/Setup\.exe$/i.test(a.name) &&
        !/blockmap/i.test(a.name)
    );
    const macDmg =
      assets.find((a) => /(darwin|mac|osx).*\.dmg$/i.test(a.name)) ||
      assets.find((a) => /\.dmg$/i.test(a.name));
    const macZip =
      assets.find((a) => /(darwin|mac|osx).*\.zip$/i.test(a.name)) ||
      assets.find((a) => /\.zip$/i.test(a.name));
    return { deb, setup, portable, macDmg, macZip, names };
  }

  function setLink(id, asset) {
    const el = document.getElementById(id);
    if (!el) return;
    if (asset && asset.browser_download_url) {
      el.href = asset.browser_download_url;
      el.removeAttribute('aria-disabled');
    } else {
      el.href = LATEST;
      el.title = 'Open the release page to download this asset.';
    }
  }

  async function run() {
    try {
      const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error('GitHub API ' + res.status);
      const data = await res.json();
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const { deb, setup, portable, macDmg, macZip } = pickAssets(assets);
      setLink('dl-setup', setup);
      setLink('dl-portable', portable);
      setLink('dl-deb', deb);
      setLink('dl-mac-dmg', macDmg || macZip);
    } catch (_) {
      ['dl-setup', 'dl-portable', 'dl-deb', 'dl-mac-dmg'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.href = LATEST;
          el.title = 'Could not resolve asset automatically — open release page.';
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
